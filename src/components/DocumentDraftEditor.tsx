import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  FilePenLine,
  Link2,
  PanelRightOpen,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  applicableDocumentTemplates,
  documentFieldValue,
  ensureDocumentDrafts,
  parcelAreaTotals,
  resolveDocumentSource,
  selectedRequiredDocuments,
  templateValidation,
  updateDocumentDraft,
  type DocumentTemplateField,
} from "../domain/documentTemplates";
import { formatDocumentFieldInput } from "../domain/inputFormat";
import type { CaseRecord, DocumentDraft } from "../types";

interface DocumentDraftEditorProps {
  caseRecord: CaseRecord;
  onChange: (patch: Partial<CaseRecord>) => void;
  onDownload?: (templateId: string, type: "pdf" | "docx") => void;
  downloadPending?: string;
  readOnly?: boolean;
}

function groupFields(fields: DocumentTemplateField[]) {
  return fields.reduce<Array<{ name: string; fields: DocumentTemplateField[] }>>((groups, field) => {
    const group = groups.find((item) => item.name === field.group);
    if (group) group.fields.push(field);
    else groups.push({ name: field.group, fields: [field] });
    return groups;
  }, []);
}

function withResetField(drafts: DocumentDraft[], templateId: string, fieldId: string): DocumentDraft[] {
  return drafts.map((draft) => {
    if (draft.templateId !== templateId) return draft;
    const overrides = { ...draft.overrides };
    delete overrides[fieldId];
    return {
      ...draft,
      overrides,
      status: draft.status === "reviewed" ? "review-needed" : draft.status,
      updatedAt: new Date().toISOString(),
    };
  });
}

interface DocumentFieldState {
  value: string;
  baseValue: string;
  overridden: boolean;
  linked: boolean;
  needsDefaultReview: boolean;
  confirmedDefault: boolean;
  edited: boolean;
  canReset: boolean;
}

function fieldState(
  caseRecord: CaseRecord,
  templateId: string,
  field: DocumentTemplateField,
  draft?: DocumentDraft,
): DocumentFieldState {
  const linkedValue = resolveDocumentSource(caseRecord, field.sourceKey);
  const defaultValue = linkedValue.trim()
    ? ""
    : typeof field.defaultContent === "function"
      ? field.defaultContent(caseRecord)
      : field.defaultContent ?? "";
  const baseValue = linkedValue.trim() ? linkedValue : defaultValue;
  const overridden = Boolean(draft && Object.prototype.hasOwnProperty.call(draft.overrides, field.id));
  const overrideValue = overridden ? draft?.overrides[field.id] ?? "" : "";
  const usesDefault = !linkedValue.trim() && Boolean(defaultValue.trim());
  const confirmedDefault = usesDefault && overridden && overrideValue === defaultValue;
  const edited = overridden && Boolean(baseValue.trim()) && !confirmedDefault;

  return {
    value: documentFieldValue(caseRecord, templateId, field),
    baseValue,
    overridden,
    linked: !overridden && Boolean(linkedValue.trim()),
    needsDefaultReview: usesDefault && !overridden,
    confirmedDefault,
    edited,
    canReset: overridden && Boolean(baseValue.trim()),
  };
}

function inputId(templateId: string, fieldId: string): string {
  return `document-field-${templateId}-${fieldId}`;
}

function formatFidelityLabel(format: "pdf" | "docx", fidelity?: string): string {
  const prefix = format.toUpperCase();
  if (fidelity === "official-layout") return `${prefix} · 국가서식 배치`;
  if (fidelity === "official-field-map") return `${prefix} · 공식 항목 편집본`;
  return `${prefix} · 사무소 편집본`;
}

export function DocumentDraftEditor({ caseRecord, onChange, onDownload, downloadPending = "", readOnly = false }: DocumentDraftEditorProps) {
  const templates = useMemo(() => applicableDocumentTemplates(caseRecord), [caseRecord.permits]);
  const drafts = useMemo(() => ensureDocumentDrafts(caseRecord), [caseRecord]);
  const draftByTemplate = useMemo(() => new Map(drafts.map((draft) => [draft.templateId, draft])), [drafts]);
  const [activeId, setActiveId] = useState(() => templates[0]?.id ?? "");
  const [reviewOpen, setReviewOpen] = useState(false);
  const active = templates.find((template) => template.id === activeId) ?? templates[0];
  const activeDraft = draftByTemplate.get(active?.id);
  const checklist = selectedRequiredDocuments(caseRecord);
  const totals = parcelAreaTotals(caseRecord);

  useEffect(() => {
    if (!templates.some((template) => template.id === activeId)) setActiveId(templates[0]?.id ?? "");
  }, [activeId, templates]);

  if (!active) return <div className="document-empty"><FilePenLine /><strong>허가 유형을 선택하면 작성할 문서가 구성됩니다.</strong></div>;

  const groups = groupFields(active.fields);
  const missingFields = active.fields.filter((field) => field.required && !documentFieldValue(caseRecord, active.id, field).trim());
  const requiredFields = active.fields.filter((field) => field.required);
  const requiredCompleted = requiredFields.length - missingFields.length;
  const inputPercent = requiredFields.length ? Math.round((requiredCompleted / requiredFields.length) * 100) : 100;
  const defaultReviewFields = active.fields.filter((field) => fieldState(caseRecord, active.id, field, activeDraft).needsDefaultReview);
  const attachedCount = checklist.filter((item) => item.attachment).length;
  const selectedCount = drafts.filter((draft) => draft.selected).length;
  const reviewCount = missingFields.length + defaultReviewFields.length + (checklist.length - attachedCount);

  function patchDraft(patch: Partial<DocumentDraft> & { fieldId?: string; value?: string }) {
    const nextPatch = patch.fieldId && activeDraft?.status === "reviewed"
      ? { ...patch, status: "review-needed" as const }
      : patch;
    onChange({ documentDrafts: updateDocumentDraft({ ...caseRecord, documentDrafts: drafts }, active.id, nextPatch) });
  }

  function resetField(fieldId: string) {
    onChange({ documentDrafts: withResetField(drafts, active.id, fieldId) });
  }

  function focusField(fieldId: string) {
    setReviewOpen(false);
    window.setTimeout(() => {
      const element = document.getElementById(inputId(active.id, fieldId));
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      element?.focus({ preventScroll: true });
    }, 100);
  }

  function scrollToSection(index: number) {
    document.getElementById(`document-section-${active.id}-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className={`document-workspace ${reviewOpen ? "review-open" : ""}`}>
      <aside className="template-rail" aria-label="작성 문서 목록">
        <div className="template-rail-head">
          <span>작성 문서</span>
          <strong>{selectedCount}/{templates.length} 묶음</strong>
        </div>
        {templates.map((template) => {
          const draft = draftByTemplate.get(template.id);
          const missing = templateValidation(caseRecord, template).length;
          const defaultsToReview = template.fields.filter((field) => fieldState(caseRecord, template.id, field, draft).needsDefaultReview).length;
          const stateLabel = missing
            ? `${missing}개 누락`
            : defaultsToReview
              ? `${defaultsToReview}개 확인`
              : draft?.status === "reviewed"
                ? "검토 완료"
                : "입력 완료";
          return (
            <div key={template.id} className={`template-rail-item ${active.id === template.id ? "active" : ""}`}>
              <button type="button" className="template-selector" onClick={() => setActiveId(template.id)} aria-current={active.id === template.id ? "page" : undefined}>
                <span className={`template-kind ${template.category}`}>{template.category === "application" ? "신청" : template.category === "statement" ? "조서" : template.category === "prevention" ? "대책" : "계획"}</span>
                <div><strong>{template.shortTitle}</strong><small>{template.generatedFormatFidelity?.pdf === "official-layout" ? "국가서식 배치" : template.status === "official-reference" ? "공식 별지 항목" : "예시 편집 서식"}</small></div>
                <em className={missing || defaultsToReview ? "needs-review" : "complete"}>{missing || defaultsToReview ? stateLabel : <><Check size={14} /> {stateLabel}</>}</em>
              </button>
              <label className="template-output-toggle">
                <input
                  type="checkbox"
                  checked={draft?.selected ?? true}
                  onChange={(event) => onChange({ documentDrafts: updateDocumentDraft({ ...caseRecord, documentDrafts: drafts }, template.id, { selected: event.target.checked }) })}
                  aria-label={`${template.title} 출력 포함`}
                  disabled={readOnly}
                />
                <span>묶음에 포함</span>
              </label>
            </div>
          );
        })}
        <div className="template-rail-note"><ShieldCheck size={16} /><span>제출본 생성 후에는 원본 버전으로 고정됩니다.</span></div>
      </aside>

      <section className="template-editor">
        <header className="template-editor-head">
          <div className="template-editor-title">
            <div className="template-badges">
              <span className={active.status}>{active.generatedFormatFidelity?.pdf === "official-layout" ? "국가서식 배치" : active.status === "official-reference" ? "공식 서식 항목 확인" : "예시 서식"}</span>
            </div>
            <h3>{active.title}</h3>
            <p>{active.description}</p>
            <details className="template-source-details">
              <summary>서식 정보</summary>
              <div>
                <span>{active.versionLabel}</span>
                {active.officialSource && <div className="official-form-source">
                  <strong>{active.officialSource.regulationName} {active.officialSource.formNumber}</strong>
                  <span>서식 개정 {active.officialSource.revisionDate} · 법령 시행 {active.officialSource.effectiveDate}</span>
                  <span>국가 원본 {active.officialSource.availableFormats.map((format) => format.toUpperCase()).join(" · ")}</span>
                </div>}
                <div className="template-format-status">
                  <span>{formatFidelityLabel("pdf", active.generatedFormatFidelity?.pdf)}</span>
                  <span>{formatFidelityLabel("docx", active.generatedFormatFidelity?.docx)}</span>
                </div>
                <div className="template-source-links">
                  {active.sourceUrl && <a href={active.sourceUrl} target="_blank" rel="noreferrer">국가서식 원문 <ExternalLink size={14} /></a>}
                  {active.officialSource?.formatUrls && Object.entries(active.officialSource.formatUrls).map(([format, url]) => url ? (
                    <a key={format} href={url} target="_blank" rel="noreferrer">원본 {format.toUpperCase()} <ExternalLink size={14} /></a>
                  ) : null)}
                </div>
              </div>
            </details>
          </div>
          <div className="template-editor-actions">
            {onDownload && <>
              <button type="button" onClick={() => onDownload(active.id, "docx")} disabled={readOnly || Boolean(downloadPending) || Boolean(missingFields.length)} title={missingFields.length ? "필수 항목을 입력한 뒤 다운로드할 수 있습니다." : undefined}><Download size={15} /> {downloadPending.endsWith("-docx") ? "생성 중" : "DOCX 다운로드"}</button>
              <button type="button" className="primary" onClick={() => onDownload(active.id, "pdf")} disabled={readOnly || Boolean(downloadPending) || Boolean(missingFields.length)} title={missingFields.length ? "필수 항목을 입력한 뒤 다운로드할 수 있습니다." : undefined}><Download size={15} /> {downloadPending.endsWith("-pdf") ? "생성 중" : "PDF 다운로드"}</button>
            </>}
          </div>
        </header>

        <div className="document-status-bar">
          <div className="required-progress" role="progressbar" aria-label="필수 항목 입력률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={inputPercent}>
            <span>필수 입력 <strong>{requiredCompleted}/{requiredFields.length}</strong></span>
            <div><i style={{ width: `${inputPercent}%` }} /></div>
          </div>
          <span className="linked-legend" title="사건 공통정보가 바뀌면 연결된 값도 함께 갱신됩니다."><Link2 size={14} /> 공통정보 연결</span>
          {defaultReviewFields.length ? <button type="button" className="status-attention" onClick={() => focusField(defaultReviewFields[0].id)}>기본문구 확인 {defaultReviewFields.length}</button> : <span className="status-clear"><Check size={14} /> 기본문구 확인 완료</span>}
          <span className={attachedCount === checklist.length ? "status-clear" : "status-muted"}>첨부 {attachedCount}/{checklist.length}</span>
          <button type="button" className="review-panel-toggle" onClick={() => setReviewOpen((current) => !current)} aria-expanded={reviewOpen}><PanelRightOpen size={16} /> 검토 {reviewCount ? reviewCount : "완료"}</button>
        </div>

        <nav className="document-section-nav" aria-label="문서 섹션 바로가기">
          {groups.map((group, index) => {
            const completed = group.fields.filter((field) => documentFieldValue(caseRecord, active.id, field).trim()).length;
            return <button key={group.name} type="button" onClick={() => scrollToSection(index)}>{group.name}<small>{completed}/{group.fields.length}</small></button>;
          })}
        </nav>

        {active.id === "area-statement" && (
          <div className="area-editor-table">
            <div className="area-row header"><span>필지·역할</span><span>대장</span><span>실측</span><span>사업</span><span>도로점용</span><span>제외</span><span>소유자</span></div>
            {caseRecord.parcels.map((parcel) => <div className="area-row" key={parcel.id}><span><strong>{parcel.lotNumber || parcel.address}</strong><small>{parcel.role === "project-site" ? "사업 대상지" : parcel.role === "access-road" ? "진입로" : parcel.role === "road-occupancy" ? "도로점용" : parcel.role === "excluded" ? "제외" : "참고"}</small></span><span>{parcel.ledgerAreaM2?.toLocaleString("ko-KR") ?? "-"}</span><span>{parcel.surveyedAreaM2?.toLocaleString("ko-KR") ?? "-"}</span><span>{parcel.plannedAreaM2?.toLocaleString("ko-KR") ?? "-"}</span><span>{parcel.roadOccupancyAreaM2?.toLocaleString("ko-KR") ?? "-"}</span><span>{parcel.excludedAreaM2?.toLocaleString("ko-KR") ?? "-"}</span><span>{parcel.ownerNames.join(", ") || "확인 필요"}</span></div>)}
            <div className="area-row total"><span>합계</span><span>{totals.ledger.toLocaleString("ko-KR")}</span><span>{totals.surveyed.toLocaleString("ko-KR")}</span><span>{totals.planned.toLocaleString("ko-KR")}</span><span>{totals.road.toLocaleString("ko-KR")}</span><span>{totals.excluded.toLocaleString("ko-KR")}</span><span /></div>
          </div>
        )}

        <div className="template-form">
          {groups.map((group, groupIndex) => {
            const completed = group.fields.filter((field) => documentFieldValue(caseRecord, active.id, field).trim()).length;
            return <fieldset key={group.name} id={`document-section-${active.id}-${groupIndex}`}><legend><span>{group.name}</span><small>{completed}/{group.fields.length}</small></legend><div className="template-form-grid">{group.fields.map((field) => {
            const state = fieldState(caseRecord, active.id, field, activeDraft);
            const fieldInputId = inputId(active.id, field.id);
            const helpId = `${fieldInputId}-help`;
            const missing = Boolean(field.required && !state.value.trim());
            const showHelp = missing || state.needsDefaultReview || state.canReset;
            const commonProps = {
              id: fieldInputId,
              value: state.value,
              onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => patchDraft({
                fieldId: field.id,
                value: formatDocumentFieldInput(field.id, field.kind, event.target.value),
              }),
              disabled: readOnly,
              placeholder: field.placeholder ?? (field.required ? "필수 항목을 입력하세요." : "해당 시 입력"),
              "aria-invalid": missing || undefined,
              "aria-describedby": showHelp ? helpId : undefined,
            };
            return <div key={field.id} className={`template-field ${field.kind === "textarea" ? "wide" : ""} ${missing ? "is-missing" : ""} ${state.needsDefaultReview ? "needs-default-review" : ""}`}>
              <label htmlFor={fieldInputId}><span>{field.label}{field.required ? <b>필수</b> : null}</span>{state.linked ? <span className="field-link-indicator" title="사건 공통정보와 연결됨"><Link2 size={13} /><span className="sr-only">사건 공통정보와 연결됨</span></span> : null}</label>
              <div className={`template-input-wrap ${state.edited ? "has-override" : ""} ${state.confirmedDefault ? "is-confirmed" : ""}`}>
                {field.kind === "textarea" ? <textarea {...commonProps} rows={4} /> : field.kind === "choice" ? <select {...commonProps}><option value="">선택하세요</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input {...commonProps} type={field.kind === "date" ? "date" : field.id.toLowerCase().includes("phone") ? "tel" : "text"} inputMode={field.kind === "number" ? "decimal" : field.id.toLowerCase().includes("registrationnumber") ? "numeric" : field.id.toLowerCase().includes("phone") ? "tel" : undefined} />}
                {state.edited ? <span className="value-origin edited">수정됨</span> : state.confirmedDefault ? <span className="value-origin confirmed">확인됨</span> : null}
              </div>
              {showHelp ? <div className="field-help" id={helpId}>
                {missing ? <span className="field-error"><TriangleAlert size={13} /> 필수 입력이 필요합니다.</span> : null}
                {state.needsDefaultReview ? <><span>기본문구입니다. 현장 조건에 맞는지 확인해 주세요.</span><button type="button" onClick={() => patchDraft({ fieldId: field.id, value: state.value })} disabled={readOnly}><Check size={13} /> 내용 확인</button></> : null}
                {state.canReset ? <button type="button" onClick={() => resetField(field.id)} disabled={readOnly}><RotateCcw size={13} /> 원본값으로 되돌리기</button> : null}
              </div> : null}
            </div>;
          })}</div></fieldset>;
          })}
        </div>
      </section>

      {reviewOpen ? <aside className="document-review-panel" aria-label="문서 검토">
        <header><div><span>문서 검토</span><strong>{reviewCount ? `${reviewCount}개 확인 필요` : "검토 준비 완료"}</strong></div><button type="button" onClick={() => setReviewOpen(false)} aria-label="검토 패널 닫기"><X size={17} /></button></header>
        <div className="review-score"><span>필수 항목 입력</span><strong>{requiredCompleted}/{requiredFields.length}</strong><div><i style={{ width: `${inputPercent}%` }} /></div></div>
        <section><h4>필수 항목</h4>{missingFields.length ? <div className="compact-warnings">{missingFields.map((field) => <button type="button" key={field.id} onClick={() => focusField(field.id)}><TriangleAlert size={14} />{field.label}</button>)}</div> : <p className="all-clear"><CheckCircle2 size={16} /> 필수 항목 입력 완료</p>}</section>
        <section><h4>기본문구 확인</h4>{defaultReviewFields.length ? <div className="compact-warnings default-review-list">{defaultReviewFields.slice(0, 6).map((field) => <button type="button" key={field.id} onClick={() => focusField(field.id)}>{field.label}</button>)}{defaultReviewFields.length > 6 ? <span>외 {defaultReviewFields.length - 6}개</span> : null}</div> : <p className="all-clear"><CheckCircle2 size={16} /> 기본문구 확인 완료</p>}</section>
        <section><h4>제출자료 연결</h4><div className="compact-checklist">{checklist.map((item) => <div key={item.id} className={item.attachment ? "attached" : "missing"}>{item.attachment ? <Check size={13} /> : <span /> }<div><strong>{item.name}</strong><small>{item.attachment?.name || item.sourceLabel}</small></div></div>)}</div></section>
        <section className="review-control"><h4>검토 상태</h4><div><button type="button" className={activeDraft?.status === "review-needed" ? "active warning" : ""} onClick={() => patchDraft({ status: "review-needed" })} disabled={readOnly}>재검토 필요</button><button type="button" className={activeDraft?.status === "reviewed" ? "active success" : ""} onClick={() => patchDraft({ status: "reviewed", reviewedAt: new Date().toISOString() })} disabled={readOnly || Boolean(missingFields.length) || Boolean(defaultReviewFields.length)} title={missingFields.length || defaultReviewFields.length ? "필수 입력과 기본문구 확인을 먼저 완료해 주세요." : undefined}>검토 완료</button></div>{activeDraft?.reviewedAt ? <small>최근 검토 {new Date(activeDraft.reviewedAt).toLocaleString("ko-KR")}</small> : <small>서식 자동작성은 법률·기술 검토를 대체하지 않습니다.</small>}</section>
      </aside> : null}
    </div>
  );
}

