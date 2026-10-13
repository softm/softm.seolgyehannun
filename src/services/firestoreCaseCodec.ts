import { normalizeCaseRecord } from "../domain/caseRecord";
import type { CaseRecord, ParcelSnapshot } from "../types";
import { normalizeParcelBoundary } from "./vworld";

export type FirestoreParcelSnapshot = Omit<ParcelSnapshot, "boundary"> & {
  boundary?: string;
};

export type FirestoreCaseRecord = Omit<CaseRecord, "parcels"> & {
  parcels: FirestoreParcelSnapshot[];
};

export function encodeParcelForFirestore(parcel: ParcelSnapshot): FirestoreParcelSnapshot {
  const { boundary, ...storedParcel } = parcel;
  return boundary
    ? { ...storedParcel, boundary: JSON.stringify(boundary) }
    : storedParcel;
}

export function decodeParcelFromFirestore(data: Record<string, unknown>): ParcelSnapshot {
  const { boundary: storedBoundary, ...storedParcel } = data;
  const boundary = normalizeParcelBoundary(storedBoundary);
  return (boundary ? { ...storedParcel, boundary } : storedParcel) as unknown as ParcelSnapshot;
}

export function encodeCaseForFirestore(caseRecord: CaseRecord): FirestoreCaseRecord {
  return {
    ...caseRecord,
    parcels: caseRecord.parcels.map(encodeParcelForFirestore),
  };
}

export function decodeCaseFromFirestore(data: Record<string, unknown>, id: string): CaseRecord {
  const parcels = Array.isArray(data.parcels)
    ? data.parcels.map((parcel) => decodeParcelFromFirestore(parcel as Record<string, unknown>))
    : [];
  return normalizeCaseRecord({ ...data, id, parcels } as unknown as CaseRecord);
}
