import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countActiveCaseFilters, filterAndSortCases, type CaseWorkspaceFilters } from "../domain/caseWorkspace";
import type { CaseRecord } from "../types";

function caseRecord(values: Partial<CaseRecord> & Pick<CaseRecord, "id" | "title">) {
  return {
    organizationId: "org-1",
    contractReference: "",
    applicantName: "",
    assigneeName: "미배정",
    status: "writing",
    primaryPermitName: "개발행위",
    jurisdictionName: "서산시",
    parcels: [],
    nextAction: "검토",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...values,
  } as CaseRecord;
}

const baseFilters: CaseWorkspaceFilters = {
  query: "",
  status: "all",
  assignee: "",
  permit: "",
  jurisdiction: "",
  deadline: "all",
  sort: "deadline",
};

describe("업무 목록 보기 조건", () => {
  beforeEach(() => vi.setSystemTime(new Date("2026-10-13T12:00:00+09:00")));
  afterEach(() => vi.useRealTimers());

  it("신청인과 PNU까지 통합 검색한다", () => {
    const cases = [
      caseRecord({ id: "case-a", title: "농지 조성", applicantName: "김지훈", parcels: [{ address: "충남 서산시", pnu: "4421025023100660000" } as CaseRecord["parcels"][number]] }),
      caseRecord({ id: "case-b", title: "공장 신축", applicantName: "박민수" }),
    ];

    expect(filterAndSortCases(cases, { ...baseFilters, query: "김 지훈" }).map((item) => item.id)).toEqual(["case-a"]);
    expect(filterAndSortCases(cases, { ...baseFilters, query: "4421025023100660000" }).map((item) => item.id)).toEqual(["case-a"]);
  });

  it("담당자·허가·관할·기한 조건을 함께 적용한다", () => {
    const cases = [
      caseRecord({ id: "case-a", title: "지연 업무", assigneeName: "임수연", nextDeadlineAt: "2026-10-12" }),
      caseRecord({ id: "case-b", title: "이번 주 업무", assigneeName: "임수연", nextDeadlineAt: "2026-10-17" }),
      caseRecord({ id: "case-c", title: "기한 없음", assigneeName: "다른 담당자" }),
    ];

    expect(filterAndSortCases(cases, { ...baseFilters, assignee: "임수연", deadline: "overdue" }).map((item) => item.id)).toEqual(["case-a"]);
    expect(filterAndSortCases(cases, { ...baseFilters, deadline: "week" }).map((item) => item.id)).toEqual(["case-b"]);
  });

  it("정렬과 활성 필터 개수를 계산한다", () => {
    const cases = [
      caseRecord({ id: "case-a", title: "가 업무", updatedAt: "2026-10-10T00:00:00.000Z" }),
      caseRecord({ id: "case-b", title: "나 업무", updatedAt: "2026-10-12T00:00:00.000Z" }),
    ];

    expect(filterAndSortCases(cases, { ...baseFilters, sort: "updated" }).map((item) => item.id)).toEqual(["case-b", "case-a"]);
    expect(countActiveCaseFilters({ ...baseFilters, status: "writing", assignee: "임수연", deadline: "today" })).toBe(3);
  });
});
