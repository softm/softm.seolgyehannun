import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDemoCases } from "../data/demo";
import { DashboardPage } from "../pages/DashboardPage";
import type { CaseRecord } from "../types";

const mocks = vi.hoisted(() => ({
  caseRecord: null as CaseRecord | null,
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
    cases: mocks.caseRecord ? [mocks.caseRecord] : [],
    loading: false,
    error: "",
    selectedCase: mocks.caseRecord,
    selectedCaseId: mocks.caseRecord?.id ?? null,
    selectCase: mocks.selectCase,
    persistCase: vi.fn(),
  }),
}));

vi.mock("../services/organizationRepository", () => ({
  subscribeOrganizationConfiguration: vi.fn(() => () => undefined),
}));

vi.mock("../components/ParcelMap", () => ({
  ParcelMap: ({ cases = [] }: { cases?: CaseRecord[] }) => <div data-testid="detail-parcel-map">{cases.map((item) => item.id).join(",")}</div>,
}));

vi.mock("../components/ReceiptMonitoringPanel", () => ({ ReceiptMonitoringPanel: () => null }));

describe("업무 상세 지도와 빠른 작업", () => {
  beforeEach(() => {
    mocks.caseRecord = makeDemoCases()[0];
    mocks.selectCase.mockReset();
  });

  it("지도 탭에서 선택 업무 필지를 보여주고 작업 버튼을 한 그룹으로 제공한다", () => {
    render(
      <MemoryRouter initialEntries={["/app/cases"]}>
        <DashboardPage listOnly />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText(mocks.caseRecord!.title));
    fireEvent.click(screen.getByRole("tab", { name: "지도" }));

    expect(screen.getByTestId("detail-parcel-map")).toHaveTextContent(mocks.caseRecord!.id);
    expect(screen.getByLabelText("선택 업무 상세")).toHaveClass("map-open");

    const quickActions = screen.getByRole("group", { name: "업무 빠른 작업" });
    expect(within(quickActions).getByRole("link", { name: "업무 정보 수정" })).toBeInTheDocument();
    expect(within(quickActions).getByRole("link", { name: "문서 작업실 열기" })).toBeInTheDocument();
    expect(within(quickActions).getByRole("button", { name: /DOCX/ })).toBeInTheDocument();
    expect(within(quickActions).getByRole("button", { name: /PDF/ })).toBeInTheDocument();
  });
});
