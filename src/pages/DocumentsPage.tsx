import { Download, FileText, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth, useCases } from "../context";
import { exportCaseDocx, exportCasePdf } from "../services/documentExport";
import { generateAndOpenCaseDocument, openPrivateDocument } from "../services/generatedDocuments";
import { loadCaseSubcollections } from "../services/caseRepository";
import type { CaseRecord } from "../types";

export function DocumentsPage() {
  const { user } = useAuth();
  const { cases } = useCases();
  const [displayCases, setDisplayCases] = useState<CaseRecord[]>(cases);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const filtered = useMemo(() => displayCases.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())), [displayCases, query]);
  const viewer = user?.role === "viewer";

  useEffect(() => {
    let active = true;
    if (user?.isDemo) {
      setDisplayCases(cases);
      return () => { active = false; };
    }
    void Promise.all(cases.map(loadCaseSubcollections)).then((loaded) => {
      if (active) setDisplayCases(loaded);
    }).catch((reason) => {
      if (active) setMessage(reason instanceof Error ? reason.message : "문서 버전을 불러오지 못했습니다.");
    });
    return () => { active = false; };
  }, [cases, user?.isDemo]);

  async function generate(caseId: string, type: "pdf" | "docx") {
    const caseRecord = displayCases.find((item) => item.id === caseId);
    if (!caseRecord || viewer) return;
    setPending(`${caseId}-${type}`);
    setMessage("");
    try {
      if (user?.isDemo) {
        if (type === "pdf") await exportCasePdf(caseRecord);
        else await exportCaseDocx(caseRecord);
        setMessage(`${type.toUpperCase()} 체험 파일을 만들었습니다.`);
      } else {
        const result = await generateAndOpenCaseDocument(caseRecord.organizationId, caseRecord.id, type);
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
            templateVersion: "개발행위 기본서식 1.0",
            sourceSnapshotAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: user?.uid ?? "",
            notice: "업무 보조용 · 제출 전 관할기관 확인 필요",
          }],
        } : item));
        setMessage(`문서 v${result.version}을 비공개 Storage에 생성했습니다.`);
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
      setMessage("저장된 문서를 열었습니다.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "문서를 열지 못했습니다.");
    } finally {
      setPending("");
    }
  }

  return (
    <div className="simple-page documents-page">
      <header className="page-header"><div><span className="page-kicker">제출본과 편집본</span><h1>문서</h1><p>업무의 현재 값으로 문서를 만들고, 생성된 버전 이력을 확인합니다.</p></div></header>
      <div className="information-banner"><ShieldCheck size={19} /><div><strong>제출본은 덮어쓰지 않습니다.</strong><span>{viewer ? "열람자는 생성된 버전을 다운로드만 할 수 있습니다." : "운영 Firebase에서는 생성 당시 입력값과 첨부 버전이 비공개 Storage에 함께 고정됩니다."}</span></div></div>
      {message && <div className="settings-save-message" role="status">{message}</div>}
      <section className="table-card">
        <div className="table-toolbar"><div className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="업무명 검색" aria-label="문서 업무명 검색" /></div><span>{filtered.length}개 업무</span></div>
        <div className="document-table">
          <div className="document-row header"><span>업무</span><span>현재 버전</span><span>최근 수정</span><span>생성·다운로드</span></div>
          {filtered.map((caseRecord) => {
            const latest = [...caseRecord.documentVersions].filter((item) => item.status === "ready").sort((a, b) => b.version - a.version)[0];
            return <div className="document-row" key={caseRecord.id}><div><span className="document-icon"><FileText /></span><div><strong>{caseRecord.title}</strong><small>{caseRecord.id} · {caseRecord.primaryPermitName}</small></div></div><span>{latest ? `제출본 v${latest.version}` : `업무 v${caseRecord.version}`}</span><time>{new Date(caseRecord.updatedAt).toLocaleDateString("ko-KR")}</time><div className="document-actions">{latest?.docxPath && <button type="button" onClick={() => void openExisting(latest.docxPath!, `${caseRecord.id}-saved-docx`)} disabled={Boolean(pending)}><Download size={16} /> v{latest.version} DOCX</button>}{latest?.pdfPath && <button type="button" onClick={() => void openExisting(latest.pdfPath!, `${caseRecord.id}-saved-pdf`)} disabled={Boolean(pending)}><Download size={16} /> v{latest.version} PDF</button>}{!viewer && <><button type="button" onClick={() => void generate(caseRecord.id, "docx")} disabled={Boolean(pending)}><Sparkles size={16} /> {pending === `${caseRecord.id}-docx` ? "생성 중" : "DOCX 새 버전"}</button><button type="button" onClick={() => void generate(caseRecord.id, "pdf")} disabled={Boolean(pending)}><Sparkles size={16} /> {pending === `${caseRecord.id}-pdf` ? "생성 중" : "PDF 새 버전"}</button></>}</div></div>;
          })}
        </div>
      </section>
    </div>
  );
}
