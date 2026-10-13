import { httpsCallable } from "firebase/functions";
import { buildCaseDocumentModels, type CaseDocumentModel } from "../domain/documentModel";
import type { CaseRecord } from "../types";
import { apiErrorMessage, apiUrl, authorizedApiHeaders } from "./api";
import { getFirebaseServices } from "./firebase";

export interface GeneratedDocumentBundle {
  documentId: string;
  version: number;
  pdfPath: string;
  docxPath: string;
}

export async function generateVersionedCaseDocuments(
  caseRecord: CaseRecord,
): Promise<GeneratedDocumentBundle> {
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase가 설정되지 않았습니다.");
  const generate = httpsCallable<
    { organizationId: string; caseId: string; documents: CaseDocumentModel[] },
    GeneratedDocumentBundle
  >(services.functions, "generateCaseDocuments");
  const documents = buildCaseDocumentModels(caseRecord);
  if (!documents.length) throw new Error("출력에 포함할 문서를 1개 이상 선택해 주세요.");
  return (await generate({ organizationId: caseRecord.organizationId, caseId: caseRecord.id, documents })).data;
}

export async function openPrivateDocument(storagePath: string): Promise<void> {
  const match = storagePath.match(/^organizations\/([^/]+)\/cases\/([^/]+)\/documents\/([^/]+)\/([^/]+\.(pdf|docx))$/i);
  if (!match) throw new Error("문서 다운로드 경로를 확인하지 못했습니다.");
  const [, organizationId, caseId, documentId, fileName, type] = match;
  const url = new URL(apiUrl("/documents/download"));
  url.searchParams.set("organizationId", organizationId);
  url.searchParams.set("caseId", caseId);
  url.searchParams.set("documentId", documentId);
  url.searchParams.set("type", type.toLowerCase());
  const response = await fetch(url, { headers: await authorizedApiHeaders() });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, `문서를 내려받지 못했습니다. (${response.status})`));
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  if (type.toLowerCase() === "pdf") anchor.target = "_blank";
  else anchor.download = fileName;
  anchor.rel = "noopener noreferrer";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function generateAndOpenCaseDocument(
  caseRecord: CaseRecord,
  type: "pdf" | "docx",
): Promise<GeneratedDocumentBundle> {
  const bundle = await generateVersionedCaseDocuments(caseRecord);
  await openPrivateDocument(type === "pdf" ? bundle.pdfPath : bundle.docxPath);
  return bundle;
}
