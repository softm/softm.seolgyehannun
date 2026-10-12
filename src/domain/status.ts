import type { CaseRecord, CaseStatus, CaseStatusId } from "../types";

export const defaultStatuses: CaseStatus[] = [
  { id: "draft", label: "초안", color: "#667085", order: 10 },
  { id: "writing", label: "작성중", color: "#2563eb", order: 20 },
  { id: "ready", label: "접수대기", color: "#7c3aed", order: 30 },
  { id: "processing", label: "처리중", color: "#0369a1", order: 40 },
  { id: "revision-requested", label: "보완요청", color: "#c2410c", order: 50 },
  { id: "revision-submitted", label: "보완제출", color: "#a16207", order: 60 },
  { id: "completed", label: "완료", color: "#047857", order: 70, isTerminal: true },
  { id: "stopped", label: "중단", color: "#475467", order: 80, isTerminal: true },
];

const transitions: Record<string, CaseStatusId[]> = {
  draft: ["writing", "stopped"],
  writing: ["draft", "ready", "stopped"],
  ready: ["writing", "processing", "stopped"],
  processing: ["revision-requested", "completed", "stopped"],
  "revision-requested": ["revision-submitted", "stopped"],
  "revision-submitted": ["processing", "revision-requested", "completed", "stopped"],
  completed: ["processing"],
  stopped: ["draft", "writing"],
};

export function canTransitionStatus(from: CaseStatusId, to: CaseStatusId): boolean {
  if (from === to) return true;
  const targetIsCustom = !defaultStatuses.some((status) => status.id === to);
  if (targetIsCustom) return from !== "completed";
  if (!transitions[from]) return true;
  return (transitions[from] ?? []).includes(to);
}

export function validateCompletion(caseRecord: CaseRecord): string[] {
  const errors: string[] = [];
  if (!caseRecord.receipts.length) errors.push("접수 기록이 없습니다.");
  if (caseRecord.permits.some((permit) => permit.relation === "agenda" && permit.reviewState !== "confirmed")) {
    errors.push("확인되지 않은 의제 절차가 있습니다.");
  }
  if (caseRecord.deadlines.some((deadline) => !deadline.completedAt && deadline.type === "supplement")) {
    errors.push("완료되지 않은 보완 항목이 있습니다.");
  }
  return errors;
}
