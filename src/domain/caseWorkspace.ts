import { deadlineDistance } from "./deadline";
import type { CaseRecord, CaseStatusId } from "../types";

export type CaseViewMode = "table" | "board" | "map";
export type CaseSortMode = "deadline" | "updated" | "created" | "title";
export type CaseDeadlineFilter = "all" | "overdue" | "today" | "week" | "none";

export interface CaseWorkspaceFilters {
  query: string;
  status: CaseStatusId | "all";
  assignee: string;
  permit: string;
  jurisdiction: string;
  deadline: CaseDeadlineFilter;
  sort: CaseSortMode;
}

function normalize(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

function matchesDeadline(caseRecord: CaseRecord, filter: CaseDeadlineFilter) {
  if (filter === "all") return true;
  if (filter === "none") return !caseRecord.nextDeadlineAt;
  if (!caseRecord.nextDeadlineAt) return false;

  const distance = deadlineDistance(caseRecord.nextDeadlineAt);
  if (filter === "overdue") return distance < 0 && caseRecord.status !== "completed";
  if (filter === "today") return distance === 0;
  return distance >= 0 && distance <= 7;
}

function compareDeadline(a: CaseRecord, b: CaseRecord) {
  if (!a.nextDeadlineAt && !b.nextDeadlineAt) return b.updatedAt.localeCompare(a.updatedAt);
  if (!a.nextDeadlineAt) return 1;
  if (!b.nextDeadlineAt) return -1;
  return a.nextDeadlineAt.localeCompare(b.nextDeadlineAt) || b.updatedAt.localeCompare(a.updatedAt);
}

export function filterAndSortCases(cases: CaseRecord[], filters: CaseWorkspaceFilters) {
  const query = normalize(filters.query);

  return cases
    .filter((caseRecord) => filters.status === "all" || caseRecord.status === filters.status)
    .filter((caseRecord) => !filters.assignee || caseRecord.assigneeName === filters.assignee)
    .filter((caseRecord) => !filters.permit || caseRecord.primaryPermitName === filters.permit)
    .filter((caseRecord) => !filters.jurisdiction || caseRecord.jurisdictionName === filters.jurisdiction)
    .filter((caseRecord) => matchesDeadline(caseRecord, filters.deadline))
    .filter((caseRecord) => {
      if (!query) return true;
      return normalize([
        caseRecord.id,
        caseRecord.title,
        caseRecord.contractReference,
        caseRecord.applicantName,
        caseRecord.primaryPermitName,
        caseRecord.assigneeName,
        caseRecord.jurisdictionName,
        ...caseRecord.parcels.flatMap((parcel) => [parcel.address, parcel.roadAddress, parcel.pnu]),
      ].filter(Boolean).join(" ")).includes(query);
    })
    .sort((a, b) => {
      if (filters.sort === "updated") return b.updatedAt.localeCompare(a.updatedAt);
      if (filters.sort === "created") return b.createdAt.localeCompare(a.createdAt);
      if (filters.sort === "title") return a.title.localeCompare(b.title, "ko-KR");
      return compareDeadline(a, b);
    });
}

export function countActiveCaseFilters(filters: CaseWorkspaceFilters) {
  return [
    filters.status !== "all",
    Boolean(filters.assignee),
    Boolean(filters.permit),
    Boolean(filters.jurisdiction),
    filters.deadline !== "all",
  ].filter(Boolean).length;
}
