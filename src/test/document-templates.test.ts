import { describe, expect, it } from "vitest";
import { makeDemoCases } from "../data/demo";
import { buildCaseDocumentModels, documentValidationErrors } from "../domain/documentModel";
import {
  documentFieldValue,
  documentTemplates,
  ensureDocumentDrafts,
  parcelAreaTotals,
  updateDocumentDraft,
} from "../domain/documentTemplates";

function demoCase() {
  return makeDemoCases(new Date("2026-10-13T09:00:00+09:00"))[0];
}

describe("인허가 문서 자동작성", () => {
  it("신청인 공통값을 선택한 여러 신청서에 연결한다", () => {
    const caseRecord = demoCase();
    const development = documentTemplates.find((template) => template.id === "development-application")!;
    const farmland = documentTemplates.find((template) => template.id === "farmland-application")!;
    const developmentName = development.fields.find((field) => field.id === "applicantName")!;
    const farmlandName = farmland.fields.find((field) => field.id === "applicantName")!;

    expect(documentFieldValue(caseRecord, development.id, developmentName)).toBe("주식회사 한결산업");
    expect(documentFieldValue(caseRecord, farmland.id, farmlandName)).toBe("주식회사 한결산업");
  });

  it("문서별 직접 수정값은 공통정보가 바뀌어도 유지한다", () => {
    const original = demoCase();
    const template = documentTemplates.find((item) => item.id === "development-application")!;
    const field = template.fields.find((item) => item.id === "applicantName")!;
    const documentDrafts = updateDocumentDraft(original, template.id, { fieldId: field.id, value: "문서 전용 신청인" });
    const changed = {
      ...original,
      applicantName: "변경된 공통 신청인",
      parties: original.parties.map((party) => party.role === "applicant" ? { ...party, name: "변경된 공통 신청인" } : party),
      documentDrafts,
    };

    expect(documentFieldValue(changed, template.id, field)).toBe("문서 전용 신청인");
  });

  it("사업계획서와 피해방지계획서의 빈 계획 항목에 수정 가능한 기본 내용을 채운다", () => {
    const original = demoCase();
    const caseRecord = {
      ...original,
      constructionSummary: "",
      safetyPlan: "",
      environmentPlan: "",
      planBody: { ...original.planBody, siteCondition: "", managementPlan: "" },
      projectPlanDetails: {
        ...original.projectPlanDetails,
        roadPlan: "",
        earthworkPlan: "",
      },
      documentDrafts: [],
    };
    const businessPlan = documentTemplates.find((template) => template.id === "business-plan")!;
    const damagePlan = documentTemplates.find((template) => template.id === "damage-prevention-plan")!;
    const overview = businessPlan.fields.find((field) => field.id === "overview")!;
    const roadPlan = businessPlan.fields.find((field) => field.id === "roadPlan")!;
    const siteSafety = damagePlan.fields.find((field) => field.id === "siteSafety")!;
    const soilRunoff = damagePlan.fields.find((field) => field.id === "soilRunoff")!;

    expect(documentFieldValue(caseRecord, businessPlan.id, overview)).toContain(caseRecord.parcels[0].address);
    expect(documentFieldValue(caseRecord, businessPlan.id, roadPlan)).toContain("진입");
    expect(documentFieldValue(caseRecord, damagePlan.id, siteSafety)).toContain("안전표지");
    expect(documentFieldValue(caseRecord, damagePlan.id, soilRunoff)).toContain("침사지");

    const models = buildCaseDocumentModels(caseRecord, [businessPlan.id, damagePlan.id]);
    const generatedRoadPlan = models
      .find((model) => model.templateId === businessPlan.id)!
      .sections.flatMap((section) => section.fields)
      .find((field) => field.id === roadPlan.id);
    expect(generatedRoadPlan?.value).toContain("진입");

    const editedDrafts = updateDocumentDraft(caseRecord, businessPlan.id, {
      fieldId: roadPlan.id,
      value: "현장 여건을 반영한 도로 계획",
    });
    const edited = { ...caseRecord, documentDrafts: editedDrafts };
    expect(documentFieldValue(edited, businessPlan.id, roadPlan)).toBe("현장 여건을 반영한 도로 계획");

    const clearedDrafts = updateDocumentDraft(edited, businessPlan.id, { fieldId: roadPlan.id, value: "" });
    expect(documentFieldValue({ ...edited, documentDrafts: clearedDrafts }, businessPlan.id, roadPlan)).toBe("");
  });

  it("대장·실측·계획·도로점용·제외 면적을 분리 합산한다", () => {
    const totals = parcelAreaTotals(demoCase());
    expect(totals).toEqual({ ledger: 4069, surveyed: 4064.2, planned: 3100, road: 48, excluded: 921 });
  });

  it("선택 허가에 맞는 신청서와 공통 문서를 제출 묶음으로 만든다", () => {
    const caseRecord = demoCase();
    caseRecord.documentDrafts = ensureDocumentDrafts(caseRecord).map((draft) => ({ ...draft, selected: draft.templateId !== "damage-prevention-plan" }));
    const models = buildCaseDocumentModels(caseRecord);

    expect(models.map((model) => model.templateId)).toEqual([
      "development-application",
      "farmland-application",
      "area-statement",
      "business-plan",
    ]);
    expect(models[0].parcels[0].plannedArea).toBe("1,820 ㎡");
  });

  it("전체 묶음에서 제외한 문서도 개별 다운로드 모델로 만든다", () => {
    const caseRecord = demoCase();
    caseRecord.documentDrafts = ensureDocumentDrafts(caseRecord).map((draft) => ({
      ...draft,
      selected: draft.templateId !== "damage-prevention-plan",
    }));

    const [model] = buildCaseDocumentModels(caseRecord, ["damage-prevention-plan"]);

    expect(model.templateId).toBe("damage-prevention-plan");
    expect(model.sections.flatMap((section) => section.fields).every((field) => Boolean(field.id))).toBe(true);
  });

  it("변경허가에는 기존 허가번호와 변경내용을 요구한다", () => {
    const caseRecord = demoCase();
    caseRecord.permits[0] = { ...caseRecord.permits[0], applicationKind: "change", existingPermitNumber: "", changeSummary: "" };

    expect(documentValidationErrors(caseRecord)).toEqual(expect.arrayContaining([
      "개발행위: 기존 허가번호를 입력해 주세요.",
      "개발행위: 변경 내용을 입력해 주세요.",
    ]));
  });
});
