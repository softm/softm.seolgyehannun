import { addDays, formatISO } from "date-fns";
import type { AppUser, CaseRecord, ParcelSnapshot } from "../types";

const isoDate = (date: Date) => formatISO(date, { representation: "date" });

export const demoUser: AppUser = {
  uid: "demo-user",
  displayName: "김설계",
  email: "demo@seolgye-hannun.local",
  organizationId: "demo-organization",
  organizationName: "한눈 토목설계",
  role: "admin",
  isDemo: true,
};

export const sampleParcels: ParcelSnapshot[] = [
  {
    id: "4159026223101450000",
    pnu: "4159026223101450000",
    address: "경기도 화성시 남양읍 신남리 145",
    roadAddress: "경기도 화성시 남양읍 남양로 88",
    lotNumber: "145",
    category: "전",
    ledgerAreaM2: 2431,
    plannedAreaM2: 1820,
    zoning: ["계획관리지역"],
    longitude: 126.8248,
    latitude: 37.2056,
    jurisdictionCode: "41590",
    jurisdictionName: "경기도 화성시",
    source: "VWorld 공간정보 오픈플랫폼 샘플",
    fetchedAt: "2026-10-12T09:10:00+09:00",
    verifiedByUser: true,
  },
  {
    id: "4159026223101460000",
    pnu: "4159026223101460000",
    address: "경기도 화성시 남양읍 신남리 146",
    lotNumber: "146",
    category: "답",
    ledgerAreaM2: 1638,
    plannedAreaM2: 1280,
    zoning: ["계획관리지역"],
    longitude: 126.8255,
    latitude: 37.2059,
    jurisdictionCode: "41590",
    jurisdictionName: "경기도 화성시",
    source: "VWorld 공간정보 오픈플랫폼 샘플",
    fetchedAt: "2026-10-12T09:12:00+09:00",
    verifiedByUser: true,
  },
];

export function makeDemoCases(now = new Date()): CaseRecord[] {
  const createdAt = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const updatedAt = new Date(now.getTime() - 2 * 3_600_000).toISOString();
  const dueSoon = isoDate(addDays(now, 3));
  const dueToday = isoDate(now);
  const overdue = isoDate(addDays(now, -2));

  return [
    {
      id: "DEMO-2026-014",
      organizationId: demoUser.organizationId,
      title: "신남리 물류창고 부지조성",
      businessFields: ["부지조성", "공장"],
      applicantName: "주식회사 한결산업",
      applicantContact: "010-0000-0000",
      assigneeId: demoUser.uid,
      assigneeName: demoUser.displayName,
      status: "revision-requested",
      primaryPermitName: "개발행위",
      jurisdictionName: "화성시",
      parcels: sampleParcels,
      permits: [
        { id: "permit-dev", catalogId: "development", name: "개발행위", relation: "primary", applicationKind: "new", legalBasis: "국토의 계획 및 이용에 관한 법률", reviewState: "confirmed" },
        { id: "permit-farm", catalogId: "farmland-conversion", name: "농지전용", relation: "agenda", applicationKind: "new", legalBasis: "농지법", reviewState: "confirmed", consultationStatus: "replied" },
      ],
      receipts: [
        { id: "receipt-1", agency: "화성시", system: "새올전자민원", receiptNumber: "2026-DEV-0142", receivedAt: createdAt, relatedPermitIds: ["permit-dev", "permit-farm"], lookupMode: "manual", lookupStatus: "manual", sourceLabel: "담당자 직접 입력" },
      ],
      deadlines: [
        { id: "deadline-1", label: "배수계획 보완 제출", type: "supplement", startAt: isoDate(addDays(now, -4)), dueAt: dueSoon, originalDueAt: dueSoon, basis: "2026-10-09 보완요청 공문", isManual: true, manualReason: "기관 공문 기한 우선" },
      ],
      attachments: [
        { id: "att-1", name: "현황측량도_v2.pdf", storagePath: "demo/현황측량도_v2.pdf", mimeType: "application/pdf", size: 2_841_600, role: "현황도", version: 2, createdAt: updatedAt, createdBy: demoUser.uid, previewable: true },
        { id: "att-2", name: "배수계획도_v1.dwg", storagePath: "demo/배수계획도_v1.dwg", mimeType: "image/vnd.dwg", size: 8_200_000, role: "배수도", version: 1, createdAt: updatedAt, createdBy: demoUser.uid, previewable: false },
      ],
      documentVersions: [],
      projectPurpose: "물류창고 조성을 위한 부지 정지 및 진입로 설치",
      projectPeriod: { start: isoDate(addDays(now, 45)), end: isoDate(addDays(now, 165)) },
      constructionSummary: "부지 정지, 우수관로 설치, 진입로 포장",
      scheduleSummary: "착공 후 토공 45일, 배수 30일, 포장 및 마감 45일",
      safetyPlan: "작업구간 출입 통제와 절토부 사면 점검을 일일 실시합니다.",
      environmentPlan: "비산먼지 억제를 위한 살수와 임시 침사지 운영 계획을 적용합니다.",
      costItems: [
        { id: "cost-1", workType: "토공", specification: "부지정지", unit: "㎥", quantity: 3400, unitPrice: 8500 },
        { id: "cost-2", workType: "배수공", specification: "우수관 D600", unit: "m", quantity: 180, unitPrice: 145000 },
      ],
      planBody: {
        overview: "대상지는 기존 농경지로, 계획고에 맞춰 부지를 정지하고 물류시설 부지를 조성합니다.",
        siteCondition: "완만한 경사지이며 서측 도로에서 진입합니다.",
        projectPlan: "토공과 배수공을 선행한 뒤 진입로와 부대시설을 시공합니다.",
        managementPlan: "공사 중 안전·환경 점검표를 운영하고 준공 전 배수 흐름을 확인합니다.",
      },
      nextAction: "배수계획 보완도면 검토",
      nextDeadlineAt: dueSoon,
      reminderOffsets: [7, 3, 1, 0],
      createdAt,
      updatedAt,
      version: 4,
    },
    {
      id: "DEMO-2026-018",
      organizationId: demoUser.organizationId,
      title: "송산면 농업용 창고 진입로",
      businessFields: ["도로"],
      applicantName: "박민수",
      assigneeId: "demo-editor",
      assigneeName: "이현장",
      status: "processing",
      primaryPermitName: "도로점용",
      jurisdictionName: "화성시",
      parcels: [sampleParcels[0]],
      permits: [
        { id: "permit-road", catalogId: "road", name: "도로점용", relation: "primary", applicationKind: "new", legalBasis: "도로법", reviewState: "confirmed" },
      ],
      receipts: [
        { id: "receipt-2", agency: "화성시", system: "직접 접수", receiptNumber: "2026-ROAD-0088", receivedAt: createdAt, relatedPermitIds: ["permit-road"], lookupMode: "manual", lookupStatus: "manual", sourceLabel: "접수증 확인" },
      ],
      deadlines: [
        { id: "deadline-2", label: "예상 처리일", type: "estimated-processing", startAt: isoDate(addDays(now, -8)), dueAt: dueToday, originalDueAt: dueToday, basis: "조직 도로점용 업무일 규칙 v1", isManual: false, policyId: "road-business-10", policyVersion: 1 },
      ],
      attachments: [],
      documentVersions: [],
      projectPurpose: "농업용 창고 차량 진입을 위한 진입로 설치",
      projectPeriod: { start: isoDate(addDays(now, 25)), end: isoDate(addDays(now, 55)) },
      constructionSummary: "기존 측구 보강 및 진입부 콘크리트 포장",
      scheduleSummary: "측구 보강 후 포장",
      safetyPlan: "통행 유도원을 배치합니다.",
      environmentPlan: "절단 분진을 습식으로 관리합니다.",
      costItems: [],
      planBody: { overview: "", siteCondition: "", projectPlan: "", managementPlan: "" },
      nextAction: "담당부서 처리상태 확인",
      nextDeadlineAt: dueToday,
      reminderOffsets: [7, 3, 1, 0],
      createdAt,
      updatedAt,
      version: 2,
    },
    {
      id: "DEMO-2026-009",
      organizationId: demoUser.organizationId,
      title: "마도면 공장 증설 변경",
      businessFields: ["공장"],
      applicantName: "정우테크",
      assigneeId: demoUser.uid,
      assigneeName: demoUser.displayName,
      status: "revision-submitted",
      primaryPermitName: "공장설립",
      jurisdictionName: "화성시",
      parcels: [sampleParcels[1]],
      permits: [
        { id: "permit-factory", catalogId: "factory", name: "공장설립", relation: "primary", applicationKind: "change", existingPermitNumber: "화성-공장-2022-031", changeSummary: "제조시설 면적 420㎡ 증설", legalBasis: "산업집적활성화 및 공장설립에 관한 법률", reviewState: "confirmed" },
      ],
      receipts: [],
      deadlines: [
        { id: "deadline-3", label: "내부 도면 재검토", type: "internal", startAt: isoDate(addDays(now, -6)), dueAt: overdue, originalDueAt: overdue, basis: "담당자 지정", isManual: true, manualReason: "보완 제출 전 내부 검토" },
      ],
      attachments: [],
      documentVersions: [],
      projectPurpose: "기존 공장 제조시설 증설",
      projectPeriod: { start: "", end: "" },
      constructionSummary: "",
      scheduleSummary: "",
      safetyPlan: "",
      environmentPlan: "",
      costItems: [],
      planBody: { overview: "", siteCondition: "", projectPlan: "", managementPlan: "" },
      nextAction: "변경 전후 면적표 재검토",
      nextDeadlineAt: overdue,
      reminderOffsets: [7, 3, 1, 0],
      createdAt,
      updatedAt,
      version: 3,
    },
  ];
}
