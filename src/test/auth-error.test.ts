import { describe, expect, it } from "vitest";
import { authenticationErrorMessage } from "../services/authError";

describe("Firebase 인증 오류 안내", () => {
  it("내부 오류를 복구 가능한 한국어 안내로 바꾼다", () => {
    expect(authenticationErrorMessage({ code: "auth/internal-error" }, "로그인 실패")).toContain("비밀번호를 재설정");
  });

  it("계정 존재 여부를 드러내지 않고 동일한 자격 증명 오류로 안내한다", () => {
    expect(authenticationErrorMessage({ code: "auth/user-not-found" }, "로그인 실패"))
      .toBe(authenticationErrorMessage({ code: "auth/wrong-password" }, "로그인 실패"));
  });

  it("인증 오류가 아니면 기존 업무 오류 메시지를 보존한다", () => {
    expect(authenticationErrorMessage(new Error("조직 생성에 실패했습니다."), "가입 실패"))
      .toBe("조직 생성에 실패했습니다.");
  });
});
