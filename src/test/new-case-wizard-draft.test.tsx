import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDemoCases } from "../data/demo";
import { NewCaseWizard } from "../pages/NewCaseWizard";
import type { CaseRecord } from "../types";

const mocks = vi.hoisted(() => ({
  cases: [] as CaseRecord[],
  loading: true,
  persistCase: vi.fn(),
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
  useCases: () => ({ cases: mocks.cases, loading: mocks.loading, persistCase: mocks.persistCase }),
}));

vi.mock("../services/organizationRepository", () => ({
  subscribeOrganizationConfiguration: vi.fn(() => () => undefined),
}));

vi.mock("../components/ParcelMap", () => ({ ParcelMap: () => null }));

function editorView(caseId: string) {
  const route = `/app/cases/${caseId}/edit?step=5`;
  return (
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/app/cases/:caseId/edit" element={<NewCaseWizard />} />
        <Route path="/app" element={<div>업무 목록</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("업무 수정 임시저장 복원", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.cases = [];
    mocks.loading = true;
    mocks.persistCase.mockReset();
  });

  it("서버 버전보다 오래된 임시저장본은 버리고 최신 사건을 연다", async () => {
    const latest = { ...makeDemoCases()[0], title: "서버 최신 업무", version: 7 };
    const stale = { ...latest, title: "오래된 임시저장 업무", version: 6 };
    const draftKey = `seolgye-hannun.wizard.${mocks.user.organizationId}.${latest.id}`;
    sessionStorage.setItem(draftKey, JSON.stringify({ step: 7, caseRecord: stale }));

    const { rerender } = render(editorView(latest.id));
    expect(screen.getByText("업무 수정 화면을 준비하고 있습니다")).toBeInTheDocument();

    mocks.cases = [latest];
    mocks.loading = false;
    rerender(editorView(latest.id));

    expect(await screen.findByRole("heading", { level: 1, name: "서버 최신 업무" })).toBeInTheDocument();
    expect(screen.queryByText("오래된 임시저장 업무")).not.toBeInTheDocument();
    await waitFor(() => {
      const restored = JSON.parse(sessionStorage.getItem(draftKey) ?? "null") as { caseRecord: CaseRecord } | null;
      expect(restored?.caseRecord.version).toBe(latest.version);
    });
  });

  it("서버와 버전이 같은 임시저장본은 작성 내용을 유지한다", async () => {
    const latest = { ...makeDemoCases()[0], title: "서버 업무", version: 7 };
    const draft = { ...latest, title: "작성 중인 임시저장 업무" };
    const draftKey = `seolgye-hannun.wizard.${mocks.user.organizationId}.${latest.id}`;
    sessionStorage.setItem(draftKey, JSON.stringify({ step: 5, caseRecord: draft }));

    const { rerender } = render(editorView(latest.id));
    mocks.cases = [latest];
    mocks.loading = false;
    rerender(editorView(latest.id));

    expect(await screen.findByRole("heading", { level: 1, name: "작성 중인 임시저장 업무" })).toBeInTheDocument();
  });
});
