export type PlatformOrganizationStatus = "active" | "trial" | "expiring" | "expired" | "suspended" | "unconfigured";

export function normalizeAdminEmails(value: string): string[] {
  return [...new Set(value
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean))];
}

export function addCalendarMonths(value: Date, months: number): Date {
  if (!Number.isInteger(months) || months < 1 || months > 36) {
    throw new Error("연장 기간은 1개월부터 36개월까지 선택할 수 있습니다.");
  }
  const source = new Date(value.getTime());
  if (Number.isNaN(source.getTime())) throw new Error("기준 날짜가 올바르지 않습니다.");
  const day = source.getUTCDate();
  const targetMonthStart = new Date(source.getTime());
  targetMonthStart.setUTCDate(1);
  targetMonthStart.setUTCMonth(targetMonthStart.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(
    targetMonthStart.getUTCFullYear(),
    targetMonthStart.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(day, lastDay));
  return targetMonthStart;
}

export function calculateSubscriptionExtension(
  currentExpiry: Date | null,
  now: Date,
  months: number,
): { startsAt: Date; expiresAt: Date } {
  if (Number.isNaN(now.getTime())) throw new Error("현재 날짜가 올바르지 않습니다.");
  const startsAt = currentExpiry && !Number.isNaN(currentExpiry.getTime()) && currentExpiry > now
    ? new Date(currentExpiry.getTime())
    : new Date(now.getTime());
  return { startsAt, expiresAt: addCalendarMonths(startsAt, months) };
}

export function classifyOrganizationStatus(input: {
  platformStatus?: unknown;
  subscriptionStatus?: unknown;
  expiresAt?: Date | null;
  now?: Date;
}): PlatformOrganizationStatus {
  if (input.platformStatus === "suspended" || input.subscriptionStatus === "suspended") return "suspended";
  const expiresAt = input.expiresAt;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return "unconfigured";
  const now = input.now ?? new Date();
  if (expiresAt.getTime() < now.getTime()) return "expired";
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (input.subscriptionStatus === "trial") return "trial";
  return daysLeft <= 30 ? "expiring" : "active";
}
