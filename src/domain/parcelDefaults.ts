import type { ParcelSnapshot } from "../types";

function mayFill(parcel: ParcelSnapshot, field: keyof ParcelSnapshot): boolean {
  return !parcel.userModifiedFields.includes(field);
}

export function mergeParcelLookupDefaults(
  parcel: ParcelSnapshot,
  resolved: ParcelSnapshot,
): ParcelSnapshot {
  const ledgerAreaM2 = mayFill(parcel, "ledgerAreaM2")
    ? parcel.ledgerAreaM2 ?? resolved.ledgerAreaM2
    : parcel.ledgerAreaM2;

  return {
    ...parcel,
    roadAddress: parcel.roadAddress || resolved.roadAddress,
    lotNumber: parcel.lotNumber || resolved.lotNumber,
    category: mayFill(parcel, "category") ? parcel.category || resolved.category : parcel.category,
    ledgerAreaM2,
    surveyedAreaM2: mayFill(parcel, "surveyedAreaM2")
      ? parcel.surveyedAreaM2 ?? resolved.surveyedAreaM2 ?? ledgerAreaM2
      : parcel.surveyedAreaM2,
    plannedAreaM2: mayFill(parcel, "plannedAreaM2")
      ? parcel.plannedAreaM2 ?? resolved.plannedAreaM2 ?? ledgerAreaM2
      : parcel.plannedAreaM2,
    roadOccupancyAreaM2: mayFill(parcel, "roadOccupancyAreaM2")
      ? parcel.roadOccupancyAreaM2 ?? resolved.roadOccupancyAreaM2 ?? 0
      : parcel.roadOccupancyAreaM2,
    excludedAreaM2: mayFill(parcel, "excludedAreaM2")
      ? parcel.excludedAreaM2 ?? resolved.excludedAreaM2 ?? 0
      : parcel.excludedAreaM2,
    ownerNames: mayFill(parcel, "ownerNames") && !parcel.ownerNames.length
      ? resolved.ownerNames
      : parcel.ownerNames,
    sourceLedgerAreaM2: resolved.sourceLedgerAreaM2 ?? parcel.sourceLedgerAreaM2 ?? ledgerAreaM2,
    zoning: mayFill(parcel, "zoning") && !parcel.zoning.length ? resolved.zoning : parcel.zoning,
    boundary: resolved.boundary ?? parcel.boundary,
    jurisdictionCode: resolved.jurisdictionCode || parcel.jurisdictionCode,
    jurisdictionName: resolved.jurisdictionName || parcel.jurisdictionName,
    source: resolved.source || parcel.source,
    sourceUrl: resolved.sourceUrl ?? parcel.sourceUrl,
    fetchedAt: resolved.fetchedAt || parcel.fetchedAt,
  };
}
