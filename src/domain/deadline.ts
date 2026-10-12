import { addDays, format, isAfter, parseISO, startOfDay } from "date-fns";
import type { DeadlinePolicy, DeadlineRecord } from "../types";

function dateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function calculateDeadline(startAt: string, policy: DeadlinePolicy): string {
  const holidays = new Set(policy.holidays);
  let cursor = startOfDay(parseISO(startAt));
  const isExcluded = (date: Date) => policy.mode === "business-days"
    && (policy.excludedWeekdays.includes(date.getDay()) || holidays.has(dateKey(date)));
  let counted = policy.includeStartDate && !isExcluded(cursor) ? 1 : 0;

  while (counted < policy.days) {
    cursor = addDays(cursor, 1);
    if (!isExcluded(cursor)) counted += 1;
  }

  return dateKey(cursor);
}

export function applyManualDeadline(
  deadline: DeadlineRecord,
  dueAt: string,
  reason: string,
): DeadlineRecord {
  if (!reason.trim()) throw new Error("수동 기한 변경 근거가 필요합니다.");
  return {
    ...deadline,
    dueAt,
    isManual: true,
    manualReason: reason.trim(),
  };
}

export function deadlineDistance(dueAt: string, now = new Date()): number {
  const due = startOfDay(parseISO(dueAt));
  const today = startOfDay(now);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function deadlineLabel(dueAt: string, now = new Date()): string {
  const distance = deadlineDistance(dueAt, now);
  if (distance === 0) return "오늘";
  if (distance > 0) return `D-${distance}`;
  return `D+${Math.abs(distance)}`;
}

export function isOverdue(dueAt?: string, now = new Date()): boolean {
  return Boolean(dueAt && isAfter(startOfDay(now), startOfDay(parseISO(dueAt))));
}
