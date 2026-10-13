import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentDraftEditor } from "../components/DocumentDraftEditor";
import { makeDemoCases } from "../data/demo";
import type { CaseRecord } from "../types";

function caseWithDefaultNarratives(): CaseRecord {
  const original = makeDemoCases(new Date("2026-10-14T09:00:00+09:00"))[0];
  return {
    ...original,
    constructionSummary: "",
    safetyPlan: "",
    environmentPlan: "",
    planBody: { ...original.planBody, siteCondition: "", managementPlan: "" },
    projectPlanDetails: {
      ...original.projectPlanDetails,
      roadPlan: "",
      earthworkPlan: "",
      noiseDustPlan: "",
      trafficPlan: "",
    },
    documentDrafts: [],
  };
}

function EditableDocumentHarness({ initial, onDownload }: { initial: CaseRecord; onDownload: (templateId: string, type: "pdf" | "docx") => void }) {
  const [caseRecord, setCaseRecord] = useState(initial);
  return <DocumentDraftEditor caseRecord={caseRecord} onChange={(patch) => setCaseRecord((current) => ({ ...current, ...patch }))} onDownload={onDownload} />;
}

describe("문서 작업실 UI", () => {
  afterEach(cleanup);

  it("내부 연결키를 숨기고 기본문구를 사용자가 확인한 상태로 기록한다", async () => {
    const onDownload = vi.fn();
    const { container } = render(<EditableDocumentHarness initial={caseWithDefaultNarratives()} onDownload={onDownload} />);

    fireEvent.click(screen.getByRole("button", { name: /사업계획서/ }));

    expect(container.textContent).not.toContain("plan.roadPlan");
    const roadPlan = screen.getByLabelText("9. 도로 계획");
    expect((roadPlan as HTMLTextAreaElement).value).toContain("진입");
    const roadPlanField = roadPlan.closest(".template-field");
    expect(roadPlanField).not.toBeNull();
    expect(within(roadPlanField as HTMLElement).getByText(/기본문구입니다/)).toBeInTheDocument();

    fireEvent.click(within(roadPlanField as HTMLElement).getByRole("button", { name: "내용 확인" }));

    await waitFor(() => expect(within(roadPlanField as HTMLElement).getByText("확인됨")).toBeInTheDocument());
    expect(within(roadPlanField as HTMLElement).queryByRole("button", { name: "내용 확인" })).not.toBeInTheDocument();
  });

  it("검토 패널은 기본으로 접고 문서별 다운로드와 묶음 선택을 명확히 제공한다", () => {
    const onDownload = vi.fn();
    render(<EditableDocumentHarness initial={caseWithDefaultNarratives()} onDownload={onDownload} />);

    expect(screen.queryByLabelText("문서 검토")).not.toBeInTheDocument();
    expect(screen.getAllByText("묶음에 포함").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /사업계획서/ }));
    fireEvent.click(screen.getByRole("button", { name: /^PDF 다운로드$/ }));
    expect(onDownload).toHaveBeenCalledWith("business-plan", "pdf");

    fireEvent.click(screen.getByRole("button", { name: /^검토/ }));
    expect(screen.getByLabelText("문서 검토")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /9\. 도로 계획|6~8\. 토지조서/ }).length).toBeGreaterThan(0);
  });
});
