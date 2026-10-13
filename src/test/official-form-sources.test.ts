import { describe, expect, it } from "vitest";
import { documentTemplates } from "../domain/documentTemplates";

describe("현행 국가서식 원본 레지스트리", () => {
  it.each([
    ["development-application", "2023-01-27", "169298847", "169298849"],
    ["farmland-application", "2019-06-28", "170090637", "170090639"],
    ["forest-application", "2026-06-24", "168602221", "168602223"],
  ])("%s에 공식 HWP·PDF 원본과 개정일을 저장한다", (templateId, revisionDate, hwpSequence, pdfSequence) => {
    const template = documentTemplates.find((item) => item.id === templateId);

    expect(template?.officialSource).toMatchObject({
      revisionDate,
      availableFormats: ["hwp", "pdf"],
    });
    expect(template?.officialSource?.formatUrls?.hwp).toContain(`flSeq=${hwpSequence}`);
    expect(template?.officialSource?.formatUrls?.pdf).toContain(`flSeq=${pdfSequence}`);
    expect(template?.officialSource?.formatUrls?.hwpx).toBeUndefined();
  });

  it("서식별 출력 충실도를 포맷마다 명시한다", () => {
    const byId = Object.fromEntries(documentTemplates.map((template) => [template.id, template]));

    expect(byId["development-application"].generatedFormatFidelity).toEqual({ pdf: "official-field-map", docx: "official-field-map" });
    expect(byId["farmland-application"].generatedFormatFidelity).toEqual({ pdf: "official-field-map", docx: "official-field-map" });
    expect(byId["forest-application"].generatedFormatFidelity).toEqual({ pdf: "official-layout", docx: "official-field-map" });
  });
});
