import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { makeDemoCases } from "../data/demo";
import { normalizeCaseRecord } from "../domain/caseRecord";
import type { CaseRecord } from "../types";
import { getFirebaseServices } from "./firebase";
import {
  decodeCaseFromFirestore,
  decodeParcelFromFirestore,
  encodeCaseForFirestore,
  encodeParcelForFirestore,
} from "./firestoreCaseCodec";

const localCasesKey = "seolgye-hannun.demo-cases.v2";

function readLocalCases(): CaseRecord[] {
  const stored = localStorage.getItem(localCasesKey);
  if (!stored) {
    const seeded = makeDemoCases();
    localStorage.setItem(localCasesKey, JSON.stringify(seeded));
    return seeded;
  }
  try {
    return (JSON.parse(stored) as CaseRecord[]).map(normalizeCaseRecord);
  } catch {
    const seeded = makeDemoCases();
    localStorage.setItem(localCasesKey, JSON.stringify(seeded));
    return seeded;
  }
}

function writeLocalCases(cases: CaseRecord[]): void {
  localStorage.setItem(localCasesKey, JSON.stringify(cases));
  window.dispatchEvent(new CustomEvent("seolgye:cases-updated"));
}

function fromFirestore(data: DocumentData, id: string): CaseRecord {
  return decodeCaseFromFirestore(data, id);
}

export function subscribeCases(
  organizationId: string,
  isDemo: boolean,
  callback: (cases: CaseRecord[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const services = getFirebaseServices();
  if (isDemo || !services) {
    const publish = () => callback(readLocalCases());
    publish();
    window.addEventListener("seolgye:cases-updated", publish);
    return () => window.removeEventListener("seolgye:cases-updated", publish);
  }

  const casesQuery = query(
    collection(services.db, "organizations", organizationId, "cases"),
    orderBy("updatedAt", "desc"),
  );
  return onSnapshot(
    casesQuery,
    (snapshot) => callback(snapshot.docs.map((item) => fromFirestore(item.data(), item.id))),
    (error) => onError?.(error),
  );
}

export async function saveCase(caseRecord: CaseRecord, isDemo: boolean): Promise<CaseRecord> {
  const services = getFirebaseServices();
  const normalized = normalizeCaseRecord(caseRecord);
  const nextRecord = {
    ...normalized,
    updatedAt: new Date().toISOString(),
    version: normalized.version + 1,
  };

  if (isDemo || !services) {
    const cases = readLocalCases();
    const existingIndex = cases.findIndex((item) => item.id === nextRecord.id);
    if (existingIndex >= 0 && cases[existingIndex].version !== caseRecord.version) {
      throw new Error("다른 사용자가 먼저 수정했습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.");
    }
    if (existingIndex >= 0) cases[existingIndex] = nextRecord;
    else cases.unshift(nextRecord);
    writeLocalCases(cases);
    return nextRecord;
  }

  const caseRef = doc(services.db, "organizations", caseRecord.organizationId, "cases", caseRecord.id);
  await runTransaction(services.db, async (transaction) => {
    const snapshot = await transaction.get(caseRef);
    if (snapshot.exists() && Number(snapshot.data().version) !== caseRecord.version) {
      throw new Error("다른 사용자가 먼저 수정했습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.");
    }
    transaction.set(caseRef, encodeCaseForFirestore(nextRecord));
  });

  const [storedParcels, storedAttachments] = await Promise.all([
    getDocs(collection(caseRef, "parcels")),
    getDocs(collection(caseRef, "attachments")),
  ]);
  const batch = writeBatch(services.db);
  const parcelIds = new Set(nextRecord.parcels.map((parcel) => parcel.id));
  const attachmentIds = new Set(nextRecord.attachments.map((attachment) => attachment.id));
  storedParcels.docs.filter((item) => !parcelIds.has(item.id)).forEach((item) => batch.delete(item.ref));
  storedAttachments.docs.filter((item) => !attachmentIds.has(item.id)).forEach((item) => batch.delete(item.ref));
  nextRecord.parcels.forEach((parcel) => {
    batch.set(doc(caseRef, "parcels", parcel.id), encodeParcelForFirestore(parcel));
  });
  nextRecord.attachments.forEach((attachment) => {
    batch.set(doc(caseRef, "attachments", attachment.id), attachment);
  });
  await batch.commit();
  return nextRecord;
}

export async function loadCaseSubcollections(caseRecord: CaseRecord): Promise<CaseRecord> {
  const services = getFirebaseServices();
  if (!services) return normalizeCaseRecord(caseRecord);
  const caseRef = doc(services.db, "organizations", caseRecord.organizationId, "cases", caseRecord.id);
  const [parcels, attachments, documents] = await Promise.all([
    getDocs(collection(caseRef, "parcels")),
    getDocs(collection(caseRef, "attachments")),
    getDocs(collection(caseRef, "documents")),
  ]);
  return normalizeCaseRecord({
    ...caseRecord,
    parcels: parcels.docs.map((item) => decodeParcelFromFirestore(item.data())),
    attachments: attachments.docs.map((item) => item.data() as CaseRecord["attachments"][number]),
    documentVersions: documents.docs.map((item) => item.data() as CaseRecord["documentVersions"][number]),
  });
}

export async function writeCaseDraft(caseRecord: CaseRecord, isDemo: boolean): Promise<void> {
  const services = getFirebaseServices();
  if (isDemo || !services) {
    sessionStorage.setItem(`seolgye-hannun.draft.${caseRecord.id}`, JSON.stringify(caseRecord));
    return;
  }
  await setDoc(
    doc(services.db, "organizations", caseRecord.organizationId, "cases", caseRecord.id),
    encodeCaseForFirestore(caseRecord),
    { merge: true },
  );
}

export function resetDemoCases(): void {
  localStorage.removeItem(localCasesKey);
  window.dispatchEvent(new CustomEvent("seolgye:cases-updated"));
}
