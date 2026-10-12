import { describe, expect, it } from "vitest";
import { defaultPermitCatalog, nextPermitSelection, validatePermitComposition } from "../domain/permits";

describe("허가 구성", () => {
  const development = defaultPermitCatalog.find((item) => item.id === "development")!;
  const farmland = defaultPermitCatalog.find((item) => item.id === "farmland-conversion")!;

  it("주허가 1개와 의제 후보를 독립적으로 저장한다", () => {
    const primary = nextPermitSelection(development, "primary");
    const agenda = nextPermitSelection(farmland, "agenda");
    expect(validatePermitComposition([primary, agenda])).toEqual([]);
    expect(agenda.reviewState).toBe("review-needed");
  });

  it("변경 신청의 기존 허가번호 누락을 검출한다", () => {
    const primary = { ...nextPermitSelection(development, "primary"), applicationKind: "change" as const };
    expect(validatePermitComposition([primary])).toContain("개발행위 변경 신청에는 기존 허가번호가 필요합니다.");
  });

  it("주허가 중복과 절차 중복을 검출한다", () => {
    const first = nextPermitSelection(development, "primary");
    const second = nextPermitSelection(development, "primary");
    expect(validatePermitComposition([first, second])).toEqual(expect.arrayContaining([
      "문서 작성 묶음에는 주허가가 1개 필요합니다.",
      "같은 절차를 중복으로 추가할 수 없습니다.",
    ]));
  });
});
