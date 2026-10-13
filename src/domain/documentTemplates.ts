import type { CaseRecord, DocumentDraft, ParcelSnapshot, PartyRecord } from "../types";

export type DocumentFieldKind = "text" | "textarea" | "date" | "number" | "choice";
export type DocumentTemplateStatus = "official-reference" | "office-template";
export type DocumentDefaultContent = string | ((caseRecord: CaseRecord) => string);
export type OfficialSourceFormat = "hwp" | "hwpx" | "pdf";
export type GeneratedFormatFidelity = "official-layout" | "official-field-map" | "office-template";

export interface OfficialFormSource {
  regulationName: string;
  formNumber: string;
  revisionDate: string;
  effectiveDate: string;
  sourceUrl: string;
  sourceHashSha256?: string;
  availableFormats: OfficialSourceFormat[];
  formatUrls?: Partial<Record<OfficialSourceFormat, string>>;
}

export interface DocumentTemplateField {
  id: string;
  label: string;
  group: string;
  kind: DocumentFieldKind;
  sourceKey?: string;
  defaultContent?: DocumentDefaultContent;
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
  officialSource?: OfficialFormSource;
  generatedFormatFidelity?: Partial<Record<"pdf" | "docx", GeneratedFormatFidelity>>;
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

const longWithDefault = (
  id: string,
  label: string,
  group: string,
  sourceKey: string | undefined,
  defaultContent: DocumentDefaultContent,
  required = false,
): DocumentTemplateField => ({
  ...long(id, label, group, sourceKey, required),
  defaultContent,
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

const choice = (
  id: string,
  label: string,
  group: string,
  options: Array<{ value: string; label: string }>,
  sourceKey?: string,
  required = false,
): DocumentTemplateField => ({ id, label, group, kind: "choice", sourceKey, required, options });

const businessPlanDefaultContent = {
  overview: (caseRecord: CaseRecord) => {
    const addresses = caseRecord.parcels.map((parcel) => parcel.address).filter(Boolean).join(", ") || "사업대상지";
    return `대상지는 ${addresses} 일원으로, 지목·용도지역·진입여건과 주변 토지이용 현황을 확인하여 사업계획에 반영합니다. 세부 현황은 현황측량도 및 토지이용계획확인서에 따릅니다.`;
  },
  fundingPlan: "사업에 필요한 공사비와 부대비용은 신청인 자체 자금으로 조달하며, 공정별 집행계획에 따라 단계적으로 투입합니다. 세부 금액은 공사내역서에 따릅니다.",
  constructionSummary: "사업부지 정지, 진입로 및 배수시설 설치 등 필요한 공정을 설계도서에 따라 순차적으로 시행합니다. 세부 공법과 물량은 현장 여건 및 관계기관 협의 결과에 따라 조정합니다.",
  roadPlan: "사업지 진입은 기존 도로 및 계획 진입로를 이용하고, 차량 통행에 지장이 없도록 폭원·접속부·회차 공간을 확보합니다. 세부 구조는 관계기관 협의 및 설계도서에 따라 시공합니다.",
  drainagePlan: "부지 내 우수는 측구와 집수정을 통해 계획 배수로로 유도하고, 토사 유출 방지를 위해 침사지 등 임시 배수시설을 설치합니다. 방류 위치와 규모는 현장 여건 및 관계기관 협의 결과에 따릅니다.",
  preventionPlan: "공사 중 토사 유출·비산먼지·소음·교통 불편을 줄이기 위해 가설울타리, 살수, 세륜 및 안전유도 조치를 시행하고 수시로 현장을 점검합니다.",
  waterSupplyPlan: "공사 및 운영에 필요한 용수는 적법한 급수시설을 이용하며, 공급 방법과 사용량은 시설계획 및 관계기관 협의 결과에 따라 확정합니다.",
  earthworkPlan: "절토와 성토량의 균형을 우선 검토하고, 발생 토사는 현장 내 적정 활용하거나 허가된 반출처로 운반합니다. 운반 중 비산과 유출이 없도록 덮개 및 세륜 조치를 시행합니다.",
  airReview: "공사 중 살수, 방진망, 적재물 덮개 및 세륜시설을 운영합니다. 대기환경보전법상 신고 대상 여부를 검토하고, 대상인 경우 착공 전에 필요한 절차를 이행합니다.",
  waterReview: "우수와 오수를 분리 처리하고 오탁수의 외부 유출을 방지합니다. 물환경보전법상 신고 대상 여부를 검토하고, 대상인 경우 필요한 시설과 절차를 반영합니다.",
  nearbyImpactPlan: "인접 토지와 시설물에 미치는 영향을 최소화하도록 경계부·배수·소음·진동 상태를 점검하고, 이상 발생 시 즉시 보강 및 복구 조치를 시행합니다.",
  vegetationPlan: "공사 과정에서 발생하는 수목과 부산물은 종류별로 분리하여 적법하게 반출·처리하며, 재활용 가능한 자재는 현장 여건에 따라 우선 활용합니다.",
  noiseDustPlan: "소음이 큰 작업은 주간에 실시하고 장비를 정기 점검합니다. 비산먼지 발생 구간에는 살수와 방진망을 적용하고 적재 차량에는 덮개를 설치합니다.",
  wastewaterPlan: "공사장 오수와 세륜수는 별도로 집수하여 적정 처리하고, 처리되지 않은 오수가 외부로 유출되지 않도록 관리합니다.",
  trafficPlan: "공사차량 진출입 시 안전요원을 배치하고 운행 시간과 동선을 관리합니다. 도로 오염 발생 시 즉시 청소하여 통행 불편과 안전사고를 예방합니다.",
  wastePlan: "건설폐기물은 종류별로 분리 보관하고 허가받은 처리업체를 통해 적법하게 처리합니다. 반출 내역과 인계서류는 준공 시까지 보관합니다.",
  postManagementPlan: "준공 후 배수시설, 사면, 포장 및 안전시설 상태를 정기적으로 확인하고, 침하·유실·파손 또는 민원 발생 시 신속히 보수·복구합니다.",
} satisfies Record<string, DocumentDefaultContent>;

const damagePreventionDefaultContent = {
  siteSafety: "공사구역에 가설울타리와 안전표지를 설치하고 출입을 통제합니다. 작업 전 안전교육과 장비 점검을 실시하고 현장책임자가 작업 상태를 수시로 확인합니다.",
  soilRunoff: "우기 전에 임시 배수로와 침사지를 설치하고 노출 사면은 방수포·식생매트 등으로 보호합니다. 유출 토사는 즉시 제거하고 훼손 구간을 복구합니다.",
  dust: "건조한 날에는 작업구간과 운반로에 살수하고, 적재 차량에는 덮개를 설치합니다. 차량 출입구에는 세륜시설을 운영하여 도로 오염과 비산먼지를 방지합니다.",
  traffic: "공사차량 진출입구에 안전요원을 배치하고 운행 시간과 동선을 관리합니다. 통행량이 많은 시간대 작업을 조정하고 도로 오염 시 즉시 청소합니다.",
  drainage: "우수와 오수를 분리하여 처리하고, 우수는 측구·집수정·침사지 등을 거쳐 계획 배수로로 유도합니다. 오탁수와 세륜수는 외부로 직접 유출되지 않도록 관리합니다.",
  additional: "공사로 인한 민원이나 주변 피해가 확인되면 즉시 원인을 조사하고 필요한 보강·복구 조치를 시행합니다. 준공 후에도 배수시설과 사면 상태를 점검합니다.",
} satisfies Record<string, DocumentDefaultContent>;

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
      longWithDefault("overview", "1. 위치 및 현황", "사업 개요", "plan.siteCondition", businessPlanDefaultContent.overview, true),
      long("purpose", "2. 사업 목적", "사업 개요", "case.projectPurpose", true),
      text("implementer", "3. 사업 시행자", "사업 개요", "applicant.name", true),
      text("projectPeriod", "4. 사업 시행 기간", "사업 개요", "case.projectPeriod", true),
      longWithDefault("fundingPlan", "5. 자금 소요 및 조달 계획", "사업 개요", "plan.fundingPlan", businessPlanDefaultContent.fundingPlan),
      longWithDefault("constructionSummary", "6~8. 토지조서·공사개요·사업개요", "계획", "case.constructionSummary", businessPlanDefaultContent.constructionSummary, true),
      text("buildingUse", "건축물 용도", "건축 개요", "building.useCategory"),
      text("legalBuildingUse", "법령상 건축물 용도", "건축 개요", "building.legalUseCategory"),
      number("buildingArea", "건축면적(㎡)", "건축 개요", "building.buildingAreaM2"),
      number("grossFloorArea", "연면적(㎡)", "건축 개요", "building.grossFloorAreaM2"),
      text("floors", "층수", "건축 개요", "building.floors"),
      number("coverageRatio", "건폐율(%)", "건축 개요", "building.buildingCoverageRatio"),
      number("floorAreaRatio", "용적률(%)", "건축 개요", "building.floorAreaRatio"),
      text("buildingStructure", "구조", "건축 개요", "building.structure"),
      longWithDefault("roadPlan", "9. 도로 계획", "기반시설", "plan.roadPlan", businessPlanDefaultContent.roadPlan),
      longWithDefault("drainagePlan", "9. 배수 계획", "기반시설", "plan.drainagePlan", businessPlanDefaultContent.drainagePlan),
      longWithDefault("preventionPlan", "10. 피해 방지 계획", "안전·환경", "case.environmentPlan", businessPlanDefaultContent.preventionPlan),
      longWithDefault("waterSupplyPlan", "11. 급수 계획", "기반시설", "plan.waterSupplyPlan", businessPlanDefaultContent.waterSupplyPlan),
      longWithDefault("earthworkPlan", "12. 토사 처리 계획", "시공", "plan.earthworkPlan", businessPlanDefaultContent.earthworkPlan),
      longWithDefault("airReview", "13. 대기환경보전법 관련 사항", "법령 검토", undefined, businessPlanDefaultContent.airReview),
      longWithDefault("waterReview", "14. 물환경보전법 관련 사항", "법령 검토", undefined, businessPlanDefaultContent.waterReview),
      longWithDefault("nearbyImpactPlan", "15. 인근에 미치는 영향", "안전·환경", "plan.nearbyImpactPlan", businessPlanDefaultContent.nearbyImpactPlan),
      longWithDefault("vegetationPlan", "16. 부산물·입목 처리 계획", "안전·환경", "plan.vegetationPlan", businessPlanDefaultContent.vegetationPlan),
      longWithDefault("noiseDustPlan", "17. 소음·분진 방지 계획", "안전·환경", "plan.noiseDustPlan", businessPlanDefaultContent.noiseDustPlan),
      longWithDefault("wastewaterPlan", "17. 오폐수·세륜 계획", "안전·환경", "plan.wastewaterPlan", businessPlanDefaultContent.wastewaterPlan),
      longWithDefault("trafficPlan", "17. 교통 계획", "안전·환경", "plan.trafficPlan", businessPlanDefaultContent.trafficPlan),
      longWithDefault("wastePlan", "18. 폐기물 처리 대책", "안전·환경", "plan.wastePlan", businessPlanDefaultContent.wastePlan),
      longWithDefault("postManagementPlan", "19. 사후 관리", "관리", "plan.postManagementPlan", businessPlanDefaultContent.postManagementPlan, true),
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
      longWithDefault("siteSafety", "가설울타리·안전표지·현장관리", "피해 방지", "case.safetyPlan", damagePreventionDefaultContent.siteSafety, true),
      longWithDefault("soilRunoff", "토사 유출 방지", "피해 방지", "plan.earthworkPlan", damagePreventionDefaultContent.soilRunoff, true),
      longWithDefault("dust", "비산먼지·세륜 대책", "피해 방지", "plan.noiseDustPlan", damagePreventionDefaultContent.dust, true),
      longWithDefault("traffic", "공사차량·교통 대책", "피해 방지", "plan.trafficPlan", damagePreventionDefaultContent.traffic, true),
      longWithDefault("drainage", "우·오수 처리", "피해 방지", "plan.drainagePlan", damagePreventionDefaultContent.drainage, true),
      longWithDefault("additional", "추가 피해방지 및 복구 약속", "피해 방지", "plan.postManagementPlan", damagePreventionDefaultContent.additional),
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
  const sourceValue = resolveDocumentSource(caseRecord, field.sourceKey);
  if (sourceValue.trim()) return sourceValue;
  return typeof field.defaultContent === "function"
    ? field.defaultContent(caseRecord)
    : field.defaultContent ?? "";
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

