import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvitationPage } from "../pages/InvitationPage";

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  acceptInvitation: vi.fn(),
  user: {
    uid: "member-user",
    displayName: "현재 사용자",
    email: "current@example.com",
    organizationId: "current-organization",
    organizationName: "현재 조직",
    role: "admin" as const,
    isDemo: false,
  },
}));

vi.mock("../context", () => ({
  useAuth: () => ({ user: mocks.user, logout: mocks.logout }),
}));

vi.mock("../services/firebase", () => ({ firebaseConfigured: true }));

vi.mock("../services/organizationRepository", () => ({
  acceptOrganizationInvitation: mocks.acceptInvitation,
}));

function LoginLocation() {
  const location = useLocation();
  return <div data-testid="login-location">{location.pathname}{location.search}</div>;
}

describe("초대 계정 전환", () => {
  beforeEach(() => {
    mocks.logout.mockReset();
    mocks.acceptInvitation.mockReset();
  });

  it("현재 계정에서 로그아웃한 뒤 초대 링크를 보존해 로그인 화면으로 이동한다", async () => {
    render(
      <MemoryRouter initialEntries={["/invite?organizationId=organization-1&token=invite-token"]}>
        <Routes>
          <Route path="/invite" element={<InvitationPage />} />
          <Route path="/login" element={<LoginLocation />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "다른 계정으로 로그인" }));

    await waitFor(() => expect(mocks.logout).toHaveBeenCalledOnce());
    expect(screen.getByTestId("login-location")).toHaveTextContent(
      "/login?returnTo=%2Finvite%3ForganizationId%3Dorganization-1%26token%3Dinvite-token",
    );
  });
});
