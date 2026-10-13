import { describe, expect, it } from "vitest";
import { normalizeParcelBoundary } from "../services/vworld";

describe("VWorld 필지 경계", () => {
  it("Polygon 좌표를 선택 영역 데이터로 보존한다", () => {
    expect(normalizeParcelBoundary({
      type: "Polygon",
      coordinates: [[[126.8, 37.2], [126.81, 37.2], [126.81, 37.21], [126.8, 37.2]]],
    })).toEqual({
      type: "Polygon",
      coordinates: [[[126.8, 37.2], [126.81, 37.2], [126.81, 37.21], [126.8, 37.2]]],
    });
  });

  it("MultiPolygon과 JSON 문자열 응답을 지원한다", () => {
    const geometry = {
      type: "MultiPolygon",
      coordinates: [[[[126.8, 37.2], [126.81, 37.2], [126.81, 37.21], [126.8, 37.2]]]],
    };
    expect(normalizeParcelBoundary(JSON.stringify(geometry))).toEqual(geometry);
  });

  it("불완전하거나 지원하지 않는 도형은 저장하지 않는다", () => {
    expect(normalizeParcelBoundary({ type: "Point", coordinates: [126.8, 37.2] })).toBeUndefined();
    expect(normalizeParcelBoundary({ type: "Polygon", coordinates: [[[126.8, 37.2]]] })).toBeUndefined();
    expect(normalizeParcelBoundary("not-json")).toBeUndefined();
  });
});
