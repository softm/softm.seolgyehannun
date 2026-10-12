import type { RegionProfile } from "../types";

export const hwaseongRegionProfile: RegionProfile = {
  id: "kr-41590-sample-v1",
  jurisdictionCode: "41590",
  jurisdictionName: "경기도 화성시",
  status: "verified-sample",
  effectiveDate: "2026-10-12",
  checkedAt: "2026-10-12",
  sources: [
    {
      label: "화성시 도시계획 조례",
      url: "https://www.law.go.kr/LSW/ordinInfoP.do?ordinSeq=2115001",
    },
    {
      label: "화성시 민원 사전심사청구 안내",
      url: "https://www.hscity.go.kr/www/minwon/minwonGnrlzInfo/rqestPreaudt.jsp",
    },
  ],
  guidance: "초기 검증 표본입니다. 제출 전 최신 조례와 담당 부서 안내를 다시 확인해야 합니다.",
  legalAutomationAllowed: false,
};

export function regionProfileFor(jurisdictionCode: string, jurisdictionName: string): RegionProfile {
  if (jurisdictionCode === hwaseongRegionProfile.jurisdictionCode) return hwaseongRegionProfile;
  return {
    id: `kr-${jurisdictionCode || "unknown"}-unverified`,
    jurisdictionCode,
    jurisdictionName: jurisdictionName || "관할 확인 필요",
    status: "unverified",
    effectiveDate: "",
    checkedAt: "",
    sources: [],
    guidance: "필지 조회는 가능하지만 이 지역의 세부 기준은 아직 검증되지 않았습니다. 법적 적합성을 자동 판정하지 않습니다.",
    legalAutomationAllowed: false,
  };
}
