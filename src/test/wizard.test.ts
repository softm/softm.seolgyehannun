import { describe, expect, it } from "vitest";
import { makeDemoCases } from "../data/demo";
import { wizardStepErrors } from "../domain/wizard";

describe("신규 업무 단계 검증", () => {
  it("공사 개요와 안전·환경 대책을 비워도 공사계획 단계를 통과한다", () => {
    const caseRecord = makeDemoCases(new Date("2026-10-13T09:00:00+09:00"))[0];
    caseRecord.constructionSummary = "";
    caseRecord.safetyPlan = "";
    caseRecord.environmentPlan = "";

    expect(wizardStepErrors(caseRecord, 5)).toEqual([]);
  });
});
