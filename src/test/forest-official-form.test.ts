import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { makeDemoCases } from "../data/demo";
import { buildCaseDocumentModels } from "../domain/documentModel";
import {
  documentFieldValue,
  documentTemplates,
  ensureDocumentDrafts,
  templateValidation,
  updateDocumentDraft,
} from "../domain/documentTemplates";
import { buildReferencePdfPages } from "../services/documentPdfTemplates";
import type { CaseRecord } from "../types";

function forestCase(applicationKind: "new" | "change" = "new"): CaseRecord {
  const original = makeDemoCases(new Date("2026-10-14T09:00:00+09:00"))[0];
  const singleParcel = { ...original.parcels[0], plannedAreaM2: 1820 };
  const record: CaseRecord = {
    ...original,
    permits: [{
      id: "permit-forest",
      catalogId: "forest-conversion",
      name: "산지전용",
      relation: "primary",
      applicationKind,
      existingPermitNumber: applicationKind === "change" ? "산지-2025-10" : undefined,
      changeSummary: applicationKind === "change" ? "전용면적 조정" : undefined,
      reviewState: "confirmed",
    }],
    parcels: [singleParcel],
    permitForm: {
      ...original.permitForm,
      applicationDate: "2026-10-14",
      forestryAreaM2: 1820,
      publicForestAreaM2: 0,
      semiConservationAreaM2: 0,
    },
    documentDrafts: [],
  };
  record.documentDrafts = ensureDocumentDrafts(record);
  return record;
}

function override(record: CaseRecord, fieldId: string, value: string): CaseRecord {
  return { ...record, documentDrafts: updateDocumentDraft(record, "forest-application", { fieldId, value }) };
}

describe("산지전용 국가서식", () => {
  it("2026년 현행 별지 제3호서식의 출처·원본 포맷·필드 대응을 고정한다", () => {
    const template = documentTemplates.find((item) => item.id === "forest-application")!;

    expect(template.versionLabel).toBe("개정 2026.6.24 · 시행 2026.9.18");
    expect(template.officialSource).toMatchObject({
      formNumber: "별지 제3호서식",
      revisionDate: "2026-06-24",
      effectiveDate: "2026-09-18",
      availableFormats: ["hwp", "pdf"],
      sourceHashSha256: "a8df6963b6bc547853750683776167cda4a6ce501fe8d397d94b3f39b554794d",
    });
    expect(template.generatedFormatFidelity).toEqual({ pdf: "official-layout", docx: "official-field-map" });
    expect(template.fields.map((field) => field.id)).toEqual(expect.arrayContaining([
      "applicationKind",
      "ownerBirthDate",
      "ownerPhone",
      "forestParcel1AreaTotalM2",
      "fellSpecies",
      "excavatedVolumeM3",
      "replacementForestChargePayment",
      "consentToLivestockRegistrationLookup",
    ]));
  });

  it("허가·변경허가 구분과 필지 공통값을 사건 데이터에서 자동 연결한다", () => {
    const record = forestCase("change");
    const template = documentTemplates.find((item) => item.id === "forest-application")!;
    const kind = template.fields.find((field) => field.id === "applicationKind")!;
    const address = template.fields.find((field) => field.id === "forestParcel1Address")!;
    const total = template.fields.find((field) => field.id === "forestParcel1AreaTotalM2")!;

    expect(documentFieldValue(record, template.id, kind)).toBe("change");
    expect(documentFieldValue(record, template.id, address)).toBe(record.parcels[0].address);
    expect(documentFieldValue(record, template.id, total)).toBe("1820");
  });

  it("산지 구분 면적·토석 합계·변경 내용을 공식 검토 규칙으로 확인한다", () => {
    const template = documentTemplates.find((item) => item.id === "forest-application")!;
    let record = forestCase("change");
    record = override(record, "forestParcel1ForestryAreaM2", "1700");
    record = override(record, "stoneTotalM3", "12");
    record = override(record, "stoneMaterialM3", "5");
    record = override(record, "soilM3", "5");
    record = override(record, "replacementForestChargePayment", "before-permit");

    expect(templateValidation(record, template)).toEqual(expect.arrayContaining([
      "산지전용 신청서: 변경 전",
      "산지전용 신청서: 변경 후",
      "산지전용 신청서: 변경 사유",
      "산지전용 신청서: 1행 면적 계와 산지 구분 합계가 다릅니다.",
      "산지전용 신청서: 토석 계와 석재·토사 합계가 다릅니다.",
    ]));
  });

  it("공식 앞·뒤 2쪽 배경에 사건 값을 겹쳐 쓰는 PDF 페이지를 만든다", () => {
    let record = forestCase();
    record = override(record, "replacementForestChargePayment", "before-permit");
    const [model] = buildCaseDocumentModels(record, ["forest-application"]);
    const pages = buildReferencePdfPages(record, model)!;

    expect(pages).toHaveLength(2);
    expect(pages[0].element.dataset.backgroundImage).toContain("forest-application-page-1.png");
    expect(pages[1].element.dataset.backgroundImage).toContain("forest-application-page-2.png");
    expect(pages[0].element.textContent).toContain("✓");
    expect(pages[0].element.textContent).toContain(record.parties.find((party) => party.role === "applicant")!.name);
    pages.forEach((page) => page.element.remove());
  });

  it("클라이언트·서버가 동일한 공식 원본 이미지를 사용한다", () => {
    [1, 2].forEach((page) => {
      const publicAsset = readFileSync(resolve(`public/document-templates/forest-application-page-${page}.png`));
      const functionAsset = readFileSync(resolve(`functions/assets/document-templates/forest-application-page-${page}.png`));
      expect(createHash("sha256").update(publicAsset).digest("hex"))
        .toBe(createHash("sha256").update(functionAsset).digest("hex"));
    });
  });
});
