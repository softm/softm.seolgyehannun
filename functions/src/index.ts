import { createHash, randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
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

function findKoreanFont(): string {
  const require = createRequire(import.meta.url);
  const packageDirectory = dirname(require.resolve("@fontsource/noto-sans-kr/package.json"));
  const filesDirectory = join(packageDirectory, "files");
  const font = readdirSync(filesDirectory).find((file) => file.includes("korean-400-normal") && file.endsWith(".woff2"));
  if (!font) throw new Error("한글 PDF 글꼴을 찾지 못했습니다.");
  return join(filesDirectory, font);
}

async function createPdfBuffer(caseData: CaseDocumentData, parcels: FirebaseFirestore.DocumentData[], attachments: FirebaseFirestore.DocumentData[], version: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const pdf = new PDFDocument({ size: "A4", margin: 52, info: { Title: `${caseData.title ?? "업무"} 사업계획서`, Author: caseData.assigneeName ?? "설계한눈" } });
    pdf.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    try {
      pdf.registerFont("NotoKR", findKoreanFont());
      pdf.font("NotoKR");
      pdf.fontSize(22).fillColor("#0c1c2e").text(`${caseData.title ?? "제목 없는 업무"} 사업계획서`, { align: "center" });
      pdf.moveDown(0.5).fontSize(9).fillColor("#667085").text(`버전 ${version} · 작성자 ${caseData.assigneeName ?? "-"} · 생성 ${formatKstDate(new Date())}`, { align: "center" });
      const section = (title: string, lines: string[]) => {
        pdf.moveDown(1.5).fontSize(14).fillColor("#000000").text(title);
        pdf.moveDown(0.45).fontSize(10).fillColor("#344054");
        lines.forEach((line) => pdf.text(line || "작성 필요", { lineGap: 4 }));
      };
      section("대상 필지", parcels.map((parcel) => `${parcel.address ?? "주소 확인 필요"} · PNU ${parcel.pnu ?? "-"} · ${parcel.ledgerAreaM2 ?? "-"}㎡`));
      section("허가 및 관련 절차", (caseData.permits ?? []).map((permit) => `${permit.name ?? "-"} · ${permit.relation ?? "-"} · ${permit.applicationKind === "change" ? "변경" : "신규"}`));
      section("사업 개요", [caseData.projectPurpose ?? "", caseData.planBody?.overview ?? ""]);
      section("공사 계획", [caseData.constructionSummary ?? "", caseData.scheduleSummary ?? "", caseData.planBody?.projectPlan ?? ""]);
      section("안전 및 환경 대책", [`안전: ${caseData.safetyPlan ?? "작성 필요"}`, `환경: ${caseData.environmentPlan ?? "작성 필요"}`, caseData.planBody?.managementPlan ?? ""]);
      section("첨부 목록", attachments.length ? attachments.map((attachment) => `${attachment.name ?? "-"} · ${attachment.role ?? "기타"} · v${attachment.version ?? 1}`) : ["등록된 첨부가 없습니다."]);
      pdf.moveDown(1.5).fontSize(8).fillColor("#475467").text("본 문서는 업무 보조용입니다. 공식 허가 판단을 대체하지 않으며, 제출 전 관할기관과 최신 근거를 확인해야 합니다.");
      pdf.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function createDocxBuffer(caseData: CaseDocumentData, parcels: FirebaseFirestore.DocumentData[], attachments: FirebaseFirestore.DocumentData[], version: number): Promise<Buffer> {
  const cell = (text: string) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, font: "Noto Sans KR", size: 19 })] })] });
  const document = new Document({ sections: [{ children: [
    new Paragraph({ text: `${caseData.title ?? "제목 없는 업무"} 사업계획서`, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `버전 ${version} · 작성자 ${caseData.assigneeName ?? "-"} · 생성 ${formatKstDate(new Date())}` }),
    new Paragraph({ text: "대상 필지", heading: HeadingLevel.HEADING_1 }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [cell("주소"), cell("PNU"), cell("면적")] }), ...parcels.map((parcel) => new TableRow({ children: [cell(String(parcel.address ?? "-")), cell(String(parcel.pnu ?? "-")), cell(`${parcel.ledgerAreaM2 ?? "-"}㎡`)] }))] }),
    new Paragraph({ text: "허가 및 관련 절차", heading: HeadingLevel.HEADING_1 }),
    ...(caseData.permits ?? []).map((permit) => new Paragraph({ text: `${permit.name ?? "-"} · ${permit.relation ?? "-"} · ${permit.applicationKind === "change" ? "변경" : "신규"}` })),
    new Paragraph({ text: "사업 개요", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: caseData.projectPurpose ?? "작성 필요" }),
    new Paragraph({ text: caseData.planBody?.overview ?? "작성 필요" }),
    new Paragraph({ text: "공사 계획", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: caseData.constructionSummary ?? "작성 필요" }),
    new Paragraph({ text: caseData.scheduleSummary ?? "작성 필요" }),
    new Paragraph({ text: "안전 및 환경 대책", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: `안전: ${caseData.safetyPlan ?? "작성 필요"}` }),
    new Paragraph({ text: `환경: ${caseData.environmentPlan ?? "작성 필요"}` }),
    new Paragraph({ text: "첨부 목록", heading: HeadingLevel.HEADING_1 }),
    ...(attachments.length ? attachments.map((attachment) => new Paragraph({ text: `${attachment.name ?? "-"} · ${attachment.role ?? "기타"} · v${attachment.version ?? 1}` })) : [new Paragraph({ text: "등록된 첨부가 없습니다." })]),
    new Paragraph({ children: [new TextRun({ text: "본 문서는 업무 보조용입니다. 공식 허가 판단을 대체하지 않으며, 제출 전 관할기관과 최신 근거를 확인해야 합니다.", bold: true })] }),
  ] }] });
  return Buffer.from(await Packer.toBuffer(document));
}

export const generateCaseDocuments = onCall({ enforceAppCheck: false, timeoutSeconds: 300, memory: "1GiB" }, async (request) => {
  requireCallableAppCheck(request);
  const organizationId = String(request.data?.organizationId ?? "");
  const caseId = String(request.data?.caseId ?? "");
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
  await documentRef.set({ id: documentId, caseId, version, type: "bundle", status: "generating", templateVersion: "개발행위 기본서식 1.0", sourceSnapshotAt: new Date().toISOString(), createdAt: FieldValue.serverTimestamp(), createdBy: request.auth!.uid, notice: "업무 보조용 · 제출 전 관할기관 확인 필요" });

  try {
    const caseData = caseSnapshot.data() as CaseDocumentData;
    const parcels = parcelsSnapshot.docs.map((item) => item.data());
    const attachments = attachmentsSnapshot.docs.map((item) => item.data());
    const [pdf, docx] = await Promise.all([
      createPdfBuffer(caseData, parcels, attachments, version),
      createDocxBuffer(caseData, parcels, attachments, version),
    ]);
    const basePath = `organizations/${organizationId}/cases/${caseId}/documents/${documentId}`;
    const pdfPath = `${basePath}/사업계획서_${documentId}.pdf`;
    const docxPath = `${basePath}/사업계획서_${documentId}.docx`;
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
