import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationSwitcher } from "../components/OrganizationSwitcher";

const mocks = vi.hoisted(() => ({
  switchOrganization: vi.fn(),
  user: {
    uid: "user-1",
    displayName: "사용자",
    email: "user@example.com",
    organizationId: "organization-1",
    organizationName: "기존 업무공간",
    role: "admin" as const,
    isDemo: false,
    organizations: [
      { id: "organization-1", name: "기존 업무공간", role: "admin" as const },
      { id: "organization-2", name: "초대된 업무공간", role: "editor" as const },
    ],
  },
}));

vi.mock("../context", () => ({
  useAuth: () => ({ user: mocks.user, switchOrganization: mocks.switchOrganization }),
}));

describe("업무공간 전환", () => {
  beforeEach(() => mocks.switchOrganization.mockReset());

  it("한 계정의 모든 업무공간을 표시하고 선택한 공간으로 전환한다", async () => {
    render(<MemoryRouter><OrganizationSwitcher /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "업무공간 전환: 기존 업무공간, 2개" }));
    expect(screen.getByText("초대된 업무공간")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "초대된 업무공간, 편집자" }));
    await waitFor(() => expect(mocks.switchOrganization).toHaveBeenCalledWith("organization-2"));
  });
});
