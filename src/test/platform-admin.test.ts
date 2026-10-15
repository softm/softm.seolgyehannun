import { describe, expect, it } from "vitest";
import {
  addCalendarMonths,
  calculateSubscriptionExtension,
  classifyOrganizationStatus,
  normalizeAdminEmails,
} from "../../functions/src/platformAdminCore";

describe("사이트 관리자 이용기간", () => {
  it("관리자 이메일 허용목록을 중복 없이 정규화한다", () => {
    expect(normalizeAdminEmails(" OWNER@example.com,operator@example.com,owner@example.com ")).toEqual([
      "owner@example.com",
      "operator@example.com",
    ]);
  });

  it("월말 연장 시 존재하는 마지막 날짜로 보정한다", () => {
    expect(addCalendarMonths(new Date("2026-01-31T14:59:59.000Z"), 1).toISOString()).toBe("2026-02-28T14:59:59.000Z");
    expect(addCalendarMonths(new Date("2028-01-31T14:59:59.000Z"), 1).toISOString()).toBe("2028-02-29T14:59:59.000Z");
  });

  it("남은 기간이 있으면 현재 만료일부터, 만료됐으면 오늘부터 연장한다", () => {
    const now = new Date("2026-10-16T00:00:00.000Z");
    const future = calculateSubscriptionExtension(new Date("2026-11-30T00:00:00.000Z"), now, 3);
    const expired = calculateSubscriptionExtension(new Date("2026-09-30T00:00:00.000Z"), now, 1);
    expect(future.startsAt.toISOString()).toBe("2026-11-30T00:00:00.000Z");
    expect(future.expiresAt.toISOString()).toBe("2027-02-28T00:00:00.000Z");
    expect(expired.startsAt.toISOString()).toBe(now.toISOString());
    expect(expired.expiresAt.toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });

  it("정지·체험·만료·임박 상태를 구분한다", () => {
    const now = new Date("2026-10-16T00:00:00.000Z");
    expect(classifyOrganizationStatus({ platformStatus: "suspended", now })).toBe("suspended");
    expect(classifyOrganizationStatus({ subscriptionStatus: "trial", expiresAt: new Date("2026-10-25T00:00:00.000Z"), now })).toBe("trial");
    expect(classifyOrganizationStatus({ expiresAt: new Date("2026-10-15T00:00:00.000Z"), now })).toBe("expired");
    expect(classifyOrganizationStatus({ expiresAt: new Date("2026-11-01T00:00:00.000Z"), now })).toBe("expiring");
    expect(classifyOrganizationStatus({ expiresAt: new Date("2027-01-01T00:00:00.000Z"), now })).toBe("active");
    expect(classifyOrganizationStatus({ now })).toBe("unconfigured");
  });
});
