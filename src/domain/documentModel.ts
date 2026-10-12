import type { CaseRecord } from "../types";
import { formatSeoulDate } from "./date";

export interface DocumentSection {
  title: string;
  paragraphs: string[];
}

export interface CaseDocumentModel {
  title: string;
  version: number;
  createdAt: string;
  author: string;
  templateVersion: string;
  parcels: Array<{ address: string; pnu: string; area: string; zoning: string }>;
  permits: Array<{ name: string; relation: string; application: string; review: string }>;
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

export function buildCaseDocumentModel(caseRecord: CaseRecord): CaseDocumentModel {
  const version = Math.max(1, caseRecord.documentVersions.length + 1);
  const sources = Array.from(new Set(caseRecord.parcels.flatMap((parcel) => [
    `${parcel.source} · 조회 ${formatSeoulDate(parcel.fetchedAt)}`,
    parcel.sourceUrl ?? "",
  ]).filter(Boolean)));

  return {
    title: `${caseRecord.title} 사업계획서`,
    version,
    createdAt: new Date().toISOString(),
    author: caseRecord.assigneeName,
    templateVersion: "개발행위 기본서식 1.0",
    parcels: caseRecord.parcels.map((parcel) => ({
      address: parcel.address,
      pnu: parcel.pnu,
      area: parcel.ledgerAreaM2 ? `${parcel.ledgerAreaM2.toLocaleString("ko-KR")} ㎡` : "확인 필요",
      zoning: parcel.zoning.join(", ") || "확인 필요",
    })),
    permits: caseRecord.permits.map((permit) => ({
      name: permit.name,
      relation: relationLabel[permit.relation],
      application: permit.applicationKind === "new" ? "신규" : "변경",
      review: permit.reviewState === "confirmed" ? "확인" : "검토 필요",
    })),
    sections: [
      {
        title: "사업 개요",
        paragraphs: [
          `사업 목적: ${caseRecord.projectPurpose || "작성 필요"}`,
          `신청인: ${caseRecord.applicantName || "작성 필요"}`,
          `사업 기간: ${caseRecord.projectPeriod.start || "미정"} ~ ${caseRecord.projectPeriod.end || "미정"}`,
          caseRecord.planBody.overview || "사업 개요를 작성해 주세요.",
        ],
      },
      {
        title: "대상지 현황",
        paragraphs: [caseRecord.planBody.siteCondition || "대상지 현황을 작성해 주세요."],
      },
      {
        title: "공사 계획",
        paragraphs: [
          caseRecord.constructionSummary || "공사 개요를 작성해 주세요.",
          caseRecord.scheduleSummary ? `일정: ${caseRecord.scheduleSummary}` : "공사 일정을 작성해 주세요.",
          caseRecord.planBody.projectPlan || "세부 계획을 작성해 주세요.",
        ],
      },
      {
        title: "안전 및 환경 대책",
        paragraphs: [
          `안전 대책: ${caseRecord.safetyPlan || "작성 필요"}`,
          `환경 대책: ${caseRecord.environmentPlan || "작성 필요"}`,
          caseRecord.planBody.managementPlan || "관리 방안을 작성해 주세요.",
        ],
      },
    ],
    attachments: caseRecord.attachments.map((attachment) => ({
      name: attachment.name,
      role: attachment.role,
      version: `v${attachment.version}`,
    })),
    sources,
    notice: "본 문서는 업무 보조용으로 작성되었습니다. 지역·필지 정보와 자동 기한은 공식 허가 판단을 대체하지 않으며, 제출 전 관할기관과 최신 근거를 확인해야 합니다.",
  };
}

export function documentValidationErrors(caseRecord: CaseRecord): string[] {
  const errors: string[] = [];
  if (!caseRecord.parcels.length) errors.push("필지를 1개 이상 선택해 주세요.");
  if (!caseRecord.permits.some((permit) => permit.relation === "primary")) errors.push("주허가를 선택해 주세요.");
  if (!caseRecord.projectPurpose.trim()) errors.push("사업 목적을 입력해 주세요.");
  if (!caseRecord.applicantName.trim()) errors.push("신청인을 입력해 주세요.");
  if (!caseRecord.planBody.overview.trim()) errors.push("사업 개요 본문을 작성해 주세요.");
  return errors;
}
