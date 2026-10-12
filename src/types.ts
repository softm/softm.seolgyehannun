export type OrganizationRole = "admin" | "editor" | "viewer";

export type CaseStatusId =
  | "draft"
  | "writing"
  | "ready"
  | "processing"
  | "revision-requested"
  | "revision-submitted"
  | "completed"
  | "stopped"
  | (string & {});

export interface CaseStatus {
  id: CaseStatusId;
  label: string;
  color: string;
  order: number;
  isTerminal?: boolean;
}

export type PermitApplicationKind = "new" | "change";
export type PermitRelationKind = "primary" | "agenda" | "separate" | "reference";
export type PermitReviewState = "unreviewed" | "review-needed" | "confirmed";

export interface PermitSelection {
  id: string;
  catalogId: string;
  name: string;
  relation: PermitRelationKind;
  applicationKind: PermitApplicationKind;
  existingPermitNumber?: string;
  changeSummary?: string;
  legalBasis?: string;
  reviewState: PermitReviewState;
  consultationStatus?: "not-requested" | "requested" | "supplement" | "replied" | "confirmed";
}

export interface ParcelSnapshot {
  id: string;
  pnu: string;
  address: string;
  roadAddress?: string;
  lotNumber?: string;
  category?: string;
  ledgerAreaM2?: number;
  plannedAreaM2?: number;
  zoning: string[];
  longitude: number;
  latitude: number;
  jurisdictionCode: string;
  jurisdictionName: string;
  source: string;
  sourceUrl?: string;
  fetchedAt: string;
  verifiedByUser: boolean;
}

export interface RegionProfile {
  id: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  status: "verified-sample" | "unverified";
  effectiveDate: string;
  checkedAt: string;
  sources: Array<{ label: string; url: string }>;
  guidance: string;
  legalAutomationAllowed: boolean;
}

export interface DeadlinePolicy {
  id: string;
  label: string;
  mode: "calendar-days" | "business-days";
  days: number;
  includeStartDate: boolean;
  excludedWeekdays: number[];
  holidays: string[];
  reminderOffsets: number[];
  version: number;
  sourceLabel: string;
  sourceUrl?: string;
}

export interface DeadlineRecord {
  id: string;
  label: string;
  type: "official-notice" | "estimated-processing" | "supplement" | "internal" | "validity";
  startAt: string;
  dueAt: string;
  originalDueAt: string;
  policyId?: string;
  policyVersion?: number;
  basis: string;
  isManual: boolean;
  manualReason?: string;
  pausedDays?: number;
  completedAt?: string;
}

export interface AttachmentRecord {
  id: string;
  name: string;
  storagePath: string;
  mimeType: string;
  size: number;
  role: string;
  version: number;
  createdAt: string;
  createdBy: string;
  previewable: boolean;
  originalFileId?: string;
}

export interface GeneratedDocument {
  id: string;
  caseId: string;
  version: number;
  type: "pdf" | "docx" | "bundle";
  status: "queued" | "generating" | "ready" | "failed";
  storagePath?: string;
  pdfPath?: string;
  docxPath?: string;
  templateVersion: string;
  sourceSnapshotAt: string;
  createdAt: string;
  createdBy: string;
  notice: string;
  errorMessage?: string;
}

export interface ReceiptRecord {
  id: string;
  agency: string;
  system: string;
  receiptNumber: string;
  receivedAt: string;
  relatedPermitIds: string[];
  lookupMode: "sample" | "connected" | "manual";
  lookupStatus: "not-tried" | "found" | "unsupported" | "failed" | "manual";
  sourceLabel: string;
}

export interface CostItem {
  id: string;
  workType: string;
  specification: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}

export interface CaseRecord {
  id: string;
  organizationId: string;
  title: string;
  businessFields: string[];
  applicantName: string;
  applicantContact?: string;
  assigneeId: string;
  assigneeName: string;
  status: CaseStatusId;
  primaryPermitName: string;
  jurisdictionName: string;
  parcels: ParcelSnapshot[];
  permits: PermitSelection[];
  receipts: ReceiptRecord[];
  deadlines: DeadlineRecord[];
  attachments: AttachmentRecord[];
  documentVersions: GeneratedDocument[];
  projectPurpose: string;
  projectPeriod: { start: string; end: string };
  constructionSummary: string;
  scheduleSummary: string;
  safetyPlan: string;
  environmentPlan: string;
  costItems: CostItem[];
  planBody: {
    overview: string;
    siteCondition: string;
    projectPlan: string;
    managementPlan: string;
  };
  nextAction: string;
  nextDeadlineAt?: string;
  reminderOffsets: number[];
  offlineUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface OrganizationSettings {
  name: string;
  reminderOffsets: number[];
  statuses: CaseStatus[];
  trustedDeviceCacheEnabled: boolean;
}

export interface AppUser {
  uid: string;
  displayName: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
  isDemo: boolean;
}

export interface AuditEvent {
  id: string;
  type: string;
  actorId: string;
  actorName: string;
  createdAt: string;
  summary: string;
  beforeVersion?: number;
  afterVersion?: number;
}
