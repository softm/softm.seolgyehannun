import { describe, expect, it } from "vitest";
import { makeDemoCases } from "../data/demo";
import { buildCaseDocumentModel, documentValidationErrors } from "../domain/documentModel";
import { canTransitionStatus, validateCompletion } from "../domain/status";

describe("상태와 문서 모델", () => {
  it("정해진 상태 전이만 허용한다", () => {
    expect(canTransitionStatus("writing", "ready")).toBe(true);
    expect(canTransitionStatus("draft", "completed")).toBe(false);
    expect(canTransitionStatus("revision-requested", "revision-submitted")).toBe(true);
  });

  it("보완 미완료 업무의 완료를 차단한다", () => {
    const caseRecord = makeDemoCases(new Date("2026-10-13T09:00:00+09:00"))[0];
    expect(validateCompletion(caseRecord)).toContain("완료되지 않은 보완 항목이 있습니다.");
  });

  it("문서에 필지, 허가, 출처, 참고 고지를 포함한다", () => {
    const caseRecord = makeDemoCases(new Date("2026-10-13T09:00:00+09:00"))[0];
    const model = buildCaseDocumentModel(caseRecord);
    expect(documentValidationErrors(caseRecord)).toEqual([]);
    expect(model.parcels).toHaveLength(2);
    expect(model.permits[0].relation).toBe("주허가");
    expect(model.sources.join(" ")).toContain("VWorld");
    expect(model.notice).toContain("공식 허가 판단을 대체하지 않으며");
  });
});
