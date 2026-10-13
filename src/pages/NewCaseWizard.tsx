import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
  type SVGProps,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleAlert,
  CloudUpload,
  Factory,
  Eye,
  ExternalLink,
  FileCheck2,
  FileText,
  Landmark,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  GripVertical,
  Paperclip,
  Plus,
  Route,
  Search,
  Sprout,
  Tractor,
  Trash2,
  Trees,
  Upload,
  Waves,
  Wheat,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth, useCases } from "../context";
import { deduplicateParcels } from "../domain/pnu";
import { defaultPermitCatalog, nextPermitSelection, type PermitCatalogItem } from "../domain/permits";
import { buildCaseDocumentModels, documentReviewWarnings, documentValidationErrors } from "../domain/documentModel";
import { formatSeoulDate } from "../domain/date";
import { validateAttachment } from "../domain/files";
import { wizardStepErrors } from "../domain/wizard";
import { emptyBuildingPlan, emptyPermitForm, emptyProjectPlanDetails, normalizeCaseRecord } from "../domain/caseRecord";
import { selectedRequiredDocuments } from "../domain/documentTemplates";
import { sampleParcels } from "../data/demo";
import { regionProfileFor } from "../data/regionProfiles";
import { reverseGeocodeVWorld, searchVWorld, lookupParcel, type VWorldSearchResult } from "../services/vworld";
import { createReceiptLookupProvider, manualReceipt, type ReceiptLookupResult } from "../services/receipt";
import { uploadCaseAttachment } from "../services/storage";
import { exportCaseDocx, exportCasePdf } from "../services/documentExport";
import {
  subscribeOrganizationConfiguration,
  type CustomPermitCatalogItem,
  type OrganizationWorkflowConfiguration,
} from "../services/organizationRepository";
import { ParcelMap } from "../components/ParcelMap";
import { LoadingScreen } from "../components/LoadingScreen";
import { DocumentDraftEditor } from "../components/DocumentDraftEditor";
import type { CaseRecord, CostItem, ParcelRole, ParcelSnapshot, PartyRole, PermitRelationKind } from "../types";

const wizardSteps = [
  { number: 1, title: "사건 등록", description: "관계자·필지" },
  { number: 2, title: "허가유형", description: "개발·농지·산지" },
  { number: 3, title: "관련절차", description: "신규·변경·의제" },
  { number: 4, title: "도면 등록", description: "설계도·발급서류" },
  { number: 5, title: "공사내역", description: "수량·금액·계획" },
  { number: 6, title: "사업계획서", description: "자동작성·편집" },
  { number: 7, title: "검토·출력", description: "오류·DOCX·PDF" },
];

const permitIcons: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  Factory,
  Sprout,
  Route,
  Landmark,
  Building2,
  Waves,
  Wheat,
  Trees,
  Tractor,
};

interface PendingFile {
  id: string;
  file: File;
  role: string;
}

function createEmptyCase(organizationId: string, assigneeId: string, assigneeName: string): CaseRecord {
  const now = new Date();
  const datePart = formatSeoulDate(now).replaceAll("-", "");
  const randomPart = String(Math.floor(Math.random() * 9000) + 1000);
  return {
    id: `CASE-${datePart}-${randomPart}`,
    organizationId,
    title: "",
    businessFields: [],
    contractReference: "",
    caseMemo: "",
    applicantName: "",
    applicantContact: "",
    parties: [{ id: crypto.randomUUID(), role: "applicant", partyType: "person", name: "", phone: "" }],
    assigneeId,
    assigneeName,
    status: "draft",
    primaryPermitName: "",
    jurisdictionName: "",
    parcels: [],
    permits: [],
    receipts: [],
    deadlines: [],
    attachments: [],
    documentVersions: [],
    projectPurpose: "",
    projectPeriod: { start: "", end: "" },
    buildingPlan: emptyBuildingPlan(),
    permitForm: emptyPermitForm(),
    projectPlanDetails: emptyProjectPlanDetails(),
    constructionSummary: "",
    scheduleSummary: "",
    safetyPlan: "",
    environmentPlan: "",
    costItems: [],
    planBody: { overview: "", siteCondition: "", projectPlan: "", managementPlan: "" },
    documentDrafts: [],
    nextAction: "필지와 허가 구성 확인",
    reminderOffsets: [7, 3, 1, 0, -1],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    version: 0,
  };
}

export function NewCaseWizard() {
  const { user } = useAuth();
  const { cases, loading, persistCase } = useCases();
  const navigate = useNavigate();
  const { caseId } = useParams<{ caseId?: string }>();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(caseId);
  const existingCase = caseId ? cases.find((item) => item.id === caseId) : undefined;
  const requestedStep = Number(searchParams.get("step"));
  const editStartStep = Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= 7 ? requestedStep : 5;
  const draftKey = user
    ? caseId
      ? `seolgye-hannun.wizard.${user.organizationId}.${caseId}`
      : `seolgye-hannun.wizard.${user.organizationId}`
    : "";
  const initialDraft = useMemo(() => {
    if (!user) return null;
    const stored = sessionStorage.getItem(draftKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { step: number; caseRecord: CaseRecord };
        return { ...parsed, caseRecord: normalizeCaseRecord(parsed.caseRecord) };
      } catch { /* 새 초안 사용 */ }
    }
    if (existingCase) return { step: editStartStep, caseRecord: normalizeCaseRecord(existingCase) };
    return { step: 1, caseRecord: createEmptyCase(user.organizationId, user.uid, user.displayName) };
  }, [draftKey, editStartStep, existingCase, user]);
  const [step, setStep] = useState(initialDraft?.step ?? 1);
  const [caseRecord, setCaseRecord] = useState<CaseRecord>(initialDraft?.caseRecord ?? createEmptyCase("", "", ""));
  const [editReady, setEditReady] = useState(!isEditing || initialDraft?.caseRecord.id === caseId);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const [errors, setErrors] = useState<string[]>([]);
  const [errorToast, setErrorToast] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [organizationConfiguration, setOrganizationConfiguration] = useState<OrganizationWorkflowConfiguration>({
    reminderOffsets: [7, 3, 1, 0, -1],
    customStatuses: [],
    customPermits: [],
  });
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!caseId || editReady || !existingCase) return;
    setCaseRecord(normalizeCaseRecord(existingCase));
    setStep(editStartStep);
    setEditReady(true);
  }, [caseId, editReady, editStartStep, existingCase]);

  useEffect(() => {
    if (!user?.organizationId) return;
    return subscribeOrganizationConfiguration(user.organizationId, user.isDemo, (configuration) => {
      setOrganizationConfiguration(configuration);
      setCaseRecord((current) => current.version === 0 && current.reminderOffsets.join(",") === "7,3,1,0,-1"
        ? { ...current, reminderOffsets: configuration.reminderOffsets }
        : current);
    });
  }, [user]);

  const permitCatalog = useMemo(
    () => [...defaultPermitCatalog, ...organizationConfiguration.customPermits].sort((a, b) => {
      const first = "order" in a ? Number(a.order) : defaultPermitCatalog.findIndex((item) => item.id === a.id);
      const second = "order" in b ? Number(b.order) : defaultPermitCatalog.findIndex((item) => item.id === b.id);
      return first - second;
    }),
    [organizationConfiguration.customPermits],
  );

  useEffect(() => {
    if (!draftKey) return;
    setSaveState("saving");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        sessionStorage.setItem(draftKey, JSON.stringify({ step, caseRecord }));
        setSaveState("saved");
      } catch {
        setSaveState("failed");
      }
    }, 450);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [caseRecord, draftKey, step]);

  function patchCase(patch: Partial<CaseRecord>) {
    setCaseRecord((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
  }

  function showErrors(messages: string[]) {
    setErrors(messages);
    setErrorToast(messages);
  }

  function move(nextStep: number) {
    if (nextStep > step) {
      const validation = wizardStepErrors(caseRecord, step);
      if (validation.length) {
        showErrors(validation);
        return;
      }
    }
    setErrors([]);
    setErrorToast([]);
    setStep(Math.min(7, Math.max(1, nextStep)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function finish() {
    const validation = documentValidationErrors(caseRecord);
    if (validation.length) {
      showErrors(validation);
      return;
    }
    if (!user) return;
    setSubmitting(true);
    setErrors([]);
    try {
      const uploaded = [...caseRecord.attachments];
      for (let index = 0; index < pendingFiles.length; index += 1) {
        const pending = pendingFiles[index];
        const attachment = await uploadCaseAttachment(
          caseRecord.organizationId,
          caseRecord.id,
          pending.file,
          pending.role,
          user,
          (progress) => setUploadProgress(Math.round(((index + progress.percent / 100) / pendingFiles.length) * 100)),
        );
        uploaded.push(attachment);
      }
      await persistCase({
        ...caseRecord,
        attachments: uploaded,
        status: isEditing ? caseRecord.status : "writing",
        primaryPermitName: caseRecord.permits.find((permit) => permit.relation === "primary")?.name ?? "",
        jurisdictionName: caseRecord.parcels[0]?.jurisdictionName ?? "",
        nextAction: isEditing ? caseRecord.nextAction : "사업계획서 검토 및 접수 준비",
      });
      sessionStorage.removeItem(draftKey);
      navigate("/app");
    } catch (reason) {
      showErrors([reason instanceof Error ? reason.message : "업무를 저장하지 못했습니다."]);
    } finally {
      setSubmitting(false);
    }
  }

  if (isEditing && user?.role === "viewer") return <Navigate to="/app" replace />;
  if (isEditing && (loading || (existingCase && !editReady))) return <LoadingScreen label="업무 수정 화면을 준비하고 있습니다" />;
  if (isEditing && !loading && !existingCase && !editReady) return <Navigate to="/app" replace />;

  const reviewCaseRecord: CaseRecord = {
    ...caseRecord,
    attachments: [
      ...caseRecord.attachments,
      ...pendingFiles.map((item) => ({
        id: item.id,
        name: item.file.name,
        storagePath: "pending",
        mimeType: item.file.type,
        size: item.file.size,
        role: item.role,
        version: 1,
        createdAt: caseRecord.updatedAt,
        createdBy: user?.uid ?? "",
        previewable: /\.(pdf|png|jpe?g)$/i.test(item.file.name),
      })),
    ],
  };

  return (
    <div className="wizard-page">
      <header className="wizard-header">
        <button type="button" className="wizard-back" onClick={() => navigate(-1)}><ArrowLeft size={18} /> 업무 목록</button>
        <div><span>{isEditing ? "업무 수정" : "새 업무"}</span><h1>{caseRecord.title || "제목 없는 업무"}</h1></div>
        <div className={`autosave-state ${saveState}`}>
          {saveState === "saving" ? <LoaderCircle size={15} className="spin" /> : saveState === "failed" ? <CircleAlert size={15} /> : <CloudUpload size={15} />}
          {saveState === "saving" ? "저장 중" : saveState === "failed" ? "임시저장 실패" : "임시저장됨"}
        </div>
      </header>

      <nav className="wizard-progress" aria-label="업무 생성 단계">
        {wizardSteps.map((item) => (
          <button type="button" key={item.number} className={`${step === item.number ? "active" : ""} ${step > item.number ? "complete" : ""}`} onClick={() => item.number <= step && move(item.number)} aria-current={step === item.number ? "step" : undefined}>
            <span>{step > item.number ? <Check size={16} /> : item.number}</span>
            <div><strong>{item.title}</strong><small>{item.description}</small></div>
          </button>
        ))}
      </nav>

      <main className="wizard-content">
        <div className="wizard-step-heading">
          <span>STEP {step}</span>
          <h2>{wizardSteps[step - 1].title}</h2>
          <p>{[
            "사건 공통정보를 한 번 입력합니다. 신청인·소유자·대리인과 복수 필지의 역할·면적을 함께 관리합니다.",
            "우선 지원하는 개발행위·농지전용·산지전용 중 문서 묶음의 기준 허가를 선택합니다.",
            "관련 절차를 후보로 연결하고, 각 절차의 신규·변경과 기존 허가정보를 독립적으로 기록합니다.",
            "설계도와 발급서류를 역할별로 등록합니다. 원본은 비공개 경로에 보관됩니다.",
            "공사 개요와 공종·규격·수량·단가를 입력하고 안전·환경 계획을 보완합니다.",
            "사건 공통값이 연결된 신청서·조서·사업계획서·피해방지계획서를 문서별로 수정합니다.",
            "필수 항목, 면적·금액 불일치와 제출자료를 확인한 뒤 DOCX·PDF를 생성합니다.",
          ][step - 1]}</p>
        </div>

        {errors.length > 0 && <div className="wizard-errors" role="alert"><CircleAlert size={19} /><div><strong>확인이 필요합니다</strong>{errors.map((error) => <span key={error}>{error}</span>)}</div></div>}

        {step === 1 && <div className="registration-step"><BasicStep caseRecord={caseRecord} patchCase={patchCase} /><ParcelStep caseRecord={caseRecord} patchCase={patchCase} /></div>}
        {step === 2 && <PermitStep caseRecord={caseRecord} patchCase={patchCase} catalog={permitCatalog} mode="primary" />}
        {step === 3 && <PermitStep caseRecord={caseRecord} patchCase={patchCase} catalog={permitCatalog} mode="related" />}
        {step === 4 && <AttachmentStep caseRecord={caseRecord} files={pendingFiles} setFiles={setPendingFiles} />}
        {step === 5 && <ConstructionStep caseRecord={caseRecord} patchCase={patchCase} />}
        {step === 6 && <PlanStep caseRecord={caseRecord} patchCase={patchCase} />}
        {step === 7 && <ReviewStep caseRecord={reviewCaseRecord} pendingFiles={pendingFiles} onExport={async (type) => type === "pdf" ? exportCasePdf(reviewCaseRecord) : exportCaseDocx(reviewCaseRecord)} />}
      </main>

      <footer className="wizard-footer">
        <button type="button" className="button button-secondary" onClick={() => move(step - 1)} disabled={step === 1}><ArrowLeft size={18} /> 이전</button>
        <div><span>{step} / 7</span><div className="wizard-footer-progress"><i style={{ width: `${(step / 7) * 100}%` }} /></div></div>
        {step < 7 ? <button type="button" className="button button-primary" onClick={() => move(step + 1)}>다음 <ArrowRight size={18} /></button> : <button type="button" className="button button-primary" onClick={finish} disabled={submitting}>{submitting ? <><LoaderCircle size={18} className="spin" /> 저장 중 {uploadProgress ? `${uploadProgress}%` : ""}</> : <><CheckCircle2 size={18} /> {isEditing ? "수정 저장" : "업무 시작"}</>}</button>}
      </footer>

      {errorToast.length > 0 && (
        <div className="toast" role="alert" aria-live="assertive" aria-atomic="true">
          <CircleAlert size={18} />
          <span>
            <strong>확인이 필요합니다</strong><br />
            {errorToast[0]}{errorToast.length > 1 ? ` 외 ${errorToast.length - 1}건` : ""}
          </span>
          <button type="button" onClick={() => setErrorToast([])} aria-label="알림 닫기"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}

interface StepProps {
  caseRecord: CaseRecord;
  patchCase: (patch: Partial<CaseRecord>) => void;
}

interface PermitStepProps extends StepProps {
  catalog: Array<PermitCatalogItem | CustomPermitCatalogItem>;
  mode: "primary" | "related";
}

function ParcelStep({ caseRecord, patchCase }: StepProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VWorldSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapFocus, setMapFocus] = useState<{ longitude: number; latitude: number; requestId: number } | null>(null);
  const [message, setMessage] = useState("");
  const [mapExpanded, setMapExpanded] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualParcel, setManualParcel] = useState({ pnu: "", address: "", lotNumber: "", category: "", ledgerAreaM2: "", plannedAreaM2: "" });
  const [draggedParcelId, setDraggedParcelId] = useState<string | null>(null);
  const selectedListRef = useRef<HTMLDivElement>(null);
  const mapPanelRef = useRef<HTMLDivElement>(null);
  const previousParcelCountRef = useRef(caseRecord.parcels.length);
  const draggedParcelIdRef = useRef<string | null>(null);

  useEffect(() => {
    const previousCount = previousParcelCountRef.current;
    previousParcelCountRef.current = caseRecord.parcels.length;
    if (caseRecord.parcels.length <= previousCount) return;
    const frame = requestAnimationFrame(() => {
      const list = selectedListRef.current;
      list?.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [caseRecord.parcels.length]);

  useEffect(() => {
    if (!mapExpanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMapExpanded(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeWithEscape);
    };
  }, [mapExpanded]);

  async function searchAddress() {
    if (query.trim().length < 2) {
      setMessage("주소나 지번을 두 글자 이상 입력해 주세요.");
      return;
    }
    setSearching(true);
    setMessage("");
    try {
      const next = await searchVWorld(query);
      setResults(next);
      if (!next.length) setMessage("검색 결과가 없습니다. 다른 주소나 지번을 입력해 주세요.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "주소 검색에 실패했습니다.");
    } finally {
      setSearching(false);
    }
  }

  async function addByResult(result: VWorldSearchResult) {
    setMapLoading(true);
    setMessage("");
    try {
      await addParcel(await lookupParcel(result.longitude, result.latitude, result));
      setResults([]);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "필지를 확인하지 못했습니다.");
    } finally {
      setMapLoading(false);
    }
  }

  async function addByMap(longitude: number, latitude: number) {
    setMapLoading(true);
    setMessage("선택한 위치의 필지를 확인하고 있습니다.");
    try {
      await addParcel(await lookupParcel(longitude, latitude));
      setMessage("");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "이 위치의 필지를 찾지 못했습니다.");
    } finally {
      setMapLoading(false);
    }
  }

  async function addParcel(parcel: ParcelSnapshot) {
    const next = deduplicateParcels([...caseRecord.parcels, parcel]);
    if (next.length === caseRecord.parcels.length) {
      setMessage("이미 선택한 필지입니다.");
      return;
    }
    patchCase({ parcels: next, jurisdictionName: next[0].jurisdictionName });
  }

  function reorderParcel(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const next = [...caseRecord.parcels];
    const sourceIndex = next.findIndex((parcel) => parcel.id === sourceId);
    const targetIndex = next.findIndex((parcel) => parcel.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    patchCase({ parcels: next, jurisdictionName: next[0]?.jurisdictionName ?? caseRecord.jurisdictionName });
  }

  function startParcelDrag(event: React.PointerEvent<HTMLButtonElement>, parcelId: string) {
    if (event.button !== 0) return;
    draggedParcelIdRef.current = parcelId;
    setDraggedParcelId(parcelId);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveParcelDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const sourceId = draggedParcelIdRef.current;
    if (!sourceId) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-parcel-id]");
    const targetId = target?.dataset.parcelId;
    if (targetId) reorderParcel(sourceId, targetId);
  }

  function finishParcelDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    draggedParcelIdRef.current = null;
    setDraggedParcelId(null);
  }

  function moveParcelWithKeyboard(event: React.KeyboardEvent<HTMLButtonElement>, parcelId: string) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const index = caseRecord.parcels.findIndex((parcel) => parcel.id === parcelId);
    const targetIndex = event.key === "ArrowUp" ? index - 1 : index + 1;
    const target = caseRecord.parcels[targetIndex];
    if (target) reorderParcel(parcelId, target.id);
  }

  function focusParcelOnMap(parcel: ParcelSnapshot) {
    setMapFocus({ longitude: parcel.longitude, latitude: parcel.latitude, requestId: Date.now() });
    if (!mapExpanded) requestAnimationFrame(() => mapPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function patchParcel(id: string, patch: Partial<ParcelSnapshot>, modifiedField?: string) {
    patchCase({ parcels: caseRecord.parcels.map((parcel) => parcel.id === id ? {
      ...parcel,
      ...patch,
      verifiedByUser: true,
      userModifiedFields: modifiedField && !parcel.userModifiedFields.includes(modifiedField)
        ? [...parcel.userModifiedFields, modifiedField]
        : parcel.userModifiedFields,
    } : parcel) });
  }

  function addManualParcel() {
    if (!manualParcel.address.trim()) {
      setMessage("직접 등록할 필지의 주소 또는 지번을 입력해 주세요.");
      return;
    }
    const id = crypto.randomUUID();
    const ledgerAreaM2 = manualParcel.ledgerAreaM2 ? Number(manualParcel.ledgerAreaM2) : undefined;
    const plannedAreaM2 = manualParcel.plannedAreaM2 ? Number(manualParcel.plannedAreaM2) : undefined;
    void addParcel({
      id,
      pnu: manualParcel.pnu.trim(),
      address: manualParcel.address.trim(),
      lotNumber: manualParcel.lotNumber.trim(),
      category: manualParcel.category.trim(),
      ledgerAreaM2,
      plannedAreaM2,
      role: "project-site",
      ownerNames: [],
      sourceLedgerAreaM2: ledgerAreaM2,
      userModifiedFields: ["address", "ledgerAreaM2", "plannedAreaM2"],
      zoning: [],
      longitude: 126.978,
      latitude: 37.5665,
      jurisdictionCode: manualParcel.pnu.replace(/\D/g, "").slice(0, 5),
      jurisdictionName: manualParcel.address.trim().split(" ").slice(0, 2).join(" "),
      source: "사용자 직접 입력",
      fetchedAt: new Date().toISOString(),
      verifiedByUser: true,
    });
    setManualParcel({ pnu: "", address: "", lotNumber: "", category: "", ledgerAreaM2: "", plannedAreaM2: "" });
    setManualOpen(false);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("이 브라우저는 현재 위치를 지원하지 않습니다.");
      return;
    }
    if (locating) return;
    setLocating(true);
    setMapLoading(true);
    setMessage("현재 위치와 주변 주소를 확인하고 있습니다.");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const longitude = coords.longitude;
        const latitude = coords.latitude;
        setMapFocus({ longitude, latitude, requestId: Date.now() });
        void reverseGeocodeVWorld(longitude, latitude)
          .then(async (reverseAddress) => {
            setQuery(reverseAddress.address);
            const locationHint: VWorldSearchResult = {
              id: `current-${longitude}-${latitude}`,
              title: reverseAddress.address,
              address: reverseAddress.address,
              roadAddress: reverseAddress.roadAddress,
              pnu: "",
              longitude,
              latitude,
              category: "parcel",
            };
            const [directParcel, addressMatches] = await Promise.allSettled([
              lookupParcel(longitude, latitude, locationHint),
              searchVWorld(reverseAddress.address),
            ]);
            const directResult = directParcel.status === "fulfilled" ? [{
              ...locationHint,
              id: `current-${directParcel.value.pnu}`,
              pnu: directParcel.value.pnu,
            }] : [];
            const searchResults = addressMatches.status === "fulfilled" ? addressMatches.value : [];
            const nextResults = directResult.length ? directResult : searchResults;
            setResults(nextResults);
            const accuracy = Math.round(Number(coords.accuracy) || 0);
            setMessage(nextResults.length
              ? `현재 위치${accuracy ? ` 약 ±${accuracy}m` : ""}의 주소를 찾았습니다. 아래 결과를 눌러 필지를 선택하세요. 위치 좌표는 선택 전까지 저장하지 않습니다.`
              : `현재 위치 주소는 '${reverseAddress.address}'입니다. PNU는 자동 확인되지 않아 지적도에서 해당 필지를 눌러 선택해 주세요.`);
          })
          .catch((reason) => {
            setMessage(reason instanceof Error ? reason.message : "현재 위치 주변 주소를 찾지 못했습니다.");
          })
          .finally(() => {
            setLocating(false);
            setMapLoading(false);
          });
      },
      (error) => {
        const messages: Record<number, string> = {
          1: "위치 권한을 허용하면 현재 위치의 주소를 찾을 수 있습니다.",
          2: "현재 위치를 확인할 수 없습니다. GPS와 네트워크를 확인해 주세요.",
          3: "현재 위치 확인 시간이 초과됐습니다. 다시 시도해 주세요.",
        };
        setMessage(messages[error.code] ?? "위치 권한 없이도 주소 검색과 지도 클릭으로 계속할 수 있습니다.");
        setLocating(false);
        setMapLoading(false);
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
  }

  const profile = caseRecord.parcels[0] ? regionProfileFor(caseRecord.parcels[0].jurisdictionCode, caseRecord.parcels[0].jurisdictionName) : null;

  return (
    <div className="parcel-step step-grid">
      <section className="wizard-card parcel-search-card">
        <div className="card-title"><div><h3>필지 찾기</h3><p>주소·지번 검색, 지도 선택 또는 직접 등록을 사용할 수 있습니다.</p></div><div className="card-title-actions"><button type="button" className="button button-secondary compact" onClick={() => setManualOpen((open) => !open)}><Plus size={17} /> 직접 등록</button><button type="button" className="button button-secondary compact" onClick={useCurrentLocation} disabled={locating} aria-busy={locating}><LocateFixed size={17} /> {locating ? "위치 확인 중" : "현재 위치"}</button></div></div>
        <div className="address-search"><Search size={19} /><input value={query} onChange={(event) => { const nextQuery = event.target.value; setQuery(nextQuery); if (!nextQuery.trim()) { setResults([]); setMessage(""); } }} onKeyDown={(event) => { if (event.key === "Enter") void searchAddress(); if (event.key === "Escape") setResults([]); }} placeholder="예: 화성시 남양읍 신남리 145" aria-expanded={results.length > 0} aria-controls="parcel-search-results" /><button type="button" onClick={searchAddress} disabled={searching}>{searching ? <LoaderCircle className="spin" size={18} /> : "검색"}</button></div>
        {manualOpen && <div className="manual-parcel-form"><div className="form-grid"><label className="wide">주소·지번 <span>필수</span><input value={manualParcel.address} onChange={(event) => setManualParcel((current) => ({ ...current, address: event.target.value }))} placeholder="지도 연동 없이 사용할 소재지" /></label><label>PNU<input value={manualParcel.pnu} onChange={(event) => setManualParcel((current) => ({ ...current, pnu: event.target.value }))} placeholder="확인 가능한 경우 19자리" /></label><label>지번<input value={manualParcel.lotNumber} onChange={(event) => setManualParcel((current) => ({ ...current, lotNumber: event.target.value }))} /></label><label>지목<input value={manualParcel.category} onChange={(event) => setManualParcel((current) => ({ ...current, category: event.target.value }))} /></label><label>대장면적(㎡)<input type="number" min="0" value={manualParcel.ledgerAreaM2} onChange={(event) => setManualParcel((current) => ({ ...current, ledgerAreaM2: event.target.value }))} /></label><label>계획면적(㎡)<input type="number" min="0" value={manualParcel.plannedAreaM2} onChange={(event) => setManualParcel((current) => ({ ...current, plannedAreaM2: event.target.value }))} /></label></div><div className="manual-parcel-actions"><button type="button" onClick={() => setManualOpen(false)}>취소</button><button type="button" className="button button-primary compact" onClick={addManualParcel}>필지 추가</button></div></div>}
        {results.length > 0 && <div className="search-results" id="parcel-search-results" role="region" aria-label="주소 검색 결과"><div className="search-results-header"><strong>검색 결과 {results.length}건</strong><button type="button" onClick={() => setResults([])} aria-label="검색 결과 닫기"><X size={16} /> 닫기</button></div><div className="search-results-list" role="listbox">{results.map((result) => <button type="button" key={result.id} onClick={() => addByResult(result)}><span>{result.category === "parcel" ? "지번" : result.category === "road" ? "도로" : "장소"}</span><div><strong>{result.title}</strong><small>{result.address}{result.roadAddress && ` · ${result.roadAddress}`}</small></div><Plus size={18} /></button>)}</div></div>}
        {message && <div className="lookup-message" role="status" aria-live="polite"><CircleAlert size={17} />{message}</div>}
        <div ref={mapPanelRef} className="wizard-map"><ParcelMap parcels={caseRecord.parcels} focusLocation={mapFocus} interactive onMapClick={addByMap} /><button type="button" className="map-expand-button" onClick={() => { setResults([]); setMapExpanded(true); }}><Maximize2 size={17} /> 지도 크게 보기</button>{mapLoading && <div className="map-loading"><LoaderCircle className="spin" />{locating ? "현재 위치의 주소 확인 중" : "필지 확인 중"}</div>}</div>
        {mapExpanded && <div className="parcel-map-modal" role="dialog" aria-modal="true" aria-labelledby="expanded-map-title"><header><div><span>VWorld 지적도</span><h3 id="expanded-map-title">큰 지도에서 필지 추가</h3><p>지적도 영역을 누르면 선택한 필지 목록에 계속 추가됩니다.</p></div><button type="button" onClick={() => setMapExpanded(false)} autoFocus><Minimize2 size={18} /> 큰 지도 닫기</button></header><div className="parcel-map-modal-body"><div className="parcel-map-modal-map"><ParcelMap parcels={caseRecord.parcels} focusLocation={mapFocus} interactive onMapClick={addByMap} />{mapLoading && <div className="map-loading"><LoaderCircle className="spin" />필지 확인 중</div>}</div><aside><div className="expanded-map-selection-head"><div><strong>선택한 필지</strong><span>첫 번째 필지가 대표 필지입니다.</span></div><b>{caseRecord.parcels.length}필지</b></div>{message && <div className="expanded-map-message" role="status"><CircleAlert size={16} />{message}</div>}{caseRecord.parcels.length ? <div className="expanded-map-selection-list">{caseRecord.parcels.map((parcel, index) => <article key={parcel.id}><span>{index + 1}</span><button type="button" className="expanded-map-focus" onClick={() => focusParcelOnMap(parcel)}><strong>{parcel.address}</strong><small>PNU {parcel.pnu || "확인 필요"}</small><em><LocateFixed size={13} /> 지도에서 보기</em></button><button type="button" onClick={() => patchCase({ parcels: caseRecord.parcels.filter((item) => item.id !== parcel.id) })} aria-label={`${parcel.address} 제거`}><Trash2 size={16} /></button></article>)}</div> : <div className="expanded-map-empty"><MapPin size={28} /><strong>지도를 눌러 필지를 추가하세요</strong><span>선택한 경계는 분홍색으로 표시됩니다.</span></div>}</aside></div></div>}
      </section>

      <section className="wizard-card selected-parcels-card">
        <div className="card-title"><div><h3>선택한 필지</h3><p>필지별 역할과 대장·실측·사업·도로점용 면적을 구분합니다.</p></div><span className="count-pill">{caseRecord.parcels.length}필지</span></div>
        {caseRecord.parcels.length ? (
          <div ref={selectedListRef} className="selected-parcel-list editable">
            {caseRecord.parcels.map((parcel, index) => (
              <article key={parcel.id} data-parcel-id={parcel.id} className={draggedParcelId === parcel.id ? "dragging" : ""}>
                <button
                  type="button"
                  className="parcel-drag-handle"
                  aria-label={`${parcel.address} 순서 이동. 위아래 방향키 또는 드래그로 이동`}
                  title="드래그하거나 방향키로 순서 변경"
                  onPointerDown={(event) => startParcelDrag(event, parcel.id)}
                  onPointerMove={moveParcelDrag}
                  onPointerUp={finishParcelDrag}
                  onPointerCancel={finishParcelDrag}
                  onKeyDown={(event) => moveParcelWithKeyboard(event, parcel.id)}
                >
                  <GripVertical size={18} />
                </button>
                <div className="parcel-order">{index + 1}</div>
                <div className="parcel-edit-body">
                  <div className="parcel-role"><select value={parcel.role} onChange={(event) => patchParcel(parcel.id, { role: event.target.value as ParcelRole }, "role")}><option value="project-site">사업 대상지</option><option value="access-road">진입로</option><option value="road-occupancy">도로점용 대상</option><option value="excluded">제외 필지</option><option value="reference">참고 필지</option></select>{parcel.verifiedByUser && <span><Check size={12} /> 사용자 확인</span>}</div>
                  <button type="button" className="parcel-focus-button" onClick={() => focusParcelOnMap(parcel)}><span><strong>{parcel.address}</strong><small>PNU {parcel.pnu || "직접 입력 · PNU 미확인"}</small></span><em><LocateFixed size={14} /> 지도에서 보기</em></button>
                  <div className="parcel-area-fields"><label>대장면적<small>{parcel.sourceLedgerAreaM2 ? `조회 ${parcel.sourceLedgerAreaM2.toLocaleString("ko-KR")}㎡` : "직접 입력"}</small><input type="number" min="0" value={parcel.ledgerAreaM2 ?? ""} onChange={(event) => patchParcel(parcel.id, { ledgerAreaM2: event.target.value ? Number(event.target.value) : undefined }, "ledgerAreaM2")} /></label><label>실측면적<input type="number" min="0" value={parcel.surveyedAreaM2 ?? ""} onChange={(event) => patchParcel(parcel.id, { surveyedAreaM2: event.target.value ? Number(event.target.value) : undefined }, "surveyedAreaM2")} /></label><label>사업면적<input type="number" min="0" value={parcel.plannedAreaM2 ?? ""} onChange={(event) => patchParcel(parcel.id, { plannedAreaM2: event.target.value ? Number(event.target.value) : undefined }, "plannedAreaM2")} /></label><label>도로점용<input type="number" min="0" value={parcel.roadOccupancyAreaM2 ?? ""} onChange={(event) => patchParcel(parcel.id, { roadOccupancyAreaM2: event.target.value ? Number(event.target.value) : undefined }, "roadOccupancyAreaM2")} /></label><label>제외면적<input type="number" min="0" value={parcel.excludedAreaM2 ?? ""} onChange={(event) => patchParcel(parcel.id, { excludedAreaM2: event.target.value ? Number(event.target.value) : undefined }, "excludedAreaM2")} /></label></div>
                  <label className="parcel-owner-field">소유자<input value={parcel.ownerNames.join(", ")} onChange={(event) => patchParcel(parcel.id, { ownerNames: event.target.value.split(",").map((name) => name.trim()).filter(Boolean) }, "ownerNames")} placeholder="여러 명은 쉼표로 구분" /></label>
                  <div className="parcel-facts"><span>{parcel.category || "지목 확인 필요"}</span><span>{parcel.zoning.join(", ") || "용도지역 확인 필요"}</span><span>{parcel.userModifiedFields.length ? `수정값 ${parcel.userModifiedFields.length}개` : "조회값 유지"}</span></div>
                  <p>{parcel.source} · {formatSeoulDate(parcel.fetchedAt)} {parcel.source === "사용자 직접 입력" ? "등록" : "조회"}</p>
                </div>
                <button className="parcel-remove" type="button" onClick={() => patchCase({ parcels: caseRecord.parcels.filter((item) => item.id !== parcel.id) })} aria-label={`${parcel.address} 제거`}><Trash2 size={17} /></button>
              </article>
            ))}
          </div>
        ) : <div className="empty-selection"><MapPin /><strong>아직 선택한 필지가 없습니다</strong><span>왼쪽에서 주소를 검색하거나 지도를 눌러보세요.</span>{!caseRecord.parcels.length && <button type="button" onClick={() => addParcel(sampleParcels[0])}>샘플 필지 추가</button>}</div>}
        {profile && <div className={`region-profile ${profile.status}`}><div><strong>{profile.jurisdictionName} 지역 프로필</strong><span>{profile.status === "verified-sample" ? "초기 검증 표본" : "미검증 지역"}</span></div><p>{profile.guidance}</p>{profile.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}</div>}
      </section>
    </div>
  );
}

function PermitStep({ caseRecord, patchCase, catalog, mode }: PermitStepProps) {
  const primaryItems = catalog.filter((item) => item.canBePrimary && (item.phase === "first" || !("phase" in item)));
  const primary = caseRecord.permits.find((permit) => permit.relation === "primary");
  const agendaItems = catalog.filter((item) => {
    if (item.id === primary?.catalogId) return false;
    if (!(item.canBeRelated ?? item.category === "agenda")) return false;
    if (!item.relatedPrimaryCatalogIds?.length) return true;
    return Boolean(primary && item.relatedPrimaryCatalogIds.includes(primary.catalogId));
  });

  function selectPrimary(item: PermitCatalogItem) {
    const existing = caseRecord.permits.find((permit) => permit.catalogId === item.id);
    const nextPrimary = existing ? { ...existing, relation: "primary" as const } : nextPermitSelection(item, "primary");
    const related = caseRecord.permits.filter((permit) => permit.relation !== "primary" && permit.catalogId !== item.id);
    patchCase({ permits: [nextPrimary, ...related], primaryPermitName: item.name });
  }

  function toggleRelated(item: PermitCatalogItem, relation: PermitRelationKind = "agenda") {
    const existing = caseRecord.permits.find((permit) => permit.catalogId === item.id);
    patchCase({ permits: existing ? caseRecord.permits.filter((permit) => permit.id !== existing.id) : [...caseRecord.permits, nextPermitSelection(item, relation)] });
  }

  function patchPermit(id: string, patch: Partial<CaseRecord["permits"][number]>) {
    patchCase({ permits: caseRecord.permits.map((permit) => permit.id === id ? { ...permit, ...patch } : permit) });
  }

  function patchPermitForm(patch: Partial<CaseRecord["permitForm"]>) {
    patchCase({ permitForm: { ...caseRecord.permitForm, ...patch } });
  }

  function toggleActionType(value: string) {
    patchPermitForm({ actionTypes: caseRecord.permitForm.actionTypes.includes(value)
      ? caseRecord.permitForm.actionTypes.filter((item) => item !== value)
      : [...caseRecord.permitForm.actionTypes, value] });
  }

  if (mode === "primary") return (
    <div className="permit-step">
      <section className="wizard-card">
        <div className="card-title"><div><h3>우선 지원 허가유형</h3><p>문서 작성 묶음의 기준 허가를 1개 선택합니다. 세 분야 모두 신청서와 계획서 초안을 지원합니다.</p></div>{primary && <span className="selected-summary">선택 · {primary.name}</span>}</div>
        <div className="permit-card-grid core-permits">{primaryItems.map((item) => { const Icon = permitIcons[item.icon] ?? FileText; const selected = primary?.catalogId === item.id; return <button type="button" key={item.id} className={`permit-card accent-${item.accent} ${selected ? "selected" : ""}`} onClick={() => selectPrimary(item)}><span className="permit-icon"><Icon /></span>{selected && <span className="permit-selected"><Check size={13} /> 선택됨</span>}<strong>{item.name}</strong><p>{item.description}</p><small>{item.legalBasis}</small>{item.verifiedAt && <em>서식 항목 확인 {item.verifiedAt}</em>}</button>; })}</div>
      </section>

      {primary && <section className="wizard-card form-card permit-detail-card"><div className="card-title"><div><h3>{primary.name} 공통 입력</h3><p>신청서와 사업계획서에 함께 쓰이는 기술·변경 정보를 입력합니다.</p></div></div>
        {primary.catalogId === "development" && <><fieldset className="business-fieldset"><legend>개발행위 유형 <small>복수 선택</small></legend><div>{["공작물설치", "토지형질변경", "토석채취", "토지분할", "물건적치"].map((item) => <button type="button" key={item} className={caseRecord.permitForm.actionTypes.includes(item) ? "selected" : ""} onClick={() => toggleActionType(item)}>{caseRecord.permitForm.actionTypes.includes(item) && <Check size={14} />}{item}</button>)}</div></fieldset><div className="form-grid"><label>창업자 해당 여부<select value={caseRecord.permitForm.entrepreneurStatus} onChange={(event) => patchPermitForm({ entrepreneurStatus: event.target.value as CaseRecord["permitForm"]["entrepreneurStatus"] })}><option value="unknown">확인 필요</option><option value="yes">해당</option><option value="no">미해당</option></select></label><label>경사도(도)<input type="number" min="0" step="0.1" value={caseRecord.permitForm.slopeDegree ?? ""} onChange={(event) => patchPermitForm({ slopeDegree: event.target.value ? Number(event.target.value) : undefined })} /></label><label>토질<input value={caseRecord.permitForm.soilType} onChange={(event) => patchPermitForm({ soilType: event.target.value })} placeholder="예: 사질토" /></label><label>주요 수종<input value={caseRecord.permitForm.mainTreeSpecies} onChange={(event) => patchPermitForm({ mainTreeSpecies: event.target.value })} /></label></div></>}
        {primary.catalogId === "farmland-conversion" && <div className="form-grid"><label>농업진흥구역(㎡)<input type="number" min="0" value={caseRecord.permitForm.farmlandZoneAreaM2 ?? ""} onChange={(event) => patchPermitForm({ farmlandZoneAreaM2: event.target.value ? Number(event.target.value) : undefined })} /></label><label>농업보호구역(㎡)<input type="number" min="0" value={caseRecord.permitForm.farmlandProtectionAreaM2 ?? ""} onChange={(event) => patchPermitForm({ farmlandProtectionAreaM2: event.target.value ? Number(event.target.value) : undefined })} /></label><label>진흥지역 밖(㎡)<input type="number" min="0" value={caseRecord.permitForm.farmlandOutsideAreaM2 ?? ""} onChange={(event) => patchPermitForm({ farmlandOutsideAreaM2: event.target.value ? Number(event.target.value) : undefined })} /></label><label>농지보전부담금<select value={caseRecord.permitForm.conservationChargePayment} onChange={(event) => patchPermitForm({ conservationChargePayment: event.target.value as CaseRecord["permitForm"]["conservationChargePayment"] })}><option value="undecided">미정</option><option value="lump-sum">일시납부</option><option value="installment">분할납부</option></select></label></div>}
        {primary.catalogId === "forest-conversion" && <div className="form-grid"><label className="wide">산지에 대한 권리관계<input value={caseRecord.permitForm.forestRightRelation} onChange={(event) => patchPermitForm({ forestRightRelation: event.target.value })} placeholder="소유권, 사용승낙 등" /></label><label>임업용 산지(㎡)<input type="number" min="0" value={caseRecord.permitForm.forestryAreaM2 ?? ""} onChange={(event) => patchPermitForm({ forestryAreaM2: event.target.value ? Number(event.target.value) : undefined })} /></label><label>공익용 산지(㎡)<input type="number" min="0" value={caseRecord.permitForm.publicForestAreaM2 ?? ""} onChange={(event) => patchPermitForm({ publicForestAreaM2: event.target.value ? Number(event.target.value) : undefined })} /></label><label>준보전산지(㎡)<input type="number" min="0" value={caseRecord.permitForm.semiConservationAreaM2 ?? ""} onChange={(event) => patchPermitForm({ semiConservationAreaM2: event.target.value ? Number(event.target.value) : undefined })} /></label><label className="wide">벌채·굴취·토석 계획<textarea rows={3} value={caseRecord.permitForm.forestProductPlan} onChange={(event) => patchPermitForm({ forestProductPlan: event.target.value })} /></label></div>}
      </section>}
    </div>
  );

  return (
    <div className="permit-step">
      <section className="wizard-card">
        <div className="card-title"><div><h3>관련 허가·의제 후보</h3><p>지목만으로 확정하지 않습니다. 적용 후보를 연결한 뒤 담당자가 법령 근거와 협의 조건을 검토합니다.</p></div><span className="count-pill">{caseRecord.permits.filter((permit) => permit.relation !== "primary").length}개</span></div>
        {!primary ? <div className="empty-selection"><CircleAlert /><strong>먼저 허가유형을 선택하세요.</strong></div> : <div className="agenda-options">{agendaItems.map((item) => { const selected = caseRecord.permits.some((permit) => permit.catalogId === item.id); const Icon = permitIcons[item.icon] ?? FileText; return <button type="button" key={item.id} className={selected ? "selected" : ""} onClick={() => toggleRelated(item)}><span><Icon /><div><strong>{item.name}</strong><small>{item.description}</small></div></span><em>{selected ? <><Check size={14} /> 추가됨</> : <><Plus size={14} /> 연결</>}</em></button>; })}</div>}
      </section>

      {caseRecord.permits.length > 0 && <section className="wizard-card composition-card"><div className="card-title"><div><h3>절차별 신청 구분</h3><p>신규·변경, 기존 허가번호, 의제·별도 허가 관계와 검토 상태를 각각 저장합니다.</p></div></div><div className="composition-list">{caseRecord.permits.map((permit) => <article key={permit.id}><div className="relation-pill">{permit.relation === "primary" ? "기준 허가" : permit.relation === "agenda" ? "의제 후보" : permit.relation === "separate" ? "별도 허가" : "참고 절차"}</div><div className="composition-name"><strong>{permit.name}</strong><small>{permit.legalBasis}</small></div><div className="segmented-control"><button type="button" className={permit.applicationKind === "new" ? "active" : ""} onClick={() => patchPermit(permit.id, { applicationKind: "new", existingPermitNumber: "", changeSummary: "" })}>신규</button><button type="button" className={permit.applicationKind === "change" ? "active" : ""} onClick={() => patchPermit(permit.id, { applicationKind: "change" })}>변경</button></div>{permit.applicationKind === "change" && <><label className="inline-field">기존 허가번호<input value={permit.existingPermitNumber ?? ""} onChange={(event) => patchPermit(permit.id, { existingPermitNumber: event.target.value })} placeholder="허가번호" /></label><label className="inline-field wide">변경 전후 요약<input value={permit.changeSummary ?? ""} onChange={(event) => patchPermit(permit.id, { changeSummary: event.target.value })} placeholder="변경 전 → 변경 후" /></label></>}{permit.relation !== "primary" && <label className="inline-field">처리 관계<select value={permit.relation} onChange={(event) => patchPermit(permit.id, { relation: event.target.value as PermitRelationKind })}><option value="agenda">의제 신청</option><option value="separate">별도 허가</option><option value="reference">참고 절차</option></select></label>}<label className="inline-field">검토 상태<select value={permit.reviewState} onChange={(event) => patchPermit(permit.id, { reviewState: event.target.value as CaseRecord["permits"][number]["reviewState"] })}><option value="unreviewed">미검토</option><option value="review-needed">근거 확인 필요</option><option value="confirmed">담당자 확인</option></select></label></article>)}</div></section>}
    </div>
  );
}

function BasicStep({ caseRecord, patchCase }: StepProps) {
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptAgency, setReceiptAgency] = useState(caseRecord.parcels[0]?.jurisdictionName ?? "");
  const [lookupResult, setLookupResult] = useState<ReceiptLookupResult | null>(null);
  const [lookupPending, setLookupPending] = useState(false);
  const provider = useMemo(() => createReceiptLookupProvider(), []);
  const applicantParty = caseRecord.parties.find((party) => party.role === "applicant");

  function patchParty(id: string, patch: Partial<CaseRecord["parties"][number]>) {
    const parties = caseRecord.parties.map((party) => party.id === id ? { ...party, ...patch } : party);
    const applicant = parties.find((party) => party.role === "applicant");
    patchCase({
      parties,
      applicantName: applicant?.name ?? caseRecord.applicantName,
      applicantContact: applicant?.phone ?? caseRecord.applicantContact,
    });
  }

  function addParty(role: PartyRole) {
    patchCase({ parties: [...caseRecord.parties, { id: crypto.randomUUID(), role, partyType: "person", name: "" }] });
  }

  function toggleBusinessField(field: string) {
    patchCase({ businessFields: caseRecord.businessFields.includes(field)
      ? caseRecord.businessFields.filter((item) => item !== field)
      : [...caseRecord.businessFields, field] });
  }

  async function lookupReceipt() {
    setLookupPending(true);
    setLookupResult(null);
    try {
      setLookupResult(await provider.lookup(receiptNumber, caseRecord.parcels[0]?.jurisdictionCode ?? ""));
    } catch {
      setLookupResult({ mode: "sample", supported: false, status: "failed", message: "샘플 조회에 실패했습니다. 직접 입력해 주세요." });
    } finally {
      setLookupPending(false);
    }
  }

  function addManualReceipt() {
    if (!receiptNumber.trim() || !receiptAgency.trim()) return;
    patchCase({ receipts: [...caseRecord.receipts, manualReceipt(receiptNumber.trim(), receiptAgency.trim(), caseRecord.permits.map((permit) => permit.id))] });
    setReceiptNumber("");
    setLookupResult(null);
  }

  return (
    <div className="basic-step step-grid">
      <section className="wizard-card form-card">
        <div className="card-title"><div><h3>업무와 신청인</h3><p>목록과 문서에 공통으로 쓰이는 기본값입니다.</p></div></div>
        <div className="form-grid">
          <label className="wide">업무명 <span>필수</span><input value={caseRecord.title} onChange={(event) => patchCase({ title: event.target.value })} placeholder="예: 신남리 물류창고 부지조성" /></label>
          <label>계약 참조정보<input value={caseRecord.contractReference} onChange={(event) => patchCase({ contractReference: event.target.value })} placeholder="계약번호·거래처 메모" /></label>
          <label>신청인 <span>필수</span><input value={applicantParty?.name ?? caseRecord.applicantName} onChange={(event) => applicantParty ? patchParty(applicantParty.id, { name: event.target.value }) : patchCase({ applicantName: event.target.value })} placeholder="성명 또는 법인명" /></label>
          <label>연락처<input value={applicantParty?.phone ?? caseRecord.applicantContact ?? ""} onChange={(event) => applicantParty ? patchParty(applicantParty.id, { phone: event.target.value }) : patchCase({ applicantContact: event.target.value })} placeholder="010-0000-0000" /></label>
          <label className="wide">사업 목적 <span>필수</span><textarea value={caseRecord.projectPurpose} onChange={(event) => patchCase({ projectPurpose: event.target.value })} rows={3} placeholder="무엇을 위해 어떤 행위를 하는지 구체적으로 입력하세요." /></label>
          <label className="wide">현장·업무 메모<textarea value={caseRecord.caseMemo} onChange={(event) => patchCase({ caseMemo: event.target.value })} rows={3} placeholder="현장 확인사항, 의뢰인 요청, 다음 방문 때 확인할 내용을 기록하세요." /></label>
        </div>
        <div className="party-editor">
          <div className="party-editor-head"><div><h4>관계자</h4><p>신청인과 소유자가 다르거나 소유자가 여러 명인 사건도 등록할 수 있습니다.</p></div><div><button type="button" onClick={() => addParty("owner")}><Plus size={15} /> 소유자</button><button type="button" onClick={() => addParty("agent")}><Plus size={15} /> 대리인</button></div></div>
          {caseRecord.parties.map((party) => <article key={party.id} className={`party-card role-${party.role}`}><div className="party-card-title"><select value={party.role} onChange={(event) => patchParty(party.id, { role: event.target.value as PartyRole })}><option value="applicant">신청인</option><option value="owner">소유자</option><option value="agent">대리인</option></select><div className="segmented-control"><button type="button" className={party.partyType === "person" ? "active" : ""} onClick={() => patchParty(party.id, { partyType: "person" })}>개인</button><button type="button" className={party.partyType === "corporation" ? "active" : ""} onClick={() => patchParty(party.id, { partyType: "corporation" })}>법인</button></div>{party.role !== "applicant" && <button type="button" className="party-remove" onClick={() => patchCase({ parties: caseRecord.parties.filter((item) => item.id !== party.id) })} aria-label={`${party.name || "관계자"} 삭제`}><Trash2 size={15} /></button>}</div><div className="party-fields"><label>성명·상호<input value={party.name} onChange={(event) => patchParty(party.id, { name: event.target.value })} /></label>{party.partyType === "corporation" && <label>대표자<input value={party.representativeName ?? ""} onChange={(event) => patchParty(party.id, { representativeName: event.target.value })} /></label>}<label>생년월일·등록번호<input value={party.registrationNumber ?? ""} onChange={(event) => patchParty(party.id, { registrationNumber: event.target.value })} placeholder="문서 출력값" /></label><label>연락처<input value={party.phone ?? ""} onChange={(event) => patchParty(party.id, { phone: event.target.value })} /></label><label className="wide">주소<input value={party.address ?? ""} onChange={(event) => patchParty(party.id, { address: event.target.value })} /></label>{party.role === "owner" && <label>지분·소유관계<input value={party.ownershipShare ?? ""} onChange={(event) => patchParty(party.id, { ownershipShare: event.target.value })} placeholder="예: 1/2, 공유" /></label>}{party.role === "agent" && <label>대리관계<input value={party.relationNote ?? ""} onChange={(event) => patchParty(party.id, { relationNote: event.target.value })} placeholder="위임 범위" /></label>}</div></article>)}
        </div>
        <fieldset className="business-fieldset"><legend>업무 분야 <small>복수 선택 가능</small></legend><div>{["개간", "부지조성", "단독주택", "근린생활시설", "공장", "도로", "수면", "기타"].map((field) => <button type="button" key={field} className={caseRecord.businessFields.includes(field) ? "selected" : ""} onClick={() => toggleBusinessField(field)}>{caseRecord.businessFields.includes(field) && <Check size={14} />}{field}</button>)}</div></fieldset>
        <details className="building-plan-editor"><summary><span><Building2 size={17} /> 건축 계획</span><small>건축물이 있는 경우 입력</small></summary><div className="form-grid"><label>사업상 용도<input value={caseRecord.buildingPlan.useCategory} onChange={(event) => patchCase({ buildingPlan: { ...caseRecord.buildingPlan, useCategory: event.target.value } })} placeholder="예: 단독주택" /></label><label>법령상 건축물 용도<input value={caseRecord.buildingPlan.legalUseCategory} onChange={(event) => patchCase({ buildingPlan: { ...caseRecord.buildingPlan, legalUseCategory: event.target.value } })} placeholder="예: 단독주택(다가구주택)" /></label><label>건축면적(㎡)<input type="number" min="0" value={caseRecord.buildingPlan.buildingAreaM2 ?? ""} onChange={(event) => patchCase({ buildingPlan: { ...caseRecord.buildingPlan, buildingAreaM2: event.target.value ? Number(event.target.value) : undefined } })} /></label><label>연면적(㎡)<input type="number" min="0" value={caseRecord.buildingPlan.grossFloorAreaM2 ?? ""} onChange={(event) => patchCase({ buildingPlan: { ...caseRecord.buildingPlan, grossFloorAreaM2: event.target.value ? Number(event.target.value) : undefined } })} /></label><label>지상 층수<input type="number" min="0" value={caseRecord.buildingPlan.floorsAbove ?? ""} onChange={(event) => patchCase({ buildingPlan: { ...caseRecord.buildingPlan, floorsAbove: event.target.value ? Number(event.target.value) : undefined } })} /></label><label>구조<input value={caseRecord.buildingPlan.structure} onChange={(event) => patchCase({ buildingPlan: { ...caseRecord.buildingPlan, structure: event.target.value } })} placeholder="예: 철근콘크리트구조" /></label></div></details>
      </section>

      <section className="wizard-card receipt-card">
        <div className="card-title"><div><h3>접수 정보</h3><p>접수 전에도 초안으로 저장할 수 있습니다.</p></div><span className="sample-badge">샘플 조회</span></div>
        <div className="sample-lookup-notice"><CircleAlert size={18} /><div><strong>현재 기관 민원 API와 연결되지 않았습니다.</strong><p>아래 조회는 화면 동작 확인용 샘플이며 실제 처리 상태가 아닙니다.</p></div></div>
        <div className="receipt-inputs"><label>접수번호<input value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} placeholder="접수증의 번호를 그대로 입력" /></label><label>접수기관<input value={receiptAgency} onChange={(event) => setReceiptAgency(event.target.value)} placeholder="예: 화성시" /></label></div>
        <div className="receipt-actions"><button type="button" className="button button-secondary" onClick={lookupReceipt} disabled={lookupPending || !receiptNumber.trim()}>{lookupPending ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />} 샘플 조회</button><button type="button" className="button button-primary" onClick={addManualReceipt} disabled={!receiptNumber.trim() || !receiptAgency.trim()}><Plus size={17} /> 직접 등록</button></div>
        {lookupResult && <div className={`lookup-result ${lookupResult.status}`}><strong>{lookupResult.status === "found" ? "샘플 결과" : "직접 입력 필요"}</strong><p>{lookupResult.message}</p>{lookupResult.status === "found" && <button type="button" onClick={addManualReceipt}>이 번호를 직접 등록</button>}</div>}
        {caseRecord.receipts.length > 0 && <div className="registered-receipts"><h4>등록된 접수</h4>{caseRecord.receipts.map((receipt) => <article key={receipt.id}><div><strong>{receipt.receiptNumber}</strong><small>{receipt.agency} · {receipt.sourceLabel}</small></div><span>{receipt.lookupMode === "manual" ? "직접 입력" : "연동"}</span><button type="button" onClick={() => patchCase({ receipts: caseRecord.receipts.filter((item) => item.id !== receipt.id) })} aria-label="접수 기록 제거"><X size={16} /></button></article>)}</div>}
      </section>
    </div>
  );
}

function AttachmentStep({ caseRecord, files, setFiles }: { caseRecord: CaseRecord; files: PendingFile[]; setFiles: React.Dispatch<React.SetStateAction<PendingFile[]>> }) {
  const [role, setRole] = useState("현황실측도");
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const previewFiles = files.filter((item) => /\.(pdf|png|jpe?g)$/i.test(item.file.name));
  const activePreview = previewIndex === null ? undefined : previewFiles[previewIndex];
  const previewUrl = useMemo(() => activePreview ? URL.createObjectURL(activePreview.file) : "", [activePreview]);
  const checklist = selectedRequiredDocuments({ ...caseRecord, attachments: [
    ...caseRecord.attachments,
    ...files.map((item) => ({ id: item.id, name: item.file.name, storagePath: "pending", mimeType: item.file.type, size: item.file.size, role: item.role, version: 1, createdAt: new Date().toISOString(), createdBy: "pending", previewable: /\.(pdf|png|jpe?g)$/i.test(item.file.name) })),
  ] });

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function addSelectedFiles(selected: File[], selectedRole = role) {
    const next: PendingFile[] = [];
    for (const file of selected) {
      const validation = validateAttachment(file);
      if (validation) {
        setError(`${file.name}: ${validation}`);
        continue;
      }
      next.push({ id: crypto.randomUUID(), file, role: selectedRole });
    }
    setFiles((current) => [...current, ...next]);
    if (next.length) setError("");
  }

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    addSelectedFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function addSitePhotos(event: ChangeEvent<HTMLInputElement>) {
    addSelectedFiles(Array.from(event.target.files ?? []), "현장사진");
    event.target.value = "";
  }

  return (
    <div className="attachment-step step-grid">
      <section className="wizard-card">
        <div className="card-title"><div><h3>도면과 발급서류</h3><p>첨부 참고자료의 도면 종류와 발급서류를 역할별로 관리합니다.</p></div><span className="count-pill">{caseRecord.attachments.length + files.length}개</span></div>
        <div className="attachment-upload-toolbar"><div className="upload-role"><label>추가할 파일 역할<select value={role} onChange={(event) => setRole(event.target.value)}><optgroup label="설계도"><option>위치도</option><option>현황실측도</option><option>구적도</option><option>계획평면도</option><option>횡단면도</option><option>종단면도</option><option>배수계획도</option><option>집수정상세도</option><option>PE이중벽관상세도</option><option>옹벽상세도</option></optgroup><optgroup label="발급서류"><option>토지대장</option><option>지적도</option><option>임야도</option><option>등기사항증명서</option><option>공유지연명부</option><option>소유권 자료</option></optgroup><optgroup label="내역·기타"><option>현장사진</option><option>공사내역서</option><option>예산내역서</option><option>산림조사서</option><option>입목축적조사서</option><option>기타</option></optgroup></select><ChevronDown size={16} /></label></div><button type="button" className="button button-secondary attachment-camera-button" onClick={() => photoInput.current?.click()}><Camera size={17} /> 현장사진 촬영·첨부</button></div>
        <button type="button" className="upload-dropzone" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addSelectedFiles(Array.from(event.dataTransfer.files)); }}><span><Upload /></span><strong>파일을 선택하거나 이곳에 놓으세요</strong><p>PDF·PNG·JPG는 화면에서 확인하고, DWG·DXF·DOCX·HWPX·XLSX는 원본으로 보관합니다.</p><small>파일당 최대 50MB · 실제 민원자료와 인증키는 저장소 밖에서 별도 관리</small></button>
        <input ref={fileInput} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf,.docx,.hwpx,.xlsx" onChange={addFiles} />
        <input ref={photoInput} type="file" multiple hidden accept="image/*" capture="environment" onChange={addSitePhotos} />
        {error && <div className="lookup-message"><CircleAlert size={17} />{error}</div>}
        {caseRecord.attachments.length > 0 && <div className="existing-file-summary"><strong>저장된 첨부 {caseRecord.attachments.length}개</strong><span>{caseRecord.attachments.map((item) => `${item.role} v${item.version}`).join(" · ")}</span></div>}
        {files.length > 0 && <div className="pending-file-list">{files.map((item, index) => { const canPreview = /\.(pdf|png|jpe?g)$/i.test(item.file.name); const previewPosition = previewFiles.findIndex((file) => file.id === item.id); return <article key={item.id}><span className="file-kind">{item.file.name.split(".").pop()?.toUpperCase()}</span><div><strong>{item.file.name}</strong><small>{item.role} · v1 · {(item.file.size / 1024 / 1024).toFixed(1)}MB</small></div><span className="preview-state">{canPreview ? "화면 확인 가능" : "원본 보관"}</span>{canPreview && <button type="button" onClick={() => { setPreviewIndex(previewPosition); setZoom(1); }} aria-label={`${item.file.name} 미리보기`}><Eye size={17} /></button>}<button type="button" onClick={() => setFiles((current) => current.filter((file) => file.id !== item.id))} aria-label={`${item.file.name} 제거`}><Trash2 size={17} /></button><div className="file-order">{index + 1}</div></article>; })}</div>}
      </section>
      <section className="wizard-card required-documents"><div className="card-title"><div><h3>필요 서류</h3><p>선택한 허가에 적용 가능한 후보입니다. 담당자가 관할기관 기준으로 확정합니다.</p></div></div><div className="required-document-list">{checklist.map((item) => <article key={item.id} className={item.attachment ? "ready" : "missing"}><span>{item.attachment ? <Check size={15} /> : <Paperclip size={15} />}</span><div><strong>{item.name}</strong><small>{item.attachment ? `${item.attachment.name} 연결됨` : item.reason}</small></div>{item.issueUrl ? <a href={item.issueUrl} target="_blank" rel="noreferrer">{item.sourceLabel} <ExternalLink size={13} /></a> : <em>{item.sourceLabel}</em>}</article>)}</div></section>

      {activePreview && <div className="attachment-viewer" role="dialog" aria-modal="true" aria-label={`${activePreview.file.name} 미리보기`}><header><div><strong>{activePreview.file.name}</strong><span>{activePreview.role} · {previewIndex! + 1}/{previewFiles.length}</span></div><div><button type="button" onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))} aria-label="축소"><ZoomOut /></button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(2.4, value + 0.2))} aria-label="확대"><ZoomIn /></button><button type="button" onClick={() => setPreviewIndex(null)} aria-label="닫기"><X /></button></div></header><main>{/\.pdf$/i.test(activePreview.file.name) ? <iframe src={previewUrl} title={activePreview.file.name} style={{ transform: `scale(${zoom})` }} /> : <img src={previewUrl} alt={activePreview.file.name} style={{ transform: `scale(${zoom})` }} />}</main><footer><button type="button" onClick={() => setPreviewIndex((current) => current === null ? 0 : (current - 1 + previewFiles.length) % previewFiles.length)}><ChevronLeft /> 이전</button><button type="button" onClick={() => setPreviewIndex((current) => current === null ? 0 : (current + 1) % previewFiles.length)}>다음 <ChevronRight /></button></footer></div>}
    </div>
  );
}

function ConstructionStep({ caseRecord, patchCase }: StepProps) {
  function patchCost(id: string, patch: Partial<CostItem>) {
    patchCase({ costItems: caseRecord.costItems.map((item) => item.id === id ? { ...item, ...patch } : item) });
  }
  function addCost() {
    patchCase({ costItems: [...caseRecord.costItems, { id: crypto.randomUUID(), workType: "", specification: "", unit: "", quantity: 0, unitPrice: 0 }] });
  }
  const total = caseRecord.costItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return (
    <div className="construction-step">
      <section className="wizard-card form-card">
        <div className="card-title"><div><h3>공사 개요와 일정</h3><p>선택 입력 항목입니다. 비워 두고 다음 단계로 이동한 뒤 나중에 작성할 수 있습니다.</p></div></div>
        <div className="form-grid"><label className="wide">공사 개요 <span>선택 · 나중에 입력 가능</span><textarea rows={3} value={caseRecord.constructionSummary} onChange={(event) => patchCase({ constructionSummary: event.target.value })} placeholder="주요 공종과 시공 범위를 입력하세요." /></label><label>예정 착수일<input type="date" value={caseRecord.projectPeriod.start} onChange={(event) => patchCase({ projectPeriod: { ...caseRecord.projectPeriod, start: event.target.value } })} /></label><label>예정 완료일<input type="date" value={caseRecord.projectPeriod.end} onChange={(event) => patchCase({ projectPeriod: { ...caseRecord.projectPeriod, end: event.target.value } })} /></label><label className="wide">공정 일정<textarea rows={3} value={caseRecord.scheduleSummary} onChange={(event) => patchCase({ scheduleSummary: event.target.value })} placeholder="예: 토공 45일 → 배수공 30일 → 포장·마감 45일" /></label></div>
      </section>
      <section className="wizard-card cost-card"><div className="card-title"><div><h3>공사 비용</h3><p>수량 × 단가 합계이며 공식 적산 결과로 자동 인증하지 않습니다.</p></div><button type="button" className="button button-secondary compact" onClick={addCost}><Plus size={17} /> 공종 추가</button></div><div className="cost-table"><div className="cost-header"><span>공종</span><span>규격</span><span>단위</span><span>수량</span><span>단가</span><span>금액</span><span /></div>{caseRecord.costItems.map((item) => <div className="cost-row" key={item.id}><input aria-label="공종" value={item.workType} onChange={(event) => patchCost(item.id, { workType: event.target.value })} /><input aria-label="규격" value={item.specification} onChange={(event) => patchCost(item.id, { specification: event.target.value })} /><input aria-label="단위" value={item.unit} onChange={(event) => patchCost(item.id, { unit: event.target.value })} /><input aria-label="수량" type="number" min="0" value={item.quantity || ""} onChange={(event) => patchCost(item.id, { quantity: Number(event.target.value) })} /><input aria-label="단가" type="number" min="0" value={item.unitPrice || ""} onChange={(event) => patchCost(item.id, { unitPrice: Number(event.target.value) })} /><strong>{(item.quantity * item.unitPrice).toLocaleString("ko-KR")}원</strong><button type="button" onClick={() => patchCase({ costItems: caseRecord.costItems.filter((cost) => cost.id !== item.id) })} aria-label="공종 제거"><Trash2 size={16} /></button></div>)}{!caseRecord.costItems.length && <div className="empty-cost">공종을 추가하면 수량과 단가로 합계를 계산합니다.</div>}<div className="cost-total"><span>작성 내역 합계</span><strong>{total.toLocaleString("ko-KR")}원</strong></div></div></section>
      <section className="wizard-card form-card"><div className="card-title"><div><h3>안전·환경 대책</h3><p>선택 입력 항목입니다. 업무 생성 후 수정 화면에서도 보완할 수 있습니다.</p></div></div><div className="form-grid"><label className="wide">안전 대책 <span>선택 · 나중에 입력 가능</span><textarea rows={4} value={caseRecord.safetyPlan} onChange={(event) => patchCase({ safetyPlan: event.target.value })} placeholder="출입 통제, 장비 작업, 사면 안정 등" /></label><label className="wide">환경 대책 <span>선택 · 나중에 입력 가능</span><textarea rows={4} value={caseRecord.environmentPlan} onChange={(event) => patchCase({ environmentPlan: event.target.value })} placeholder="비산먼지, 소음, 오탁수, 폐기물 관리 등" /></label></div></section>
    </div>
  );
}

function PlanStep({ caseRecord, patchCase }: StepProps) {
  const fields: Array<{ key: keyof CaseRecord["planBody"]; label: string; hint: string }> = [
    { key: "overview", label: "사업 개요", hint: "사업 목적과 규모, 시행 방법을 설명합니다." },
    { key: "siteCondition", label: "대상지 현황", hint: "지형, 현재 이용 상태, 진입과 배수 조건을 설명합니다." },
    { key: "projectPlan", label: "계획 내용", hint: "토지 이용, 시설, 배수, 진입과 공사계획을 작성합니다." },
    { key: "managementPlan", label: "일정 및 관리", hint: "공사 중 점검과 완료 후 유지·복구 계획을 작성합니다." },
  ];
  return (
    <div className="plan-step">
      <details className="wizard-card base-narrative-editor">
        <summary><div><strong>사건 공통 서술</strong><span>여러 문서에서 재사용할 기본 문장을 입력합니다.</span></div><ChevronDown /></summary>
        <div className="source-summary"><FileCheck2 size={18} /><div><strong>공통값 연결됨</strong><span>{caseRecord.parcels.length}필지 · {caseRecord.permits.length}개 절차 · 신청인 {caseRecord.applicantName || "미입력"}</span></div></div>
        <div className="base-narrative-grid">
          {fields.map((field) => <label className="editor-field" key={field.key}><div><strong>{field.label}</strong><span>{field.hint}</span></div><textarea rows={4} value={caseRecord.planBody[field.key]} onChange={(event) => patchCase({ planBody: { ...caseRecord.planBody, [field.key]: event.target.value } })} placeholder={`${field.label} 내용을 작성하세요.`} /></label>)}
        </div>
      </details>
      <DocumentDraftEditor caseRecord={caseRecord} onChange={patchCase} />
    </div>
  );
}

function ReviewStep({ caseRecord, pendingFiles, onExport }: { caseRecord: CaseRecord; pendingFiles: PendingFile[]; onExport: (type: "pdf" | "docx") => Promise<void> }) {
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const blocking = documentValidationErrors(caseRecord);
  const warnings = documentReviewWarnings(caseRecord);
  const models = buildCaseDocumentModels(caseRecord);
  const totalArea = caseRecord.parcels.reduce((sum, parcel) => sum + (parcel.plannedAreaM2 ?? parcel.surveyedAreaM2 ?? parcel.ledgerAreaM2 ?? 0), 0);
  const totalCost = caseRecord.costItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  async function runExport(type: "pdf" | "docx") { setExporting(type); try { await onExport(type); } finally { setExporting(null); } }
  return (
    <div className="review-step step-grid">
      <section className="wizard-card review-summary">
        <div className="card-title"><div><h3>업무 검토</h3><p>저장 차단 오류와 제출 전 확인사항을 나누어 표시합니다.</p></div>{blocking.length ? <span className="review-warning">오류 {blocking.length}</span> : <span className="review-ok"><Check size={14} /> 저장 가능</span>}</div>
        {blocking.length > 0 && <div className="review-errors blocking">{blocking.map((item) => <button type="button" key={item} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><CircleAlert size={16} />{item}</button>)}</div>}
        {warnings.length > 0 && <div className="review-errors advisory"><strong>제출 전 확인 {warnings.length}건</strong>{warnings.slice(0, 12).map((item) => <p key={item}><CircleAlert size={15} />{item}</p>)}</div>}
        <dl><div><dt>업무명</dt><dd>{caseRecord.title || "미입력"}</dd></div><div><dt>신청인</dt><dd>{caseRecord.applicantName || "미입력"}</dd></div><div><dt>대표 필지</dt><dd>{caseRecord.parcels[0]?.address || "미선택"}</dd></div><div><dt>신청면적 합계</dt><dd>{caseRecord.parcels.length}필지 · {totalArea.toLocaleString("ko-KR")}㎡</dd></div><div><dt>허가 구성</dt><dd>{caseRecord.permits.map((permit) => `${permit.name}(${permit.applicationKind === "new" ? "신규" : "변경"})`).join(" · ") || "미선택"}</dd></div><div><dt>선택 문서</dt><dd>{models.length}종</dd></div><div><dt>첨부</dt><dd>{caseRecord.attachments.length}개 {pendingFiles.length ? `(신규 ${pendingFiles.length})` : ""}</dd></div><div><dt>공사비 합계</dt><dd>{totalCost.toLocaleString("ko-KR")}원</dd></div></dl>
      </section>
      <section className="wizard-card output-card">
        <div className="card-title"><div><h3>제출 문서 묶음</h3><p>선택한 문서와 생성 당시 공통값·첨부 버전을 고정합니다.</p></div><span className="count-pill">{models.length}종</span></div>
        <div className="packet-preview">{models.map((model, index) => <article key={model.templateId}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{model.title}</strong><small>{model.statusLabel} · {model.templateVersion}</small></div><em>{model.sections.reduce((sum, section) => sum + section.fields.filter((field) => field.value !== "작성 필요").length, 0)}항목 작성</em></article>)}</div>
        <div className="paper-preview compact"><div className="paper-head"><span>제출서류 묶음</span><strong>{caseRecord.title || "제목 없는 업무"}</strong><small>문서 v{Math.max(1, caseRecord.documentVersions.length + 1)}</small></div><div className="paper-section"><b>대상 필지</b><p>{caseRecord.parcels.map((parcel) => `${parcel.lotNumber || parcel.address} · ${parcel.role}`).join(" / ") || "필지 미선택"}</p></div><div className="paper-section"><b>허가 구성</b><p>{caseRecord.permits.map((permit) => `${permit.name} ${permit.applicationKind === "new" ? "신규" : "변경"}`).join(" · ") || "허가 미선택"}</p></div><div className="paper-notice">공식 서식 항목 초안과 예시 서식을 구분해 출력</div></div>
        <div className="output-actions"><button type="button" className="button button-secondary" onClick={() => runExport("docx")} disabled={Boolean(exporting) || !models.length}>{exporting === "docx" ? <LoaderCircle className="spin" size={18} /> : <FileText size={18} />} 편집용 DOCX</button><button type="button" className="button button-primary" onClick={() => runExport("pdf")} disabled={Boolean(exporting) || !models.length}>{exporting === "pdf" ? <LoaderCircle className="spin" size={18} /> : <FileCheck2 size={18} />} 검토용 PDF</button></div><p className="output-notice">제출 전 원문 서식 배치와 관할기관 요구사항을 최종 확인하세요.</p>
      </section>
    </div>
  );
}
