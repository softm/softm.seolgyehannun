import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { PermitCatalogItem } from "../domain/permits";
import type { CaseStatus, OrganizationRole } from "../types";
import { getFirebaseServices } from "./firebase";

export interface OrganizationMemberRecord {
  id: string;
  displayName: string;
  email: string;
  role: OrganizationRole;
  status: "active" | "pending";
}

export interface CustomPermitCatalogItem extends PermitCatalogItem {
  relatedPrimaryCatalogIds: string[];
  order: number;
}

export interface OrganizationWorkflowConfiguration {
  reminderOffsets: number[];
  customStatuses: CaseStatus[];
  customPermits: CustomPermitCatalogItem[];
}

export interface InvitationResult {
  invitationId: string;
  token: string;
  emailStatus: string;
}

const workflowKey = "seolgye-hannun.workflow-settings.v1";
const demoMembersKey = "seolgye-hannun.demo-members.v1";
const workflowEvent = "seolgye:workflow-updated";
const membersEvent = "seolgye:members-updated";

const emptyConfiguration: OrganizationWorkflowConfiguration = {
  reminderOffsets: [7, 3, 1, 0, -1],
  customStatuses: [],
  customPermits: [],
};

const initialDemoMembers: OrganizationMemberRecord[] = [
  { id: "demo-user", displayName: "김설계", email: "demo@seolgye-hannun.local", role: "admin", status: "active" },
  { id: "demo-editor", displayName: "이현장", email: "field@example.com", role: "editor", status: "active" },
  { id: "demo-viewer", displayName: "박검토", email: "review@example.com", role: "viewer", status: "pending" },
];

function parseStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function readDemoConfiguration(): OrganizationWorkflowConfiguration {
  const stored = parseStored<OrganizationWorkflowConfiguration | null>(workflowKey, null);
  if (stored) return { ...emptyConfiguration, ...stored };

  // Migrate the very first MVP's name-only local settings without losing user input.
  const statusNames = parseStored<string[]>("seolgye.custom-statuses", []);
  const permitNames = parseStored<string[]>("seolgye.custom-permits", []);
  return {
    ...emptyConfiguration,
    customStatuses: statusNames.map((label, index) => ({
      id: `custom-status-${index + 1}`,
      label,
      color: "#667085",
      order: 100 + index,
    })),
    customPermits: permitNames.map((name, index) => ({
      id: `custom-permit-${index + 1}`,
      name,
      description: "조직 추가 허가 유형",
      category: "main",
      legalBasis: "근거 확인 필요",
      icon: "FileText",
      accent: "green",
      canBePrimary: true,
      relatedPrimaryCatalogIds: [],
      order: 100 + index,
    })),
  };
}

function writeDemoConfiguration(configuration: OrganizationWorkflowConfiguration): void {
  localStorage.setItem(workflowKey, JSON.stringify(configuration));
  window.dispatchEvent(new CustomEvent(workflowEvent));
}

function readDemoMembers(): OrganizationMemberRecord[] {
  return parseStored(demoMembersKey, initialDemoMembers);
}

function writeDemoMembers(members: OrganizationMemberRecord[]): void {
  localStorage.setItem(demoMembersKey, JSON.stringify(members));
  window.dispatchEvent(new CustomEvent(membersEvent));
}

export function subscribeOrganizationConfiguration(
  organizationId: string,
  isDemo: boolean,
  callback: (configuration: OrganizationWorkflowConfiguration) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const services = getFirebaseServices();
  if (isDemo || !services) {
    const publish = () => callback(readDemoConfiguration());
    publish();
    window.addEventListener(workflowEvent, publish);
    return () => window.removeEventListener(workflowEvent, publish);
  }

  let workflow = { reminderOffsets: emptyConfiguration.reminderOffsets, customStatuses: [] as CaseStatus[] };
  let customPermits: CustomPermitCatalogItem[] = [];
  const publish = () => callback({ ...workflow, customPermits });
  const settingsRef = doc(services.db, "organizations", organizationId, "settings", "workflow");
  const catalogRef = doc(services.db, "organizations", organizationId, "catalogs", "permits");
  const unsubscribeSettings = onSnapshot(settingsRef, (snapshot) => {
    const data = snapshot.data();
    workflow = {
      reminderOffsets: Array.isArray(data?.reminderOffsets) ? data.reminderOffsets.map(Number) : emptyConfiguration.reminderOffsets,
      customStatuses: Array.isArray(data?.customStatuses) ? data.customStatuses as CaseStatus[] : [],
    };
    publish();
  }, (error) => onError?.(error));
  const unsubscribeCatalog = onSnapshot(catalogRef, (snapshot) => {
    customPermits = Array.isArray(snapshot.data()?.items) ? snapshot.data()!.items as CustomPermitCatalogItem[] : [];
    publish();
  }, (error) => onError?.(error));
  return () => {
    unsubscribeSettings();
    unsubscribeCatalog();
  };
}

export async function saveOrganizationConfiguration(
  organizationId: string,
  isDemo: boolean,
  configuration: OrganizationWorkflowConfiguration,
  updatedBy: string,
): Promise<void> {
  const normalized = {
    reminderOffsets: [...new Set(configuration.reminderOffsets)].sort((a, b) => b - a),
    customStatuses: configuration.customStatuses.map((status, index) => ({ ...status, order: 100 + index })),
    customPermits: configuration.customPermits.map((permit, index) => ({ ...permit, order: 100 + index })),
  };
  const services = getFirebaseServices();
  if (isDemo || !services) {
    writeDemoConfiguration(normalized);
    return;
  }
  await Promise.all([
    setDoc(doc(services.db, "organizations", organizationId, "settings", "workflow"), {
      reminderOffsets: normalized.reminderOffsets,
      customStatuses: normalized.customStatuses,
      updatedBy,
      updatedAt: serverTimestamp(),
    }, { merge: true }),
    setDoc(doc(services.db, "organizations", organizationId, "catalogs", "permits"), {
      items: normalized.customPermits,
      updatedBy,
      updatedAt: serverTimestamp(),
    }, { merge: true }),
  ]);
}

export function subscribeOrganizationMembers(
  organizationId: string,
  isDemo: boolean,
  callback: (members: OrganizationMemberRecord[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const services = getFirebaseServices();
  if (isDemo || !services) {
    const publish = () => callback(readDemoMembers());
    publish();
    window.addEventListener(membersEvent, publish);
    return () => window.removeEventListener(membersEvent, publish);
  }
  return onSnapshot(
    collection(services.db, "organizations", organizationId, "members"),
    (snapshot) => callback(snapshot.docs.map((item) => ({
      id: item.id,
      displayName: String(item.data().displayName ?? "사용자"),
      email: String(item.data().email ?? ""),
      role: item.data().role as OrganizationRole,
      status: item.data().status === "pending" ? "pending" : "active",
    }))),
    (error) => onError?.(error),
  );
}

export async function updateOrganizationMemberRole(
  organizationId: string,
  memberId: string,
  role: OrganizationRole,
  isDemo: boolean,
): Promise<void> {
  const services = getFirebaseServices();
  if (isDemo || !services) {
    writeDemoMembers(readDemoMembers().map((member) => member.id === memberId ? { ...member, role } : member));
    return;
  }
  await updateDoc(doc(services.db, "organizations", organizationId, "members", memberId), {
    role,
    updatedAt: serverTimestamp(),
  });
}

export async function createOrganizationInvitation(
  organizationId: string,
  email: string,
  role: OrganizationRole,
  isDemo: boolean,
): Promise<InvitationResult> {
  if (isDemo) {
    const token = crypto.randomUUID();
    const next = [...readDemoMembers(), {
      id: `pending-${token}`,
      displayName: email.split("@")[0],
      email,
      role,
      status: "pending" as const,
    }];
    writeDemoMembers(next);
    return { invitationId: token, token, emailStatus: "sample" };
  }
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase가 설정되지 않았습니다.");
  const createInvitation = httpsCallable<
    { organizationId: string; email: string; role: OrganizationRole },
    InvitationResult
  >(services.functions, "createInvitation");
  return (await createInvitation({ organizationId, email, role })).data;
}

export async function acceptOrganizationInvitation(organizationId: string, token: string): Promise<void> {
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase가 설정되지 않았습니다.");
  const acceptInvitation = httpsCallable<{ organizationId: string; token: string }, { organizationId: string; role: OrganizationRole }>(
    services.functions,
    "acceptInvitation",
  );
  await acceptInvitation({ organizationId, token });
}
