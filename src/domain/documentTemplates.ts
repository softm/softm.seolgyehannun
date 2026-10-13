import type { CaseRecord, DocumentDraft, ParcelSnapshot, PartyRecord } from "../types";

export type DocumentFieldKind = "text" | "textarea" | "date" | "number" | "choice";
export type DocumentTemplateStatus = "official-reference" | "office-template";

export interface DocumentTemplateField {
  id: string;
  label: string;
  group: string;
  kind: DocumentFieldKind;
  sourceKey?: string;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface DocumentTemplateDefinition {
  id: string;
  title: string;
  shortTitle: string;
  category: "application" | "statement" | "plan" | "prevention";
  permitCatalogIds: string[];
  status: DocumentTemplateStatus;
  authority: string;
  versionLabel: string;
  sourceUrl?: string;
  description: string;
  fields: DocumentTemplateField[];
}

export interface RequiredDocumentItem {
  id: string;
  name: string;
  reason: string;
  permitCatalogIds: string[];
  acceptedRoles: string[];
  issueUrl?: string;
  sourceLabel: string;
}

const text = (id: string, label: string, group: string, sourceKey?: string, required = false): DocumentTemplateField => ({
  id,
  label,
  group,
  kind: "text",
  sourceKey,
  required,
});

const long = (id: string, label: string, group: string, sourceKey?: string, required = false, placeholder?: string): DocumentTemplateField => ({
  id,
  label,
  group,
  kind: "textarea",
  sourceKey,
  required,
  placeholder,
});

const date = (id: string, label: string, group: string, sourceKey?: string, required = false): DocumentTemplateField => ({
  id,
  label,
  group,
  kind: "date",
  sourceKey,
  required,
});

const number = (id: string, label: string, group: string, sourceKey?: string, required = false): DocumentTemplateField => ({
  id,
  label,
  group,
  kind: "number",
  sourceKey,
  required,
});

export const documentTemplates: DocumentTemplateDefinition[] = [
  {
    id: "development-application",
    title: "개발행위(변경) 허가신청서",
    shortTitle: "개발행위 신청서",
    category: "application",
    permitCatalogIds: ["development"],
    status: "official-reference",
    authority: "국토교통부 · 국토의 계획 및 이용에 관한 법률 시행규칙 별지 제5호",
    versionLabel: "개정 2020.10.19 · 법령정보센터 확인",
    sourceUrl: "https://www.law.go.kr/flDownload.do?flSeq=112404233",
    description: "공식 별지 서식의 입력 항목에 사건 공통정보를 연결한 작성 초안입니다.",
    fields: [
      text("applicantName", "성명·법인명", "신청인", "applicant.name", true),
      text("representativeName", "대표자 성명", "신청인", "applicant.representativeName"),
      text("registrationNumber", "생년월일·법인등록번호", "신청인", "applicant.registrationNumber", true),
      text("applicantAddress", "주소", "신청인", "applicant.address", true),
      text("applicantPhone", "전화번호", "신청인", "applicant.phone", true),
      text("entrepreneurStatus", "창업자 해당 여부", "신청인", "permit.entrepreneurStatus"),
      text("actionTypes", "개발행위 유형", "허가신청 사항", "permit.actionTypes", true),
      text("siteAddress", "위치(지번)", "허가신청 사항", "parcel.addresses", true),
      text("landCategory", "지목", "허가신청 사항", "parcel.categories", true),
      text("zoning", "용도지역", "허가신청 사항", "parcel.zoning", true),
      text("district", "용도지구", "허가신청 사항"),
      number("slopeDegree", "경사도(도)", "토지현황", "permit.slopeDegree"),
      text("soilType", "토질", "토지현황", "permit.soilType"),
      number("buriedRockVolumeM3", "토석매장량(㎥)", "토지현황", "permit.buriedRockVolumeM3"),
      text("mainTreeSpecies", "주요 수종", "토지현황", "permit.mainTreeSpecies"),
      number("standingForestAreaM2", "입목지(㎡)", "토지현황", "permit.standingForestAreaM2"),
      number("unforestedAreaM2", "무입목지(㎡)", "토지현황", "permit.unforestedAreaM2"),
      number("applicationAreaM2", "신청면적(㎡)", "신청 내용", "parcel.totalApplicationArea", true),
      long("purpose", "개발행위 목적·변경사유", "신청 내용", "case.projectPurpose", true),
      date("startDate", "착공 예정일", "사업기간", "case.projectStart", true),
      date("endDate", "준공 예정일", "사업기간", "case.projectEnd", true),
      text("recipient", "수신 기관", "신청", "case.jurisdiction", true),
    ],
  },
  {
    id: "farmland-application",
    title: "농지전용 허가·변경허가 신청서",
    shortTitle: "농지전용 신청서",
    category: "application",
    permitCatalogIds: ["farmland-conversion"],
    status: "official-reference",
    authority: "농림축산식품부 · 농지법 시행규칙 별지 제14호",
    versionLabel: "개정 2016.1.21 · 현행 규칙 항목 확인",
    sourceUrl: "https://www.law.go.kr/flDownload.do?flSeq=34469097&gubun=",
    description: "허가·변경허가, 농지 구분별 면적과 부담금 납부방법을 작성합니다.",
    fields: [
      text("applicantName", "성명·명칭", "신청인", "applicant.name", true),
      text("registrationNumber", "주민·법인등록번호", "신청인", "applicant.registrationNumber", true),
      text("applicantAddress", "주소", "신청인", "applicant.address", true),
      text("mailingAddress", "우편물 수령지", "신청인", "applicant.address"),
      text("applicantPhone", "전화번호", "신청인", "applicant.phone", true),
      text("siteAddress", "전용하려는 농지 소재지", "농지 현황", "parcel.addresses", true),
      number("farmlandZoneAreaM2", "농업진흥구역(㎡)", "농지 현황", "permit.farmlandZoneAreaM2"),
      number("farmlandProtectionAreaM2", "농업보호구역(㎡)", "농지 현황", "permit.farmlandProtectionAreaM2"),
      number("farmlandOutsideAreaM2", "농업진흥지역 밖(㎡)", "농지 현황", "permit.farmlandOutsideAreaM2"),
      number("totalProjectAreaM2", "사업예정부지 총 면적(㎡)", "사업 내용", "parcel.totalApplicationArea", true),
      date("startDate", "착공 예정일", "사업기간", "case.projectStart", true),
      date("endDate", "준공 예정일", "사업기간", "case.projectEnd", true),
      long("purpose", "전용 목적", "사업 내용", "case.projectPurpose", true),
      text("paymentMethod", "농지보전부담금 납부방법", "부담금", "permit.conservationChargePayment"),
      text("recipient", "수신 기관", "신청", "case.jurisdiction", true),
    ],
  },
  {
    id: "forest-application",
    title: "산지전용 허가·변경허가 신청서",
    shortTitle: "산지전용 신청서",
    category: "application",
    permitCatalogIds: ["forest-conversion"],
    status: "official-reference",
    authority: "산림청 · 산지관리법 시행규칙 별지 제3호",
    versionLabel: "개정 2018.11.29 · 법령정보센터 항목 확인",
    sourceUrl: "https://www.law.go.kr/flDownload.do?flSeq=74393251",
    description: "신청인·산지소유자, 보전산지 구분, 부산물과 변경사항을 작성합니다.",
    fields: [
      text("applicantName", "신청인 성명·명칭", "신청인", "applicant.name", true),
      text("registrationNumber", "주민·법인등록번호", "신청인", "applicant.registrationNumber", true),
      text("applicantAddress", "주소", "신청인", "applicant.address", true),
      text("applicantPhone", "전화번호", "신청인", "applicant.phone", true),
      text("forestRightRelation", "해당 산지에 대한 권리관계", "신청인", "permit.forestRightRelation", true),
      text("ownerName", "산지 소유자", "산지 소유자", "owner.name", true),
      text("ownerAddress", "소유자 주소", "산지 소유자", "owner.address"),
      text("siteAddress", "전용대상 산지", "산지 내역", "parcel.addresses", true),
      number("forestryAreaM2", "임업용 산지(㎡)", "산지 내역", "permit.forestryAreaM2"),
      number("publicForestAreaM2", "공익용 산지(㎡)", "산지 내역", "permit.publicForestAreaM2"),
      number("semiConservationAreaM2", "준보전산지(㎡)", "산지 내역", "permit.semiConservationAreaM2"),
      long("forestProductPlan", "벌채·굴취·토석 생산 현황", "부산물", "permit.forestProductPlan"),
      long("purpose", "전용 목적", "사업 내용", "case.projectPurpose", true),
      date("startDate", "전용 시작일", "전용 기간", "case.projectStart", true),
      date("endDate", "전용 종료일", "전용 기간", "case.projectEnd", true),
      long("previousDescription", "변경 전", "변경 신청", "permit.previousDescription"),
      long("changedDescription", "변경 후", "변경 신청", "permit.changedDescription"),
      long("changeReason", "변경 사유", "변경 신청", "permit.changeReason"),
    ],
  },
  {
    id: "area-statement",
    title: "허가면적조서",
    shortTitle: "면적조서",
    category: "statement",
    permitCatalogIds: ["development", "farmland-conversion", "forest-conversion"],
    status: "office-template",
    authority: "사무소 참고 화면 기반 편집 서식",
    versionLabel: "예시 서식 1.0",
    description: "필지별 대장·실측·사업·도로점용·제외 면적과 소유자를 한 표로 작성합니다.",
    fields: [
      text("siteAddress", "대상지", "조서", "parcel.addresses", true),
      long("areaStatementNote", "조서 비고", "조서"),
    ],
  },
  {
    id: "business-plan",
    title: "사업계획서",
    shortTitle: "사업계획서",
    category: "plan",
    permitCatalogIds: ["development", "farmland-conversion", "forest-conversion"],
    status: "office-template",
    authority: "사무소 작성 틀 · 첨부 참고 화면 기반",
    versionLabel: "예시 서식 1.0",
    description: "사업 개요부터 배수·환경·폐기물·사후관리까지 사건별 설명을 편집합니다.",
    fields: [
      long("overview", "1. 위치 및 현황", "사업 개요", "plan.siteCondition", true),
      long("purpose", "2. 사업 목적", "사업 개요", "case.projectPurpose", true),
      text("implementer", "3. 사업 시행자", "사업 개요", "applicant.name", true),
      text("projectPeriod", "4. 사업 시행 기간", "사업 개요", "case.projectPeriod", true),
      long("fundingPlan", "5. 자금 소요 및 조달 계획", "사업 개요", "plan.fundingPlan"),
      long("constructionSummary", "6~8. 토지조서·공사개요·사업개요", "계획", "case.constructionSummary", true),
      text("buildingUse", "건축물 용도", "건축 개요", "building.useCategory"),
      text("legalBuildingUse", "법령상 건축물 용도", "건축 개요", "building.legalUseCategory"),
      number("buildingArea", "건축면적(㎡)", "건축 개요", "building.buildingAreaM2"),
      number("grossFloorArea", "연면적(㎡)", "건축 개요", "building.grossFloorAreaM2"),
      text("floors", "층수", "건축 개요", "building.floors"),
      number("coverageRatio", "건폐율(%)", "건축 개요", "building.buildingCoverageRatio"),
      number("floorAreaRatio", "용적률(%)", "건축 개요", "building.floorAreaRatio"),
      text("buildingStructure", "구조", "건축 개요", "building.structure"),
      long("roadPlan", "9. 도로 계획", "기반시설", "plan.roadPlan"),
      long("drainagePlan", "9. 배수 계획", "기반시설", "plan.drainagePlan"),
      long("preventionPlan", "10. 피해 방지 계획", "안전·환경", "case.environmentPlan"),
      long("waterSupplyPlan", "11. 급수 계획", "기반시설", "plan.waterSupplyPlan"),
      long("earthworkPlan", "12. 토사 처리 계획", "시공", "plan.earthworkPlan"),
      long("airReview", "13. 대기환경보전법 관련 사항", "법령 검토"),
      long("waterReview", "14. 물환경보전법 관련 사항", "법령 검토"),
      long("nearbyImpactPlan", "15. 인근에 미치는 영향", "안전·환경", "plan.nearbyImpactPlan"),
      long("vegetationPlan", "16. 부산물·입목 처리 계획", "안전·환경", "plan.vegetationPlan"),
      long("noiseDustPlan", "17. 소음·분진 방지 계획", "안전·환경", "plan.noiseDustPlan"),
      long("wastewaterPlan", "17. 오폐수·세륜 계획", "안전·환경", "plan.wastewaterPlan"),
      long("trafficPlan", "17. 교통 계획", "안전·환경", "plan.trafficPlan"),
      long("wastePlan", "18. 폐기물 처리 대책", "안전·환경", "plan.wastePlan"),
      long("postManagementPlan", "19. 사후 관리", "관리", "plan.postManagementPlan", true),
    ],
  },
  {
    id: "damage-prevention-plan",
    title: "피해방지계획서",
    shortTitle: "피해방지계획",
    category: "prevention",
    permitCatalogIds: ["development", "farmland-conversion", "forest-conversion"],
    status: "office-template",
    authority: "사무소 참고 화면 기반 편집 서식",
    versionLabel: "예시 서식 1.0",
    description: "토사 유출, 비산먼지, 교통, 우·오수와 현장 안전대책을 사건별로 보완합니다.",
    fields: [
      text("siteAddress", "사업장 위치", "표지", "parcel.addresses", true),
      text("purpose", "전용 목적", "표지", "case.projectPurpose", true),
      number("area", "사업장 면적(㎡)", "표지", "parcel.totalApplicationArea", true),
      long("siteSafety", "가설울타리·안전표지·현장관리", "피해 방지", "case.safetyPlan", true),
      long("soilRunoff", "토사 유출 방지", "피해 방지", "plan.earthworkPlan", true),
      long("dust", "비산먼지·세륜 대책", "피해 방지", "plan.noiseDustPlan", true),
      long("traffic", "공사차량·교통 대책", "피해 방지", "plan.trafficPlan", true),
      long("drainage", "우·오수 처리", "피해 방지", "plan.drainagePlan", true),
      long("additional", "추가 피해방지 및 복구 약속", "피해 방지", "plan.postManagementPlan"),
    ],
  },
];

export const requiredDocumentCatalog: RequiredDocumentItem[] = [
  { id: "land-ledger", name: "토지대장", reason: "지목·대장면적 확인", permitCatalogIds: ["development", "farmland-conversion", "forest-conversion"], acceptedRoles: ["토지대장"], issueUrl: "https://www.gov.kr/", sourceLabel: "정부24" },
  { id: "cadastral-map", name: "지적도·임야도", reason: "대상 필지와 전용예정구역 확인", permitCatalogIds: ["development", "farmland-conversion", "forest-conversion"], acceptedRoles: ["지적도", "임야도", "구적도"], issueUrl: "https://www.gov.kr/", sourceLabel: "정부24" },
  { id: "registry", name: "토지 등기사항증명서", reason: "소유권·사용권 확인", permitCatalogIds: ["development", "farmland-conversion", "forest-conversion"], acceptedRoles: ["등기사항증명서", "소유권 자료"], issueUrl: "https://www.iros.go.kr/", sourceLabel: "인터넷등기소" },
  { id: "site-plan", name: "배치도·계획평면도", reason: "사업 배치와 시설 계획 확인", permitCatalogIds: ["development", "farmland-conversion", "forest-conversion"], acceptedRoles: ["계획평면도", "계획도", "배치도"], sourceLabel: "작성 도면" },
  { id: "survey-plan", name: "현황실측도·구적도", reason: "경계·계획면적 근거", permitCatalogIds: ["development", "farmland-conversion", "forest-conversion"], acceptedRoles: ["현황실측도", "현황도", "구적도"], sourceLabel: "측량 도면" },
  { id: "drainage", name: "배수계획도·상세도", reason: "우수 흐름과 구조물 확인", permitCatalogIds: ["development", "farmland-conversion"], acceptedRoles: ["배수도", "배수계획도", "상세도"], sourceLabel: "설계 도면" },
  { id: "cross-section", name: "횡단면도", reason: "절·성토 및 사면 계획 확인", permitCatalogIds: ["development", "forest-conversion"], acceptedRoles: ["횡단면도", "종단면도"], sourceLabel: "설계 도면" },
  { id: "cost-breakdown", name: "공사비·예산 내역서", reason: "위해·환경 방지시설 예산 확인", permitCatalogIds: ["development"], acceptedRoles: ["공사내역서", "예산내역서"], sourceLabel: "적산 결과" },
  { id: "forest-survey", name: "산림조사서·입목축적조사서", reason: "산지 현황과 입목 확인", permitCatalogIds: ["forest-conversion"], acceptedRoles: ["산림조사서", "입목축적조사서"], sourceLabel: "산림 기술자료" },
];

function firstParty(caseRecord: CaseRecord, role: PartyRecord["role"]): PartyRecord | undefined {
  return caseRecord.parties.find((party) => party.role === role);
}

function formatNumber(value: number | undefined): string {
  return value === undefined || Number.isNaN(value) ? "" : String(value);
}

function joinParcels(parcels: ParcelSnapshot[], pick: (parcel: ParcelSnapshot) => string | undefined): string {
  return Array.from(new Set(parcels.map(pick).filter(Boolean))).join(", ");
}

export function parcelAreaTotals(caseRecord: CaseRecord) {
  return caseRecord.parcels.reduce((totals, parcel) => ({
    ledger: totals.ledger + (parcel.ledgerAreaM2 ?? 0),
    surveyed: totals.surveyed + (parcel.surveyedAreaM2 ?? 0),
    planned: totals.planned + (parcel.plannedAreaM2 ?? 0),
    road: totals.road + (parcel.roadOccupancyAreaM2 ?? 0),
    excluded: totals.excluded + (parcel.excludedAreaM2 ?? 0),
  }), { ledger: 0, surveyed: 0, planned: 0, road: 0, excluded: 0 });
}

export function resolveDocumentSource(caseRecord: CaseRecord, sourceKey?: string): string {
  if (!sourceKey) return "";
  const applicant = firstParty(caseRecord, "applicant");
  const owner = firstParty(caseRecord, "owner");
  const totals = parcelAreaTotals(caseRecord);
  const sources: Record<string, string> = {
    "applicant.name": applicant?.name || caseRecord.applicantName || "",
    "applicant.representativeName": applicant?.representativeName ?? "",
    "applicant.registrationNumber": applicant?.registrationNumber ?? "",
    "applicant.address": applicant?.address ?? "",
    "applicant.phone": applicant?.phone || caseRecord.applicantContact || "",
    "owner.name": owner?.name ?? "",
    "owner.address": owner?.address ?? "",
    "case.projectPurpose": caseRecord.projectPurpose,
    "case.projectStart": caseRecord.projectPeriod.start,
    "case.projectEnd": caseRecord.projectPeriod.end,
    "case.projectPeriod": `${caseRecord.projectPeriod.start || "미정"} ~ ${caseRecord.projectPeriod.end || "미정"}`,
    "case.jurisdiction": caseRecord.jurisdictionName,
    "case.constructionSummary": caseRecord.constructionSummary,
    "case.safetyPlan": caseRecord.safetyPlan,
    "case.environmentPlan": caseRecord.environmentPlan,
    "building.useCategory": caseRecord.buildingPlan.useCategory,
    "building.legalUseCategory": caseRecord.buildingPlan.legalUseCategory,
    "building.buildingAreaM2": formatNumber(caseRecord.buildingPlan.buildingAreaM2),
    "building.grossFloorAreaM2": formatNumber(caseRecord.buildingPlan.grossFloorAreaM2),
    "building.floors": `${caseRecord.buildingPlan.floorsAbove ?? 0}층 / 지하 ${caseRecord.buildingPlan.floorsBelow ?? 0}층`,
    "building.buildingCoverageRatio": formatNumber(caseRecord.buildingPlan.buildingCoverageRatio),
    "building.floorAreaRatio": formatNumber(caseRecord.buildingPlan.floorAreaRatio),
    "building.structure": caseRecord.buildingPlan.structure,
    "parcel.addresses": caseRecord.parcels.map((parcel) => parcel.address).join(" / "),
    "parcel.categories": joinParcels(caseRecord.parcels, (parcel) => parcel.category),
    "parcel.zoning": joinParcels(caseRecord.parcels, (parcel) => parcel.zoning.join(", ")),
    "parcel.totalApplicationArea": formatNumber(totals.planned || totals.surveyed || totals.ledger),
    "permit.actionTypes": caseRecord.permitForm.actionTypes.join(", "),
    "permit.entrepreneurStatus": caseRecord.permitForm.entrepreneurStatus === "yes" ? "해당" : caseRecord.permitForm.entrepreneurStatus === "no" ? "미해당" : "확인 필요",
    "permit.slopeDegree": formatNumber(caseRecord.permitForm.slopeDegree),
    "permit.soilType": caseRecord.permitForm.soilType,
    "permit.buriedRockVolumeM3": formatNumber(caseRecord.permitForm.buriedRockVolumeM3),
    "permit.mainTreeSpecies": caseRecord.permitForm.mainTreeSpecies,
    "permit.standingForestAreaM2": formatNumber(caseRecord.permitForm.standingForestAreaM2),
    "permit.unforestedAreaM2": formatNumber(caseRecord.permitForm.unforestedAreaM2),
    "permit.forestRightRelation": caseRecord.permitForm.forestRightRelation,
    "permit.forestryAreaM2": formatNumber(caseRecord.permitForm.forestryAreaM2),
    "permit.publicForestAreaM2": formatNumber(caseRecord.permitForm.publicForestAreaM2),
    "permit.semiConservationAreaM2": formatNumber(caseRecord.permitForm.semiConservationAreaM2),
    "permit.forestProductPlan": caseRecord.permitForm.forestProductPlan,
    "permit.farmlandZoneAreaM2": formatNumber(caseRecord.permitForm.farmlandZoneAreaM2),
    "permit.farmlandProtectionAreaM2": formatNumber(caseRecord.permitForm.farmlandProtectionAreaM2),
    "permit.farmlandOutsideAreaM2": formatNumber(caseRecord.permitForm.farmlandOutsideAreaM2),
    "permit.conservationChargePayment": caseRecord.permitForm.conservationChargePayment === "lump-sum" ? "일시납부" : caseRecord.permitForm.conservationChargePayment === "installment" ? "분할납부" : "미정",
    "permit.previousDescription": caseRecord.permitForm.previousDescription,
    "permit.changedDescription": caseRecord.permitForm.changedDescription,
    "permit.changeReason": caseRecord.permitForm.changeReason,
    "plan.siteCondition": caseRecord.planBody.siteCondition,
    "plan.fundingPlan": caseRecord.projectPlanDetails.fundingPlan,
    "plan.roadPlan": caseRecord.projectPlanDetails.roadPlan,
    "plan.drainagePlan": caseRecord.projectPlanDetails.drainagePlan,
    "plan.waterSupplyPlan": caseRecord.projectPlanDetails.waterSupplyPlan,
    "plan.earthworkPlan": caseRecord.projectPlanDetails.earthworkPlan,
    "plan.nearbyImpactPlan": caseRecord.projectPlanDetails.nearbyImpactPlan,
    "plan.vegetationPlan": caseRecord.projectPlanDetails.vegetationPlan,
    "plan.noiseDustPlan": caseRecord.projectPlanDetails.noiseDustPlan,
    "plan.wastewaterPlan": caseRecord.projectPlanDetails.wastewaterPlan,
    "plan.trafficPlan": caseRecord.projectPlanDetails.trafficPlan,
    "plan.wastePlan": caseRecord.projectPlanDetails.wastePlan,
    "plan.postManagementPlan": caseRecord.projectPlanDetails.postManagementPlan || caseRecord.planBody.managementPlan,
  };
  return sources[sourceKey] ?? "";
}

export function applicableDocumentTemplates(caseRecord: CaseRecord): DocumentTemplateDefinition[] {
  const selected = new Set(caseRecord.permits.map((permit) => permit.catalogId));
  const templates = documentTemplates.filter((template) => template.permitCatalogIds.some((id) => selected.has(id)));
  if (templates.length) return templates;
  return documentTemplates.filter((template) => ["area-statement", "business-plan", "damage-prevention-plan"].includes(template.id));
}

export function ensureDocumentDrafts(caseRecord: CaseRecord): DocumentDraft[] {
  const now = new Date().toISOString();
  const existing = new Map(caseRecord.documentDrafts.map((draft) => [draft.templateId, draft]));
  return applicableDocumentTemplates(caseRecord).map((template) => existing.get(template.id) ?? {
    id: `${caseRecord.id}-${template.id}`,
    templateId: template.id,
    title: template.title,
    status: "draft",
    selected: true,
    overrides: {},
    updatedAt: now,
  });
}

export function documentFieldValue(caseRecord: CaseRecord, templateId: string, field: DocumentTemplateField): string {
  const draft = caseRecord.documentDrafts.find((item) => item.templateId === templateId);
  if (draft && Object.prototype.hasOwnProperty.call(draft.overrides, field.id)) return draft.overrides[field.id] ?? "";
  return resolveDocumentSource(caseRecord, field.sourceKey);
}

export function updateDocumentDraft(
  caseRecord: CaseRecord,
  templateId: string,
  patch: Partial<DocumentDraft> & { fieldId?: string; value?: string },
): DocumentDraft[] {
  const drafts = ensureDocumentDrafts(caseRecord);
  return drafts.map((draft) => {
    if (draft.templateId !== templateId) return draft;
    const overrides = patch.fieldId
      ? { ...draft.overrides, [patch.fieldId]: patch.value ?? "" }
      : draft.overrides;
    const { fieldId: _fieldId, value: _value, ...draftPatch } = patch;
    return { ...draft, ...draftPatch, overrides, updatedAt: new Date().toISOString() };
  });
}

export function templateValidation(caseRecord: CaseRecord, template: DocumentTemplateDefinition): string[] {
  const missing = template.fields
    .filter((field) => field.required && !documentFieldValue(caseRecord, template.id, field).trim())
    .map((field) => `${template.shortTitle}: ${field.label}`);
  return missing;
}

export function selectedRequiredDocuments(caseRecord: CaseRecord) {
  const permits = new Set(caseRecord.permits.map((permit) => permit.catalogId));
  return requiredDocumentCatalog
    .filter((item) => item.permitCatalogIds.some((id) => permits.has(id)))
    .map((item) => ({
      ...item,
      attachment: caseRecord.attachments.find((attachment) => item.acceptedRoles.includes(attachment.role)),
    }));
}

