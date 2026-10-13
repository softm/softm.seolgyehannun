import type { CaseRecord } from "../types";
import { formatSeoulDate } from "./date";
import {
  applicableDocumentTemplates,
  documentFieldValue,
  ensureDocumentDrafts,
  parcelAreaTotals,
  selectedRequiredDocuments,
  templateValidation,
  type DocumentTemplateDefinition,
} from "./documentTemplates";

export interface DocumentFieldRow {
  id: string;
  label: string;
  value: string;
  required: boolean;
  origin: "linked" | "edited" | "document-only";
}

export interface DocumentSection {
  title: string;
  paragraphs: string[];
  fields: DocumentFieldRow[];
}

export interface CaseDocumentModel {
  templateId: string;
  title: string;
  category: DocumentTemplateDefinition["category"];
  authority: string;
  statusLabel: string;
  version: number;
  createdAt: string;
  author: string;
  templateVersion: string;
  parcels: Array<{
    address: string;
    pnu: string;
    role: string;
    ledgerArea: string;
    surveyedArea: string;
    plannedArea: string;
    roadArea: string;
    excludedArea: string;
    owner: string;
    zoning: string;
  }>;
  permits: Array<{ name: string; relation: string; application: string; existingPermit: string; review: string }>;
  sections: DocumentSection[];
  attachments: Array<{ name: string; role: string; version: string }>;
  sources: string[];
  notice: string;
}

const relationLabel = {
  primary: "주허가",
  agenda: "의제 검토",
  separate: "별도 절차",
  reference: "참고 절차",
} as const;

const parcelRoleLabel = {
  "project-site": "사업 대상지",
  "access-road": "진입로",
  "road-occupancy": "도로점용 대상",
  excluded: "제외 필지",
  reference: "참고 필지",
} as const;

function area(value: number | undefined): string {
  return value === undefined ? "-" : `${value.toLocaleString("ko-KR")} ㎡`;
}

function documentSources(caseRecord: CaseRecord, template: DocumentTemplateDefinition): string[] {
  return Array.from(new Set([
    `${template.authority} · ${template.versionLabel}`,
    template.officialSource
      ? `${template.officialSource.regulationName} ${template.officialSource.formNumber} · 서식 개정 ${template.officialSource.revisionDate} · 시행 ${template.officialSource.effectiveDate}${template.officialSource.sourceHashSha256 ? ` · 원본 SHA-256 ${template.officialSource.sourceHashSha256}` : ""}`
      : "",
    template.sourceUrl ?? "",
    ...caseRecord.parcels.flatMap((parcel) => [
      `${parcel.source} · 조회 ${formatSeoulDate(parcel.fetchedAt)}`,
      parcel.sourceUrl ?? "",
    ]),
  ].filter(Boolean)));
}

function buildSections(caseRecord: CaseRecord, template: DocumentTemplateDefinition): DocumentSection[] {
  const draft = ensureDocumentDrafts(caseRecord).find((item) => item.templateId === template.id);
  const groups = new Map<string, DocumentFieldRow[]>();
  template.fields.forEach((field) => {
    const value = documentFieldValue(caseRecord, template.id, field).trim();
    const edited = Boolean(draft && Object.prototype.hasOwnProperty.call(draft.overrides, field.id));
    const row: DocumentFieldRow = {
      id: field.id,
      label: field.label,
      value: value || "작성 필요",
      required: Boolean(field.required),
      origin: edited ? "edited" : field.sourceKey ? "linked" : "document-only",
    };
    const fields = groups.get(field.group) ?? [];
    fields.push(row);
    groups.set(field.group, fields);
  });
  return Array.from(groups, ([title, fields]) => ({
    title,
    fields,
    paragraphs: fields.map((field) => `${field.label}: ${field.value}`),
  }));
}

function buildTemplateModel(caseRecord: CaseRecord, template: DocumentTemplateDefinition): CaseDocumentModel {
  const version = Math.max(1, caseRecord.documentVersions.length + 1);
  return {
    templateId: template.id,
    title: template.title,
    category: template.category,
    authority: template.authority,
    statusLabel: template.generatedFormatFidelity?.pdf === "official-layout"
      ? "국가서식 배치 자동작성본"
      : template.status === "official-reference" ? "공식 별지 항목 대응 초안" : "사무소 예시 편집 서식",
    version,
    createdAt: new Date().toISOString(),
    author: caseRecord.assigneeName,
    templateVersion: template.versionLabel,
    parcels: caseRecord.parcels.map((parcel) => ({
      address: parcel.address,
      pnu: parcel.pnu,
      role: parcelRoleLabel[parcel.role],
      ledgerArea: area(parcel.ledgerAreaM2),
      surveyedArea: area(parcel.surveyedAreaM2),
      plannedArea: area(parcel.plannedAreaM2),
      roadArea: area(parcel.roadOccupancyAreaM2),
      excludedArea: area(parcel.excludedAreaM2),
      owner: parcel.ownerNames.join(", ") || "확인 필요",
      zoning: parcel.zoning.join(", ") || "확인 필요",
    })),
    permits: caseRecord.permits.map((permit) => ({
      name: permit.name,
      relation: relationLabel[permit.relation],
      application: permit.applicationKind === "new" ? "신규" : "변경",
      existingPermit: permit.existingPermitNumber || "-",
      review: permit.reviewState === "confirmed" ? "확인" : "검토 필요",
    })),
    sections: buildSections(caseRecord, template),
    attachments: caseRecord.attachments.map((attachment) => ({
      name: attachment.name,
      role: attachment.role,
      version: `v${attachment.version}`,
    })),
    sources: documentSources(caseRecord, template),
    notice: template.generatedFormatFidelity?.pdf === "official-layout"
      ? "등록된 국가서식 원본 배치에 사건 데이터를 자동 입력한 초안입니다. 제출 전 필지별 면적, 첨부조건, 서명·날인과 관할기관의 최신 요구사항을 확인해야 합니다."
      : template.status === "official-reference"
      ? "공식 별지의 입력 항목을 기준으로 만든 작성 초안입니다. 제출 전 관할기관의 최신 서식·법령·협의 조건과 원문 배치를 확인해야 합니다."
      : "첨부 업무자료를 바탕으로 만든 사무소 편집용 예시 서식입니다. 공식 허가 판단을 대체하지 않으며, 공식 제출 서식이 아니므로 제출 전 담당자의 검토가 필요합니다.",
  };
}

export function buildCaseDocumentModels(caseRecord: CaseRecord, templateIds?: string[]): CaseDocumentModel[] {
  const drafts = ensureDocumentDrafts(caseRecord);
  const selected = new Set(templateIds ?? drafts.filter((draft) => draft.selected).map((draft) => draft.templateId));
  return applicableDocumentTemplates(caseRecord)
    .filter((template) => selected.has(template.id))
    .map((template) => buildTemplateModel(caseRecord, template));
}

export function buildCaseDocumentModel(caseRecord: CaseRecord): CaseDocumentModel {
  const models = buildCaseDocumentModels(caseRecord);
  const preferred = models.find((model) => model.templateId === "business-plan") ?? models[0];
  if (preferred) return preferred;
  return buildTemplateModel(caseRecord, applicableDocumentTemplates(caseRecord)[0]);
}

export function documentValidationErrors(caseRecord: CaseRecord): string[] {
  const errors: string[] = [];
  const applicant = caseRecord.parties.find((party) => party.role === "applicant");
  if (!caseRecord.title.trim()) errors.push("사건명을 입력해 주세요.");
  if (!caseRecord.parcels.length) errors.push("필지를 1개 이상 선택해 주세요.");
  if (!caseRecord.permits.some((permit) => permit.relation === "primary")) errors.push("주허가를 선택해 주세요.");
  if (!caseRecord.projectPurpose.trim()) errors.push("사업 목적을 입력해 주세요.");
  if (!(applicant?.name || caseRecord.applicantName).trim()) errors.push("신청인을 입력해 주세요.");
  caseRecord.permits.filter((permit) => permit.applicationKind === "change").forEach((permit) => {
    if (!permit.existingPermitNumber?.trim()) errors.push(`${permit.name}: 기존 허가번호를 입력해 주세요.`);
    if (!permit.changeSummary?.trim()) errors.push(`${permit.name}: 변경 내용을 입력해 주세요.`);
  });
  caseRecord.parcels.forEach((parcel) => {
    const reference = parcel.ledgerAreaM2 ?? parcel.surveyedAreaM2 ?? 0;
    const allocation = (parcel.plannedAreaM2 ?? 0) + (parcel.roadOccupancyAreaM2 ?? 0) + (parcel.excludedAreaM2 ?? 0);
    if (reference > 0 && allocation > reference + 0.01) {
      errors.push(`${parcel.lotNumber || parcel.address}: 사업·도로점용·제외 면적 합계가 기준면적을 초과합니다.`);
    }
  });
  return Array.from(new Set(errors));
}

export function documentReviewWarnings(caseRecord: CaseRecord): string[] {
  const drafts = ensureDocumentDrafts(caseRecord);
  const selected = new Set(drafts.filter((draft) => draft.selected).map((draft) => draft.templateId));
  const templateWarnings = applicableDocumentTemplates(caseRecord)
    .filter((template) => selected.has(template.id))
    .flatMap((template) => templateValidation(caseRecord, template));
  const attachmentWarnings = selectedRequiredDocuments(caseRecord)
    .filter((item) => !item.attachment)
    .map((item) => `제출자료 미연결: ${item.name}`);
  const totals = parcelAreaTotals(caseRecord);
  const totalCost = caseRecord.costItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const costWarnings = caseRecord.costItems.some((item) => !item.workType.trim() || item.quantity <= 0 || item.unitPrice < 0)
    ? ["공사내역에 공종명·수량·단가가 불완전한 행이 있습니다."]
    : [];
  const areaWarnings = totals.ledger && !totals.planned && !totals.surveyed
    ? ["대장면적은 있으나 실측면적 또는 계획면적이 입력되지 않았습니다."]
    : [];
  const emptyCostWarning = totalCost === 0 ? ["공사비 합계가 0원입니다. 해당 없음인지 확인해 주세요."] : [];
  return Array.from(new Set([...templateWarnings, ...attachmentWarnings, ...areaWarnings, ...costWarnings, ...emptyCostWarning]));
}
