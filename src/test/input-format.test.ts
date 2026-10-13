import { describe, expect, it } from "vitest";
import {
  formatBusinessNumberInput,
  formatNumericInput,
  formatPhoneInput,
  formatPnuInput,
  formatRegistrationNumberInput,
  parseFormattedNumber,
} from "../domain/inputFormat";

describe("입력 포맷팅", () => {
  it("전화번호 유형에 맞춰 하이픈을 표시한다", () => {
    expect(formatPhoneInput("01012345678")).toBe("010-1234-5678");
    expect(formatPhoneInput("0212345678")).toBe("02-1234-5678");
    expect(formatPhoneInput("15881234")).toBe("1588-1234");
    expect(formatPhoneInput("050712345678")).toBe("0507-1234-5678");
  });

  it("등록번호와 사업자번호를 정해진 자리수로 제한한다", () => {
    expect(formatRegistrationNumberInput("90010112345678")).toBe("900101-1234567");
    expect(formatBusinessNumberInput("12345678901")).toBe("123-45-67890");
  });

  it("PNU는 숫자 19자리만 유지한다", () => {
    expect(formatPnuInput("41590-25300 11000-0001")).toBe("4159025300110000001");
  });

  it("수량과 금액에 쉼표를 표시하고 숫자로 복원한다", () => {
    expect(formatNumericInput("0012345.6789", 3)).toBe("12,345.678");
    expect(parseFormattedNumber("12,345.678")).toBe(12345.678);
    expect(parseFormattedNumber("")).toBeUndefined();
  });
});
