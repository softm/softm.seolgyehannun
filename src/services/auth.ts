import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { demoUser } from "../data/demo";
import type { AppUser, OrganizationRole, OrganizationWorkspace } from "../types";
import { firebaseConfigured, getFirebaseServices } from "./firebase";
import {
  endPlatformWorkspaceAccess,
  getPlatformAdminAccess,
  startPlatformWorkspaceAccess,
} from "./platformAdminRepository";

const demoSessionKey = "seolgye-hannun.demo-session";

async function mapFirebaseUser(user: User): Promise<AppUser> {
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase가 설정되지 않았습니다.");
  const [profileSnapshot, listedOrganizations, platformAccess] = await Promise.all([
    getDoc(doc(services.db, "users", user.uid)),
    listCurrentUserOrganizations().catch(() => null),
    getPlatformAdminAccess().catch(() => null),
  ]);
  const profile = profileSnapshot.data() ?? {};
  const workspaceAccess = platformAccess?.workspaceAccess ?? null;
  const organizationId = workspaceAccess?.organizationId ?? String(profile.defaultOrganizationId ?? "");
  let organizationName = "조직 선택 필요";
  let role: OrganizationRole = "viewer";
  let organizationStatus: "active" | "suspended" = "active";
  let subscriptionExpiresAt: string | null = null;

  if (organizationId) {
    const [organization, membership] = await Promise.all([
      getDoc(doc(services.db, "organizations", organizationId)),
      workspaceAccess ? Promise.resolve(null) : getDoc(doc(services.db, "organizations", organizationId, "members", user.uid)),
    ]);
    const organizationData = organization.data() ?? {};
    organizationName = workspaceAccess?.organizationName ?? String(organizationData.name ?? organizationName);
    const expiry = organizationData.subscription?.expiresAt;
    subscriptionExpiresAt = typeof expiry?.toDate === "function" ? expiry.toDate().toISOString() : null;
    organizationStatus = organizationData.platformStatus === "suspended"
      || (subscriptionExpiresAt ? new Date(subscriptionExpiresAt).getTime() < Date.now() : false)
      ? "suspended"
      : "active";
    role = workspaceAccess?.role ?? (membership?.data()?.role as OrganizationRole | undefined) ?? role;
  }

  let organizations: OrganizationWorkspace[] = organizationId
    ? [{ id: organizationId, name: organizationName, role, status: organizationStatus, subscriptionExpiresAt }]
    : [];
  if (listedOrganizations) organizations = listedOrganizations;
  const platformRole = platformAccess?.isPlatformAdmin ? platformAccess.role : null;

  return {
    uid: user.uid,
    displayName: user.displayName || user.email?.split("@")[0] || "사용자",
    email: user.email ?? "",
    organizationId,
    organizationName,
    role,
    isDemo: false,
    organizations,
    organizationStatus,
    subscriptionExpiresAt,
    platformRole,
    platformWorkspaceAccess: workspaceAccess,
  };
}

export async function listCurrentUserOrganizations(): Promise<OrganizationWorkspace[]> {
  const services = getFirebaseServices();
  if (!services?.auth.currentUser) throw new Error("로그인이 필요합니다.");
  const listOrganizations = httpsCallable<void, { organizations: OrganizationWorkspace[] }>(
    services.functions,
    "listUserOrganizations",
  );
  const result = await listOrganizations();
  return result.data.organizations;
}

export async function switchCurrentOrganization(organizationId: string): Promise<AppUser> {
  const services = getFirebaseServices();
  if (!services?.auth.currentUser) throw new Error("로그인이 필요합니다.");
  const switchOrganization = httpsCallable<{ organizationId: string }, { organizationId: string }>(
    services.functions,
    "switchUserOrganization",
  );
  await switchOrganization({ organizationId });
  return mapFirebaseUser(services.auth.currentUser);
}

export async function reloadCurrentUser(): Promise<AppUser> {
  const services = getFirebaseServices();
  if (!services?.auth.currentUser) throw new Error("로그인이 필요합니다.");
  return mapFirebaseUser(services.auth.currentUser);
}

export async function enterPlatformWorkspace(organizationId: string, role: OrganizationRole): Promise<AppUser> {
  const services = getFirebaseServices();
  const currentUser = services?.auth.currentUser;
  if (!services || !currentUser) throw new Error("로그인이 필요합니다.");
  await startPlatformWorkspaceAccess(organizationId, role);
  await currentUser.getIdToken(true);
  return mapFirebaseUser(currentUser);
}

export async function leavePlatformWorkspace(): Promise<AppUser> {
  const services = getFirebaseServices();
  const currentUser = services?.auth.currentUser;
  if (!services || !currentUser) throw new Error("로그인이 필요합니다.");
  await endPlatformWorkspaceAccess();
  await currentUser.getIdToken(true);
  return mapFirebaseUser(currentUser);
}

export function observeUser(callback: (user: AppUser | null) => void): () => void {
  if (!firebaseConfigured) {
    callback(localStorage.getItem(demoSessionKey) === "active" ? demoUser : null);
    const listener = (event: StorageEvent) => {
      if (event.key === demoSessionKey) callback(event.newValue === "active" ? demoUser : null);
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }
  const services = getFirebaseServices();
  if (!services) return () => undefined;
  return onAuthStateChanged(services.auth, async (user) => {
    if (user) {
      localStorage.removeItem(demoSessionKey);
      callback(await mapFirebaseUser(user));
      return;
    }
    callback(localStorage.getItem(demoSessionKey) === "active" ? demoUser : null);
  });
}

export function startDemoSession(): AppUser {
  localStorage.setItem(demoSessionKey, "active");
  return demoUser;
}

export async function signInWithGoogle(): Promise<AppUser> {
  const services = getFirebaseServices();
  if (!services) return startDemoSession();
  localStorage.removeItem(demoSessionKey);
  const credential = await signInWithPopup(services.auth, new GoogleAuthProvider());
  return mapFirebaseUser(credential.user);
}

export async function signInWithEmail(email: string, password: string): Promise<AppUser> {
  const services = getFirebaseServices();
  if (!services) return startDemoSession();
  localStorage.removeItem(demoSessionKey);
  const credential = await signInWithEmailAndPassword(services.auth, email.trim(), password);
  return mapFirebaseUser(credential.user);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase가 설정되지 않았습니다.");
  services.auth.languageCode = "ko";
  await sendPasswordResetEmail(services.auth, email.trim());
}

export async function registerWithEmail(name: string, organizationName: string, email: string, password: string): Promise<AppUser> {
  const services = getFirebaseServices();
  if (!services) return startDemoSession();
  localStorage.removeItem(demoSessionKey);
  const credential = await createUserWithEmailAndPassword(services.auth, email.trim(), password);
  await updateProfile(credential.user, { displayName: name });
  if (organizationName.trim()) {
    const bootstrap = httpsCallable<{ name: string }, { organizationId: string }>(
      services.functions,
      "bootstrapOrganization",
    );
    await bootstrap({ name: organizationName.trim() });
  }
  return mapFirebaseUser(credential.user);
}

export async function bootstrapUserOrganization(name: string): Promise<AppUser> {
  const services = getFirebaseServices();
  if (!services) return startDemoSession();
  const currentUser = services.auth.currentUser;
  if (!currentUser) throw new Error("로그인이 필요합니다.");
  const bootstrap = httpsCallable<{ name: string }, { organizationId: string }>(
    services.functions,
    "bootstrapOrganization",
  );
  await bootstrap({ name: name.trim() });
  return mapFirebaseUser(currentUser);
}

export async function endSession(): Promise<void> {
  localStorage.removeItem(demoSessionKey);
  const services = getFirebaseServices();
  if (services) await signOut(services.auth);
}
