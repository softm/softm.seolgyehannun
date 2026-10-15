import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformDashboardData } from "../services/platformAdminRepository";

const getDashboard = vi.fn();
const confirmPayment = vi.fn();
const updateStatus = vi.fn();

vi.mock("../context", () => ({
  useAuth: () => ({
    user: {
      uid: "platform-owner",
      displayName: "전체 관리자",
      email: "owner@example.com",
      organizationId: "org-1",
      platformRole: "owner",
    },
    logout: vi.fn(),
  }),
}));

vi.mock("../services/platformAdminRepository", async () => {
  const actual = await vi.importActual<typeof import("../services/platformAdminRepository")>("../services/platformAdminRepository");
  return {
    ...actual,
    getPlatformAdminDashboard: (...args: unknown[]) => getDashboard(...args),
    confirmPlatformPayment: (...args: unknown[]) => confirmPayment(...args),
    updatePlatformOrganizationStatus: (...args: unknown[]) => updateStatus(...args),
  };
});

import { PlatformAdminPage } from "../pages/PlatformAdminPage";

const dashboard: PlatformDashboardData = {
  organizations: [{
    id: "org-1",
    name: "한눈 설계사무소",
    ownerId: "owner-1",
    ownerName: "김관리",
    ownerEmail: "office@example.com",
    createdAt: "2026-10-01T00:00:00.000Z",
    platformStatus: "active",
    serviceStatus: "expiring",
    subscriptionStatus: "active",
    planCode: "manual",
    expiresAt: "2026-10-31T00:00:00.000Z",
    trialEndsAt: null,
    suspendedReason: "",
    memberCount: 3,
    caseCount: 12,
  }],
  recentPayments: [],
  monthlyRevenue: 0,
  generatedAt: "2026-10-16T00:00:00.000Z",
};

describe("사이트 전체 관리자", () => {
  beforeEach(() => {
    getDashboard.mockReset().mockResolvedValue(dashboard);
    confirmPayment.mockReset().mockResolvedValue({
      paymentId: "payment-1",
      previousExpiresAt: "2026-10-31T00:00:00.000Z",
      extendedExpiresAt: "2027-01-31T00:00:00.000Z",
    });
    updateStatus.mockReset().mockResolvedValue(undefined);
  });

  it("가입 사무소 현황을 표시하고 입금 확인으로 이용기간을 연장한다", async () => {
    render(<MemoryRouter><PlatformAdminPage /></MemoryRouter>);

    expect(await screen.findByText("한눈 설계사무소")).toBeInTheDocument();
    expect(screen.getAllByText("만료 임박").length).toBeGreaterThan(0);
    expect(screen.getByText("업무 12건")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "입금 확인" }));
    expect(screen.getByRole("dialog", { name: "한눈 설계사무소" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("입금액"), { target: { value: "330000" } });
    fireEvent.change(screen.getByLabelText("연장 기간"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /입금 확인 및 기간 연장/ }));

    await waitFor(() => expect(confirmPayment).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      amount: 330000,
      months: 3,
    })));
    expect(await screen.findByText(/2027\. 1\. 31\.까지 연장했습니다/)).toBeInTheDocument();
  });
});
