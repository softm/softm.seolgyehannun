import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../pages/DashboardPage";

const mocks = vi.hoisted(() => ({
  user: {
    uid: "demo-user",
    displayName: "김설계",
    email: "demo@seolgye-hannun.local",
    organizationId: "demo-organization",
    organizationName: "한눈 토목설계",
    role: "admin" as const,
    isDemo: true,
  },
}));

vi.mock("../context", () => ({
  useAuth: () => ({ user: mocks.user }),
  useCases: () => ({
    cases: [],
    loading: false,
    error: "",
    selectedCase: null,
    selectedCaseId: null,
    selectCase: vi.fn(),
    persistCase: vi.fn(),
  }),
}));

vi.mock("../services/organizationRepository", () => ({
  subscribeOrganizationConfiguration: vi.fn(() => () => undefined),
}));

vi.mock("../components/ParcelMap", () => ({ ParcelMap: () => null }));
vi.mock("../components/ReceiptMonitoringPanel", () => ({ ReceiptMonitoringPanel: () => null }));

describe("대시보드 모바일 목록 전환", () => {
  it("목록 버튼을 누르면 전체 업무 목록 화면으로 이동한다", () => {
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/app/cases" element={<h1>전체 업무 목록 화면</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "목록" }));

    expect(screen.getByRole("heading", { name: "전체 업무 목록 화면" })).toBeInTheDocument();
  });
});
