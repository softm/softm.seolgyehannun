import { describe, expect, it } from "vitest";
import {
  createOrganizationDefaultDeadline,
  normalizeDeadlineDefaults,
  normalizeRegionProfile,
  validateRegionProfile,
  type OrganizationRegionProfileRecord,
} from "../domain/organizationAdmin";

describe("조직 관리자 설정", () => {
  it("처리기한 일수·제외요일·휴일을 안전한 값으로 정규화한다", () => {
    const normalized = normalizeDeadlineDefaults({
      mode: "business-days",
      days: 999,
      includeStartDate: true,
      excludedWeekdays: [6, 0, 6, 8],
      holidays: ["2026-10-09", "잘못된 날짜", "2026-10-09"],
    });

    expect(normalized.days).toBe(365);
    expect(normalized.excludedWeekdays).toEqual([0, 6]);
    expect(normalized.holidays).toEqual(["2026-10-09"]);
    expect(normalized.includeStartDate).toBe(true);
  });

  it("미검증 지역은 법적 자동판정을 강제로 비활성화한다", () => {
    const profile: OrganizationRegionProfileRecord = {
      id: "region-test",
      jurisdictionCode: "41-590",
      jurisdictionName: " 경기도 화성시 ",
      status: "unverified",
      effectiveDate: "",
      checkedAt: "",
      sourceLabel: " 공식 안내 ",
      sourceUrl: "https://example.com/guide",
      guidance: " 확인 필요 ",
      legalAutomationAllowed: true,
    };

    const normalized = normalizeRegionProfile(profile);
    expect(normalized.jurisdictionCode).toBe("41590");
    expect(normalized.jurisdictionName).toBe("경기도 화성시");
    expect(normalized.legalAutomationAllowed).toBe(false);
    expect(validateRegionProfile(normalized)).toBeNull();
  });

  it("검증 프로필은 공식 https 출처와 시행·확인일을 요구한다", () => {
    const profile: OrganizationRegionProfileRecord = {
      id: "region-test",
      jurisdictionCode: "41590",
      jurisdictionName: "화성시",
      status: "verified-sample",
      effectiveDate: "",
      checkedAt: "",
      sourceLabel: "조례",
      sourceUrl: "http://example.com",
      guidance: "",
      legalAutomationAllowed: false,
    };

    expect(validateRegionProfile(profile)).toContain("https");
    expect(validateRegionProfile({ ...profile, sourceUrl: "https://example.com" })).toContain("시행일");
  });

  it("접수 등록 시 조직 업무일·휴일 규칙으로 예상 처리기한을 만든다", () => {
    const deadline = createOrganizationDefaultDeadline(
      "receipt-1",
      "2026-10-16",
      "화성시 예상 처리기한",
      {
        mode: "business-days",
        days: 3,
        includeStartDate: false,
        excludedWeekdays: [0, 6],
        holidays: ["2026-10-19"],
        sourceLabel: "민원 처리 기준",
        sourceUrl: "https://example.com/deadline",
      },
      [7, 3, 1, 0, -1],
    );

    expect(deadline.startAt).toBe("2026-10-16");
    expect(deadline.dueAt).toBe("2026-10-22");
    expect(deadline.originalDueAt).toBe("2026-10-22");
    expect(deadline.basis).toContain("https://example.com/deadline");
    expect(deadline.isManual).toBe(false);
  });
});
