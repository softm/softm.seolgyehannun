import type {
  BuildingPlan,
  CaseRecord,
  ParcelSnapshot,
  PermitFormData,
  ProjectPlanDetails,
} from "../types";

export function emptyBuildingPlan(): BuildingPlan {
  return {
    useCategory: "",
    legalUseCategory: "",
    structure: "",
  };
}

export function emptyPermitForm(): PermitFormData {
  return {
    actionTypes: ["토지형질변경"],
    entrepreneurStatus: "unknown",
    applicationDate: "",
    soilType: "",
    mainTreeSpecies: "",
    forestRightRelation: "",
    forestProductPlan: "",
    conservationChargePayment: "undecided",
    previousDescription: "",
    changedDescription: "",
    changeReason: "",
  };
}

export function emptyProjectPlanDetails(): ProjectPlanDetails {
  return {
    fundingPlan: "",
    roadPlan: "",
    drainagePlan: "",
    waterSupplyPlan: "",
    earthworkPlan: "",
    spoilDisposalPlan: "",
    vegetationPlan: "",
    landscapePlan: "",
    nearbyImpactPlan: "",
    wastePlan: "",
    noiseDustPlan: "",
    wastewaterPlan: "",
    trafficPlan: "",
    postManagementPlan: "",
  };
}

function normalizeParcel(parcel: ParcelSnapshot, index: number): ParcelSnapshot {
  return {
    ...parcel,
    role: parcel.role ?? (index === 0 ? "project-site" : "reference"),
    ownerNames: parcel.ownerNames ?? [],
    sourceLedgerAreaM2: parcel.sourceLedgerAreaM2 ?? parcel.ledgerAreaM2,
    userModifiedFields: parcel.userModifiedFields ?? [],
  };
}

export function normalizeCaseRecord(caseRecord: CaseRecord): CaseRecord {
  const legacyApplicant = {
    id: `party-applicant-${caseRecord.id}`,
    role: "applicant" as const,
    partyType: "person" as const,
    name: caseRecord.applicantName ?? "",
    phone: caseRecord.applicantContact ?? "",
  };

  return {
    ...caseRecord,
    businessFields: caseRecord.businessFields ?? [],
    contractReference: caseRecord.contractReference ?? "",
    caseMemo: caseRecord.caseMemo ?? "",
    applicantName: caseRecord.applicantName ?? "",
    parties: caseRecord.parties?.length ? caseRecord.parties : [legacyApplicant],
    parcels: (caseRecord.parcels ?? []).map(normalizeParcel),
    permits: caseRecord.permits ?? [],
    receipts: caseRecord.receipts ?? [],
    deadlines: caseRecord.deadlines ?? [],
    attachments: caseRecord.attachments ?? [],
    documentVersions: caseRecord.documentVersions ?? [],
    buildingPlan: { ...emptyBuildingPlan(), ...(caseRecord.buildingPlan ?? {}) },
    permitForm: { ...emptyPermitForm(), ...(caseRecord.permitForm ?? {}) },
    projectPlanDetails: { ...emptyProjectPlanDetails(), ...(caseRecord.projectPlanDetails ?? {}) },
    costItems: caseRecord.costItems ?? [],
    planBody: caseRecord.planBody ?? {
      overview: "",
      siteCondition: "",
      projectPlan: "",
      managementPlan: "",
    },
    documentDrafts: caseRecord.documentDrafts ?? [],
    reminderOffsets: caseRecord.reminderOffsets ?? [7, 3, 1, 0],
  };
}

