import { httpsCallable } from "firebase/functions";
import { attachmentDownloadUrl } from "./storage";
import { getFirebaseServices } from "./firebase";

export interface GeneratedDocumentBundle {
  documentId: string;
  version: number;
  pdfPath: string;
  docxPath: string;
}

export async function generateVersionedCaseDocuments(
  organizationId: string,
  caseId: string,
): Promise<GeneratedDocumentBundle> {
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase가 설정되지 않았습니다.");
  const generate = httpsCallable<
    { organizationId: string; caseId: string },
    GeneratedDocumentBundle
  >(services.functions, "generateCaseDocuments");
  return (await generate({ organizationId, caseId })).data;
}

export async function openPrivateDocument(storagePath: string): Promise<void> {
  const url = await attachmentDownloadUrl(storagePath);
  if (!url) throw new Error("문서 다운로드 경로를 확인하지 못했습니다.");
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.click();
}

export async function generateAndOpenCaseDocument(
  organizationId: string,
  caseId: string,
  type: "pdf" | "docx",
): Promise<GeneratedDocumentBundle> {
  const bundle = await generateVersionedCaseDocuments(organizationId, caseId);
  await openPrivateDocument(type === "pdf" ? bundle.pdfPath : bundle.docxPath);
  return bundle;
}
