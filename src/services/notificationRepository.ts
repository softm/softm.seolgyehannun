import { collection, doc, onSnapshot, query, updateDoc, where, type Unsubscribe } from "firebase/firestore";
import { getFirebaseServices } from "./firebase";

export interface InAppNotification {
  id: string;
  caseId: string;
  title: string;
  body: string;
  dueAt?: string;
  createdAt: string;
  readAt: string | null;
}

function dateValue(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return typeof value === "string" ? value : new Date().toISOString();
}

export function subscribeInAppNotifications(
  organizationId: string,
  userId: string,
  caseIds: string[],
  callback: (notifications: InAppNotification[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const services = getFirebaseServices();
  if (!services || !caseIds.length) {
    callback([]);
    return () => undefined;
  }
  const notificationsByCase = new Map<string, InAppNotification[]>();
  const publish = () => callback([...notificationsByCase.values()].flat()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30));
  const unsubscribes = caseIds.map((caseId) => onSnapshot(
    query(
      collection(services.db, "organizations", organizationId, "cases", caseId, "notifications"),
      where("recipientId", "==", userId),
    ),
    (snapshot) => {
      notificationsByCase.set(caseId, snapshot.docs.map((item) => ({
        id: item.id,
        caseId,
        title: String(item.data().title ?? "업무 알림"),
        body: String(item.data().body ?? ""),
        dueAt: item.data().dueAt ? String(item.data().dueAt) : undefined,
        createdAt: dateValue(item.data().createdAt),
        readAt: item.data().readAt ? dateValue(item.data().readAt) : null,
      })));
      publish();
    },
    (error) => onError?.(error),
  ));
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

export async function markInAppNotificationRead(
  organizationId: string,
  caseId: string,
  notificationId: string,
): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return;
  await updateDoc(doc(services.db, "organizations", organizationId, "cases", caseId, "notifications", notificationId), {
    readAt: new Date().toISOString(),
  });
}
