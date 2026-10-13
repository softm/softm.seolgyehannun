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
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CloudUpload,
  Factory,
  FileCheck2,
  FileText,
  Landmark,
  LoaderCircle,
  LocateFixed,
  MapPin,
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
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth, useCases } from "../context";
import { deduplicateParcels } from "../domain/pnu";
import { defaultPermitCatalog, nextPermitSelection, validatePermitComposition, type PermitCatalogItem } from "../domain/permits";
import { documentValidationErrors } from "../domain/documentModel";
import { formatSeoulDate } from "../domain/date";
import { validateAttachment } from "../domain/files";
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
import type { CaseRecord, CostItem, ParcelSnapshot, PermitRelationKind } from "../types";

const wizardSteps = [
  { number: 1, title: "필지", description: "대표·연접 필지" },
  { number: 2, title: "허가", description: "주허가·의제" },
  { number: 3, title: "기본정보", description: "사업·접수" },
  { number: 4, title: "자료", description: "도면·첨부" },
  { number: 5, title: "공사계획", description: "일정·비용·대책" },
  { number: 6, title: "계획서", description: "본문 작성" },
  { number: 7, title: "검토", description: "저장·출력" },
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
    applicantName: "",
    applicantContact: "",
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
    constructionSummary: "",
    scheduleSummary: "",
    safetyPlan: "",
    environmentPlan: "",
    costItems: [],
    planBody: { overview: "", siteCondition: "", projectPlan: "", managementPlan: "" },
    nextAction: "필지와 허가 구성 확인",
    reminderOffsets: [7, 3, 1, 0, -1],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    version: 0,
  };
}

export function NewCaseWizard() {
  const { user } = useAuth();
  const { persistCase } = useCases();
  const navigate = useNavigate();
  const draftKey = user ? `seolgye-hannun.wizard.${user.organizationId}` : "";
  const initialDraft = useMemo(() => {
    if (!user) return null;
    const stored = sessionStorage.getItem(draftKey);
    if (stored) {
      try { return JSON.parse(stored) as { step: number; caseRecord: CaseRecord }; } catch { /* 새 초안 사용 */ }
    }
    return { step: 1, caseRecord: createEmptyCase(user.organizationId, user.uid, user.displayName) };
  }, [draftKey, user]);
  const [step, setStep] = useState(initialDraft?.step ?? 1);
  const [caseRecord, setCaseRecord] = useState<CaseRecord>(initialDraft?.caseRecord ?? createEmptyCase("", "", ""));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const [errors, setErrors] = useState<string[]>([]);
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

  function stepErrors(targetStep = step): string[] {
    if (targetStep === 1 && !caseRecord.parcels.length) return ["대표 필지를 1개 이상 선택해 주세요."];
    if (targetStep === 2) return validatePermitComposition(caseRecord.permits);
    if (targetStep === 3) {
      const next: string[] = [];
      if (!caseRecord.title.trim()) next.push("업무명을 입력해 주세요.");
      if (!caseRecord.applicantName.trim()) next.push("신청인을 입력해 주세요.");
      if (!caseRecord.projectPurpose.trim()) next.push("사업 목적을 입력해 주세요.");
      return next;
    }
    if (targetStep === 5) {
      const next: string[] = [];
      if (!caseRecord.constructionSummary.trim()) next.push("공사 개요를 입력해 주세요.");
      if (!caseRecord.safetyPlan.trim()) next.push("안전 대책을 입력해 주세요.");
      if (!caseRecord.environmentPlan.trim()) next.push("환경 대책을 입력해 주세요.");
      return next;
    }
    if (targetStep === 6 && !caseRecord.planBody.overview.trim()) return ["사업 개요 본문을 입력해 주세요."];
    return [];
  }

  function move(nextStep: number) {
    if (nextStep > step) {
      const validation = stepErrors();
      if (validation.length) {
        setErrors(validation);
        return;
      }
    }
    setErrors([]);
    setStep(Math.min(7, Math.max(1, nextStep)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function finish() {
    const validation = documentValidationErrors(caseRecord);
    if (validation.length) {
      setErrors(validation);
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
        status: "writing",
        primaryPermitName: caseRecord.permits.find((permit) => permit.relation === "primary")?.name ?? "",
        jurisdictionName: caseRecord.parcels[0]?.jurisdictionName ?? "",
        nextAction: "사업계획서 검토 및 접수 준비",
      });
      sessionStorage.removeItem(draftKey);
      navigate("/app");
    } catch (reason) {
      setErrors([reason instanceof Error ? reason.message : "업무를 저장하지 못했습니다."]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="wizard-page">
      <header className="wizard-header">
        <button type="button" className="wizard-back" onClick={() => navigate(-1)}><ArrowLeft size={18} /> 업무 목록</button>
        <div><span>새 업무</span><h1>{caseRecord.title || "제목 없는 업무"}</h1></div>
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
            "현재 위치는 지도 시작점에만 사용합니다. 최종 관할은 선택한 필지의 PNU로 확인합니다.",
            "주허가와 관련 절차의 관계, 신규·변경을 각각 구분해 주세요.",
            "사건 기본값과 접수 정보를 입력합니다. 기관 조회 전에는 샘플 조회로 표시됩니다.",
            "도면 역할과 버전을 함께 등록합니다. 원본 파일은 비공개 경로에 보관됩니다.",
            "공사 개요, 일정, 비용과 안전·환경 대책을 작성합니다.",
            "앞에서 입력한 값으로 계획서 본문을 완성합니다.",
            "누락 항목과 출처를 확인하고 업무를 저장하거나 문서를 출력합니다.",
          ][step - 1]}</p>
        </div>

        {errors.length > 0 && <div className="wizard-errors" role="alert"><CircleAlert size={19} /><div><strong>확인이 필요합니다</strong>{errors.map((error) => <span key={error}>{error}</span>)}</div></div>}

        {step === 1 && <ParcelStep caseRecord={caseRecord} patchCase={patchCase} />}
        {step === 2 && <PermitStep caseRecord={caseRecord} patchCase={patchCase} catalog={permitCatalog} />}
        {step === 3 && <BasicStep caseRecord={caseRecord} patchCase={patchCase} />}
        {step === 4 && <AttachmentStep files={pendingFiles} setFiles={setPendingFiles} />}
        {step === 5 && <ConstructionStep caseRecord={caseRecord} patchCase={patchCase} />}
        {step === 6 && <PlanStep caseRecord={caseRecord} patchCase={patchCase} />}
        {step === 7 && <ReviewStep caseRecord={{ ...caseRecord, attachments: [...caseRecord.attachments, ...pendingFiles.map((item) => ({ id: item.id, name: item.file.name, storagePath: "pending", mimeType: item.file.type, size: item.file.size, role: item.role, version: 1, createdAt: new Date().toISOString(), createdBy: user?.uid ?? "", previewable: /\.(pdf|png|jpe?g)$/i.test(item.file.name) }))] }} pendingFiles={pendingFiles} onExport={async (type) => type === "pdf" ? exportCasePdf(caseRecord) : exportCaseDocx(caseRecord)} />}
      </main>

      <footer className="wizard-footer">
        <button type="button" className="button button-secondary" onClick={() => move(step - 1)} disabled={step === 1}><ArrowLeft size={18} /> 이전</button>
        <div><span>{step} / 7</span><div className="wizard-footer-progress"><i style={{ width: `${(step / 7) * 100}%` }} /></div></div>
        {step < 7 ? <button type="button" className="button button-primary" onClick={() => move(step + 1)}>다음 <ArrowRight size={18} /></button> : <button type="button" className="button button-primary" onClick={finish} disabled={submitting}>{submitting ? <><LoaderCircle size={18} className="spin" /> 저장 중 {uploadProgress ? `${uploadProgress}%` : ""}</> : <><CheckCircle2 size={18} /> 업무 시작</>}</button>}
      </footer>
    </div>
  );
}

interface StepProps {
  caseRecord: CaseRecord;
  patchCase: (patch: Partial<CaseRecord>) => void;
}

interface PermitStepProps extends StepProps {
  catalog: Array<PermitCatalogItem | CustomPermitCatalogItem>;
}

function ParcelStep({ caseRecord, patchCase }: StepProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VWorldSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapFocus, setMapFocus] = useState<{ longitude: number; latitude: number; requestId: number } | null>(null);
  const [message, setMessage] = useState("");
  const [draggedParcelId, setDraggedParcelId] = useState<string | null>(null);
  const selectedListRef = useRef<HTMLDivElement>(null);
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
        <div className="card-title"><div><h3>필지 찾기</h3><p>주소·지번을 검색하거나 VWorld 지적도를 눌러 선택하세요.</p></div><button type="button" className="button button-secondary compact" onClick={useCurrentLocation} disabled={locating} aria-busy={locating}><LocateFixed size={17} /> {locating ? "위치 확인 중" : "현재 위치"}</button></div>
        <div className="address-search"><Search size={19} /><input value={query} onChange={(event) => { const nextQuery = event.target.value; setQuery(nextQuery); if (!nextQuery.trim()) { setResults([]); setMessage(""); } }} onKeyDown={(event) => { if (event.key === "Enter") void searchAddress(); if (event.key === "Escape") setResults([]); }} placeholder="예: 화성시 남양읍 신남리 145" aria-expanded={results.length > 0} aria-controls="parcel-search-results" /><button type="button" onClick={searchAddress} disabled={searching}>{searching ? <LoaderCircle className="spin" size={18} /> : "검색"}</button></div>
        {results.length > 0 && <div className="search-results" id="parcel-search-results" role="region" aria-label="주소 검색 결과"><div className="search-results-header"><strong>검색 결과 {results.length}건</strong><button type="button" onClick={() => setResults([])} aria-label="검색 결과 닫기"><X size={16} /> 닫기</button></div><div className="search-results-list" role="listbox">{results.map((result) => <button type="button" key={result.id} onClick={() => addByResult(result)}><span>{result.category === "parcel" ? "지번" : result.category === "road" ? "도로" : "장소"}</span><div><strong>{result.title}</strong><small>{result.address}{result.roadAddress && ` · ${result.roadAddress}`}</small></div><Plus size={18} /></button>)}</div></div>}
        {message && <div className="lookup-message" role="status" aria-live="polite"><CircleAlert size={17} />{message}</div>}
        <div className="wizard-map"><ParcelMap parcels={caseRecord.parcels} focusLocation={mapFocus} interactive onMapClick={addByMap} />{mapLoading && <div className="map-loading"><LoaderCircle className="spin" />{locating ? "현재 위치의 주소 확인 중" : "필지 확인 중"}</div>}</div>
      </section>

      <section className="wizard-card selected-parcels-card">
        <div className="card-title"><div><h3>선택한 필지</h3><p>첫 번째 필지가 대표 필지입니다.</p></div><span className="count-pill">{caseRecord.parcels.length}필지</span></div>
        {caseRecord.parcels.length ? (
          <div ref={selectedListRef} className="selected-parcel-list">
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
                <div>
                  <div className="parcel-role">{index === 0 ? "대표 필지" : "연접 필지"}{parcel.verifiedByUser && <span><Check size={12} /> 사용자 확인</span>}</div>
                  <strong>{parcel.address}</strong>
                  <small>PNU {parcel.pnu}</small>
                  <div className="parcel-facts"><span>{parcel.category || "지목 확인 필요"}</span><span>{parcel.ledgerAreaM2?.toLocaleString("ko-KR") ?? "-"}㎡</span><span>{parcel.zoning.join(", ") || "용도지역 확인 필요"}</span></div>
                  <p>{parcel.source} · {formatSeoulDate(parcel.fetchedAt)} 조회</p>
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

function PermitStep({ caseRecord, patchCase, catalog }: PermitStepProps) {
  const primaryItems = catalog.filter((item) => item.category === "main");
  const primary = caseRecord.permits.find((permit) => permit.relation === "primary");
  const agendaItems = catalog.filter((item) => {
    if (item.category !== "agenda") return false;
    if (!("relatedPrimaryCatalogIds" in item) || !item.relatedPrimaryCatalogIds.length) return true;
    return Boolean(primary && item.relatedPrimaryCatalogIds.includes(primary.catalogId));
  });

  function selectPrimary(item: PermitCatalogItem) {
    const nextPrimary = nextPermitSelection(item, "primary");
    const related = caseRecord.permits.filter((permit) => permit.relation !== "primary");
    patchCase({ permits: [nextPrimary, ...related], primaryPermitName: item.name });
  }

  function toggleRelated(item: PermitCatalogItem, relation: PermitRelationKind = "agenda") {
    const existing = caseRecord.permits.find((permit) => permit.catalogId === item.id);
    patchCase({ permits: existing ? caseRecord.permits.filter((permit) => permit.id !== existing.id) : [...caseRecord.permits, nextPermitSelection(item, relation)] });
  }

  function patchPermit(id: string, patch: Partial<CaseRecord["permits"][number]>) {
    patchCase({ permits: caseRecord.permits.map((permit) => permit.id === id ? { ...permit, ...patch } : permit) });
  }

  return (
    <div className="permit-step">
      <section className="wizard-card">
        <div className="card-title"><div><h3>주허가 선택</h3><p>이 문서 작성 묶음의 기준 절차를 1개 선택합니다.</p></div>{primary && <span className="selected-summary">선택 · {primary.name}</span>}</div>
        <div className="permit-card-grid">{primaryItems.map((item) => { const Icon = permitIcons[item.icon] ?? FileText; const selected = primary?.catalogId === item.id; return <button type="button" key={item.id} className={`permit-card accent-${item.accent} ${selected ? "selected" : ""}`} onClick={() => selectPrimary(item)}><span className="permit-icon"><Icon /></span>{selected && <span className="permit-selected"><Check size={13} /> 선택됨</span>}<strong>{item.name}</strong><p>{item.description}</p><small>{item.legalBasis}</small></button>; })}</div>
      </section>

      <section className="wizard-card">
        <div className="card-title"><div><h3>관련 절차</h3><p>후보를 추가해도 기관 처리 결과가 확정되는 것은 아닙니다.</p></div><span className="count-pill">{caseRecord.permits.filter((permit) => permit.relation !== "primary").length}개</span></div>
        <div className="agenda-options">{agendaItems.map((item) => { const selected = caseRecord.permits.some((permit) => permit.catalogId === item.id); const Icon = permitIcons[item.icon] ?? FileText; return <button type="button" key={item.id} className={selected ? "selected" : ""} onClick={() => toggleRelated(item)}><span><Icon /><div><strong>{item.name}</strong><small>{item.description}</small></div></span><em>{selected ? <><Check size={14} /> 추가됨</> : <><Plus size={14} /> 추가</>}</em></button>; })}<button type="button" className="separate-option" onClick={() => { const road = catalog.find((item) => item.id === "road")!; toggleRelated(road, "separate"); }}><span><Route /><div><strong>별도 절차 연결</strong><small>도로점용 등 별도 진행 절차</small></div></span><em><Plus size={14} /> 추가</em></button></div>
      </section>

      {caseRecord.permits.length > 0 && <section className="wizard-card composition-card"><div className="card-title"><div><h3>구성 확인</h3><p>각 절차마다 신규·변경과 검토 상태를 따로 저장합니다.</p></div></div><div className="composition-list">{caseRecord.permits.map((permit) => <article key={permit.id}><div className="relation-pill">{permit.relation === "primary" ? "주허가" : permit.relation === "agenda" ? "의제 후보" : "별도 절차"}</div><div className="composition-name"><strong>{permit.name}</strong><small>{permit.legalBasis}</small></div><div className="segmented-control"><button type="button" className={permit.applicationKind === "new" ? "active" : ""} onClick={() => patchPermit(permit.id, { applicationKind: "new", existingPermitNumber: "" })}>신규</button><button type="button" className={permit.applicationKind === "change" ? "active" : ""} onClick={() => patchPermit(permit.id, { applicationKind: "change" })}>변경</button></div>{permit.applicationKind === "change" && <label className="inline-field">기존 허가번호<input value={permit.existingPermitNumber ?? ""} onChange={(event) => patchPermit(permit.id, { existingPermitNumber: event.target.value })} placeholder="허가번호 입력" /></label>}{permit.relation !== "primary" && <label className="inline-field">관계<select value={permit.relation} onChange={(event) => patchPermit(permit.id, { relation: event.target.value as PermitRelationKind })}><option value="agenda">의제 신청</option><option value="separate">별도 허가</option><option value="reference">참고 절차</option></select></label>}</article>)}</div></section>}
    </div>
  );
}

function BasicStep({ caseRecord, patchCase }: StepProps) {
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptAgency, setReceiptAgency] = useState(caseRecord.parcels[0]?.jurisdictionName ?? "");
  const [lookupResult, setLookupResult] = useState<ReceiptLookupResult | null>(null);
  const [lookupPending, setLookupPending] = useState(false);
  const provider = useMemo(() => createReceiptLookupProvider(), []);

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
          <label>신청인 <span>필수</span><input value={caseRecord.applicantName} onChange={(event) => patchCase({ applicantName: event.target.value })} placeholder="성명 또는 법인명" /></label>
          <label>연락처<input value={caseRecord.applicantContact ?? ""} onChange={(event) => patchCase({ applicantContact: event.target.value })} placeholder="010-0000-0000" /></label>
          <label className="wide">사업 목적 <span>필수</span><textarea value={caseRecord.projectPurpose} onChange={(event) => patchCase({ projectPurpose: event.target.value })} rows={3} placeholder="무엇을 위해 어떤 행위를 하는지 구체적으로 입력하세요." /></label>
        </div>
        <fieldset className="business-fieldset"><legend>업무 분야 <small>복수 선택 가능</small></legend><div>{["개간", "부지조성", "공장", "도로", "수면", "기타"].map((field) => <button type="button" key={field} className={caseRecord.businessFields.includes(field) ? "selected" : ""} onClick={() => toggleBusinessField(field)}>{caseRecord.businessFields.includes(field) && <Check size={14} />}{field}</button>)}</div></fieldset>
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

function AttachmentStep({ files, setFiles }: { files: PendingFile[]; setFiles: React.Dispatch<React.SetStateAction<PendingFile[]>> }) {
  const [role, setRole] = useState("현황도");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    const next: PendingFile[] = [];
    for (const file of selected) {
      const validation = validateAttachment(file);
      if (validation) {
        setError(`${file.name}: ${validation}`);
        continue;
      }
      next.push({ id: crypto.randomUUID(), file, role });
    }
    setFiles((current) => [...current, ...next]);
    if (next.length) setError("");
    event.target.value = "";
  }

  return (
    <div className="attachment-step">
      <section className="wizard-card">
        <div className="card-title"><div><h3>도면과 첨부파일</h3><p>파일 역할과 버전은 제출본 재현에 함께 기록됩니다.</p></div><span className="count-pill">{files.length}개</span></div>
        <div className="upload-role"><label>추가할 파일 역할<select value={role} onChange={(event) => setRole(event.target.value)}><option>위치도</option><option>현황도</option><option>계획도</option><option>배수도</option><option>공사내역서</option><option>소유권 자료</option><option>기타</option></select><ChevronDown size={16} /></label></div>
        <button type="button" className="upload-dropzone" onClick={() => fileInput.current?.click()}><span><Upload /></span><strong>파일을 선택하거나 이곳에 놓으세요</strong><p>PDF·PNG·JPG는 미리보기, DWG·DXF·DOCX·HWPX·XLSX는 원본 보관</p><small>파일당 최대 50MB · 실행 파일은 등록할 수 없습니다.</small></button>
        <input ref={fileInput} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf,.docx,.hwpx,.xlsx" onChange={addFiles} />
        {error && <div className="lookup-message"><CircleAlert size={17} />{error}</div>}
        {files.length > 0 && <div className="pending-file-list">{files.map((item, index) => <article key={item.id}><span className="file-kind">{item.file.name.split(".").pop()?.toUpperCase()}</span><div><strong>{item.file.name}</strong><small>{item.role} · v1 · {(item.file.size / 1024 / 1024).toFixed(1)}MB</small></div><span className="preview-state">{/\.(pdf|png|jpe?g)$/i.test(item.file.name) ? "미리보기 가능" : "원본 보관"}</span><button type="button" onClick={() => setFiles((current) => current.filter((file) => file.id !== item.id))} aria-label={`${item.file.name} 제거`}><Trash2 size={17} /></button><div className="file-order">{index + 1}</div></article>)}</div>}
      </section>
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
        <div className="card-title"><div><h3>공사 개요와 일정</h3><p>단위와 기준일이 필요한 수치는 근거 자료와 함께 확인하세요.</p></div></div>
        <div className="form-grid"><label className="wide">공사 개요 <span>필수</span><textarea rows={3} value={caseRecord.constructionSummary} onChange={(event) => patchCase({ constructionSummary: event.target.value })} placeholder="주요 공종과 시공 범위를 입력하세요." /></label><label>예정 착수일<input type="date" value={caseRecord.projectPeriod.start} onChange={(event) => patchCase({ projectPeriod: { ...caseRecord.projectPeriod, start: event.target.value } })} /></label><label>예정 완료일<input type="date" value={caseRecord.projectPeriod.end} onChange={(event) => patchCase({ projectPeriod: { ...caseRecord.projectPeriod, end: event.target.value } })} /></label><label className="wide">공정 일정<textarea rows={3} value={caseRecord.scheduleSummary} onChange={(event) => patchCase({ scheduleSummary: event.target.value })} placeholder="예: 토공 45일 → 배수공 30일 → 포장·마감 45일" /></label></div>
      </section>
      <section className="wizard-card cost-card"><div className="card-title"><div><h3>공사 비용</h3><p>수량 × 단가 합계이며 공식 적산 결과로 자동 인증하지 않습니다.</p></div><button type="button" className="button button-secondary compact" onClick={addCost}><Plus size={17} /> 공종 추가</button></div><div className="cost-table"><div className="cost-header"><span>공종</span><span>규격</span><span>단위</span><span>수량</span><span>단가</span><span>금액</span><span /></div>{caseRecord.costItems.map((item) => <div className="cost-row" key={item.id}><input aria-label="공종" value={item.workType} onChange={(event) => patchCost(item.id, { workType: event.target.value })} /><input aria-label="규격" value={item.specification} onChange={(event) => patchCost(item.id, { specification: event.target.value })} /><input aria-label="단위" value={item.unit} onChange={(event) => patchCost(item.id, { unit: event.target.value })} /><input aria-label="수량" type="number" min="0" value={item.quantity || ""} onChange={(event) => patchCost(item.id, { quantity: Number(event.target.value) })} /><input aria-label="단가" type="number" min="0" value={item.unitPrice || ""} onChange={(event) => patchCost(item.id, { unitPrice: Number(event.target.value) })} /><strong>{(item.quantity * item.unitPrice).toLocaleString("ko-KR")}원</strong><button type="button" onClick={() => patchCase({ costItems: caseRecord.costItems.filter((cost) => cost.id !== item.id) })} aria-label="공종 제거"><Trash2 size={16} /></button></div>)}{!caseRecord.costItems.length && <div className="empty-cost">공종을 추가하면 수량과 단가로 합계를 계산합니다.</div>}<div className="cost-total"><span>작성 내역 합계</span><strong>{total.toLocaleString("ko-KR")}원</strong></div></div></section>
      <section className="wizard-card form-card"><div className="card-title"><div><h3>안전·환경 대책</h3><p>현장 조건에 맞는 실행 계획을 작성합니다.</p></div></div><div className="form-grid"><label className="wide">안전 대책 <span>필수</span><textarea rows={4} value={caseRecord.safetyPlan} onChange={(event) => patchCase({ safetyPlan: event.target.value })} placeholder="출입 통제, 장비 작업, 사면 안정 등" /></label><label className="wide">환경 대책 <span>필수</span><textarea rows={4} value={caseRecord.environmentPlan} onChange={(event) => patchCase({ environmentPlan: event.target.value })} placeholder="비산먼지, 소음, 오탁수, 폐기물 관리 등" /></label></div></section>
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
  return <div className="plan-step"><section className="wizard-card plan-editor"><div className="card-title"><div><h3>사업계획서 본문</h3><p>자동 채움 값은 출처와 사용자가 수정했는지 함께 관리합니다.</p></div><span className="template-pill">개발행위 기본서식 1.0</span></div><div className="source-summary"><FileCheck2 size={18} /><div><strong>사건 공통값 연결됨</strong><span>{caseRecord.parcels.length}필지 · {caseRecord.permits.length}개 절차 · 신청인 {caseRecord.applicantName || "미입력"}</span></div></div>{fields.map((field) => <label className="editor-field" key={field.key}><div><strong>{field.label}</strong><span>{field.hint}</span></div><textarea rows={field.key === "overview" ? 7 : 6} value={caseRecord.planBody[field.key]} onChange={(event) => patchCase({ planBody: { ...caseRecord.planBody, [field.key]: event.target.value } })} placeholder={`${field.label} 내용을 작성하세요.`} /><small>사용자 입력 · 마지막 임시저장 시각 {new Date(caseRecord.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</small></label>)}</section></div>;
}

function ReviewStep({ caseRecord, pendingFiles, onExport }: { caseRecord: CaseRecord; pendingFiles: PendingFile[]; onExport: (type: "pdf" | "docx") => Promise<void> }) {
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const validation = documentValidationErrors(caseRecord);
  const totalArea = caseRecord.parcels.reduce((sum, parcel) => sum + (parcel.ledgerAreaM2 ?? 0), 0);
  const totalCost = caseRecord.costItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  async function runExport(type: "pdf" | "docx") { setExporting(type); try { await onExport(type); } finally { setExporting(null); } }
  return (
    <div className="review-step step-grid">
      <section className="wizard-card review-summary"><div className="card-title"><div><h3>업무 검토</h3><p>저장될 값과 누락 항목을 확인합니다.</p></div>{validation.length ? <span className="review-warning">{validation.length}개 확인</span> : <span className="review-ok"><Check size={14} /> 준비됨</span>}</div>{validation.length > 0 && <div className="review-errors">{validation.map((item) => <p key={item}><CircleAlert size={16} />{item}</p>)}</div>}<dl><div><dt>업무명</dt><dd>{caseRecord.title || "미입력"}</dd></div><div><dt>신청인</dt><dd>{caseRecord.applicantName || "미입력"}</dd></div><div><dt>대표 필지</dt><dd>{caseRecord.parcels[0]?.address || "미선택"}</dd></div><div><dt>필지 합계</dt><dd>{caseRecord.parcels.length}필지 · {totalArea.toLocaleString("ko-KR")}㎡</dd></div><div><dt>허가 구성</dt><dd>{caseRecord.permits.map((permit) => `${permit.name}(${permit.applicationKind === "new" ? "신규" : "변경"})`).join(" · ") || "미선택"}</dd></div><div><dt>접수</dt><dd>{caseRecord.receipts.length ? `${caseRecord.receipts.length}건 등록` : "접수 전 초안"}</dd></div><div><dt>첨부</dt><dd>{caseRecord.attachments.length + pendingFiles.length}개</dd></div><div><dt>공사비 합계</dt><dd>{totalCost.toLocaleString("ko-KR")}원</dd></div></dl></section>
      <section className="wizard-card output-card"><div className="card-title"><div><h3>문서 미리보기 및 출력</h3><p>생성 당시 값과 첨부 버전이 문서 버전으로 고정됩니다.</p></div></div><div className="paper-preview"><div className="paper-head"><span>사업계획서</span><strong>{caseRecord.title || "제목 없는 업무"}</strong><small>개발행위 기본서식 1.0</small></div><div className="paper-section"><b>01 대상 필지</b><p>{caseRecord.parcels.map((parcel) => parcel.address).join(" · ") || "필지 미선택"}</p></div><div className="paper-section"><b>02 허가 및 관련 절차</b><p>{caseRecord.permits.map((permit) => permit.name).join(" · ") || "허가 미선택"}</p></div><div className="paper-section"><b>03 사업 개요</b><p>{caseRecord.planBody.overview || caseRecord.projectPurpose || "내용 미입력"}</p></div><div className="paper-lines"><i /><i /><i /></div><div className="paper-notice">참고용 · 제출 전 관할기관 확인 필요</div></div><div className="output-actions"><button type="button" className="button button-secondary" onClick={() => runExport("docx")} disabled={Boolean(exporting)}>{exporting === "docx" ? <LoaderCircle className="spin" size={18} /> : <FileText size={18} />} DOCX 생성</button><button type="button" className="button button-primary" onClick={() => runExport("pdf")} disabled={Boolean(exporting)}>{exporting === "pdf" ? <LoaderCircle className="spin" size={18} /> : <FileCheck2 size={18} />} PDF 생성</button></div><p className="output-notice">출력물에는 작성자·버전·출처일과 참고용 고지가 포함됩니다.</p></section>
    </div>
  );
}
