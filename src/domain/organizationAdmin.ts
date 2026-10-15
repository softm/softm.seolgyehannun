import type { DeadlinePolicy, DeadlineRecord } from "../types";
import { calculateDeadline } from "./deadline";

export interface OrganizationDeadlineDefaults {
  mode: "calendar-days" | "business-days";
  days: number;
  includeStartDate: boolean;
  excludedWeekdays: number[];
  holidays: string[];
  sourceLabel: string;
  sourceUrl: string;
}

export interface OrganizationNotificationDefaults {
  inAppEnabled: boolean;
  emailEnabled: boolean;
}

export interface OrganizationRegionProfileRecord {
  id: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  status: "verified-sample" | "unverified";
  effectiveDate: string;
  checkedAt: string;
  sourceLabel: string;
  sourceUrl: string;
  guidance: string;
  legalAutomationAllowed: boolean;
}

export interface OrganizationAuditEntry {
  id: string;
  action: string;
  detail: string;
  actorId: string;
  actorName: string;
  createdAt: string;
}

export const defaultDeadlineDefaults: OrganizationDeadlineDefaults = {
  mode: "business-days",
  days: 15,
  includeStartDate: false,
  excludedWeekdays: [0, 6],
  holidays: [],
  sourceLabel: "조직 기본 처리기한",
  sourceUrl: "",
};

export const defaultNotificationDefaults: OrganizationNotificationDefaults = {
  inAppEnabled: true,
  emailEnabled: false,
};

export const defaultRegionProfiles: OrganizationRegionProfileRecord[] = [{
  id: "hwaseong-41590",
  jurisdictionCode: "41590",
  jurisdictionName: "경기도 화성시",
  status: "verified-sample",
  effectiveDate: "2026-10-14",
  checkedAt: "2026-10-14",
  sourceLabel: "화성시 도시계획 조례·민원 안내",
  sourceUrl: "https://www.hscity.go.kr/www/minwon/minwonGnrlzInfo/rqestPreaudt.jsp",
  guidance: "초기 검증 표본입니다. 제출 전 관할기관의 최신 기준을 다시 확인합니다.",
  legalAutomationAllowed: false,
}];

export function normalizeDeadlineDefaults(value?: Partial<OrganizationDeadlineDefaults>): OrganizationDeadlineDefaults {
  const mode = value?.mode === "calendar-days" ? "calendar-days" : "business-days";
  const days = Math.min(365, Math.max(1, Math.trunc(Number(value?.days) || defaultDeadlineDefaults.days)));
  const excludedWeekdays = [...new Set((value?.excludedWeekdays ?? defaultDeadlineDefaults.excludedWeekdays)
    .map(Number)
    .filter((day) => day >= 0 && day <= 6))].sort((a, b) => a - b);
  const holidays = [...new Set((value?.holidays ?? []).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
  return {
    mode,
    days,
    includeStartDate: Boolean(value?.includeStartDate),
    excludedWeekdays,
    holidays,
    sourceLabel: String(value?.sourceLabel ?? defaultDeadlineDefaults.sourceLabel).trim().slice(0, 120),
    sourceUrl: String(value?.sourceUrl ?? "").trim().slice(0, 500),
  };
}

export function normalizeRegionProfile(profile: OrganizationRegionProfileRecord): OrganizationRegionProfileRecord {
  const verified = profile.status === "verified-sample";
  return {
    ...profile,
    jurisdictionCode: profile.jurisdictionCode.replace(/\D/g, "").slice(0, 10),
    jurisdictionName: profile.jurisdictionName.trim().slice(0, 80),
    effectiveDate: /^\d{4}-\d{2}-\d{2}$/.test(profile.effectiveDate) ? profile.effectiveDate : "",
    checkedAt: /^\d{4}-\d{2}-\d{2}$/.test(profile.checkedAt) ? profile.checkedAt : "",
    sourceLabel: profile.sourceLabel.trim().slice(0, 120),
    sourceUrl: profile.sourceUrl.trim().slice(0, 500),
    guidance: profile.guidance.trim().slice(0, 1000),
    legalAutomationAllowed: verified && Boolean(profile.legalAutomationAllowed),
  };
}

export function validateRegionProfile(profile: OrganizationRegionProfileRecord): string | null {
  if (!profile.jurisdictionCode || !profile.jurisdictionName.trim()) return "관할 코드와 관할명을 입력해 주세요.";
  if (!profile.sourceLabel.trim() || !profile.sourceUrl.trim()) return "공식 출처 이름과 URL을 입력해 주세요.";
  if (!/^https:\/\//i.test(profile.sourceUrl)) return "공식 출처 URL은 https 주소여야 합니다.";
  if (profile.status === "verified-sample" && (!profile.effectiveDate || !profile.checkedAt)) {
    return "검증 프로필에는 시행일과 확인일이 필요합니다.";
  }
  return null;
}

export function buildOrganizationDeadlinePolicy(
  defaults: OrganizationDeadlineDefaults,
  reminderOffsets: number[],
): DeadlinePolicy {
  const normalized = normalizeDeadlineDefaults(defaults);
  return {
    id: "organization-default",
    label: normalized.sourceLabel || "조직 기본 처리기한",
    mode: normalized.mode,
    days: normalized.days,
    includeStartDate: normalized.includeStartDate,
    excludedWeekdays: normalized.excludedWeekdays,
    holidays: normalized.holidays,
    reminderOffsets: [...new Set(reminderOffsets)].sort((a, b) => b - a),
    version: 1,
    sourceLabel: normalized.sourceLabel || "조직 기본 처리기한",
    sourceUrl: normalized.sourceUrl || undefined,
  };
}

export function createOrganizationDefaultDeadline(
  referenceId: string,
  startAt: string,
  label: string,
  defaults: OrganizationDeadlineDefaults,
  reminderOffsets: number[],
): DeadlineRecord {
  const policy = buildOrganizationDeadlinePolicy(defaults, reminderOffsets);
  const dueAt = calculateDeadline(startAt, policy);
  return {
    id: `organization-deadline-${referenceId}`,
    label,
    type: "estimated-processing",
    startAt,
    dueAt,
    originalDueAt: dueAt,
    policyId: policy.id,
    policyVersion: policy.version,
    basis: policy.sourceUrl ? `${policy.sourceLabel} · ${policy.sourceUrl}` : policy.sourceLabel,
    isManual: false,
  };
}
