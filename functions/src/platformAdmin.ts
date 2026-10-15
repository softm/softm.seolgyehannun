import { randomUUID } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  calculatePlatformWorkspaceExpiry,
  calculateSubscriptionExtension,
  classifyOrganizationStatus,
  normalizeAdminEmails,
  normalizePlatformWorkspaceRole,
} from "./platformAdminCore.js";

type PlatformRole = "owner" | "operator";

interface PlatformAdminIdentity {
  uid: string;
  email: string;
  displayName: string;
  role: PlatformRole;
}

interface PlatformAdminDependencies {
  db: Firestore;
  auth: Auth;
  requireAppCheck: (request: CallableRequest) => void;
  adminEmails: () => string;
}

interface PlatformWorkspaceAccessData {
  sessionId: string;
  organizationId: string;
  organizationName: string;
  role: "admin" | "editor" | "viewer";
  startedAt: string | null;
  expiresAt: string;
  accessVersion: number;
}

function objectData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "요청 형식을 확인해 주세요.");
  }
  return value as Record<string, unknown>;
}

function textValue(data: Record<string, unknown>, key: string, maxLength: number, required = true): string {
  const value = typeof data[key] === "string" ? data[key].trim() : "";
  if ((required && !value) || value.length > maxLength) {
    throw new HttpsError("invalid-argument", `${key} 값을 확인해 주세요.`);
  }
  return value;
}

function timestampValue(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function isoValue(value: unknown): string | null {
  return timestampValue(value)?.toDate().toISOString() ?? null;
}

function subscriptionData(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function dateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00+09:00`);
  return !Number.isNaN(date.getTime());
}

function monthStartInKst(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return new Date(`${year}-${month}-01T00:00:00+09:00`);
}

function audit(
  transaction: Transaction,
  db: Firestore,
  identity: PlatformAdminIdentity,
  action: string,
  organizationId: string,
  organizationName: string,
  detail: Record<string, unknown>,
): void {
  const reference = db.collection("platformAuditEvents").doc();
  transaction.create(reference, {
    id: reference.id,
    action,
    organizationId,
    organizationName,
    actorId: identity.uid,
    actorEmail: identity.email,
    actorName: identity.displayName,
    detail,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export function createPlatformAdminFunctions({ db, auth, requireAppCheck, adminEmails }: PlatformAdminDependencies) {
  async function resolvePlatformAdmin(request: CallableRequest, required: boolean): Promise<PlatformAdminIdentity | null> {
    if (!request.auth) {
      if (required) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
      return null;
    }
    const email = typeof request.auth.token.email === "string" ? request.auth.token.email.trim().toLowerCase() : "";
    const displayName = typeof request.auth.token.name === "string" ? request.auth.token.name.trim() : email || "사이트 관리자";
    const reference = db.doc(`platformAdmins/${request.auth.uid}`);
    const snapshot = await reference.get();
    if (snapshot.exists) {
      const data = snapshot.data() ?? {};
      const role = data.role === "operator" ? "operator" : "owner";
      if (data.status !== "active") {
        if (required) throw new HttpsError("permission-denied", "비활성화된 사이트 관리자 계정입니다.");
        return null;
      }
      return { uid: request.auth.uid, email, displayName, role };
    }

    const allowlist = normalizeAdminEmails(adminEmails());
    const verified = request.auth.token.email_verified === true;
    if (!email || !verified || !allowlist.includes(email)) {
      if (required) throw new HttpsError("permission-denied", "사이트 관리자 권한이 없습니다.");
      return null;
    }
    await reference.create({
      uid: request.auth.uid,
      email,
      displayName,
      role: "owner",
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      lastSignedInAt: FieldValue.serverTimestamp(),
    });
    return { uid: request.auth.uid, email, displayName, role: "owner" };
  }

  async function updateWorkspaceClaims(identity: PlatformAdminIdentity, access: PlatformWorkspaceAccessData | null): Promise<void> {
    const user = await auth.getUser(identity.uid);
    const claims: Record<string, unknown> = { ...(user.customClaims ?? {}) };
    delete claims.platformWorkspaceOrganizationId;
    delete claims.platformWorkspaceRole;
    delete claims.platformWorkspaceExpiresAt;
    delete claims.platformWorkspaceSessionId;
    delete claims.platformWorkspaceAccessVersion;
    if (access) {
      claims.platformWorkspaceOrganizationId = access.organizationId;
      claims.platformWorkspaceRole = access.role;
      claims.platformWorkspaceExpiresAt = new Date(access.expiresAt).getTime();
      claims.platformWorkspaceSessionId = access.sessionId;
      claims.platformWorkspaceAccessVersion = access.accessVersion;
    }
    await auth.setCustomUserClaims(identity.uid, claims);
  }

  async function resolveWorkspaceAccess(identity: PlatformAdminIdentity): Promise<PlatformWorkspaceAccessData | null> {
    const session = await db.doc(`platformWorkspaceAccess/${identity.uid}`).get();
    if (!session.exists) return null;
    const data = session.data() ?? {};
    const role = normalizePlatformWorkspaceRole(data.role);
    const expiresAt = timestampValue(data.expiresAt);
    const organizationId = typeof data.organizationId === "string" ? data.organizationId : "";
    if (data.status !== "active" || !role || !organizationId || !expiresAt || expiresAt.toMillis() <= Date.now()) return null;

    const organization = await db.doc(`organizations/${organizationId}`).get();
    if (!organization.exists || organization.data()?.platformStatus === "suspended") return null;
    const accessVersion = Number(organization.data()?.platformAccessVersion ?? 0);
    if (!Number.isInteger(accessVersion) || Number(data.accessVersion ?? 0) !== accessVersion) return null;
    const subscriptionExpiry = timestampValue(subscriptionData(organization.data()?.subscription).expiresAt);
    if (subscriptionExpiry && subscriptionExpiry.toMillis() <= Date.now()) return null;
    return {
      sessionId: String(data.sessionId ?? session.id),
      organizationId,
      organizationName: String(organization.data()?.name ?? data.organizationName ?? "이름 없는 설계사무소"),
      role,
      startedAt: isoValue(data.startedAt),
      expiresAt: expiresAt.toDate().toISOString(),
      accessVersion,
    };
  }

  const getPlatformAdminAccess = onCall({ enforceAppCheck: false }, async (request) => {
    requireAppCheck(request);
    const identity = await resolvePlatformAdmin(request, false);
    return {
      isPlatformAdmin: Boolean(identity),
      role: identity?.role ?? null,
      email: identity?.email ?? null,
      workspaceAccess: identity ? await resolveWorkspaceAccess(identity) : null,
    };
  });

  const startPlatformWorkspaceAccess = onCall(
    { enforceAppCheck: false, timeoutSeconds: 30, memory: "256MiB" },
    async (request) => {
      requireAppCheck(request);
      const identity = await resolvePlatformAdmin(request, true);
      const data = objectData(request.data);
      const organizationId = textValue(data, "organizationId", 120);
      const role = normalizePlatformWorkspaceRole(data.role);
      if (!role) throw new HttpsError("invalid-argument", "접속 권한을 확인해 주세요.");

      const organizationRef = db.doc(`organizations/${organizationId}`);
      const sessionRef = db.doc(`platformWorkspaceAccess/${identity!.uid}`);
      const now = Timestamp.now();
      const result = await db.runTransaction(async (transaction) => {
        const organization = await transaction.get(organizationRef);
        if (!organization.exists) throw new HttpsError("not-found", "설계사무소를 찾을 수 없습니다.");
        const organizationData = organization.data() ?? {};
        if (organizationData.platformStatus === "suspended") {
          throw new HttpsError("failed-precondition", "이용 정지된 설계사무소에는 접속할 수 없습니다.");
        }
        const subscriptionExpiry = timestampValue(subscriptionData(organizationData.subscription).expiresAt);
        if (subscriptionExpiry && subscriptionExpiry.toMillis() <= now.toMillis()) {
          throw new HttpsError("failed-precondition", "이용기간이 만료된 설계사무소에는 접속할 수 없습니다.");
        }

        const sessionId = randomUUID();
        const expiresAt = Timestamp.fromDate(calculatePlatformWorkspaceExpiry(now.toDate(), subscriptionExpiry?.toDate()));
        const organizationName = String(organizationData.name ?? "이름 없는 설계사무소");
        const accessVersion = Number.isInteger(Number(organizationData.platformAccessVersion))
          ? Number(organizationData.platformAccessVersion)
          : 0;
        transaction.set(sessionRef, {
          sessionId,
          status: "active",
          organizationId,
          organizationName,
          role,
          actorId: identity!.uid,
          actorEmail: identity!.email,
          startedAt: now,
          expiresAt,
          accessVersion,
          updatedAt: now,
        });
        audit(transaction, db, identity!, "workspace.access.started", organizationId, organizationName, {
          sessionId,
          role,
          expiresAt: expiresAt.toDate().toISOString(),
          accessVersion,
        });
        return {
          sessionId,
          organizationId,
          organizationName,
          role,
          startedAt: now.toDate().toISOString(),
          expiresAt: expiresAt.toDate().toISOString(),
          accessVersion,
        };
      });
      try {
        await updateWorkspaceClaims(identity!, result);
      } catch {
        await sessionRef.delete();
        throw new HttpsError("internal", "대리 접속 권한을 발급하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
      return { workspaceAccess: result };
    },
  );

  const endPlatformWorkspaceAccess = onCall(
    { enforceAppCheck: false, timeoutSeconds: 30, memory: "256MiB" },
    async (request) => {
      requireAppCheck(request);
      const identity = await resolvePlatformAdmin(request, true);
      const sessionRef = db.doc(`platformWorkspaceAccess/${identity!.uid}`);
      await updateWorkspaceClaims(identity!, null);
      const ended = await db.runTransaction(async (transaction) => {
        const session = await transaction.get(sessionRef);
        if (!session.exists) return false;
        const sessionData = session.data() ?? {};
        transaction.delete(sessionRef);
        audit(
          transaction,
          db,
          identity!,
          "workspace.access.ended",
          String(sessionData.organizationId ?? ""),
          String(sessionData.organizationName ?? ""),
          { sessionId: String(sessionData.sessionId ?? ""), role: String(sessionData.role ?? "") },
        );
        return true;
      });
      return { ended };
    },
  );

  const getPlatformAdminDashboard = onCall(
    { enforceAppCheck: false, timeoutSeconds: 60, memory: "512MiB" },
    async (request) => {
      requireAppCheck(request);
      await resolvePlatformAdmin(request, true);
      const now = new Date();
      const [organizationSnapshot, recentPaymentsSnapshot, monthPaymentsSnapshot] = await Promise.all([
        db.collection("organizations").get(),
        db.collection("platformPayments").orderBy("confirmedAt", "desc").limit(30).get(),
        db.collection("platformPayments").where("confirmedAt", ">=", Timestamp.fromDate(monthStartInKst(now))).get(),
      ]);

      const organizations = await Promise.all(organizationSnapshot.docs.map(async (organization) => {
        const data = organization.data();
        const subscription = subscriptionData(data.subscription);
        const expiresAt = timestampValue(subscription.expiresAt);
        const ownerId = typeof data.ownerId === "string" ? data.ownerId : "";
        const [memberCount, caseCount, owner] = await Promise.all([
          organization.ref.collection("members").where("status", "==", "active").count().get(),
          organization.ref.collection("cases").count().get(),
          ownerId ? organization.ref.collection("members").doc(ownerId).get() : Promise.resolve(null),
        ]);
        return {
          id: organization.id,
          name: String(data.name ?? "이름 없는 설계사무소"),
          ownerId,
          ownerName: String(owner?.data()?.displayName ?? ""),
          ownerEmail: String(owner?.data()?.email ?? ""),
          createdAt: isoValue(data.createdAt),
          platformStatus: data.platformStatus === "suspended" ? "suspended" : "active",
          serviceStatus: classifyOrganizationStatus({
            platformStatus: data.platformStatus,
            subscriptionStatus: subscription.status,
            expiresAt: expiresAt?.toDate() ?? null,
            now,
          }),
          subscriptionStatus: String(subscription.status ?? "unconfigured"),
          planCode: String(subscription.planCode ?? "manual"),
          expiresAt: expiresAt?.toDate().toISOString() ?? null,
          trialEndsAt: isoValue(subscription.trialEndsAt),
          suspendedReason: String(data.suspendedReason ?? ""),
          memberCount: memberCount.data().count,
          caseCount: caseCount.data().count,
        };
      }));
      organizations.sort((left, right) => left.name.localeCompare(right.name, "ko"));

      const recentPayments = recentPaymentsSnapshot.docs.map((payment) => {
        const data = payment.data();
        return {
          id: payment.id,
          organizationId: String(data.organizationId ?? ""),
          organizationName: String(data.organizationName ?? ""),
          amount: Number(data.amount ?? 0),
          months: Number(data.months ?? 0),
          depositedAt: String(data.depositedAt ?? ""),
          depositorName: String(data.depositorName ?? ""),
          previousExpiresAt: isoValue(data.previousExpiresAt),
          extendedExpiresAt: isoValue(data.extendedExpiresAt),
          confirmedAt: isoValue(data.confirmedAt),
          confirmedByEmail: String(data.confirmedByEmail ?? ""),
          note: String(data.note ?? ""),
        };
      });
      const monthlyRevenue = monthPaymentsSnapshot.docs.reduce((sum, payment) => sum + Number(payment.data().amount ?? 0), 0);
      return { organizations, recentPayments, monthlyRevenue, generatedAt: now.toISOString() };
    },
  );

  const confirmPlatformPayment = onCall(
    { enforceAppCheck: false, timeoutSeconds: 30, memory: "256MiB" },
    async (request) => {
      requireAppCheck(request);
      const identity = await resolvePlatformAdmin(request, true);
      const data = objectData(request.data);
      const organizationId = textValue(data, "organizationId", 120);
      const depositorName = textValue(data, "depositorName", 80);
      const depositedAt = textValue(data, "depositedAt", 10);
      const note = textValue(data, "note", 500, false);
      const amount = Number(data.amount);
      const months = Number(data.months);
      if (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000_000) {
        throw new HttpsError("invalid-argument", "입금액을 확인해 주세요.");
      }
      if (!Number.isInteger(months) || months < 1 || months > 36) {
        throw new HttpsError("invalid-argument", "연장 개월 수를 확인해 주세요.");
      }
      if (!dateOnly(depositedAt)) throw new HttpsError("invalid-argument", "입금일을 확인해 주세요.");

      const organizationRef = db.doc(`organizations/${organizationId}`);
      const paymentRef = db.collection("platformPayments").doc(randomUUID());
      const now = Timestamp.now();
      const result = await db.runTransaction(async (transaction) => {
        const organization = await transaction.get(organizationRef);
        if (!organization.exists) throw new HttpsError("not-found", "설계사무소를 찾을 수 없습니다.");
        const organizationData = organization.data() ?? {};
        const subscription = subscriptionData(organizationData.subscription);
        const previousExpiry = timestampValue(subscription.expiresAt);
        const extension = calculateSubscriptionExtension(previousExpiry?.toDate() ?? null, now.toDate(), months);
        const expiresAt = Timestamp.fromDate(extension.expiresAt);
        transaction.create(paymentRef, {
          id: paymentRef.id,
          organizationId,
          organizationName: String(organizationData.name ?? "이름 없는 설계사무소"),
          amount,
          months,
          depositedAt,
          depositorName,
          note,
          previousExpiresAt: previousExpiry,
          extensionBaseAt: Timestamp.fromDate(extension.startsAt),
          extendedExpiresAt: expiresAt,
          status: "confirmed",
          confirmedBy: identity!.uid,
          confirmedByEmail: identity!.email,
          confirmedAt: now,
          createdAt: now,
        });
        transaction.update(organizationRef, {
          platformStatus: "active",
          suspendedReason: FieldValue.delete(),
          subscription: {
            ...subscription,
            status: "active",
            planCode: String(subscription.planCode ?? "manual"),
            startedAt: timestampValue(subscription.startedAt) ?? now,
            expiresAt,
            lastPaymentId: paymentRef.id,
            lastPaymentAt: now,
            updatedAt: now,
          },
          updatedAt: now,
        });
        audit(transaction, db, identity!, "payment.confirmed", organizationId, String(organizationData.name ?? ""), {
          paymentId: paymentRef.id,
          amount,
          months,
          depositedAt,
          previousExpiresAt: previousExpiry?.toDate().toISOString() ?? null,
          extendedExpiresAt: extension.expiresAt.toISOString(),
        });
        return {
          paymentId: paymentRef.id,
          previousExpiresAt: previousExpiry?.toDate().toISOString() ?? null,
          extendedExpiresAt: extension.expiresAt.toISOString(),
        };
      });
      return result;
    },
  );

  const updatePlatformOrganizationStatus = onCall(
    { enforceAppCheck: false, timeoutSeconds: 30, memory: "256MiB" },
    async (request) => {
      requireAppCheck(request);
      const identity = await resolvePlatformAdmin(request, true);
      const data = objectData(request.data);
      const organizationId = textValue(data, "organizationId", 120);
      const status = textValue(data, "status", 20);
      const reason = textValue(data, "reason", 300, status !== "active");
      if (status !== "active" && status !== "suspended") {
        throw new HttpsError("invalid-argument", "이용 상태를 확인해 주세요.");
      }
      const organizationRef = db.doc(`organizations/${organizationId}`);
      const workspaceSessions = db.collection("platformWorkspaceAccess").where("organizationId", "==", organizationId);
      const now = Timestamp.now();
      let revokedSessionUids: string[] = [];
      await db.runTransaction(async (transaction) => {
        const organization = await transaction.get(organizationRef);
        if (!organization.exists) throw new HttpsError("not-found", "설계사무소를 찾을 수 없습니다.");
        const sessions = status === "suspended" ? await transaction.get(workspaceSessions) : null;
        const organizationData = organization.data() ?? {};
        const currentAccessVersion = Number.isInteger(Number(organizationData.platformAccessVersion))
          ? Number(organizationData.platformAccessVersion)
          : 0;
        const subscription = subscriptionData(organizationData.subscription);
        const expiresAt = timestampValue(subscription.expiresAt);
        const subscriptionStatus = status === "suspended"
          ? "suspended"
          : !expiresAt
            ? "unconfigured"
            : expiresAt.toMillis() >= now.toMillis() ? "active" : "overdue";
        transaction.update(organizationRef, {
          platformStatus: status,
          platformAccessVersion: status === "suspended"
            ? currentAccessVersion + 1
            : currentAccessVersion,
          suspendedReason: status === "suspended" ? reason : FieldValue.delete(),
          suspendedAt: status === "suspended" ? now : FieldValue.delete(),
          subscription: { ...subscription, status: subscriptionStatus, updatedAt: now },
          updatedAt: now,
        });
        sessions?.docs.forEach((session) => transaction.delete(session.ref));
        revokedSessionUids = sessions?.docs.map((session) => session.id) ?? [];
        audit(transaction, db, identity!, status === "suspended" ? "organization.suspended" : "organization.reactivated", organizationId, String(organizationData.name ?? ""), {
          reason,
          revokedWorkspaceSessions: sessions?.size ?? 0,
        });
      });
      if (status === "suspended" && revokedSessionUids.length) {
        await Promise.allSettled(revokedSessionUids.map(async (uid) => {
          const administrator = await auth.getUser(uid);
          const claims: Record<string, unknown> = { ...(administrator.customClaims ?? {}) };
          delete claims.platformWorkspaceOrganizationId;
          delete claims.platformWorkspaceRole;
          delete claims.platformWorkspaceExpiresAt;
          delete claims.platformWorkspaceSessionId;
          delete claims.platformWorkspaceAccessVersion;
          await auth.setCustomUserClaims(uid, claims);
        }));
      }
      return { organizationId, status };
    },
  );

  return {
    getPlatformAdminAccess,
    startPlatformWorkspaceAccess,
    endPlatformWorkspaceAccess,
    getPlatformAdminDashboard,
    confirmPlatformPayment,
    updatePlatformOrganizationStatus,
  };
}
