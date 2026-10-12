import { describe, expect, it } from "vitest";
import { formatSeoulDate } from "../domain/date";

describe("서울 기준 날짜", () => {
  it("UTC 날짜가 전날이어도 KST 날짜를 반환한다", () => {
    expect(formatSeoulDate("2026-10-12T15:30:00.000Z")).toBe("2026-10-13");
  });

  it("유효하지 않은 값은 빈 문자열로 처리한다", () => {
    expect(formatSeoulDate("not-a-date")).toBe("");
  });
});
