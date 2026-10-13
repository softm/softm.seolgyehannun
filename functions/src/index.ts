import { createHash, randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import PDFDocument from "pdfkit";
import { defineBoolean, defineSecret, defineString } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest, type CallableRequest, type Request, type Response } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { copyAllowedVWorldQuery } from "./vworldProxy.js";

initializeApp();
setGlobalOptions({ region: "asia-northeast3", maxInstances: 10 });

const db = getFirestore();
const bucket = getStorage().bucket();
const vworldApiKey = defineSecret("VWORLD_API_KEY");
const vworldDomain = defineString("VWORLD_DOMAIN", { default: "localhost" });
const allowedOrigins = defineString("ALLOWED_ORIGINS", { default: "http://localhost:5173,http://127.0.0.1:5173" });
const enforceAppCheck = defineBoolean("ENFORCE_APP_CHECK", { default: false });

const ALLOWED_VWORLD_SERVICES = new Set(["search", "address", "data", "wms"]);
const ALLOWED_NED_OPERATIONS = new Set([
  "getBuildingUse",
  "ladfrlList",
  "getPossessionAttr",
  "getLandMoveAttr",
  "getLandCharacteristics",
  "getIndvdLandPriceAttr",
  "getLandUseAttr",
]);
interface AuthenticatedRequest {
  uid: string;
  email?: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function formatKstDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  return allowedOrigins.value().split(",").map((item) => item.trim()).filter(Boolean).includes(origin);
}

async function authenticateHttpRequest(request: Request): Promise<AuthenticatedRequest> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const decoded = await getAuth().verifyIdToken(authorization.slice(7));
  if (process.env.FUNCTIONS_EMULATOR !== "true") {
    const appCheckToken = request.header("X-Firebase-AppCheck");
    if (enforceAppCheck.value() && !appCheckToken) {
      throw new HttpsError("failed-precondition", "App Check 토큰이 필요합니다.");
    }
    if (appCheckToken) await getAppCheck().verifyToken(appCheckToken);
  }
  return { uid: decoded.uid, email: decoded.email };
}

function requireCallableAppCheck(request: CallableRequest): void {
  if (process.env.FUNCTIONS_EMULATOR !== "true" && enforceAppCheck.value() && !request.app) {
    throw new HttpsError("failed-precondition", "App Check 토큰이 필요합니다.");
  }
}

function applyCors(request: Request, response: Response): boolean {
  const origin = request.headers.origin;
  if (!originAllowed(origin)) {
    response.status(403).json({ error: "허용되지 않은 출처입니다." });
    return false;
  }
  if (origin) response.set("Access-Control-Allow-Origin", origin);
  response.set("Vary", "Origin");
  response.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Firebase-AppCheck");
  response.set("Access-Control-Expose-Headers", "Content-Disposition, Content-Length, Content-Type");
  response.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return false;
  }
  return true;
}

export interface ReceiptLookupResult {
  mode: "sample" | "connected";
  status: "found" | "unsupported" | "failed";
  message: string;
  agency?: string;
  receivedAt?: string;
}

export interface ReceiptLookupProvider {
  lookup(receiptNumber: string, jurisdictionCode: string): Promise<ReceiptLookupResult>;
}

class SampleReceiptLookupProvider implements ReceiptLookupProvider {
  async lookup(receiptNumber: string, jurisdictionCode: string): Promise<ReceiptLookupResult> {
    if (!receiptNumber.trim()) return { mode: "sample", status: "failed", message: "접수번호가 필요합니다." };
    if (jurisdictionCode !== "41590") return { mode: "sample", status: "unsupported", message: "연결되지 않은 기관입니다. 직접 입력해 주세요." };
    return { mode: "sample", status: "found", message: "샘플 응답이며 실제 기관 처리 상태가 아닙니다.", agency: "화성시 (샘플)", receivedAt: new Date().toISOString() };
  }
}

export const api = onRequest(
  { secrets: [vworldApiKey], timeoutSeconds: 60, memory: "256MiB", cors: false },
  async (request, response) => {
    if (!applyCors(request, response)) return;
    try {
      const actor = await authenticateHttpRequest(request);
      if (request.method !== "GET") {
        response.status(405).json({ error: "GET 요청만 지원합니다." });
        return;
      }

      const incomingUrl = new URL(request.originalUrl, "https://local.invalid");
      const pathname = incomingUrl.pathname.replace(/^\/api/, "");
      const serviceMatch = pathname.match(/^\/vworld\/(search|address|data|wms)$/);
      const nedMatch = pathname.match(/^\/vworld\/ned\/([A-Za-z]+)$/);

      if (pathname === "/documents/download") {
        const organizationId = incomingUrl.searchParams.get("organizationId") ?? "";
        const caseId = incomingUrl.searchParams.get("caseId") ?? "";
        const documentId = incomingUrl.searchParams.get("documentId") ?? "";
        const type = incomingUrl.searchParams.get("type") === "pdf" ? "pdf" : incomingUrl.searchParams.get("type") === "docx" ? "docx" : "";
        if (!organizationId || !caseId || !documentId || !type) {
          throw new HttpsError("invalid-argument", "문서 다운로드 요청을 확인해 주세요.");
        }
        const membership = await db.doc(`organizations/${organizationId}/members/${actor.uid}`).get();
        if (!membership.exists || !["admin", "editor", "viewer"].includes(String(membership.data()?.role))) {
          throw new HttpsError("permission-denied", "이 문서를 내려받을 권한이 없습니다.");
        }
        const documentSnapshot = await db.doc(`organizations/${organizationId}/cases/${caseId}/documents/${documentId}`).get();
        const documentData = documentSnapshot.data();
        if (!documentSnapshot.exists || documentData?.status !== "ready") {
          throw new HttpsError("not-found", "완료된 문서를 찾지 못했습니다.");
        }
        const storagePath = String(type === "pdf" ? documentData.pdfPath ?? "" : documentData.docxPath ?? "");
        const expectedPrefix = `organizations/${organizationId}/cases/${caseId}/documents/${documentId}/`;
        if (!storagePath.startsWith(expectedPrefix) || storagePath.includes("..") || !storagePath.toLowerCase().endsWith(`.${type}`)) {
          throw new HttpsError("permission-denied", "문서 저장 경로를 확인할 수 없습니다.");
        }
        const file = bucket.file(storagePath);
        const [metadata] = await file.getMetadata();
        if (Number(metadata.size ?? 0) > 50 * 1024 * 1024) {
          throw new HttpsError("failed-precondition", "50MB를 초과한 문서는 내려받을 수 없습니다.");
        }
        const [contents] = await file.download();
        const fileName = storagePath.slice(expectedPrefix.length);
        response.set("Content-Type", metadata.contentType || (type === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
        response.set("Content-Disposition", `attachment; filename="document-${documentId}.${type}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        response.set("Content-Length", String(contents.byteLength));
        response.set("Cache-Control", "private, no-store, max-age=0");
        response.status(200).send(contents);
        return;
      }

      if (serviceMatch) {
        const service = serviceMatch[1];
        if (!ALLOWED_VWORLD_SERVICES.has(service)) {
          response.status(404).json({ error: "지원하지 않는 VWorld 서비스입니다." });
          return;
        }
        const target = new URL(`https://api.vworld.kr/req/${service}`);
        copyAllowedVWorldQuery(incomingUrl.searchParams, target.searchParams);
        target.searchParams.set("key", vworldApiKey.value());
        target.searchParams.set("domain", vworldDomain.value());
        const upstream = await fetch(target, {
          headers: { Accept: request.headers.accept || "*/*", Referer: `https://${vworldDomain.value()}/`, "User-Agent": "SeolgyeHannun/0.1" },
        });
        response.status(upstream.status);
        response.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
        response.set("Cache-Control", service === "wms" ? "private, max-age=300" : "no-store");
        response.send(Buffer.from(await upstream.arrayBuffer()));
        return;
      }

      if (nedMatch) {
        const operation = nedMatch[1];
        if (!ALLOWED_NED_OPERATIONS.has(operation)) {
          response.status(404).json({ error: "지원하지 않는 NED 조회입니다." });
          return;
        }
        const target = new URL(`https://api.vworld.kr/ned/data/${operation}`);
        copyAllowedVWorldQuery(incomingUrl.searchParams, target.searchParams);
        target.searchParams.set("key", vworldApiKey.value());
        target.searchParams.set("domain", vworldDomain.value());
        target.searchParams.set("format", "json");
        const upstream = await fetch(target, {
          headers: { Accept: "application/json", Referer: `https://${vworldDomain.value()}/`, "User-Agent": "SeolgyeHannun/0.1" },
        });
        response.status(upstream.status);
        response.set("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
        response.set("Cache-Control", "private, max-age=300");
        response.send(Buffer.from(await upstream.arrayBuffer()));
        return;
      }

      if (pathname === "/receipts/sample") {
        const result = await new SampleReceiptLookupProvider().lookup(
          incomingUrl.searchParams.get("receiptNumber") ?? "",
          incomingUrl.searchParams.get("jurisdictionCode") ?? "",
        );
        response.json(result);
        return;
      }

      response.status(404).json({ error: "지원하지 않는 API 경로입니다." });
    } catch (error) {
      logger.error("API request failed", error);
      const status = error instanceof HttpsError && error.code === "unauthenticated"
        ? 401
        : error instanceof HttpsError && error.code === "not-found"
          ? 404
          : error instanceof HttpsError && ["invalid-argument", "failed-precondition"].includes(error.code)
            ? 400
            : error instanceof HttpsError
              ? 403
              : 502;
      response.status(status).json({ error: error instanceof Error ? error.message : "외부 서비스 연결에 실패했습니다." });
    }
  },
);

async function requireRole(request: CallableRequest, organizationId: string, roles: string[]): Promise<void> {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const membership = await db.doc(`organizations/${organizationId}/members/${request.auth.uid}`).get();
  if (!membership.exists || !roles.includes(String(membership.data()?.role))) {
    throw new HttpsError("permission-denied", "이 작업을 수행할 권한이 없습니다.");
  }
}

export const listUserOrganizations = onCall({ enforceAppCheck: false }, async (request) => {
  requireCallableAppCheck(request);
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const organizations = await db.collection("organizations").select("name").get();
  const memberships = organizations.empty
    ? []
    : await db.getAll(...organizations.docs.map((organization) => organization.ref.collection("members").doc(request.auth!.uid)));
  return {
    organizations: organizations.docs.flatMap((organization, index) => {
      const membership = memberships[index];
      if (!membership?.exists || membership.data()?.status !== "active") return [];
      return [{
        id: organization.id,
        name: String(organization.data().name ?? "이름 없는 업무공간"),
        role: String(membership.data()?.role ?? "viewer"),
      }];
    }).sort((left, right) => left.name.localeCompare(right.name, "ko")),
  };
});

export const switchUserOrganization = onCall({ enforceAppCheck: false }, async (request) => {
  requireCallableAppCheck(request);
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const organizationId = String(request.data?.organizationId ?? "").trim();
  if (!organizationId) throw new HttpsError("invalid-argument", "업무공간을 선택해 주세요.");
  const [membership, organization] = await Promise.all([
    db.doc(`organizations/${organizationId}/members/${request.auth.uid}`).get(),
    db.doc(`organizations/${organizationId}`).get(),
  ]);
  if (!membership.exists || membership.data()?.status !== "active" || !organization.exists) {
    throw new HttpsError("permission-denied", "이 업무공간에 접근할 권한이 없습니다.");
  }
  await db.doc(`users/${request.auth.uid}`).set({
    defaultOrganizationId: organizationId,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { organizationId };
});

export const bootstrapOrganization = onCall({ enforceAppCheck: false }, async (request) => {
  requireCallableAppCheck(request);
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const name = String(request.data?.name ?? "").trim();
  if (name.length < 2 || name.length > 80) throw new HttpsError("invalid-argument", "조직 이름을 확인해 주세요.");
  const organizationRef = db.collection("organizations").doc();
  const userRef = db.doc(`users/${request.auth.uid}`);
  const memberRef = organizationRef.collection("members").doc(request.auth.uid);
  await db.runTransaction(async (transaction) => {
    const user = await transaction.get(userRef);
    if (user.data()?.defaultOrganizationId) throw new HttpsError("already-exists", "이미 기본 조직이 있습니다.");
    transaction.set(organizationRef, { name, ownerId: request.auth!.uid, createdAt: FieldValue.serverTimestamp(), reminderOffsets: [7, 3, 1, 0, -1] });
    transaction.set(memberRef, { uid: request.auth!.uid, email: request.auth!.token.email ?? "", displayName: request.auth!.token.name ?? "사용자", role: "admin", status: "active", createdAt: FieldValue.serverTimestamp() });
    transaction.set(userRef, { email: request.auth!.token.email ?? "", displayName: request.auth!.token.name ?? "사용자", defaultOrganizationId: organizationRef.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { organizationId: organizationRef.id };
});

export const createInvitation = onCall({ enforceAppCheck: false }, async (request) => {
  requireCallableAppCheck(request);
  const organizationId = String(request.data?.organizationId ?? "");
  const email = String(request.data?.email ?? "").trim().toLowerCase();
  const role = String(request.data?.role ?? "viewer");
  await requireRole(request, organizationId, ["admin"]);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpsError("invalid-argument", "이메일 주소를 확인해 주세요.");
  if (!new Set(["admin", "editor", "viewer"]).has(role)) throw new HttpsError("invalid-argument", "유효하지 않은 역할입니다.");
  const token = randomUUID();
  const tokenHash = sha256(token);
  const invitationId = tokenHash.slice(0, 32);
  await db.doc(`organizations/${organizationId}/invitations/${invitationId}`).set({
    email,
    role,
    tokenHash,
    status: "pending",
    createdBy: request.auth!.uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
    emailStatus: "not-configured",
  });
  return { invitationId, token, emailStatus: "not-configured" };
});

export const acceptInvitation = onCall({ enforceAppCheck: false }, async (request) => {
  requireCallableAppCheck(request);
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const organizationId = String(request.data?.organizationId ?? "");
  const tokenHash = sha256(String(request.data?.token ?? ""));
  const invitationRef = db.doc(`organizations/${organizationId}/invitations/${tokenHash.slice(0, 32)}`);
  const memberRef = db.doc(`organizations/${organizationId}/members/${request.auth.uid}`);
  const userRef = db.doc(`users/${request.auth.uid}`);
  await db.runTransaction(async (transaction) => {
    const invitation = await transaction.get(invitationRef);
    const data = invitation.data();
    if (!invitation.exists || data?.tokenHash !== tokenHash || data.status !== "pending") throw new HttpsError("not-found", "유효한 초대를 찾지 못했습니다.");
    if (data.expiresAt?.toDate?.().getTime() < Date.now()) throw new HttpsError("deadline-exceeded", "초대가 만료되었습니다.");
    const authEmail = String(request.auth!.token.email ?? "").toLowerCase();
    if (authEmail !== data.email) throw new HttpsError("permission-denied", "초대된 이메일로 로그인해 주세요.");
    transaction.set(memberRef, { uid: request.auth!.uid, email: authEmail, displayName: request.auth!.token.name ?? "사용자", role: data.role, status: "active", acceptedAt: FieldValue.serverTimestamp() });
    transaction.set(userRef, { email: authEmail, displayName: request.auth!.token.name ?? "사용자", defaultOrganizationId: organizationId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.update(invitationRef, { status: "accepted", acceptedBy: request.auth!.uid, acceptedAt: FieldValue.serverTimestamp() });
  });
  return { organizationId, role: (await memberRef.get()).data()?.role };
});

interface CaseDocumentData {
  title?: string;
  applicantName?: string;
  assigneeName?: string;
  projectPurpose?: string;
  constructionSummary?: string;
  scheduleSummary?: string;
  safetyPlan?: string;
  environmentPlan?: string;
  planBody?: Record<string, string>;
  permits?: Array<{ name?: string; relation?: string; applicationKind?: string }>;
}

interface DocumentSnapshot {
  templateId: string;
  title: string;
  statusLabel: string;
  templateVersion: string;
  author: string;
  sections: Array<{ title: string; fields: Array<{ id: string; label: string; value: string; required: boolean }> }>;
  parcels: Array<{ address: string; role: string; ledgerArea: string; surveyedArea: string; plannedArea: string; roadArea: string; excludedArea: string; owner: string }>;
  permits: Array<{ name: string; relation: string; application: string; existingPermit: string; review: string }>;
  attachments: Array<{ name: string; role: string; version: string }>;
  sources: string[];
  notice: string;
}

function safeText(value: unknown, maxLength = 8_000): string {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, maxLength);
}

function sanitizeDocumentSnapshots(value: unknown): DocumentSnapshot[] {
  if (!Array.isArray(value)) return [];
  if (value.length > 10) throw new HttpsError("invalid-argument", "한 번에 생성할 수 있는 문서는 최대 10종입니다.");
  return value.map((document) => {
    const item = document && typeof document === "object" ? document as Record<string, unknown> : {};
    const sections = Array.isArray(item.sections) ? item.sections.slice(0, 30).map((section) => {
      const sectionItem = section && typeof section === "object" ? section as Record<string, unknown> : {};
      const fields = Array.isArray(sectionItem.fields) ? sectionItem.fields.slice(0, 100).map((field) => {
        const fieldItem = field && typeof field === "object" ? field as Record<string, unknown> : {};
        return { id: safeText(fieldItem.id, 120), label: safeText(fieldItem.label, 200), value: safeText(fieldItem.value), required: Boolean(fieldItem.required) };
      }) : [];
      return { title: safeText(sectionItem.title, 200), fields };
    }) : [];
    const parcels = Array.isArray(item.parcels) ? item.parcels.slice(0, 200).map((parcel) => {
      const row = parcel && typeof parcel === "object" ? parcel as Record<string, unknown> : {};
      return {
        address: safeText(row.address, 500), role: safeText(row.role, 100), ledgerArea: safeText(row.ledgerArea, 100),
        surveyedArea: safeText(row.surveyedArea, 100), plannedArea: safeText(row.plannedArea, 100), roadArea: safeText(row.roadArea, 100),
        excludedArea: safeText(row.excludedArea, 100), owner: safeText(row.owner, 500),
      };
    }) : [];
    const permits = Array.isArray(item.permits) ? item.permits.slice(0, 50).map((permit) => {
      const row = permit && typeof permit === "object" ? permit as Record<string, unknown> : {};
      return { name: safeText(row.name, 200), relation: safeText(row.relation, 100), application: safeText(row.application, 100), existingPermit: safeText(row.existingPermit, 300), review: safeText(row.review, 100) };
    }) : [];
    const attachments = Array.isArray(item.attachments) ? item.attachments.slice(0, 500).map((attachment) => {
      const row = attachment && typeof attachment === "object" ? attachment as Record<string, unknown> : {};
      return { name: safeText(row.name, 500), role: safeText(row.role, 200), version: safeText(row.version, 50) };
    }) : [];
    return {
      templateId: safeText(item.templateId, 120),
      title: safeText(item.title, 300) || "제목 없는 문서",
      statusLabel: safeText(item.statusLabel, 200),
      templateVersion: safeText(item.templateVersion, 300),
      author: safeText(item.author, 200),
      sections,
      parcels,
      permits,
      attachments,
      sources: Array.isArray(item.sources) ? item.sources.slice(0, 100).map((source) => safeText(source, 1_000)) : [],
      notice: safeText(item.notice, 2_000),
    };
  });
}

function fallbackDocument(caseData: CaseDocumentData, parcels: FirebaseFirestore.DocumentData[], attachments: FirebaseFirestore.DocumentData[]): DocumentSnapshot {
  return {
    templateId: "legacy-business-plan",
    title: `${caseData.title ?? "제목 없는 업무"} 사업계획서`,
    statusLabel: "기존 사업계획서 편집본",
    templateVersion: "기존 기본서식 1.0",
    author: caseData.assigneeName ?? "-",
    sections: [
      { title: "사업 개요", fields: [{ id: "purpose", label: "사업 목적", value: caseData.projectPurpose ?? "작성 필요", required: true }, { id: "overview", label: "개요", value: caseData.planBody?.overview ?? "작성 필요", required: true }] },
      { title: "공사 계획", fields: [{ id: "constructionSummary", label: "공사 개요", value: caseData.constructionSummary ?? "작성 필요", required: false }, { id: "scheduleSummary", label: "일정", value: caseData.scheduleSummary ?? "작성 필요", required: false }] },
      { title: "안전 및 환경", fields: [{ id: "safetyPlan", label: "안전", value: caseData.safetyPlan ?? "작성 필요", required: false }, { id: "environmentPlan", label: "환경", value: caseData.environmentPlan ?? "작성 필요", required: false }] },
    ],
    parcels: parcels.map((parcel) => ({ address: safeText(parcel.address), role: safeText(parcel.role), ledgerArea: `${parcel.ledgerAreaM2 ?? "-"}㎡`, surveyedArea: `${parcel.surveyedAreaM2 ?? "-"}㎡`, plannedArea: `${parcel.plannedAreaM2 ?? "-"}㎡`, roadArea: `${parcel.roadOccupancyAreaM2 ?? "-"}㎡`, excludedArea: `${parcel.excludedAreaM2 ?? "-"}㎡`, owner: Array.isArray(parcel.ownerNames) ? parcel.ownerNames.join(", ") : "-" })),
    permits: (caseData.permits ?? []).map((permit) => ({ name: permit.name ?? "-", relation: permit.relation ?? "-", application: permit.applicationKind === "change" ? "변경" : "신규", existingPermit: "-", review: "확인 필요" })),
    attachments: attachments.map((attachment) => ({ name: safeText(attachment.name), role: safeText(attachment.role), version: `v${attachment.version ?? 1}` })),
    sources: [],
    notice: "본 문서는 업무 보조용입니다. 제출 전 관할기관과 최신 근거를 확인해야 합니다.",
  };
}

function findKoreanFont(): string {
  const require = createRequire(import.meta.url);
  const packageDirectory = dirname(require.resolve("@fontsource/noto-sans-kr/package.json"));
  const filesDirectory = join(packageDirectory, "files");
  const font = readdirSync(filesDirectory).find((file) => file.includes("korean-400-normal") && file.endsWith(".woff2"));
  if (!font) throw new Error("한글 PDF 글꼴을 찾지 못했습니다.");
  return join(filesDirectory, font);
}

function documentField(document: DocumentSnapshot, id: string): string {
  const result = document.sections.flatMap((section) => section.fields).find((field) => field.id === id)?.value ?? "";
  return result === "작성 필요" ? "" : result;
}

function pdfTemplatePath(fileName: string): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "document-templates", fileName);
}

function addPdfPage(pdf: PDFKit.PDFDocument, layout: "portrait" | "landscape" = "portrait"): void {
  pdf.addPage({ size: "A4", layout, margin: 42 });
  pdf.font("NotoKR").fillColor("#111111");
}

function drawReferenceTitle(pdf: PDFKit.PDFDocument, title: string, top = 42): void {
  pdf.fontSize(23).fillColor("#111111").text(title.split("").join(" "), 42, top, { width: pdf.page.width - 84, align: "center" });
}

function drawFieldAt(
  pdf: PDFKit.PDFDocument,
  text: string,
  leftPercent: number,
  topPercent: number,
  widthPercent: number,
  options: { fontSize?: number; align?: "left" | "center" | "right"; heightPercent?: number } = {},
): void {
  if (!text) return;
  pdf.fontSize(options.fontSize ?? 8.5).fillColor("#111111").text(
    text,
    pdf.page.width * leftPercent / 100,
    pdf.page.height * topPercent / 100,
    {
      width: pdf.page.width * widthPercent / 100,
      height: options.heightPercent ? pdf.page.height * options.heightPercent / 100 : undefined,
      align: options.align ?? "left",
      lineBreak: Boolean(options.heightPercent),
      ellipsis: true,
    },
  );
}

function drawOfficialDate(
  pdf: PDFKit.PDFDocument,
  source: string,
  positions: Array<{ left: number; width: number }>,
  top: number,
): void {
  const [year = "", month = "", day = ""] = source.slice(0, 10).split("-");
  [year, month ? String(Number(month)) : "", day ? String(Number(day)) : ""].forEach((part, index) => {
    drawFieldAt(pdf, part, positions[index].left, top, positions[index].width, { fontSize: 7.2, align: "right" });
  });
}

function renderDevelopmentApplicationPdf(pdf: PDFKit.PDFDocument, document: DocumentSnapshot): void {
  addPdfPage(pdf);
  pdf.image(pdfTemplatePath("development-application-page-1.png"), 0, 0, { width: pdf.page.width, height: pdf.page.height });
  const actionTypes = documentField(document, "actionTypes").replaceAll(" ", "");
  [
    ["공작물설치", 10.7], ["토지형질변경", 29.1], ["토석채취", 48], ["토지분할", 67.2], ["물건적치", 85.6],
  ].forEach(([label, left]) => {
    if (actionTypes.includes(String(label))) drawFieldAt(pdf, "✓", Number(left), 16.75, 2.8, { fontSize: 10, align: "center" });
  });
  const applicantName = [documentField(document, "applicantName"), documentField(document, "representativeName")].filter(Boolean).join(" / ");
  drawFieldAt(pdf, applicantName, 20.3, 21.2, 38.2, { fontSize: 7.5, align: "center" });
  drawFieldAt(pdf, documentField(document, "registrationNumber"), 64.2, 21.2, 24, { fontSize: 7.5, align: "center" });
  drawFieldAt(pdf, documentField(document, "applicantAddress"), 16.1, 23.8, 73, { fontSize: 7.5 });
  drawFieldAt(pdf, documentField(document, "applicantPhone"), 61.2, 25.9, 24, { fontSize: 7.5, align: "center" });
  drawFieldAt(pdf, documentField(document, "siteAddress"), 17, 30.9, 45, { fontSize: 7.2 });
  drawFieldAt(pdf, documentField(document, "landCategory"), 69, 30.9, 18, { fontSize: 7.5, align: "center" });
  drawFieldAt(pdf, documentField(document, "zoning"), 17, 33.5, 45, { fontSize: 7.2 });
  drawFieldAt(pdf, documentField(document, "district"), 69, 33.5, 18, { fontSize: 7.5, align: "center" });
  drawFieldAt(pdf, documentField(document, "slopeDegree"), 34, 41.15, 19, { fontSize: 7.5, align: "center" });
  drawFieldAt(pdf, documentField(document, "soilType"), 70, 41.15, 17, { fontSize: 7.5, align: "center" });
  drawFieldAt(pdf, documentField(document, "buriedRockVolumeM3"), 34, 43.65, 19, { fontSize: 7.5, align: "center" });
  drawFieldAt(pdf, documentField(document, "mainTreeSpecies"), 34, 46.2, 19, { fontSize: 7.5, align: "center" });
  drawFieldAt(pdf, documentField(document, "standingForestAreaM2"), 34, 48.7, 19, { fontSize: 7.5, align: "center" });
  drawFieldAt(pdf, documentField(document, "unforestedAreaM2"), 70, 48.7, 17, { fontSize: 7.5, align: "center" });
  drawFieldAt(pdf, documentField(document, "applicationAreaM2"), 34, 51.2, 45, { fontSize: 7.5 });
  drawFieldAt(pdf, documentField(document, "purpose"), 17, 68.75, 72, { fontSize: 7.5, heightPercent: 2.2 });
  drawOfficialDate(pdf, documentField(document, "startDate"), [{ left: 28.9, width: 6.6 }, { left: 37.5, width: 3.7 }, { left: 43.2, width: 4.5 }], 71);
  drawOfficialDate(pdf, documentField(document, "endDate"), [{ left: 55, width: 7.1 }, { left: 64, width: 4.2 }, { left: 70, width: 4.2 }], 71);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  drawOfficialDate(pdf, today, [{ left: 67.4, width: 5 }, { left: 74.2, width: 5.7 }, { left: 81.8, width: 5.8 }], 76.15);
  drawFieldAt(pdf, applicantName, 53.5, 78.05, 25.5, { fontSize: 7.5, align: "center" });
  addPdfPage(pdf);
  pdf.image(pdfTemplatePath("development-application-page-2.png"), 0, 0, { width: pdf.page.width, height: pdf.page.height });
}

function drawPdfTable(
  pdf: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  options: { x?: number; y?: number; width?: number; rowHeight?: number; columnRatios?: number[] } = {},
): number {
  const x = options.x ?? 42;
  const y = options.y ?? pdf.y;
  const width = options.width ?? pdf.page.width - x * 2;
  const rowHeight = options.rowHeight ?? 32;
  const ratios = options.columnRatios ?? headers.map(() => 1);
  const ratioTotal = ratios.reduce((sum, value) => sum + value, 0);
  const widths = ratios.map((ratio) => width * ratio / ratioTotal);
  const drawRow = (values: string[], top: number, bold = false) => {
    let left = x;
    values.forEach((value, index) => {
      const cellWidth = widths[index];
      pdf.rect(left, top, cellWidth, rowHeight).stroke("#111111");
      pdf.fontSize(7.5).fillColor("#111111").text(value, left + 3, top + 6, { width: cellWidth - 6, height: rowHeight - 10, align: "center", ellipsis: true });
      left += cellWidth;
    });
    if (bold) pdf.font("NotoKR");
  };
  drawRow(headers, y, true);
  rows.forEach((row, index) => drawRow(row, y + rowHeight * (index + 1)));
  return y + rowHeight * (rows.length + 1);
}

function renderAreaStatementPdf(pdf: PDFKit.PDFDocument, document: DocumentSnapshot): void {
  addPdfPage(pdf, "landscape");
  drawReferenceTitle(pdf, "개발행위허가면적조서", 30);
  pdf.fontSize(8).text("단위: ㎡", 42, 74, { width: pdf.page.width - 84, align: "right" });
  const rows = document.parcels.map((parcel) => [parcel.address, parcel.ledgerArea, parcel.plannedArea, parcel.roadArea, parcel.excludedArea, parcel.owner, parcel.role]);
  const numericTotal = (key: "ledgerArea" | "plannedArea" | "roadArea" | "excludedArea") => document.parcels.reduce((sum, parcel) => sum + Number.parseFloat(parcel[key].replace(/[^0-9.-]/g, "") || "0"), 0).toLocaleString("ko-KR");
  rows.push(["합계", numericTotal("ledgerArea"), numericTotal("plannedArea"), numericTotal("roadArea"), numericTotal("excludedArea"), "", `${document.parcels.length}필지`]);
  drawPdfTable(pdf, ["토지 소재지·지번", "지적", "사업부지", "도로점용", "제외면적", "소유자", "비고"], rows, { y: 90, rowHeight: 43, columnRatios: [2.4, 1, 1, 1, 1, 1.35, 1.2] });
}

function renderReferenceSectionsPage(pdf: PDFKit.PDFDocument, title: string, fields: Array<{ label: string; value: string }>, firstPage = false): void {
  addPdfPage(pdf);
  if (firstPage) drawReferenceTitle(pdf, title, 38);
  let y = firstPage ? 104 : 56;
  fields.forEach((field, index) => {
    const heading = `${index + 1}. ${field.label}`;
    pdf.fontSize(11).fillColor("#111111").text(heading, 54, y, { width: pdf.page.width - 108 });
    y = pdf.y + 5;
    pdf.fontSize(8.8).fillColor("#222222").text(field.value || "해당사항 없음.", 70, y, { width: pdf.page.width - 140, lineGap: 3 });
    y = pdf.y + 12;
  });
}

function renderBusinessPlanPdf(pdf: PDFKit.PDFDocument, document: DocumentSnapshot): void {
  const fields = document.sections.flatMap((section) => section.fields);
  const groups = [fields.slice(0, 5), fields.slice(5, 13), fields.slice(13, 22), fields.slice(22)];
  groups.forEach((group, index) => renderReferenceSectionsPage(pdf, "사업계획서", group, index === 0));
}

function renderDamagePreventionPdf(pdf: PDFKit.PDFDocument, document: DocumentSnapshot): void {
  addPdfPage(pdf);
  drawReferenceTitle(pdf, "피해방지계획서", 38);
  const site = documentField(document, "siteAddress");
  const purpose = documentField(document, "purpose");
  const area = documentField(document, "area");
  pdf.fontSize(9.5).text(`◆ 사업장의 위치: ${site}\n◆ 전용 목적: ${purpose}\n◆ 사업장의 면적: ${area}㎡`, 58, 100, { width: pdf.page.width - 116, lineGap: 7 });
  pdf.fontSize(16).text("■ 피 해 방 지 계 획 ■", 58, 178, { width: pdf.page.width - 116, align: "center" });
  const items = ["siteSafety", "soilRunoff", "dust", "traffic", "drainage", "additional"].map((id) => documentField(document, id));
  let y = 226;
  items.forEach((item, index) => {
    pdf.fontSize(9).text(`${index + 1}. ${item || "해당사항 없음."}`, 64, y, { width: pdf.page.width - 128, lineGap: 3 });
    y = pdf.y + 13;
  });
  pdf.fontSize(9).text("7. 상기 사항 외에도 피해방지 등이 필요하다고 인정될 경우 적절한 조치를 취하겠습니다.", 64, y, { width: pdf.page.width - 128, lineGap: 3 });
  pdf.fontSize(9).text(documentField(document, "applicantName"), 64, pdf.page.height - 110, { width: pdf.page.width - 128, align: "right" });
}

function renderGenericPdf(pdf: PDFKit.PDFDocument, document: DocumentSnapshot, version: number, caseData: CaseDocumentData): void {
  addPdfPage(pdf);
  pdf.fontSize(22).fillColor("#0c1c2e").text(document.title, { align: "center" });
  pdf.moveDown(0.3).fontSize(9).fillColor("#08766d").text(document.statusLabel, { align: "center" });
  pdf.moveDown(0.3).fontSize(8).fillColor("#667085").text(`${document.templateVersion} · 제출본 v${version} · 작성자 ${document.author || caseData.assigneeName || "-"} · 생성 ${formatKstDate(new Date())}`, { align: "center" });
  const section = (title: string, lines: string[]) => {
    pdf.moveDown(1.5).fontSize(14).fillColor("#000000").text(title);
    pdf.moveDown(0.45).fontSize(10).fillColor("#344054");
    lines.forEach((line) => pdf.text(line || "작성 필요", { lineGap: 4 }));
  };
  document.sections.forEach((item) => section(item.title, item.fields.map((field) => `${field.label}${field.required ? " *" : ""}: ${field.value || "작성 필요"}`)));
  section("대상 필지 및 면적", document.parcels.map((parcel) => `${parcel.address} · ${parcel.role} · 대장 ${parcel.ledgerArea} · 실측 ${parcel.surveyedArea} · 계획 ${parcel.plannedArea} · 도로 ${parcel.roadArea} · 제외 ${parcel.excludedArea} · 소유자 ${parcel.owner}`));
  section("허가 및 관련 절차", document.permits.map((permit) => `${permit.name} · ${permit.relation} · ${permit.application} · 기존 허가 ${permit.existingPermit} · ${permit.review}`));
  section("첨부 목록", document.attachments.length ? document.attachments.map((attachment) => `${attachment.name} · ${attachment.role} · ${attachment.version}`) : ["등록된 첨부가 없습니다."]);
  section("서식·데이터 출처", document.sources.length ? document.sources : ["출처 정보 없음"]);
  pdf.moveDown(1.2).fontSize(8).fillColor("#475467").text(document.notice);
}

async function createPdfBuffer(caseData: CaseDocumentData, parcels: FirebaseFirestore.DocumentData[], attachments: FirebaseFirestore.DocumentData[], version: number, requestedDocuments: DocumentSnapshot[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const pdf = new PDFDocument({ autoFirstPage: false, info: { Title: `${caseData.title ?? "업무"} 제출서류 묶음`, Author: caseData.assigneeName ?? "설계한눈" } });
    pdf.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    try {
      pdf.registerFont("NotoKR", findKoreanFont());
      const documents = requestedDocuments.length ? requestedDocuments : [fallbackDocument(caseData, parcels, attachments)];
      documents.forEach((document) => {
        if (document.templateId === "development-application") renderDevelopmentApplicationPdf(pdf, document);
        else if (document.templateId === "area-statement") renderAreaStatementPdf(pdf, document);
        else if (document.templateId === "business-plan") renderBusinessPlanPdf(pdf, document);
        else if (document.templateId === "damage-prevention-plan") renderDamagePreventionPdf(pdf, document);
        else renderGenericPdf(pdf, document, version, caseData);
      });
      pdf.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function createDocxBuffer(caseData: CaseDocumentData, parcels: FirebaseFirestore.DocumentData[], attachments: FirebaseFirestore.DocumentData[], version: number, requestedDocuments: DocumentSnapshot[]): Promise<Buffer> {
  const cell = (text: string) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, font: "Noto Sans KR", size: 19 })] })] });
  const documents = requestedDocuments.length ? requestedDocuments : [fallbackDocument(caseData, parcels, attachments)];
  const children: Array<Paragraph | Table> = [];
  documents.forEach((item, index) => {
    children.push(new Paragraph({ text: item.title, heading: HeadingLevel.TITLE, pageBreakBefore: index > 0 }));
    children.push(new Paragraph({ children: [new TextRun({ text: item.statusLabel, bold: true, color: "08766D" })] }));
    children.push(new Paragraph({ text: `${item.templateVersion} · 제출본 v${version} · 작성자 ${item.author || caseData.assigneeName || "-"} · 생성 ${formatKstDate(new Date())}` }));
    item.sections.forEach((section) => {
      children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }));
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [cell("항목"), cell("작성 내용")] }), ...section.fields.map((field) => new TableRow({ children: [cell(`${field.label}${field.required ? " *" : ""}`), cell(field.value || "작성 필요")] }))] }));
    });
    children.push(new Paragraph({ text: "대상 필지 및 면적", heading: HeadingLevel.HEADING_1 }));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [cell("주소"), cell("역할"), cell("대장"), cell("실측"), cell("계획"), cell("도로"), cell("제외"), cell("소유자")] }), ...item.parcels.map((parcel) => new TableRow({ children: [cell(parcel.address), cell(parcel.role), cell(parcel.ledgerArea), cell(parcel.surveyedArea), cell(parcel.plannedArea), cell(parcel.roadArea), cell(parcel.excludedArea), cell(parcel.owner)] }))] }));
    children.push(new Paragraph({ text: "허가 및 관련 절차", heading: HeadingLevel.HEADING_1 }));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [cell("절차"), cell("관계"), cell("신청"), cell("기존 허가"), cell("검토")] }), ...item.permits.map((permit) => new TableRow({ children: [cell(permit.name), cell(permit.relation), cell(permit.application), cell(permit.existingPermit), cell(permit.review)] }))] }));
    children.push(new Paragraph({ text: "첨부 목록", heading: HeadingLevel.HEADING_1 }));
    children.push(...(item.attachments.length ? item.attachments.map((attachment) => new Paragraph({ text: `${attachment.name} · ${attachment.role} · ${attachment.version}` })) : [new Paragraph({ text: "등록된 첨부가 없습니다." })]));
    children.push(new Paragraph({ text: "서식·데이터 출처", heading: HeadingLevel.HEADING_1 }));
    children.push(...item.sources.map((source) => new Paragraph({ text: source, bullet: { level: 0 } })));
    children.push(new Paragraph({ children: [new TextRun({ text: item.notice, bold: true })] }));
  });
  const document = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(document));
}

export const generateCaseDocuments = onCall({ enforceAppCheck: false, timeoutSeconds: 300, memory: "1GiB" }, async (request) => {
  requireCallableAppCheck(request);
  const organizationId = String(request.data?.organizationId ?? "");
  const caseId = String(request.data?.caseId ?? "");
  const requestedDocuments = sanitizeDocumentSnapshots(request.data?.documents);
  if (!requestedDocuments.length) throw new HttpsError("invalid-argument", "출력에 포함할 문서를 선택해 주세요.");
  await requireRole(request, organizationId, ["admin", "editor"]);
  const caseRef = db.doc(`organizations/${organizationId}/cases/${caseId}`);
  const [caseSnapshot, parcelsSnapshot, attachmentsSnapshot] = await Promise.all([
    caseRef.get(), caseRef.collection("parcels").get(), caseRef.collection("attachments").get(),
  ]);
  if (!caseSnapshot.exists) throw new HttpsError("not-found", "업무를 찾지 못했습니다.");

  let version = 1;
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(caseRef);
    version = Number(current.data()?.documentVersionCounter ?? 0) + 1;
    transaction.update(caseRef, { documentVersionCounter: version, updatedAt: new Date().toISOString() });
  });
  const documentId = `v${String(version).padStart(3, "0")}`;
  const documentRef = caseRef.collection("documents").doc(documentId);
  await documentRef.set({ id: documentId, caseId, version, type: "bundle", status: "generating", templateVersion: "인허가 문서 묶음 1.0", templateIds: requestedDocuments.map((item) => item.templateId), sourceSnapshotAt: new Date().toISOString(), createdAt: FieldValue.serverTimestamp(), createdBy: request.auth!.uid, notice: "공식 서식 항목 대응 초안과 사무소 예시 서식 · 제출 전 관할기관 확인 필요" });

  try {
    const caseData = caseSnapshot.data() as CaseDocumentData;
    const parcels = parcelsSnapshot.docs.map((item) => item.data());
    const attachments = attachmentsSnapshot.docs.map((item) => item.data());
    const [pdf, docx] = await Promise.all([
      createPdfBuffer(caseData, parcels, attachments, version, requestedDocuments),
      createDocxBuffer(caseData, parcels, attachments, version, requestedDocuments),
    ]);
    const basePath = `organizations/${organizationId}/cases/${caseId}/documents/${documentId}`;
    const pdfPath = `${basePath}/제출서류묶음_${documentId}.pdf`;
    const docxPath = `${basePath}/제출서류묶음_${documentId}.docx`;
    await Promise.all([
      bucket.file(pdfPath).save(pdf, { resumable: false, contentType: "application/pdf", metadata: { cacheControl: "private,no-store" } }),
      bucket.file(docxPath).save(docx, { resumable: false, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", metadata: { cacheControl: "private,no-store" } }),
    ]);
    await documentRef.update({ status: "ready", pdfPath, docxPath, completedAt: FieldValue.serverTimestamp() });
    return { documentId, version, pdfPath, docxPath };
  } catch (error) {
    await documentRef.update({ status: "failed", errorMessage: error instanceof Error ? error.message : "문서 생성 실패", failedAt: FieldValue.serverTimestamp() });
    throw new HttpsError("internal", "문서를 생성하지 못했습니다.");
  }
});

export const auditCaseWrite = onDocumentWritten("organizations/{organizationId}/cases/{caseId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after) return;
  const eventRef = db.doc(`organizations/${event.params.organizationId}/cases/${event.params.caseId}/events/${event.id}`);
  await eventRef.set({
    type: before ? "case.updated" : "case.created",
    actorId: after.lastModifiedBy ?? "system",
    actorName: after.lastModifiedByName ?? "시스템 또는 클라이언트",
    createdAt: FieldValue.serverTimestamp(),
    summary: before ? `업무 v${before.version ?? 0} → v${after.version ?? 0}` : "업무가 생성되었습니다.",
    beforeVersion: before?.version ?? null,
    afterVersion: after.version ?? null,
  });
});

export const createDeadlineNotifications = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Asia/Seoul", retryCount: 3, memory: "256MiB" },
  async () => {
    const now = new Date();
    const today = formatKstDate(now);
    const horizon = formatKstDate(new Date(now.getTime() + 7 * 86_400_000));
    const cases = await db.collectionGroup("cases").where("nextDeadlineAt", "<=", horizon).limit(500).get();
    let created = 0;
    for (const caseSnapshot of cases.docs) {
      const data = caseSnapshot.data();
      if (["completed", "stopped"].includes(data.status) || !data.nextDeadlineAt) continue;
      const due = new Date(`${data.nextDeadlineAt}T00:00:00+09:00`);
      const start = new Date(`${today}T00:00:00+09:00`);
      const distance = Math.round((due.getTime() - start.getTime()) / 86_400_000);
      const offsets: number[] = Array.isArray(data.reminderOffsets) ? data.reminderOffsets : [7, 3, 1, 0, -1];
      const shouldNotify = offsets.includes(distance) || (distance < 0 && offsets.includes(-1));
      if (!shouldNotify) continue;
      const organizationId = String(data.organizationId ?? caseSnapshot.ref.parent.parent?.id ?? "");
      const notificationId = sha256(`${organizationId}:${caseSnapshot.id}:${data.nextDeadlineAt}:${distance < 0 ? "late" : distance}`).slice(0, 32);
      const notificationRef = caseSnapshot.ref.collection("notifications").doc(notificationId);
      const wasCreated = await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(notificationRef);
        if (existing.exists) return false;
        transaction.create(notificationRef, {
          id: notificationId,
          organizationId,
          caseId: caseSnapshot.id,
          recipientId: data.assigneeId,
          type: distance < 0 ? "deadline.overdue" : "deadline.reminder",
          title: distance < 0 ? `${Math.abs(distance)}일 지연된 업무가 있습니다.` : distance === 0 ? "오늘 마감인 업무가 있습니다." : `${distance}일 남은 업무가 있습니다.`,
          body: `${data.title} · ${data.nextAction ?? "다음 행동 확인"}`,
          dueAt: data.nextDeadlineAt,
          createdAt: FieldValue.serverTimestamp(),
          readAt: null,
          emailStatus: "not-configured",
          idempotencyKey: notificationId,
        });
        return true;
      });
      if (wasCreated) created += 1;
    }
    logger.info("Deadline notification schedule completed", { scanned: cases.size, created });
  },
);
