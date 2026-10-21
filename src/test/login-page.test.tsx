import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "../pages/LoginPage";

const mocks = vi.hoisted(() => ({
  loginWithEmail: vi.fn(),
  loginWithGoogle: vi.fn(),
  register: vi.fn(),
  resetPassword: vi.fn(),
  startDemo: vi.fn(),
}));

vi.mock("../context", () => ({
  useAuth: () => ({
    user: null,
    ...mocks,
  }),
}));

vi.mock("../services/firebase", () => ({ firebaseConfigured: true }));

describe("로그인 복구", () => {
  afterEach(cleanup);

  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.resetPassword.mockResolvedValue(undefined);
  });

  it("입력한 이메일로 비밀번호 재설정 안내를 요청한다", async () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    fireEvent.change(screen.getByRole("textbox", { name: "이메일" }), { target: { value: " softm@nate.com " } });
    fireEvent.click(screen.getByRole("button", { name: "비밀번호를 잊으셨나요?" }));

    await waitFor(() => expect(mocks.resetPassword).toHaveBeenCalledWith("softm@nate.com"));
    expect(await screen.findByRole("status")).toHaveTextContent("비밀번호 재설정 안내를 발송했습니다");
  });

  it("Firebase 내부 오류 대신 복구 안내를 표시한다", async () => {
    mocks.loginWithEmail.mockRejectedValue({ code: "auth/internal-error" });
    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    fireEvent.change(screen.getByRole("textbox", { name: "이메일" }), { target: { value: "softm@nate.com" } });
    fireEvent.change(screen.getByPlaceholderText("6자 이상"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("비밀번호를 재설정해 주세요");
    expect(screen.queryByText(/auth\/internal-error/)).not.toBeInTheDocument();
  });
});
