import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  FileText,
  Filter,
  List,
  Map as MapIcon,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useAuth, useCases } from "../context";
import { deadlineDistance, deadlineLabel, isOverdue } from "../domain/deadline";
import { canTransitionStatus, defaultStatuses, validateCompletion } from "../domain/status";
import { documentValidationErrors } from "../domain/documentModel";
import { exportCaseDocx, exportCasePdf } from "../services/documentExport";
import { generateAndOpenCaseDocument } from "../services/generatedDocuments";
import { attachmentDownloadUrl } from "../services/storage";
import { subscribeOrganizationConfiguration } from "../services/organizationRepository";
import type { AttachmentRecord, CaseRecord, CaseStatus, CaseStatusId } from "../types";
import { ParcelMap } from "../components/ParcelMap";
import { StatusBadge } from "../components/StatusBadge";

type DetailTab = "overview" | "deadline" | "files" | "history";

export function DashboardPage({ listOnly = false }: { listOnly?: boolean }) {
  const { user } = useAuth();
  const { cases, loading, error, selectedCase, selectedCaseId, selectCase, persistCase } = useCases();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CaseStatusId | "all">("all");
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [detailOpen, setDetailOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [customStatuses, setCustomStatuses] = useState<CaseStatus[]>([]);

  useEffect(() => {
    if (!user?.organizationId) return;
    return subscribeOrganizationConfiguration(user.organizationId, user.isDemo, (configuration) => {
      setCustomStatuses(configuration.customStatuses);
    });
  }, [user]);

  const allStatuses = useMemo(
    () => [...defaultStatuses, ...customStatuses].sort((a, b) => a.order - b.order),
    [customStatuses],
  );

  const filteredCases = useMemo(() => {
    const normalized = query.trim().replace(/\s+/g, "").toLowerCase();
    return cases
      .filter((item) => statusFilter === "all" || item.status === statusFilter)
      .filter((item) => !normalized || [item.title, item.primaryPermitName, item.assigneeName, ...item.parcels.map((parcel) => parcel.address)]
        .join("").replace(/\s+/g, "").toLowerCase().includes(normalized))
      .sort((a, b) => {
        if (!a.nextDeadlineAt) return 1;
        if (!b.nextDeadlineAt) return -1;
        return a.nextDeadlineAt.localeCompare(b.nextDeadlineAt);
      });
  }, [cases, query, statusFilter]);

  const overview = useMemo(() => ({
    dueToday: cases.filter((item) => item.nextDeadlineAt && deadlineDistance(item.nextDeadlineAt) === 0).length,
    revision: cases.filter((item) => item.status === "revision-requested").length,
    overdue: cases.filter((item) => isOverdue(item.nextDeadlineAt) && item.status !== "completed").length,
  }), [cases]);

  function openCase(caseId: string) {
    selectCase(caseId);
    setDetailOpen(true);
    setDetailTab("overview");
  }

  async function changeStatus(nextStatus: CaseStatusId) {
    if (!selectedCase || user?.role === "viewer") return;
    if (!canTransitionStatus(selectedCase.status, nextStatus)) {
      setNotice("현재 상태에서 바로 이동할 수 없습니다.");
      return;
    }
    if (nextStatus === "completed") {
      const errors = validateCompletion(selectedCase);
      if (errors.length) {
        setNotice(errors[0]);
        return;
      }
    }
    try {
      await persistCase({ ...selectedCase, status: nextStatus });
      setNotice("상태를 변경했습니다.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "상태를 저장하지 못했습니다.");
    }
  }

  async function exportDocument(type: "pdf" | "docx") {
    if (!selectedCase) return;
    const errors = documentValidationErrors(selectedCase);
    if (errors.length) {
      setNotice(`출력 전 확인: ${errors[0]}`);
      return;
    }
    setExporting(type);
    try {
      if (user?.isDemo) {
        if (type === "pdf") await exportCasePdf(selectedCase);
        else await exportCaseDocx(selectedCase);
        setNotice(`${type.toUpperCase()} 체험 파일을 만들었습니다.`);
      } else {
        const result = await generateAndOpenCaseDocument(selectedCase, type);
        setNotice(`서버 문서 v${result.version}을 생성해 ${type.toUpperCase()}를 열었습니다.`);
      }
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "문서를 만들지 못했습니다.");
    } finally {
      setExporting(null);
    }
  }

  async function openAttachment(attachment: AttachmentRecord) {
    if (user?.isDemo) {
      setNotice("체험 자료는 파일 정보만 표시합니다. Firebase Storage 연결 후 미리보기·다운로드가 작동합니다.");
      return;
    }
    const previewWindow = window.open("about:blank", "_blank");
    if (previewWindow) previewWindow.opener = null;
    try {
      const url = await attachmentDownloadUrl(attachment.storagePath);
      if (!url) throw new Error("파일 경로를 확인하지 못했습니다.");
      if (previewWindow) previewWindow.location.href = url;
      else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.click();
      }
      setNotice(attachment.previewable ? "비공개 미리보기를 열었습니다." : "비공개 원본 파일을 열었습니다.");
    } catch (reason) {
      previewWindow?.close();
      setNotice(reason instanceof Error ? reason.message : "파일을 열지 못했습니다.");
    }
  }

  return (
    <div className="dashboard-page">
      <header className="page-header dashboard-header">
        <div>
          <span className="page-kicker">{listOnly ? "전체 업무" : "오늘의 업무"}</span>
          <h1>{listOnly ? "업무 목록" : `${user?.displayName}님, 이어서 처리할 업무예요`}</h1>
          <p>{listOnly ? "필지, 허가, 담당자와 기한을 한 번에 검색할 수 있습니다." : "가장 가까운 기한과 보완 요청부터 정리했습니다."}</p>
        </div>
        <Link className="button button-primary" to="/app/cases/new"><Plus size={18} /> 새 업무</Link>
      </header>

      {!listOnly && (
        <section className="summary-cards" aria-label="오늘의 업무 요약">
          <article><span className="summary-icon mint"><CalendarClock /></span><div><small>오늘 마감</small><strong>{overview.dueToday}<em>건</em></strong><p>오늘 확인이 필요한 기한</p></div><ArrowRight /></article>
          <article><span className="summary-icon orange"><ClipboardList /></span><div><small>보완 요청</small><strong>{overview.revision}<em>건</em></strong><p>제출자료 준비가 필요한 업무</p></div><ArrowRight /></article>
          <article><span className="summary-icon red"><AlertTriangle /></span><div><small>지연</small><strong>{overview.overdue}<em>건</em></strong><p>기한과 다음 행동을 확인하세요</p></div><ArrowRight /></article>
        </section>
      )}

      <section className="workspace-card">
        <div className="workspace-toolbar">
          <div className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="업무명, 지번, 담당자 검색" aria-label="업무 검색" />{query && <button type="button" onClick={() => setQuery("")} aria-label="검색어 지우기"><X size={16} /></button>}</div>
          <div className="status-filters" aria-label="상태 필터">
            <button type="button" className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>전체 <span>{cases.length}</span></button>
            {defaultStatuses.filter((item) => ["processing", "revision-requested", "completed"].includes(item.id)).map((status) => (
              <button type="button" key={status.id} className={statusFilter === status.id ? "active" : ""} onClick={() => setStatusFilter(status.id)}>{status.label} <span>{cases.filter((item) => item.status === status.id).length}</span></button>
            ))}
          </div>
          <button type="button" className="filter-button"><Filter size={17} /> 필터 <ChevronDown size={15} /></button>
          {!listOnly && (
            <div className="mobile-view-switch" role="group" aria-label="목록 지도 전환">
              <button type="button" className={mobileView === "list" ? "active" : ""} onClick={() => setMobileView("list")}><List size={17} /> 목록</button>
              <button type="button" className={mobileView === "map" ? "active" : ""} onClick={() => setMobileView("map")}><MapIcon size={17} /> 지도</button>
            </div>
          )}
        </div>

        {error && <div className="inline-error" role="alert">{error}</div>}
        <div className={`case-workspace ${listOnly ? "list-only" : ""} mobile-${mobileView}`}>
          <div className="case-list-panel">
            <div className="case-list-head"><span>{filteredCases.length}개 업무</span><button type="button">기한 임박순 <ChevronDown size={14} /></button></div>
            {loading ? (
              <div className="case-list-loading">업무를 불러오는 중입니다…</div>
            ) : filteredCases.length ? (
              <div className="case-list">
                {filteredCases.map((caseRecord) => (
                  <CaseListItem key={caseRecord.id} caseRecord={caseRecord} statuses={allStatuses} selected={caseRecord.id === selectedCaseId} onClick={() => openCase(caseRecord.id)} />
                ))}
              </div>
            ) : (
              <div className="empty-list"><Search /><strong>조건에 맞는 업무가 없습니다</strong><span>검색어나 상태 필터를 바꿔보세요.</span></div>
            )}
          </div>

          {!listOnly && (
            <div className="case-map-panel">
              <ParcelMap cases={filteredCases} selectedCaseId={selectedCaseId} onCaseSelect={openCase} />
              {selectedCase && (
                <CaseDetailCard
                  caseRecord={selectedCase}
                  tab={detailTab}
                  setTab={setDetailTab}
                  open={detailOpen}
                  close={() => setDetailOpen(false)}
                  onStatusChange={changeStatus}
                  onExport={exportDocument}
                  exporting={exporting}
                  viewer={user?.role === "viewer"}
                  statuses={allStatuses}
                  onAttachmentOpen={openAttachment}
                />
              )}
            </div>
          )}
        </div>
      </section>

      {notice && <div className="toast" role="status"><CheckCircle2 size={18} />{notice}<button type="button" onClick={() => setNotice("")} aria-label="알림 닫기"><X size={16} /></button></div>}
    </div>
  );
}

function CaseListItem({ caseRecord, statuses, selected, onClick }: { caseRecord: CaseRecord; statuses: CaseStatus[]; selected: boolean; onClick: () => void }) {
  const deadline = caseRecord.nextDeadlineAt;
  const distance = deadline ? deadlineDistance(deadline) : null;
  return (
    <button type="button" className={`case-list-item ${selected ? "selected" : ""}`} onClick={onClick}>
      <div className="case-item-top"><StatusBadge status={caseRecord.status} statuses={statuses} /><span className={`deadline-chip ${distance !== null && distance < 0 ? "late" : ""}`}>{deadline ? deadlineLabel(deadline) : "기한 없음"}</span></div>
      <strong>{caseRecord.title}</strong>
      <div className="case-item-meta"><span>{caseRecord.primaryPermitName}</span><i /> <span>{caseRecord.parcels.length}필지</span><i /> <span>{caseRecord.assigneeName}</span></div>
      <div className="case-next-action"><span>{caseRecord.nextAction}</span>{deadline && <time dateTime={deadline}>{format(parseISO(deadline), "M월 d일")}</time>}</div>
    </button>
  );
}

interface CaseDetailCardProps {
  caseRecord: CaseRecord;
  tab: DetailTab;
  setTab: (tab: DetailTab) => void;
  open: boolean;
  close: () => void;
  onStatusChange: (status: CaseStatusId) => void;
  onExport: (type: "pdf" | "docx") => void;
  exporting: "pdf" | "docx" | null;
  viewer: boolean;
  statuses: CaseStatus[];
  onAttachmentOpen: (attachment: AttachmentRecord) => void;
}

function CaseDetailCard({ caseRecord, tab, setTab, open, close, onStatusChange, onExport, exporting, viewer, statuses, onAttachmentOpen }: CaseDetailCardProps) {
  return (
    <aside className={`case-detail-card ${open ? "open" : ""}`} aria-label="선택 업무 상세">
      <div className="detail-drag-handle" />
      <header>
        <div><StatusBadge status={caseRecord.status} statuses={statuses} /><span className="case-id">{caseRecord.id}</span></div>
        <div><button type="button" className="icon-button detail-close" onClick={close} aria-label="상세 닫기"><X size={19} /></button></div>
      </header>
      <div className="detail-title"><h2>{caseRecord.title}</h2><p>{caseRecord.primaryPermitName} · {caseRecord.jurisdictionName} · {caseRecord.parcels.length}필지</p></div>
      <div className="detail-tabs" role="tablist">
        {(["overview", "deadline", "files", "history"] as DetailTab[]).map((item) => (
          <button type="button" role="tab" aria-selected={tab === item} key={item} onClick={() => setTab(item)}>{({ overview: "개요", deadline: "기한", files: "자료", history: "기록" } as const)[item]}</button>
        ))}
      </div>
      <div className="detail-body">
        {tab === "overview" && (
          <>
            <div className={`next-action-box ${isOverdue(caseRecord.nextDeadlineAt) ? "late" : ""}`}>
              <div><span>다음 할 일</span><strong>{caseRecord.nextAction}</strong></div>
              <em>{caseRecord.nextDeadlineAt ? deadlineLabel(caseRecord.nextDeadlineAt) : "—"}</em>
            </div>
            <section className="detail-section"><div className="section-title"><h3>필지</h3><span>{caseRecord.parcels.length}</span></div>{caseRecord.parcels.map((parcel, index) => <div className="parcel-line" key={parcel.id}><span>{index === 0 ? "대표" : "연접"}</span><div><strong>{parcel.address}</strong><small>PNU {parcel.pnu} · {parcel.ledgerAreaM2?.toLocaleString("ko-KR") ?? "-"}㎡</small></div></div>)}</section>
            <section className="detail-section"><div className="section-title"><h3>허가 구성</h3><span>{caseRecord.permits.length}</span></div>{caseRecord.permits.map((permit) => <div className="permit-line-row" key={permit.id}><span>{permit.relation === "primary" ? "주허가" : permit.relation === "agenda" ? "의제" : "별도"}</span><strong>{permit.name}</strong><em>{permit.applicationKind === "new" ? "신규" : "변경"}</em></div>)}</section>
            <section className="detail-section"><div className="section-title"><h3>접수</h3><span>{caseRecord.receipts.length}</span></div>{caseRecord.receipts.length ? caseRecord.receipts.map((receipt) => <div className="receipt-line" key={receipt.id}><strong>{receipt.receiptNumber}</strong><small>{receipt.agency} · {receipt.sourceLabel}</small></div>) : <div className="empty-inline">아직 접수번호가 없습니다.</div>}</section>
          </>
        )}
        {tab === "deadline" && (
          <section className="detail-section deadline-list"><div className="section-title"><h3>기한과 근거</h3><span>{caseRecord.deadlines.length}</span></div>{caseRecord.deadlines.map((deadline) => <article key={deadline.id}><div><strong>{deadline.label}</strong><small>{deadline.basis}</small></div><div><em>{deadlineLabel(deadline.dueAt)}</em><time>{deadline.dueAt}</time></div>{deadline.isManual && <span>수동 조정 · {deadline.manualReason}</span>}</article>)}</section>
        )}
        {tab === "files" && (
          <section className="detail-section file-list"><div className="section-title"><h3>첨부 자료</h3><span>{caseRecord.attachments.length}</span></div>{caseRecord.attachments.length ? caseRecord.attachments.map((file) => <article key={file.id}><Paperclip size={18} /><div><strong>{file.name}</strong><small>{file.role} · v{file.version} · {(file.size / 1024 / 1024).toFixed(1)}MB</small></div><button type="button" onClick={() => onAttachmentOpen(file)} aria-label={`${file.name} ${file.previewable ? "미리보기" : "다운로드"}`}><Download size={17} /></button></article>) : <div className="empty-inline">등록된 자료가 없습니다.</div>}</section>
        )}
        {tab === "history" && (
          <section className="detail-section history-list"><div className="section-title"><h3>최근 기록</h3></div><article><span /><div><strong>{caseRecord.assigneeName}님이 업무를 수정했습니다.</strong><small>{new Date(caseRecord.updatedAt).toLocaleString("ko-KR")}</small></div></article><article><span /><div><strong>현재 문서 버전 v{caseRecord.version}</strong><small>이전 제출본은 덮어쓰지 않습니다.</small></div></article></section>
        )}
      </div>
      <footer className="detail-actions">
        <div className="status-change">
          <select value={caseRecord.status} onChange={(event) => onStatusChange(event.target.value)} disabled={viewer} aria-label="업무 상태 변경">
            {statuses.map((status) => <option value={status.id} key={status.id} disabled={!canTransitionStatus(caseRecord.status, status.id)}>{status.label}</option>)}
          </select><ChevronDown size={15} />
        </div>
        {!viewer && <Link className="button button-secondary" to={`/app/cases/${caseRecord.id}/edit?step=5`}><Pencil size={17} /> 수정</Link>}
        <Link className="button button-secondary" to={`/app/documents/${caseRecord.id}`}><FileText size={17} /> 문서 작업실</Link>
        <button type="button" className="button button-secondary" onClick={() => onExport("docx")} disabled={viewer || Boolean(exporting)} title={viewer ? "열람자는 기존 문서만 다운로드할 수 있습니다." : undefined}><FileText size={17} />{exporting === "docx" ? "생성 중" : "DOCX"}</button>
        <button type="button" className="button button-primary" onClick={() => onExport("pdf")} disabled={viewer || Boolean(exporting)} title={viewer ? "열람자는 기존 문서만 다운로드할 수 있습니다." : undefined}><Sparkles size={17} />{exporting === "pdf" ? "생성 중" : "PDF"}</button>
      </footer>
    </aside>
  );
}
