import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  FilePenLine,
  Link2,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
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
    return { ...draft, overrides, updatedAt: new Date().toISOString() };
  });
}

function formatFidelityLabel(fidelity?: string): string {
  if (fidelity === "official-layout") return "국가서식 배치";
  if (fidelity === "official-field-map") return "국가서식 항목 대응";
  if (fidelity === "office-template") return "사무소 편집 서식";
  return "지원 정보 확인 필요";
}

export function DocumentDraftEditor({ caseRecord, onChange, onDownload, downloadPending = "", readOnly = false }: DocumentDraftEditorProps) {
  const templates = useMemo(() => applicableDocumentTemplates(caseRecord), [caseRecord.permits]);
  const drafts = useMemo(() => ensureDocumentDrafts(caseRecord), [caseRecord]);
  const [activeId, setActiveId] = useState(() => templates[0]?.id ?? "");
  const active = templates.find((template) => template.id === activeId) ?? templates[0];
  const activeDraft = drafts.find((draft) => draft.templateId === active?.id);
  const checklist = selectedRequiredDocuments(caseRecord);
  const totals = parcelAreaTotals(caseRecord);

  useEffect(() => {
    if (!templates.some((template) => template.id === activeId)) setActiveId(templates[0]?.id ?? "");
  }, [activeId, templates]);

  if (!active) return <div className="document-empty"><FilePenLine /><strong>허가 유형을 선택하면 작성할 문서가 구성됩니다.</strong></div>;

  const validation = templateValidation(caseRecord, active);
  const completed = active.fields.filter((field) => documentFieldValue(caseRecord, active.id, field).trim()).length;
  const percent = Math.round((completed / Math.max(1, active.fields.length)) * 100);
  const groups = groupFields(active.fields);

  function patchDraft(patch: Partial<DocumentDraft> & { fieldId?: string; value?: string }) {
    onChange({ documentDrafts: updateDocumentDraft({ ...caseRecord, documentDrafts: drafts }, active.id, patch) });
  }

  function resetField(fieldId: string) {
    onChange({ documentDrafts: withResetField(drafts, active.id, fieldId) });
  }

  return (
    <div className="document-workspace">
      <aside className="template-rail" aria-label="작성 문서 목록">
        <div className="template-rail-head">
          <span>자동 작성 문서</span>
          <strong>{templates.length}종</strong>
        </div>
        {templates.map((template) => {
          const draft = drafts.find((item) => item.templateId === template.id);
          const missing = templateValidation(caseRecord, template).length;
          return (
            <div key={template.id} className={`template-rail-item ${active.id === template.id ? "active" : ""}`}>
              <button type="button" className="template-selector" onClick={() => setActiveId(template.id)}>
                <span className={`template-kind ${template.category}`}>{template.category === "application" ? "신청" : template.category === "statement" ? "조서" : template.category === "prevention" ? "대책" : "계획"}</span>
                <div><strong>{template.shortTitle}</strong><small>{template.generatedFormatFidelity?.pdf === "official-layout" ? "국가서식 배치" : template.status === "official-reference" ? "공식 별지 항목" : "예시 편집 서식"}</small></div>
                <em className={missing ? "needs-review" : "complete"}>{missing ? `${missing}개 확인` : <Check size={14} />}</em>
              </button>
              <label className="template-output-toggle">
                <input
                  type="checkbox"
                  checked={draft?.selected ?? true}
                  onChange={(event) => onChange({ documentDrafts: updateDocumentDraft({ ...caseRecord, documentDrafts: drafts }, template.id, { selected: event.target.checked }) })}
                  aria-label={`${template.title} 출력 포함`}
                  disabled={readOnly}
                />
                <span>전체 묶음</span>
              </label>
            </div>
          );
        })}
        <div className="template-rail-note"><ShieldCheck size={16} /><span>제출본 생성 후에는 원본 버전으로 고정됩니다.</span></div>
      </aside>

      <section className="template-editor">
        <header className="template-editor-head">
          <div>
            <div className="template-badges">
              <span className={active.status}>{active.generatedFormatFidelity?.pdf === "official-layout" ? "국가서식 원본 배치" : active.status === "official-reference" ? "공식 서식 항목 확인" : "예시 서식"}</span>
              <span>{active.versionLabel}</span>
            </div>
            <h3>{active.title}</h3>
            <p>{active.description}</p>
            {active.officialSource && <div className="official-form-source">
              <strong>{active.officialSource.regulationName} {active.officialSource.formNumber}</strong>
              <span>개정 {active.officialSource.revisionDate}</span>
              <span>시행 {active.officialSource.effectiveDate}</span>
            </div>}
            <div className="template-format-status">
              <span>PDF · {formatFidelityLabel(active.generatedFormatFidelity?.pdf)}</span>
              <span>DOCX · {formatFidelityLabel(active.generatedFormatFidelity?.docx)}</span>
            </div>
            {active.officialSource?.formatUrls && <div className="template-source-links">
              {Object.entries(active.officialSource.formatUrls).map(([format, url]) => url
                ? <a key={format} href={url} target="_blank" rel="noreferrer">원본 {format.toUpperCase()} <ExternalLink size={13} /></a>
                : null)}
            </div>}
          </div>
          <div className="template-editor-actions">
            {active.sourceUrl && <a href={active.sourceUrl} target="_blank" rel="noreferrer">원문 서식 <ExternalLink size={15} /></a>}
            {onDownload && <>
              <button type="button" onClick={() => onDownload(active.id, "docx")} disabled={readOnly || Boolean(downloadPending)}><Download size={15} /> {downloadPending.endsWith("-docx") ? "생성 중" : "DOCX"}</button>
              <button type="button" className="primary" onClick={() => onDownload(active.id, "pdf")} disabled={readOnly || Boolean(downloadPending)}><Download size={15} /> {downloadPending.endsWith("-pdf") ? "생성 중" : "PDF"}</button>
            </>}
          </div>
        </header>

        <div className="linked-data-banner">
          <Link2 size={18} />
          <div><strong>사건 공통정보 자동 연결</strong><span>자동값은 공통정보가 바뀌면 함께 갱신되고, 직접 수정한 칸만 문서별 값으로 유지됩니다.</span></div>
          <b>{percent}%</b>
        </div>

        {active.id === "area-statement" && (
          <div className="area-editor-table">
            <div className="area-row header"><span>필지·역할</span><span>대장</span><span>실측</span><span>사업</span><span>도로점용</span><span>제외</span><span>소유자</span></div>
            {caseRecord.parcels.map((parcel) => <div className="area-row" key={parcel.id}><span><strong>{parcel.lotNumber || parcel.address}</strong><small>{parcel.role === "project-site" ? "사업 대상지" : parcel.role === "access-road" ? "진입로" : parcel.role === "road-occupancy" ? "도로점용" : parcel.role === "excluded" ? "제외" : "참고"}</small></span><span>{parcel.ledgerAreaM2?.toLocaleString("ko-KR") ?? "-"}</span><span>{parcel.surveyedAreaM2?.toLocaleString("ko-KR") ?? "-"}</span><span>{parcel.plannedAreaM2?.toLocaleString("ko-KR") ?? "-"}</span><span>{parcel.roadOccupancyAreaM2?.toLocaleString("ko-KR") ?? "-"}</span><span>{parcel.excludedAreaM2?.toLocaleString("ko-KR") ?? "-"}</span><span>{parcel.ownerNames.join(", ") || "확인 필요"}</span></div>)}
            <div className="area-row total"><span>합계</span><span>{totals.ledger.toLocaleString("ko-KR")}</span><span>{totals.surveyed.toLocaleString("ko-KR")}</span><span>{totals.planned.toLocaleString("ko-KR")}</span><span>{totals.road.toLocaleString("ko-KR")}</span><span>{totals.excluded.toLocaleString("ko-KR")}</span><span /></div>
          </div>
        )}

        <div className="template-form">
          {groups.map((group) => <fieldset key={group.name}><legend>{group.name}</legend><div className="template-form-grid">{group.fields.map((field) => {
            const value = documentFieldValue(caseRecord, active.id, field);
            const automaticValue = resolveDocumentSource(caseRecord, field.sourceKey);
            const overridden = Boolean(activeDraft && Object.prototype.hasOwnProperty.call(activeDraft.overrides, field.id));
            const commonProps = {
              value,
              onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => patchDraft({ fieldId: field.id, value: event.target.value }),
              disabled: readOnly,
              placeholder: field.placeholder ?? (field.required ? "필수 항목을 입력하세요." : "해당 시 입력"),
            };
            return <label key={field.id} className={field.kind === "textarea" ? "wide" : ""}><span>{field.label}{field.required && <b>필수</b>}</span><div className={`template-input-wrap ${overridden ? "has-override" : ""}`}>{field.kind === "textarea" ? <textarea {...commonProps} rows={5} /> : field.kind === "choice" ? <select {...commonProps}><option value="">선택하세요.</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input {...commonProps} type={field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text"} />}{overridden && <span className="value-origin edited">직접 수정</span>}</div><small>{field.sourceKey ? <><Link2 size={12} aria-hidden="true" />{overridden ? "문서별 수정값" : `공통정보 · ${field.sourceKey}`}{overridden && <button type="button" onClick={() => resetField(field.id)} disabled={readOnly}><RotateCcw size={12} /> 자동값 복원{automaticValue ? ` (${automaticValue.slice(0, 24)})` : ""}</button>}</> : "이 문서에서만 입력하는 항목"}</small></label>;
          })}</div></fieldset>)}
        </div>
      </section>

      <aside className="document-review-panel">
        <div className="review-score"><span>현재 문서 완성도</span><strong>{percent}<small>%</small></strong><div><i style={{ width: `${percent}%` }} /></div></div>
        <section><h4>필수 항목</h4>{validation.length ? <div className="compact-warnings">{validation.map((item) => <p key={item}><TriangleAlert size={14} />{item.split(": ").at(-1)}</p>)}</div> : <p className="all-clear"><CheckCircle2 size={16} /> 필수 항목 입력 완료</p>}</section>
        <section><h4>제출자료 연결</h4><div className="compact-checklist">{checklist.slice(0, 7).map((item) => <div key={item.id} className={item.attachment ? "attached" : "missing"}>{item.attachment ? <Check size={13} /> : <span /> }<div><strong>{item.name}</strong><small>{item.attachment?.name || item.sourceLabel}</small></div></div>)}</div></section>
        <section className="review-control"><h4>검토 상태</h4><div><button type="button" className={activeDraft?.status === "review-needed" ? "active warning" : ""} onClick={() => patchDraft({ status: "review-needed" })} disabled={readOnly}>확인 필요</button><button type="button" className={activeDraft?.status === "reviewed" ? "active success" : ""} onClick={() => patchDraft({ status: "reviewed", reviewedAt: new Date().toISOString() })} disabled={readOnly}>검토 완료</button></div><small>서식 자동작성은 법률·기술 검토를 대체하지 않습니다.</small></section>
      </aside>
    </div>
  );
}

