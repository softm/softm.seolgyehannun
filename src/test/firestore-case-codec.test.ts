import { describe, expect, it } from "vitest";
import { makeDemoCases } from "../data/demo";
import {
  decodeCaseFromFirestore,
  decodeParcelFromFirestore,
  encodeCaseForFirestore,
  encodeParcelForFirestore,
} from "../services/firestoreCaseCodec";
import type { ParcelBoundary } from "../types";

const boundary: ParcelBoundary = {
  type: "Polygon",
  coordinates: [[[126.8, 37.2], [126.81, 37.2], [126.81, 37.21], [126.8, 37.2]]],
};

describe("Firestore 업무 데이터 변환", () => {
  it("중첩 좌표 배열을 문자열로 저장하고 다시 경계 객체로 복원한다", () => {
    const parcel = { ...makeDemoCases()[0].parcels[0], boundary };
    const encoded = encodeParcelForFirestore(parcel);

    expect(typeof encoded.boundary).toBe("string");
    expect(decodeParcelFromFirestore(encoded).boundary).toEqual(boundary);
  });

  it("업무 문서와 필지 하위 컬렉션이 같은 변환 규칙을 사용한다", () => {
    const caseRecord = makeDemoCases()[0];
    caseRecord.parcels[0] = { ...caseRecord.parcels[0], boundary };

    const encoded = encodeCaseForFirestore(caseRecord);
    expect(typeof encoded.parcels[0].boundary).toBe("string");

    const decoded = decodeCaseFromFirestore(encoded as unknown as Record<string, unknown>, caseRecord.id);
    expect(decoded.parcels[0].boundary).toEqual(boundary);
  });
});
