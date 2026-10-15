import { httpsCallable } from "firebase/functions";
import type { OrganizationRole, PlatformWorkspaceAccess } from "../types";
import { getFirebaseServices } from "./firebase";

export type PlatformAdminRole = "owner" | "operator";
export type PlatformServiceStatus = "active" | "trial" | "expiring" | "expired" | "suspended" | "unconfigured";

export interface PlatformAdminAccess {
  isPlatformAdmin: boolean;
  role: PlatformAdminRole | null;
  email: string | null;
  workspaceAccess: PlatformWorkspaceAccess | null;
}

export interface PlatformOrganizationSummary {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  createdAt: string | null;
  platformStatus: "active" | "suspended";
  serviceStatus: PlatformServiceStatus;
  subscriptionStatus: string;
  planCode: string;
  expiresAt: string | null;
  trialEndsAt: string | null;
  suspendedReason: string;
  memberCount: number;
  caseCount: number;
}

export interface PlatformPaymentRecord {
  id: string;
  organizationId: string;
  organizationName: string;
  amount: number;
  months: number;
  depositedAt: string;
  depositorName: string;
  previousExpiresAt: string | null;
  extendedExpiresAt: string | null;
  confirmedAt: string | null;
  confirmedByEmail: string;
  note: string;
}

export interface PlatformDashboardData {
  organizations: PlatformOrganizationSummary[];
  recentPayments: PlatformPaymentRecord[];
  monthlyRevenue: number;
  generatedAt: string;
}

export interface ConfirmPlatformPaymentInput {
  organizationId: string;
  amount: number;
  months: number;
  depositedAt: string;
  depositorName: string;
  note: string;
}

export interface ConfirmPlatformPaymentResult {
  paymentId: string;
  previousExpiresAt: string | null;
  extendedExpiresAt: string;
}

function functionsService() {
  const services = getFirebaseServices();
  if (!services?.auth.currentUser) throw new Error("로그인이 필요합니다.");
  return services.functions;
}

export async function getPlatformAdminAccess(): Promise<PlatformAdminAccess> {
  const callable = httpsCallable<void, PlatformAdminAccess>(functionsService(), "getPlatformAdminAccess");
  return (await callable()).data;
}

export async function getPlatformAdminDashboard(): Promise<PlatformDashboardData> {
  const callable = httpsCallable<void, PlatformDashboardData>(functionsService(), "getPlatformAdminDashboard");
  return (await callable()).data;
}

export async function startPlatformWorkspaceAccess(
  organizationId: string,
  role: OrganizationRole,
): Promise<PlatformWorkspaceAccess> {
  const callable = httpsCallable<
    { organizationId: string; role: OrganizationRole },
    { workspaceAccess: PlatformWorkspaceAccess }
  >(functionsService(), "startPlatformWorkspaceAccess");
  return (await callable({ organizationId, role })).data.workspaceAccess;
}

export async function endPlatformWorkspaceAccess(): Promise<boolean> {
  const callable = httpsCallable<void, { ended: boolean }>(functionsService(), "endPlatformWorkspaceAccess");
  return (await callable()).data.ended;
}

export async function confirmPlatformPayment(input: ConfirmPlatformPaymentInput): Promise<ConfirmPlatformPaymentResult> {
  const callable = httpsCallable<ConfirmPlatformPaymentInput, ConfirmPlatformPaymentResult>(functionsService(), "confirmPlatformPayment");
  return (await callable(input)).data;
}

export async function updatePlatformOrganizationStatus(
  organizationId: string,
  status: "active" | "suspended",
  reason: string,
): Promise<void> {
  const callable = httpsCallable<
    { organizationId: string; status: "active" | "suspended"; reason: string },
    { organizationId: string; status: "active" | "suspended" }
  >(functionsService(), "updatePlatformOrganizationStatus");
  await callable({ organizationId, status, reason });
}
