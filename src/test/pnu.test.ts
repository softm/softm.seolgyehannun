import { describe, expect, it } from "vitest";
import { deduplicateParcels, isValidPnu, jurisdictionCodeFromPnu, parsePnu } from "../domain/pnu";

describe("PNU", () => {
  it("19자리 PNU를 검증하고 관할 코드를 분리한다", () => {
    const pnu = "4159026223101450000";
    expect(isValidPnu(pnu)).toBe(true);
    expect(jurisdictionCodeFromPnu(pnu)).toBe("41590");
    expect(parsePnu(pnu)).toMatchObject({ landType: "land", mainNumber: 145, subNumber: 0 });
  });

  it("자리수나 토지구분 코드가 잘못된 PNU를 거부한다", () => {
    expect(isValidPnu("41590")) .toBe(false);
    expect(isValidPnu("4159026223901450000")).toBe(false);
  });

  it("같은 PNU의 연접 필지를 중복 추가하지 않는다", () => {
    const parcels = deduplicateParcels([
      { id: "a", pnu: "4159026223101450000" },
      { id: "b", pnu: "4159026223101450000" },
      { id: "c", pnu: "4159026223101460000" },
    ]);
    expect(parcels.map((item) => item.id)).toEqual(["a", "c"]);
  });
});
