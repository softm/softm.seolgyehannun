import { ArrowLeft, ChevronDown, Download, FilePenLine, FileText, Save, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { DocumentDraftEditor } from "../components/DocumentDraftEditor";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth, useCases } from "../context";
import { normalizeCaseRecord } from "../domain/caseRecord";
import { buildCaseDocumentModels, documentReviewWarnings, documentValidationErrors } from "../domain/documentModel";
import { applicableDocumentTemplates, ensureDocumentDrafts, resolveDocumentSource } from "../domain/documentTemplates";
import { exportCaseDocx, exportCasePdf } from "../services/documentExport";
import { generateAndOpenCaseDocument, openPrivateDocument } from "../services/generatedDocuments";
import { loadCaseSubcollections } from "../services/caseRepository";
import type { CaseRecord } from "../types";

type DocumentListFilter = "all" | "attention" | "ready" | "generated";
type DocumentListTone = "danger" | "warning" | "ready" | "current";

interface DocumentListEntry {
  caseRecord: CaseRecord;
  latest?: CaseRecord["documentVersions"][number];
  modelCount: number;
  errorCount: number;
  reviewCount: number;
  submissionStale: boolean;
  statusLabel: string;
  statusTone: DocumentListTone;
  searchText: string;
}

function countDefaultReviewFields(caseRecord: CaseRecord): number {
  const drafts = ensureDocumentDrafts(caseRecord);
  const selectedDrafts = new Map(drafts.filter((item) => item.selected).map((item) => [item.templateId, item]));
  return applicableDocumentTemplates(caseRecord)
    .filter((template) => selectedDrafts.has(template.id))
    .flatMap((template) => template.fields.map((field) => ({ field, draft: selectedDrafts.get(template.id) })))
    .filter(({ field, draft }) => {
      if (resolveDocumentSource(caseRecord, field.sourceKey).trim()) return false;
      const defaultValue = typeof field.defaultContent === "function" ? field.defaultContent(caseRecord) : field.defaultContent ?? "";
      return Boolean(defaultValue.trim()) && !Object.prototype.hasOwnProperty.call(draft?.overrides ?? {}, field.id);
    }).length;
}

function makeDocumentListEntry(caseRecord: CaseRecord): DocumentListEntry {
  const latest = [...caseRecord.documentVersions]
    .filter((item) => item.status === "ready")
    .sort((a, b) => b.version - a.version || b.createdAt.localeCompare(a.createdAt))[0];
  const errorCount = documentValidationErrors(caseRecord).length;
  const reviewCount = documentReviewWarnings(caseRecord).length + countDefaultReviewFields(caseRecord);
  const modelCount = buildCaseDocumentModels(caseRecord).length;
  const latestTime = latest ? new Date(latest.createdAt).getTime() : 0;
  const updatedTime = new Date(caseRecord.updatedAt).getTime();
  const submissionStale = Boolean(latest && Number.isFinite(latestTime) && Number.isFinite(updatedTime) && updatedTime > latestTime);
  let statusLabel = "출력 가능";
  let statusTone: DocumentListTone = "ready";

  if (errorCount) {
    statusLabel = `필수 확인 ${errorCount}건`;
    statusTone = "danger";
  } else if (reviewCount) {
    statusLabel = `검토 필요 ${reviewCount}건`;
    statusTone = "warning";
  } else if (submissionStale) {
    statusLabel = "새 제출본 필요";
    statusTone = "warning";
  } else if (latest) {
    statusLabel = `제출본 v${latest.version} 최신`;
    statusTone = "current";
  }

  const representativeParcel = caseRecord.parcels[0]?.address ?? "";
  const searchText = [
    caseRecord.title,
    caseRecord.id,
    caseRecord.applicantName,
    caseRecord.primaryPermitName,
    caseRecord.jurisdictionName,
    ...caseRecord.parcels.flatMap((parcel) => [parcel.address, parcel.roadAddress ?? "", parcel.lotNumber ?? ""]),
  ].join(" ").toLowerCase();

  return { caseRecord, latest, modelCount, errorCount, reviewCount, submissionStale, statusLabel, statusTone, searchText };
}

function needsDocumentAttention(entry: DocumentListEntry): boolean {
  return Boolean(entry.errorCount || entry.reviewCount || entry.submissionStale);
}

export function DocumentsPage() {
  const { caseId } = useParams<{ caseId?: string }>();
  const { user } = useAuth();
  const { cases, loading, persistCase } = useCases();
  const [displayCases, setDisplayCases] = useState<CaseRecord[]>(cases.map(normalizeCaseRecord));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocumentListFilter>("all");
  const [sortOrder, setSortOrder] = useState<"recent" | "title">("recent");
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const entries = useMemo(() => displayCases.map(makeDocumentListEntry), [displayCases]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries
      .filter((entry) => !normalizedQuery || entry.searchText.includes(normalizedQuery))
      .filter((entry) => {
        if (statusFilter === "attention") return needsDocumentAttention(entry);
        if (statusFilter === "ready") return !needsDocumentAttention(entry);
        if (statusFilter === "generated") return Boolean(entry.latest);
        return true;
      })
      .sort((a, b) => sortOrder === "title"
        ? a.caseRecord.title.localeCompare(b.caseRecord.title, "ko")
        : new Date(b.caseRecord.updatedAt).getTime() - new Date(a.caseRecord.updatedAt).getTime());
  }, [entries, query, sortOrder, statusFilter]);
  const summary = useMemo(() => ({
    all: entries.length,
    attention: entries.filter(needsDocumentAttention).length,
    ready: entries.filter((entry) => !needsDocumentAttention(entry)).length,
    generated: entries.filter((entry) => entry.latest).length,
  }), [entries]);
  const viewer = user?.role === "viewer";

  useEffect(() => {
    let active = true;
    if (user?.isDemo) {
      setDisplayCases(cases.map(normalizeCaseRecord));
      return () => { active = false; };
    }
    void Promise.all(cases.map(loadCaseSubcollections)).then((loaded) => {
      if (active) setDisplayCases(loaded.map(normalizeCaseRecord));
    }).catch((reason) => {
      if (active) setMessage(reason instanceof Error ? reason.message : "문서 버전을 불러오지 못했습니다.");
    });
    return () => { active = false; };
  }, [cases, user?.isDemo]);

  async function generate(caseRecord: CaseRecord, type: "pdf" | "docx", templateId?: string) {
    if (viewer) return;
    const pendingKey = `${caseRecord.id}-${templateId ? `${templateId}-` : ""}${type}`;
    setPending(pendingKey);
    setMessage("");
    try {
      if (templateId) {
        if (type === "pdf") await exportCasePdf(caseRecord, templateId);
        else await exportCaseDocx(caseRecord, templateId);
        const documentName = buildCaseDocumentModels(caseRecord, [templateId])[0]?.title ?? "선택 문서";
        setMessage(`${documentName} ${type.toUpperCase()} 파일을 개별 다운로드했습니다.`);
      } else if (user?.isDemo) {
        if (type === "pdf") await exportCasePdf(caseRecord);
        else await exportCaseDocx(caseRecord);
        setMessage(`선택 문서 전체 ${type.toUpperCase()} 파일을 만들었습니다.`);
      } else {
        const result = await generateAndOpenCaseDocument(caseRecord, type);
        setDisplayCases((current) => current.map((item) => item.id === caseRecord.id ? {
          ...item,
          documentVersions: [...item.documentVersions, {
            id: result.documentId,
            caseId: item.id,
            version: result.version,
            type: "bundle",
            status: "ready",
            pdfPath: result.pdfPath,
            docxPath: result.docxPath,
            templateVersion: "인허가 문서 묶음 1.0",
            sourceSnapshotAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: user?.uid ?? "",
            notice: "업무 보조용 · 제출 전 관할기관 확인 필요",
            templateIds: buildCaseDocumentModels(caseRecord).map((model) => model.templateId),
          }],
        } : item));
        setMessage(`제출본 v${result.version}을 비공개 저장소에 생성했습니다.`);
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "문서를 생성하지 못했습니다.");
    } finally {
      setPending("");
    }
  }

  async function openExisting(path: string, label: string, successMessage?: string) {
    setPending(label);
    setMessage("");
    try {
      await openPrivateDocument(path);
      setMessage(successMessage ?? "저장된 제출본을 열었습니다.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "문서를 열지 못했습니다.");
    } finally {
      setPending("");
    }
  }

  if (caseId) {
    const selected = displayCases.find((item) => item.id === caseId) ?? cases.find((item) => item.id === caseId);
    if (!selected && loading) return <LoadingScreen label="문서 작업실을 준비하고 있습니다" />;
    if (!selected && !loading) return <Navigate to="/app/documents" replace />;
    if (selected) return <DocumentWorkspace
      caseRecord={selected}
      viewer={viewer}
      pending={pending}
      message={message}
      onMessage={setMessage}
      onSave={async (next) => {
        setPending(`${next.id}-save`);
        setMessage("");
        try {
          const saved = await persistCase(next);
          setDisplayCases((current) => current.map((item) => item.id === saved.id ? saved : item));
          setMessage("문서 초안을 저장했습니다. 기존 제출본은 변경되지 않습니다.");
        } catch (reason) {
          setMessage(reason instanceof Error ? reason.message : "문서 초안을 저장하지 못했습니다.");
        } finally {
          setPending("");
        }
      }}
      onGenerate={generate}
      onOpenExisting={openExisting}
    />;
  }

  return (
    <div className="simple-page documents-page">
      <header className="page-header"><div><span className="page-kicker">작성·검토·제출본</span><h1>문서</h1><p>업무별 작성 상태를 확인하고 필요한 문서와 최신 제출본을 관리합니다.</p></div></header>
      <section className="document-overview" aria-label="문서 업무 현황">
        {([
          ["all", "전체 업무", summary.all],
          ["attention", "확인 필요", summary.attention],
          ["ready", "출력 가능", summary.ready],
          ["generated", "제출본 있음", summary.generated],
        ] as const).map(([filter, label, count]) => (
          <button type="button" key={filter} className={statusFilter === filter ? "active" : ""} aria-pressed={statusFilter === filter} onClick={() => setStatusFilter(filter)}>
            <span>{label}</span><strong>{count}</strong>
          </button>
        ))}
      </section>
      <div className="document-list-guide"><ShieldCheck size={17} aria-hidden="true" /><span><strong>제출본은 버전별로 보존됩니다.</strong> {viewer ? "열람자는 생성된 버전을 열람할 수 있습니다." : "초안을 수정해도 기존 제출본은 변경되지 않습니다."}</span></div>
      {message && <div className="settings-save-message" role="status">{message}</div>}
      <section className="table-card document-list-card">
        <div className="table-toolbar document-list-toolbar">
          <div className="search-field"><Search size={18} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="업무명·사건번호·필지 검색" aria-label="문서 업무 통합 검색" />{query && <button type="button" aria-label="검색어 지우기" onClick={() => setQuery("")}><X size={16} /></button>}</div>
          <div className="document-list-filters" role="group" aria-label="문서 상태 필터">
            {([['all', '전체'], ['attention', '확인 필요'], ['ready', '출력 가능'], ['generated', '제출본']] as const).map(([filter, label]) => <button type="button" key={filter} className={statusFilter === filter ? "active" : ""} aria-pressed={statusFilter === filter} onClick={() => setStatusFilter(filter)}>{label}</button>)}
          </div>
          <label className="document-sort"><span>정렬</span><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "recent" | "title")}><option value="recent">최근 수정순</option><option value="title">업무명순</option></select></label>
          <span className="document-result-count" aria-live="polite">{filtered.length}개 업무</span>
        </div>
        <div className="document-table" role="table" aria-label="문서 업무 목록">
          <div className="document-row header" role="row"><span role="columnheader">업무</span><span role="columnheader">문서 상태</span><span role="columnheader">최근 수정</span><span role="columnheader">작성·제출본</span></div>
          {filtered.map((entry) => {
            const { caseRecord, latest } = entry;
            const actionLabel = viewer ? "문서 보기" : entry.errorCount ? "오류 확인" : entry.reviewCount ? "검토 계속" : entry.submissionStale ? "변경 검토" : latest ? "문서 열기" : "작성 시작";
            const updatedAt = new Date(caseRecord.updatedAt);
            const docxPending = pending === `${caseRecord.id}-saved-docx`;
            const pdfPending = pending === `${caseRecord.id}-saved-pdf`;
            return (
              <div className="document-row" role="row" key={caseRecord.id}>
                <div className="document-case-cell" role="cell"><span className="document-icon"><FileText aria-hidden="true" /></span><div><strong title={caseRecord.title}>{caseRecord.title}</strong><small>{caseRecord.id} · {caseRecord.primaryPermitName}</small><span>{caseRecord.parcels[0]?.address ?? "대표 필지 미입력"}</span></div></div>
                <div className="document-status-cell" role="cell"><span className={`document-state ${entry.statusTone}`}>{entry.statusLabel}</span><small>{entry.modelCount}종 문서 · {latest ? `제출본 v${latest.version}${entry.submissionStale ? " 이후 수정" : ""}` : "제출본 없음"}</small></div>
                <time className="document-updated" role="cell" dateTime={caseRecord.updatedAt}>{Number.isNaN(updatedAt.getTime()) ? "-" : updatedAt.toLocaleDateString("ko-KR")}</time>
                <div className="document-actions" role="cell">
                  <Link to={`/app/documents/${caseRecord.id}`} aria-label={`${caseRecord.title} ${actionLabel}`}><FilePenLine size={16} aria-hidden="true" /> {actionLabel}</Link>
                  {(latest?.docxPath || latest?.pdfPath) && <details className="document-download-menu"><summary aria-label={`${caseRecord.title} 제출본 v${latest.version} 다운로드`}><Download size={16} aria-hidden="true" /> 제출본 받기 <ChevronDown size={14} aria-hidden="true" /></summary><div className="document-download-options">{latest.docxPath && <button type="button" onClick={() => void openExisting(latest.docxPath!, `${caseRecord.id}-saved-docx`, `${caseRecord.title} 제출본 v${latest.version} DOCX를 열었습니다.`)} disabled={docxPending} aria-busy={docxPending}><Download size={15} aria-hidden="true" /> {docxPending ? "여는 중…" : `v${latest.version} DOCX`}</button>}{latest.pdfPath && <button type="button" onClick={() => void openExisting(latest.pdfPath!, `${caseRecord.id}-saved-pdf`, `${caseRecord.title} 제출본 v${latest.version} PDF를 열었습니다.`)} disabled={pdfPending} aria-busy={pdfPending}><Download size={15} aria-hidden="true" /> {pdfPending ? "여는 중…" : `v${latest.version} PDF`}</button>}</div></details>}
                </div>
              </div>
            );
          })}
          {!filtered.length && <div className="document-list-empty" role="status"><FileText aria-hidden="true" /><strong>{entries.length ? "조건에 맞는 업무가 없습니다." : "아직 작성할 문서가 없습니다."}</strong><span>{entries.length ? "검색어나 상태 필터를 초기화해 보세요." : "새 업무를 등록하면 필요한 문서가 자동으로 구성됩니다."}</span>{entries.length ? <button type="button" onClick={() => { setQuery(""); setStatusFilter("all"); }}>검색·필터 초기화</button> : !viewer && <Link to="/app/cases/new">새 업무 등록</Link>}</div>}
        </div>
      </section>
    </div>
  );
}

function DocumentWorkspace({
  caseRecord,
  viewer,
  pending,
  message,
  onMessage,
  onSave,
  onGenerate,
  onOpenExisting,
}: {
  caseRecord: CaseRecord;
  viewer: boolean;
  pending: string;
  message: string;
  onMessage: (message: string) => void;
  onSave: (caseRecord: CaseRecord) => Promise<void>;
  onGenerate: (caseRecord: CaseRecord, type: "pdf" | "docx", templateId?: string) => Promise<void>;
  onOpenExisting: (path: string, label: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(caseRecord);
  const models = buildCaseDocumentModels(draft);
  const errors = documentValidationErrors(draft);
  const warnings = documentReviewWarnings(draft);
  const defaultReviewCount = useMemo(() => countDefaultReviewFields(draft), [draft]);
  const reviewNeeded = warnings.length + defaultReviewCount;
  const savePending = pending === `${draft.id}-save`;
  const dirty = draft.updatedAt !== caseRecord.updatedAt;
  const saveFailed = message.includes("초안을 저장하지 못했습니다");
  const canGenerate = Boolean(models.length) && !errors.length;

  useEffect(() => setDraft(caseRecord), [caseRecord]);

  useEffect(() => {
    if (!dirty) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function patchDraft(patch: Partial<CaseRecord>) {
    setDraft((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
    onMessage("");
  }

  return (
    <div className="simple-page document-studio-page">
      <header className="page-header document-studio-header"><div><Link to="/app/documents" className="back-link" onClick={(event) => { if (dirty && !window.confirm("저장하지 않은 변경사항이 있습니다. 문서 목록으로 이동할까요?")) event.preventDefault(); }}><ArrowLeft size={16} /> 문서 목록</Link><span className="page-kicker">{caseRecord.id}</span><h1>{caseRecord.title}</h1><div className="studio-subline"><span>{models.length}종 문서 · 공통정보 연결</span><span className={`draft-save-state ${savePending ? "saving" : saveFailed ? "failed" : dirty ? "dirty" : "saved"}`}>{savePending ? "저장 중…" : saveFailed ? "저장 실패 · 다시 시도해 주세요" : dirty ? "저장할 변경사항 있음" : `저장됨 ${new Date(caseRecord.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`}</span></div></div><div className="studio-actions"><button type="button" className="button button-secondary" onClick={() => void onSave(draft)} disabled={viewer || Boolean(pending) || !dirty}><Save size={17} /> {savePending ? "저장 중" : "초안 저장"}</button><button type="button" className="button button-secondary" onClick={() => void onGenerate(draft, "docx")} disabled={viewer || Boolean(pending) || !canGenerate} title={errors.length ? "필수 항목을 확인한 뒤 제출본을 생성할 수 있습니다." : undefined}><Sparkles size={17} /> 선택 문서 DOCX</button><button type="button" className="button button-primary" onClick={() => void onGenerate(draft, "pdf")} disabled={viewer || Boolean(pending) || !canGenerate} title={errors.length ? "필수 항목을 확인한 뒤 제출본을 생성할 수 있습니다." : undefined}><Sparkles size={17} /> 선택 문서 PDF</button></div></header>
      {message && <div className="settings-save-message" role="status">{message}</div>}
      <div className={`document-health ${errors.length ? "has-errors" : reviewNeeded ? "needs-review" : "ready"}`}><ShieldCheck size={19} /><div><strong>{errors.length ? `출력 전 필수 확인 ${errors.length}건` : reviewNeeded ? `출력 전 검토 ${reviewNeeded}건` : "선택 문서 출력 준비 완료"}</strong><span>{errors.length ? "초안은 저장할 수 있으며, 필수 항목을 채우면 PDF·DOCX 생성이 활성화됩니다." : reviewNeeded ? `기본문구 ${defaultReviewCount}건 · 제출자료 등 ${warnings.length}건 · 초안 출력은 가능합니다.` : `검토 완료 · 제출 묶음 ${models.length}종`}</span></div>{errors.length ? <span className="document-health-count">필수 {errors.length}</span> : reviewNeeded ? <span className="document-health-count review">검토 필요</span> : <span className="document-health-count ready">준비 완료</span>}</div>
      <DocumentDraftEditor caseRecord={draft} onChange={patchDraft} onDownload={(templateId, type) => void onGenerate(draft, type, templateId)} downloadPending={pending} readOnly={viewer} />
      <section className="table-card version-history"><div className="card-title"><div><h3>제출본 버전</h3><p>생성 시점의 사건 값과 문서 선택을 고정한 이력입니다.</p></div></div>{caseRecord.documentVersions.length ? <div className="version-list">{[...caseRecord.documentVersions].sort((a, b) => b.version - a.version).map((version) => <article key={version.id}><div><strong>제출본 v{version.version}</strong><small>{new Date(version.createdAt).toLocaleString("ko-KR")} · {version.templateIds?.length ?? "기존"}종 문서</small></div><span>{version.submittedAt ? "제출 완료" : "생성 완료"}</span><div>{version.docxPath && <button type="button" onClick={() => void onOpenExisting(version.docxPath!, `${version.id}-docx`)}><Download size={15} /> DOCX</button>}{version.pdfPath && <button type="button" onClick={() => void onOpenExisting(version.pdfPath!, `${version.id}-pdf`)}><Download size={15} /> PDF</button>}</div></article>)}</div> : <div className="empty-version"><FileText /><strong>아직 생성된 제출본이 없습니다.</strong><span>오른쪽 위에서 DOCX 또는 PDF를 생성하면 이력으로 보존됩니다.</span></div>}</section>
    </div>
  );
}
