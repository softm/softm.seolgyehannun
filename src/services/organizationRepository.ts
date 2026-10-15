import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { PermitCatalogItem } from "../domain/permits";
import {
  defaultDeadlineDefaults,
  defaultNotificationDefaults,
  defaultRegionProfiles,
  normalizeDeadlineDefaults,
  normalizeRegionProfile,
  type OrganizationAuditEntry,
  type OrganizationDeadlineDefaults,
  type OrganizationNotificationDefaults,
  type OrganizationRegionProfileRecord,
} from "../domain/organizationAdmin";
import type { CaseStatus, OrganizationRole } from "../types";
import { getFirebaseServices } from "./firebase";

export interface OrganizationMemberRecord {
  id: string;
  displayName: string;
  email: string;
  role: OrganizationRole;
  status: "active" | "pending" | "suspended";
}

export interface OrganizationInvitationRecord {
  id: string;
  email: string;
  role: OrganizationRole;
  status: "pending" | "accepted" | "cancelled" | "expired";
  expiresAt: string;
  createdAt: string;
}

export interface OrganizationProfileRecord {
  name: string;
}

export interface CustomPermitCatalogItem extends PermitCatalogItem {
  relatedPrimaryCatalogIds: string[];
  order: number;
}

export interface OrganizationWorkflowConfiguration {
  reminderOffsets: number[];
  customStatuses: CaseStatus[];
  customPermits: CustomPermitCatalogItem[];
  deadlineDefaults?: OrganizationDeadlineDefaults;
  notificationDefaults?: OrganizationNotificationDefaults;
  regionProfiles?: OrganizationRegionProfileRecord[];
}

export interface InvitationResult {
  invitationId: string;
  token: string;
  emailStatus: string;
}

const workflowKey = "seolgye-hannun.workflow-settings.v1";
const demoMembersKey = "seolgye-hannun.demo-members.v1";
const demoInvitationsKey = "seolgye-hannun.demo-invitations.v1";
const demoAuditKey = "seolgye-hannun.demo-admin-audit.v1";
const demoOrganizationKey = "seolgye-hannun.demo-organization.v1";
const workflowEvent = "seolgye:workflow-updated";
const membersEvent = "seolgye:members-updated";
const invitationsEvent = "seolgye:invitations-updated";
const auditEvent = "seolgye:admin-audit-updated";
const organizationEvent = "seolgye:organization-updated";

const emptyConfiguration: OrganizationWorkflowConfiguration = {
  reminderOffsets: [7, 3, 1, 0, -1],
  customStatuses: [],
  customPermits: [],
  deadlineDefaults: defaultDeadlineDefaults,
  notificationDefaults: defaultNotificationDefaults,
  regionProfiles: defaultRegionProfiles,
};

const initialDemoMembers: OrganizationMemberRecord[] = [
  { id: "demo-user", displayName: "김설계", email: "demo@seolgye-hannun.local", role: "admin", status: "active" },
  { id: "demo-editor", displayName: "이현장", email: "field@example.com", role: "editor", status: "active" },
  { id: "demo-viewer", displayName: "박검토", email: "review@example.com", role: "viewer", status: "pending" },
];

function parseStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function readDemoConfiguration(): OrganizationWorkflowConfiguration {
  const stored = parseStored<OrganizationWorkflowConfiguration | null>(workflowKey, null);
  if (stored) return {
    ...emptyConfiguration,
    ...stored,
    deadlineDefaults: normalizeDeadlineDefaults(stored.deadlineDefaults),
    notificationDefaults: { ...defaultNotificationDefaults, ...stored.notificationDefaults },
    regionProfiles: (stored.regionProfiles ?? defaultRegionProfiles).map(normalizeRegionProfile),
  };

  // Migrate the very first MVP's name-only local settings without losing user input.
  const statusNames = parseStored<string[]>("seolgye.custom-statuses", []);
  const permitNames = parseStored<string[]>("seolgye.custom-permits", []);
  return {
    ...emptyConfiguration,
    customStatuses: statusNames.map((label, index) => ({
      id: `custom-status-${index + 1}`,
      label,
      color: "#667085",
      order: 100 + index,
    })),
    customPermits: permitNames.map((name, index) => ({
      id: `custom-permit-${index + 1}`,
      name,
      description: "조직 추가 허가 유형",
      category: "main",
      legalBasis: "근거 확인 필요",
      icon: "FileText",
      accent: "green",
      canBePrimary: true,
      relatedPrimaryCatalogIds: [],
      order: 100 + index,
    })),
  };
}

function writeDemoConfiguration(configuration: OrganizationWorkflowConfiguration): void {
  localStorage.setItem(workflowKey, JSON.stringify(configuration));
  window.dispatchEvent(new CustomEvent(workflowEvent));
}

function readDemoMembers(): OrganizationMemberRecord[] {
  return parseStored(demoMembersKey, initialDemoMembers);
}

function writeDemoMembers(members: OrganizationMemberRecord[]): void {
  localStorage.setItem(demoMembersKey, JSON.stringify(members));
  window.dispatchEvent(new CustomEvent(membersEvent));
}

function readDemoInvitations(): OrganizationInvitationRecord[] {
  return parseStored(demoInvitationsKey, []);
}

function writeDemoInvitations(invitations: OrganizationInvitationRecord[]): void {
  localStorage.setItem(demoInvitationsKey, JSON.stringify(invitations));
  window.dispatchEvent(new CustomEvent(invitationsEvent));
}

function readDemoAudit(): OrganizationAuditEntry[] {
  return parseStored(demoAuditKey, []);
}

function writeDemoAudit(entries: OrganizationAuditEntry[]): void {
  localStorage.setItem(demoAuditKey, JSON.stringify(entries.slice(0, 100)));
  window.dispatchEvent(new CustomEvent(auditEvent));
}

function dateText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return "";
}

async function appendOrganizationAudit(
  organizationId: string,
  isDemo: boolean,
  action: string,
  detail: string,
  actorId: string,
  actorName = "관리자",
): Promise<void> {
  const entry: OrganizationAuditEntry = {
    id: crypto.randomUUID(),
    action,
    detail,
    actorId,
    actorName,
    createdAt: new Date().toISOString(),
  };
  if (isDemo) {
    writeDemoAudit([entry, ...readDemoAudit()]);
    return;
  }
  const services = getFirebaseServices();
  if (!services) return;
  const auditRef = doc(services.db, "organizations", organizationId, "settings", "admin-audit");
  const snapshot = await getDoc(auditRef);
  const previous = Array.isArray(snapshot.data()?.entries) ? snapshot.data()!.entries as OrganizationAuditEntry[] : [];
  await setDoc(auditRef, { entries: [entry, ...previous].slice(0, 100), updatedAt: serverTimestamp() });
}

export function subscribeOrganizationConfiguration(
  organizationId: string,
  isDemo: boolean,
  callback: (configuration: OrganizationWorkflowConfiguration) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const services = getFirebaseServices();
  if (isDemo || !services) {
    const publish = () => callback(readDemoConfiguration());
    publish();
    window.addEventListener(workflowEvent, publish);
    return () => window.removeEventListener(workflowEvent, publish);
  }

  let workflow = {
    reminderOffsets: emptyConfiguration.reminderOffsets,
    customStatuses: [] as CaseStatus[],
    deadlineDefaults: defaultDeadlineDefaults,
    notificationDefaults: defaultNotificationDefaults,
    regionProfiles: defaultRegionProfiles,
  };
  let customPermits: CustomPermitCatalogItem[] = [];
  const publish = () => callback({ ...workflow, customPermits });
  const settingsRef = doc(services.db, "organizations", organizationId, "settings", "workflow");
  const catalogRef = doc(services.db, "organizations", organizationId, "catalogs", "permits");
  const unsubscribeSettings = onSnapshot(settingsRef, (snapshot) => {
    const data = snapshot.data();
    workflow = {
      reminderOffsets: Array.isArray(data?.reminderOffsets) ? data.reminderOffsets.map(Number) : emptyConfiguration.reminderOffsets,
      customStatuses: Array.isArray(data?.customStatuses) ? data.customStatuses as CaseStatus[] : [],
      deadlineDefaults: normalizeDeadlineDefaults(data?.deadlineDefaults as Partial<OrganizationDeadlineDefaults> | undefined),
      notificationDefaults: {
        ...defaultNotificationDefaults,
        ...(data?.notificationDefaults as Partial<OrganizationNotificationDefaults> | undefined),
      },
      regionProfiles: Array.isArray(data?.regionProfiles)
        ? (data.regionProfiles as OrganizationRegionProfileRecord[]).map(normalizeRegionProfile)
        : defaultRegionProfiles,
    };
    publish();
  }, (error) => onError?.(error));
  const unsubscribeCatalog = onSnapshot(catalogRef, (snapshot) => {
    customPermits = Array.isArray(snapshot.data()?.items) ? snapshot.data()!.items.map((item: Record<string, unknown>) => ({
      ...item,
      relatedPrimaryCatalogIds: Array.isArray(item.relatedPrimaryCatalogIds)
        ? item.relatedPrimaryCatalogIds.map(String)
        : String(item.relatedPrimaryCatalogId ?? "").split(",").filter(Boolean),
    })) as CustomPermitCatalogItem[] : [];
    publish();
  }, (error) => onError?.(error));
  return () => {
    unsubscribeSettings();
    unsubscribeCatalog();
  };
}

export async function saveOrganizationConfiguration(
  organizationId: string,
  isDemo: boolean,
  configuration: OrganizationWorkflowConfiguration,
  updatedBy: string,
  updatedByName = "관리자",
): Promise<void> {
  const normalized = {
    reminderOffsets: [...new Set(configuration.reminderOffsets)].sort((a, b) => b - a),
    customStatuses: configuration.customStatuses.map((status, index) => ({ ...status, order: 100 + index })),
    customPermits: configuration.customPermits.map((permit, index) => ({ ...permit, order: 100 + index })),
    deadlineDefaults: normalizeDeadlineDefaults(configuration.deadlineDefaults),
    notificationDefaults: { ...defaultNotificationDefaults, ...configuration.notificationDefaults },
    regionProfiles: (configuration.regionProfiles ?? defaultRegionProfiles).map(normalizeRegionProfile),
  };
  const services = getFirebaseServices();
  if (isDemo || !services) {
    writeDemoConfiguration(normalized);
    await appendOrganizationAudit(organizationId, true, "workflow.settings", "조직 운영 설정을 변경했습니다.", updatedBy, updatedByName);
    return;
  }
  await Promise.all([
    setDoc(doc(services.db, "organizations", organizationId, "settings", "workflow"), {
      reminderOffsets: normalized.reminderOffsets,
      customStatuses: normalized.customStatuses,
      deadlineDefaults: normalized.deadlineDefaults,
      notificationDefaults: normalized.notificationDefaults,
      regionProfiles: normalized.regionProfiles,
      updatedBy,
      updatedAt: serverTimestamp(),
    }, { merge: true }),
    setDoc(doc(services.db, "organizations", organizationId, "catalogs", "permits"), {
      items: normalized.customPermits.map(({ relatedPrimaryCatalogIds, ...permit }) => ({
        ...permit,
        relatedPrimaryCatalogId: relatedPrimaryCatalogIds.join(","),
      })),
      updatedBy,
      updatedAt: serverTimestamp(),
    }, { merge: true }),
  ]);
  await appendOrganizationAudit(organizationId, isDemo, "workflow.settings", "조직 운영 설정을 변경했습니다.", updatedBy, updatedByName);
}

export function subscribeOrganizationMembers(
  organizationId: string,
  isDemo: boolean,
  callback: (members: OrganizationMemberRecord[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const services = getFirebaseServices();
  if (isDemo || !services) {
    const publish = () => callback(readDemoMembers());
    publish();
    window.addEventListener(membersEvent, publish);
    return () => window.removeEventListener(membersEvent, publish);
  }
  return onSnapshot(
    collection(services.db, "organizations", organizationId, "members"),
    (snapshot) => callback(snapshot.docs.map((item) => ({
      id: item.id,
      displayName: String(item.data().displayName ?? "사용자"),
      email: String(item.data().email ?? ""),
      role: item.data().role as OrganizationRole,
      status: item.data().status === "pending" ? "pending" : item.data().status === "suspended" ? "suspended" : "active",
    }))),
    (error) => onError?.(error),
  );
}

export async function updateOrganizationMemberRole(
  organizationId: string,
  memberId: string,
  role: OrganizationRole,
  isDemo: boolean,
  actorId = "",
  actorName = "관리자",
): Promise<void> {
  const services = getFirebaseServices();
  if (isDemo || !services) {
    writeDemoMembers(readDemoMembers().map((member) => member.id === memberId ? { ...member, role } : member));
    await appendOrganizationAudit(organizationId, true, "member.role", `구성원 역할을 ${role}(으)로 변경했습니다.`, actorId, actorName);
    return;
  }
  await updateDoc(doc(services.db, "organizations", organizationId, "members", memberId), {
    role,
    updatedAt: serverTimestamp(),
  });
  await appendOrganizationAudit(organizationId, false, "member.role", `구성원 역할을 ${role}(으)로 변경했습니다.`, actorId, actorName);
}

export async function updateOrganizationMemberStatus(
  organizationId: string,
  memberId: string,
  status: "active" | "suspended",
  isDemo: boolean,
  actorId: string,
  actorName: string,
): Promise<void> {
  const services = getFirebaseServices();
  if (isDemo || !services) {
    writeDemoMembers(readDemoMembers().map((member) => member.id === memberId ? { ...member, status } : member));
  } else {
    await updateDoc(doc(services.db, "organizations", organizationId, "members", memberId), {
      status,
      updatedAt: serverTimestamp(),
    });
  }
  await appendOrganizationAudit(organizationId, isDemo, "member.status", status === "active" ? "구성원 사용을 재개했습니다." : "구성원 사용을 정지했습니다.", actorId, actorName);
}

export async function removeOrganizationMember(
  organizationId: string,
  memberId: string,
  isDemo: boolean,
  actorId: string,
  actorName: string,
): Promise<void> {
  const services = getFirebaseServices();
  if (isDemo || !services) writeDemoMembers(readDemoMembers().filter((member) => member.id !== memberId));
  else await deleteDoc(doc(services.db, "organizations", organizationId, "members", memberId));
  await appendOrganizationAudit(organizationId, isDemo, "member.remove", "구성원을 업무공간에서 제거했습니다.", actorId, actorName);
}

export async function createOrganizationInvitation(
  organizationId: string,
  email: string,
  role: OrganizationRole,
  isDemo: boolean,
  actorId = "",
  actorName = "관리자",
): Promise<InvitationResult> {
  if (isDemo) {
    const token = crypto.randomUUID();
    const next = [...readDemoMembers(), {
      id: `pending-${token}`,
      displayName: email.split("@")[0],
      email,
      role,
      status: "pending" as const,
    }];
    writeDemoMembers(next);
    writeDemoInvitations([{
      id: token,
      email,
      role,
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    }, ...readDemoInvitations()]);
    await appendOrganizationAudit(organizationId, true, "invitation.create", `${email} 계정을 ${role} 역할로 초대했습니다.`, actorId, actorName);
    return { invitationId: token, token, emailStatus: "sample" };
  }
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase가 설정되지 않았습니다.");
  const createInvitation = httpsCallable<
    { organizationId: string; email: string; role: OrganizationRole },
    InvitationResult
  >(services.functions, "createInvitation");
  const result = (await createInvitation({ organizationId, email, role })).data;
  await appendOrganizationAudit(organizationId, false, "invitation.create", `${email} 계정을 ${role} 역할로 초대했습니다.`, actorId, actorName);
  return result;
}

export function subscribeOrganizationInvitations(
  organizationId: string,
  isDemo: boolean,
  callback: (invitations: OrganizationInvitationRecord[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const services = getFirebaseServices();
  if (isDemo || !services) {
    const publish = () => callback(readDemoInvitations());
    publish();
    window.addEventListener(invitationsEvent, publish);
    return () => window.removeEventListener(invitationsEvent, publish);
  }
  return onSnapshot(collection(services.db, "organizations", organizationId, "invitations"), (snapshot) => {
    const now = Date.now();
    callback(snapshot.docs.map((item) => {
      const data = item.data();
      const expiresAt = dateText(data.expiresAt);
      const status = data.status === "accepted" || data.status === "cancelled"
        ? data.status
        : expiresAt && new Date(expiresAt).getTime() < now ? "expired" : "pending";
      return {
        id: item.id,
        email: String(data.email ?? ""),
        role: data.role as OrganizationRole,
        status,
        expiresAt,
        createdAt: dateText(data.createdAt),
      };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, (error) => onError?.(error));
}

export async function cancelOrganizationInvitation(
  organizationId: string,
  invitationId: string,
  isDemo: boolean,
  actorId: string,
  actorName: string,
): Promise<void> {
  const services = getFirebaseServices();
  if (isDemo || !services) {
    writeDemoInvitations(readDemoInvitations().map((item) => item.id === invitationId ? { ...item, status: "cancelled" } : item));
    writeDemoMembers(readDemoMembers().filter((member) => member.id !== `pending-${invitationId}`));
  } else {
    await updateDoc(doc(services.db, "organizations", organizationId, "invitations", invitationId), {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
      cancelledBy: actorId,
    });
  }
  await appendOrganizationAudit(organizationId, isDemo, "invitation.cancel", "대기 중인 초대를 취소했습니다.", actorId, actorName);
}

export function subscribeOrganizationProfile(
  organizationId: string,
  isDemo: boolean,
  callback: (profile: OrganizationProfileRecord) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const services = getFirebaseServices();
  if (isDemo || !services) {
    const publish = () => callback(parseStored(demoOrganizationKey, { name: "한눈 토목설계" }));
    publish();
    window.addEventListener(organizationEvent, publish);
    return () => window.removeEventListener(organizationEvent, publish);
  }
  return onSnapshot(doc(services.db, "organizations", organizationId), (snapshot) => {
    callback({ name: String(snapshot.data()?.name ?? "이름 없는 업무공간") });
  }, (error) => onError?.(error));
}

export async function saveOrganizationProfile(
  organizationId: string,
  isDemo: boolean,
  name: string,
  actorId: string,
  actorName: string,
): Promise<void> {
  const normalizedName = name.trim().slice(0, 80);
  if (!normalizedName) throw new Error("업무공간 이름을 입력해 주세요.");
  const services = getFirebaseServices();
  if (isDemo || !services) {
    localStorage.setItem(demoOrganizationKey, JSON.stringify({ name: normalizedName }));
    window.dispatchEvent(new CustomEvent(organizationEvent));
  } else {
    await setDoc(doc(services.db, "organizations", organizationId), {
      name: normalizedName,
      updatedAt: serverTimestamp(),
      updatedBy: actorId,
    }, { merge: true });
  }
  await appendOrganizationAudit(organizationId, isDemo, "organization.profile", `업무공간 이름을 '${normalizedName}'(으)로 변경했습니다.`, actorId, actorName);
}

export function subscribeOrganizationAudit(
  organizationId: string,
  isDemo: boolean,
  callback: (entries: OrganizationAuditEntry[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const services = getFirebaseServices();
  if (isDemo || !services) {
    const publish = () => callback(readDemoAudit());
    publish();
    window.addEventListener(auditEvent, publish);
    return () => window.removeEventListener(auditEvent, publish);
  }
  return onSnapshot(doc(services.db, "organizations", organizationId, "settings", "admin-audit"), (snapshot) => {
    callback(Array.isArray(snapshot.data()?.entries) ? snapshot.data()!.entries as OrganizationAuditEntry[] : []);
  }, (error) => onError?.(error));
}

export async function acceptOrganizationInvitation(organizationId: string, token: string): Promise<void> {
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase가 설정되지 않았습니다.");
  const acceptInvitation = httpsCallable<{ organizationId: string; token: string }, { organizationId: string; role: OrganizationRole }>(
    services.functions,
    "acceptInvitation",
  );
  await acceptInvitation({ organizationId, token });
}
