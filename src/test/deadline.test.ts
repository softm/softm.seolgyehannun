import { describe, expect, it } from "vitest";
import { applyManualDeadline, calculateDeadline, deadlineLabel } from "../domain/deadline";
import type { DeadlinePolicy, DeadlineRecord } from "../types";

const businessPolicy: DeadlinePolicy = {
  id: "business-3",
  label: "3 업무일",
  mode: "business-days",
  days: 3,
  includeStartDate: false,
  excludedWeekdays: [0, 6],
  holidays: [],
  reminderOffsets: [1, 0],
  version: 1,
  sourceLabel: "테스트 규칙",
};

describe("기한 계산", () => {
  it("주말을 제외한 업무일을 계산한다", () => {
    expect(calculateDeadline("2026-10-09", businessPolicy)).toBe("2026-10-14");
  });

  it("휴일표와 첫날 산입을 반영한다", () => {
    expect(calculateDeadline("2026-10-09", { ...businessPolicy, includeStartDate: true, holidays: ["2026-10-12"] })).toBe("2026-10-14");
  });

  it("수동 기한은 근거를 요구하고 원래 기한을 보존한다", () => {
    const deadline: DeadlineRecord = { id: "d1", label: "보완", type: "supplement", startAt: "2026-10-01", dueAt: "2026-10-14", originalDueAt: "2026-10-14", basis: "자동 규칙", isManual: false };
    expect(() => applyManualDeadline(deadline, "2026-10-13", " ")).toThrow();
    expect(applyManualDeadline(deadline, "2026-10-13", "기관 공문")).toMatchObject({ dueAt: "2026-10-13", originalDueAt: "2026-10-14", isManual: true, manualReason: "기관 공문" });
  });

  it("당일과 지연 D-day를 구분한다", () => {
    expect(deadlineLabel("2026-10-13", new Date("2026-10-13T12:00:00+09:00"))).toBe("오늘");
    expect(deadlineLabel("2026-10-11", new Date("2026-10-13T12:00:00+09:00"))).toBe("D+2");
  });
});
