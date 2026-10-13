import type { CaseRecord } from "../types";
import { validatePermitComposition } from "./permits";

export function wizardStepErrors(caseRecord: CaseRecord, targetStep: number): string[] {
  if (targetStep === 1) {
    const next: string[] = [];
    if (!caseRecord.title.trim()) next.push("사건명을 입력해 주세요.");
    if (!(caseRecord.parties.find((party) => party.role === "applicant")?.name || caseRecord.applicantName).trim()) next.push("신청인을 입력해 주세요.");
    if (!caseRecord.projectPurpose.trim()) next.push("사업 목적을 입력해 주세요.");
    if (!caseRecord.parcels.length) next.push("대표 필지를 1개 이상 선택해 주세요.");
    return next;
  }
  if (targetStep === 2) return validatePermitComposition(caseRecord.permits);
  if (targetStep === 3) {
    return caseRecord.permits.flatMap((permit) => permit.applicationKind === "change"
      ? [
        ...(!permit.existingPermitNumber?.trim() ? [`${permit.name}: 기존 허가번호를 입력해 주세요.`] : []),
        ...(!permit.changeSummary?.trim() ? [`${permit.name}: 변경 전후 내용을 입력해 주세요.`] : []),
      ]
      : []);
  }
  return [];
}
