import { describe, expect, it } from "vitest";
import { mergeParcelLookupDefaults } from "../domain/parcelDefaults";
import { normalizeNedParcelDetails } from "../services/vworld";
import type { ParcelSnapshot } from "../types";

const baseParcel: ParcelSnapshot = {
  id: "parcel-1",
  pnu: "4421025028106670001",
  address: "충청남도 서산시 예시리 1",
  role: "project-site",
  ownerNames: [],
  userModifiedFields: [],
  zoning: [],
  longitude: 126.5,
  latitude: 36.8,
  jurisdictionCode: "44210",
  jurisdictionName: "충청남도 서산시",
  source: "저장된 조회",
  fetchedAt: "2026-10-12T00:00:00.000Z",
  verifiedByUser: false,
};

describe("필지 조회 기본값", () => {
  it("VWorld 대장과 토지이용 응답을 면적·지목·용도지역으로 정규화한다", () => {
    expect(normalizeNedParcelDetails(
      { fields: { ladfrlVOList: { lndpclAr: "2431.5", lndcgrCodeNm: "전" } } },
      { response: { fields: { field: [
        { prposAreaDstrcCodeNm: "계획관리지역" },
        { prposAreaDstrcCodeNm: "계획관리지역" },
        { prposAreaDstrcCodeNm: "성장관리계획구역" },
      ] } } },
    )).toEqual({
      ledgerAreaM2: 2431.5,
      sourceLedgerAreaM2: 2431.5,
      category: "전",
      zoning: ["계획관리지역", "성장관리계획구역"],
    });
  });

  it("빈 면적은 대장면적으로 채우고 0 기본값을 적용한다", () => {
    const merged = mergeParcelLookupDefaults(baseParcel, {
      ...baseParcel,
      ledgerAreaM2: 2431,
      sourceLedgerAreaM2: 2431,
      category: "전",
      zoning: ["계획관리지역"],
      fetchedAt: "2026-10-13T00:00:00.000Z",
    });
    expect(merged).toMatchObject({
      ledgerAreaM2: 2431,
      surveyedAreaM2: 2431,
      plannedAreaM2: 2431,
      roadOccupancyAreaM2: 0,
      excludedAreaM2: 0,
      category: "전",
      zoning: ["계획관리지역"],
    });
  });

  it("사용자가 수정하거나 비운 값은 다시 덮어쓰지 않는다", () => {
    const merged = mergeParcelLookupDefaults({
      ...baseParcel,
      surveyedAreaM2: 2400,
      plannedAreaM2: undefined,
      roadOccupancyAreaM2: 25,
      userModifiedFields: ["surveyedAreaM2", "plannedAreaM2", "roadOccupancyAreaM2"],
    }, { ...baseParcel, ledgerAreaM2: 2431, surveyedAreaM2: 2431, plannedAreaM2: 2431 });
    expect(merged.surveyedAreaM2).toBe(2400);
    expect(merged.plannedAreaM2).toBeUndefined();
    expect(merged.roadOccupancyAreaM2).toBe(25);
    expect(merged.excludedAreaM2).toBe(0);
  });
});
