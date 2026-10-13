import { ArrowLeft, Download, FilePenLine, FileText, Save, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { DocumentDraftEditor } from "../components/DocumentDraftEditor";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth, useCases } from "../context";
import { normalizeCaseRecord } from "../domain/caseRecord";
import { buildCaseDocumentModels, documentReviewWarnings, documentValidationErrors } from "../domain/documentModel";
import { exportCaseDocx, exportCasePdf } from "../services/documentExport";
import { generateAndOpenCaseDocument, openPrivateDocument } from "../services/generatedDocuments";
import { loadCaseSubcollections } from "../services/caseRepository";
import type { CaseRecord } from "../types";

export function DocumentsPage() {
  const { caseId } = useParams<{ caseId?: string }>();
  const { user } = useAuth();
  const { cases, loading, persistCase } = useCases();
  const [displayCases, setDisplayCases] = useState<CaseRecord[]>(cases.map(normalizeCaseRecord));
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const filtered = useMemo(() => displayCases.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())), [displayCases, query]);
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

  async function generate(caseRecord: CaseRecord, type: "pdf" | "docx") {
    if (viewer) return;
    setPending(`${caseRecord.id}-${type}`);
    setMessage("");
    try {
      if (user?.isDemo) {
        if (type === "pdf") await exportCasePdf(caseRecord);
        else await exportCaseDocx(caseRecord);
        setMessage(`${type.toUpperCase()} 편집·검토 파일을 만들었습니다.`);
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

  async function openExisting(path: string, label: string) {
    setPending(label);
    setMessage("");
    try {
      await openPrivateDocument(path);
      setMessage("저장된 제출본을 열었습니다.");
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
      <header className="page-header"><div><span className="page-kicker">제출본과 편집본</span><h1>문서</h1><p>사건 공통값으로 신청서와 사업계획서를 작성하고 생성 이력을 확인합니다.</p></div></header>
      <div className="information-banner"><ShieldCheck size={19} /><div><strong>제출본은 덮어쓰지 않습니다.</strong><span>{viewer ? "열람자는 생성된 버전을 다운로드만 할 수 있습니다." : "편집본을 수정해도 생성된 제출본은 원본 버전으로 유지됩니다."}</span></div></div>
      {message && <div className="settings-save-message" role="status">{message}</div>}
      <section className="table-card">
        <div className="table-toolbar"><div className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="업무명 검색" aria-label="문서 업무명 검색" /></div><span>{filtered.length}개 업무</span></div>
        <div className="document-table">
          <div className="document-row header"><span>업무</span><span>현재 버전</span><span>최근 수정</span><span>작성·다운로드</span></div>
          {filtered.map((caseRecord) => {
            const latest = [...caseRecord.documentVersions].filter((item) => item.status === "ready").sort((a, b) => b.version - a.version)[0];
            return <div className="document-row" key={caseRecord.id}><div><span className="document-icon"><FileText /></span><div><strong>{caseRecord.title}</strong><small>{caseRecord.id} · {caseRecord.primaryPermitName}</small></div></div><span>{latest ? `제출본 v${latest.version}` : `편집본 v${caseRecord.version}`}</span><time>{new Date(caseRecord.updatedAt).toLocaleDateString("ko-KR")}</time><div className="document-actions"><Link to={`/app/documents/${caseRecord.id}`}><FilePenLine size={16} /> 문서 작업실</Link>{latest?.docxPath && <button type="button" onClick={() => void openExisting(latest.docxPath!, `${caseRecord.id}-saved-docx`)} disabled={Boolean(pending)}><Download size={16} /> v{latest.version} DOCX</button>}{latest?.pdfPath && <button type="button" onClick={() => void openExisting(latest.pdfPath!, `${caseRecord.id}-saved-pdf`)} disabled={Boolean(pending)}><Download size={16} /> v{latest.version} PDF</button>}</div></div>;
          })}
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
  onGenerate: (caseRecord: CaseRecord, type: "pdf" | "docx") => Promise<void>;
  onOpenExisting: (path: string, label: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(caseRecord);
  const models = buildCaseDocumentModels(draft);
  const errors = documentValidationErrors(draft);
  const warnings = documentReviewWarnings(draft);

  useEffect(() => setDraft(caseRecord), [caseRecord]);

  function patchDraft(patch: Partial<CaseRecord>) {
    setDraft((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
    onMessage("");
  }

  return (
    <div className="simple-page document-studio-page">
      <header className="page-header document-studio-header"><div><Link to="/app/documents" className="back-link"><ArrowLeft size={16} /> 문서 목록</Link><span className="page-kicker">{caseRecord.id}</span><h1>{caseRecord.title}</h1><p>{models.length}종 문서가 공통정보와 연결되어 있습니다.</p></div><div className="studio-actions"><button type="button" className="button button-secondary" onClick={() => void onSave(draft)} disabled={viewer || Boolean(pending)}><Save size={17} /> {pending === `${draft.id}-save` ? "저장 중" : "초안 저장"}</button><button type="button" className="button button-secondary" onClick={() => void onGenerate(draft, "docx")} disabled={viewer || Boolean(pending) || !models.length}><Sparkles size={17} /> DOCX</button><button type="button" className="button button-primary" onClick={() => void onGenerate(draft, "pdf")} disabled={viewer || Boolean(pending) || !models.length}><Sparkles size={17} /> PDF 제출본</button></div></header>
      {message && <div className="settings-save-message" role="status">{message}</div>}
      <div className={`document-health ${errors.length ? "has-errors" : "ready"}`}><ShieldCheck size={19} /><div><strong>{errors.length ? `저장 차단 오류 ${errors.length}건` : "공통정보 저장 가능"}</strong><span>제출 전 확인 {warnings.length}건 · 선택 문서 {models.length}종</span></div>{errors.length > 0 && <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>}</div>
      <DocumentDraftEditor caseRecord={draft} onChange={patchDraft} readOnly={viewer} />
      <section className="table-card version-history"><div className="card-title"><div><h3>제출본 버전</h3><p>생성 시점의 사건 값과 문서 선택을 고정한 이력입니다.</p></div></div>{caseRecord.documentVersions.length ? <div className="version-list">{[...caseRecord.documentVersions].sort((a, b) => b.version - a.version).map((version) => <article key={version.id}><div><strong>제출본 v{version.version}</strong><small>{new Date(version.createdAt).toLocaleString("ko-KR")} · {version.templateIds?.length ?? "기존"}종 문서</small></div><span>{version.submittedAt ? "제출 완료" : "생성 완료"}</span><div>{version.docxPath && <button type="button" onClick={() => void onOpenExisting(version.docxPath!, `${version.id}-docx`)}><Download size={15} /> DOCX</button>}{version.pdfPath && <button type="button" onClick={() => void onOpenExisting(version.pdfPath!, `${version.id}-pdf`)}><Download size={15} /> PDF</button>}</div></article>)}</div> : <div className="empty-version"><FileText /><strong>아직 생성된 제출본이 없습니다.</strong><span>오른쪽 위에서 DOCX 또는 PDF를 생성하면 이력으로 보존됩니다.</span></div>}</section>
    </div>
  );
}
