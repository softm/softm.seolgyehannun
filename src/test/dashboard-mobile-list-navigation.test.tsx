import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDemoCases } from "../data/demo";
import { DashboardPage } from "../pages/DashboardPage";
import type { CaseRecord } from "../types";

const mocks = vi.hoisted(() => ({
  cases: [] as CaseRecord[],
  selectCase: vi.fn(),
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
    cases: mocks.cases,
    loading: false,
    error: "",
    selectedCase: null,
    selectedCaseId: null,
    selectCase: mocks.selectCase,
    persistCase: vi.fn(),
  }),
}));

vi.mock("../services/organizationRepository", () => ({
  subscribeOrganizationConfiguration: vi.fn(() => () => undefined),
}));

vi.mock("../components/ParcelMap", () => ({ ParcelMap: () => null }));
vi.mock("../components/ReceiptMonitoringPanel", () => ({ ReceiptMonitoringPanel: () => null }));

describe("대시보드 모바일 목록 전환", () => {
  beforeEach(() => {
    mocks.cases = [];
    mocks.selectCase.mockReset();
  });

  it("업무 카드를 누르면 해당 업무를 선택하고 지도 화면으로 전환한다", () => {
    const caseRecord = makeDemoCases()[0];
    mocks.cases = [caseRecord];

    const { container } = render(
      <MemoryRouter initialEntries={["/app"]}>
        <DashboardPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(caseRecord.title) }));

    expect(mocks.selectCase).toHaveBeenCalledWith(caseRecord.id);
    expect(container.querySelector(".case-workspace")).toHaveClass("mobile-map");
    expect(screen.getByRole("button", { name: "지도" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "목록" }));

    expect(container.querySelector(".case-workspace")).toHaveClass("mobile-list");
    expect(screen.getByRole("button", { name: "목록" })).toHaveAttribute("aria-pressed", "true");
  });
});
