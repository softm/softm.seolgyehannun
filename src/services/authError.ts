const authErrorMessages: Record<string, string> = {
  "auth/email-already-in-use": "이미 사용 중인 이메일입니다. 로그인하거나 비밀번호를 재설정해 주세요.",
  "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "auth/invalid-email": "올바른 이메일 주소를 입력해 주세요.",
  "auth/internal-error": "인증 처리 중 오류가 발생했습니다. 잠시 후 다시 시도하거나 비밀번호를 재설정해 주세요.",
  "auth/network-request-failed": "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
  "auth/operation-not-allowed": "현재 사용할 수 없는 로그인 방식입니다. 관리자에게 문의해 주세요.",
  "auth/popup-blocked": "Google 로그인 창이 차단되었습니다. 팝업을 허용한 뒤 다시 시도해 주세요.",
  "auth/popup-closed-by-user": "Google 로그인 창이 닫혔습니다. 다시 시도해 주세요.",
  "auth/too-many-requests": "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하거나 비밀번호를 재설정해 주세요.",
  "auth/unauthorized-domain": "현재 접속한 주소에서는 로그인할 수 없습니다. 관리자에게 문의해 주세요.",
  "auth/user-disabled": "사용이 중지된 계정입니다. 관리자에게 문의해 주세요.",
  "auth/user-not-found": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "auth/weak-password": "비밀번호는 6자 이상으로 설정해 주세요.",
  "auth/wrong-password": "이메일 또는 비밀번호가 올바르지 않습니다.",
};

function errorCode(reason: unknown): string {
  if (!reason || typeof reason !== "object" || !("code" in reason)) return "";
  return typeof reason.code === "string" ? reason.code : "";
}

export function authenticationErrorMessage(reason: unknown, fallback: string): string {
  const code = errorCode(reason);
  if (code.startsWith("auth/")) {
    return authErrorMessages[code] ?? "인증 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return reason instanceof Error ? reason.message : fallback;
}
