import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BellRing,
  Check,
  Database,
  ListChecks,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useAuth } from "../context";
import { defaultStatuses } from "../domain/status";
import { defaultPermitCatalog } from "../domain/permits";
import {
  clearTrustedDeviceCache,
  isTrustedDeviceCacheEnabled,
  setTrustedDeviceCache,
} from "../services/firebase";
import {
  saveOrganizationConfiguration,
  subscribeOrganizationConfiguration,
  type CustomPermitCatalogItem,
  type OrganizationWorkflowConfiguration,
} from "../services/organizationRepository";

const initialConfiguration: OrganizationWorkflowConfiguration = {
  reminderOffsets: [7, 3, 1, 0, -1],
  customStatuses: [],
  customPermits: [],
};

export function SettingsPage() {
  const { user } = useAuth();
  const [cacheEnabled, setCacheEnabled] = useState(isTrustedDeviceCacheEnabled());
  const [cacheMessage, setCacheMessage] = useState("");
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [customStatus, setCustomStatus] = useState("");
  const [customPermit, setCustomPermit] = useState("");
  const [permitCategory, setPermitCategory] = useState<"main" | "agenda">("main");
  const [permitBasis, setPermitBasis] = useState("");
  const [relatedPrimary, setRelatedPrimary] = useState("development");
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const admin = user?.role === "admin";

  useEffect(() => {
    if (!user?.organizationId) return;
    return subscribeOrganizationConfiguration(
      user.organizationId,
      user.isDemo,
      setConfiguration,
      (error) => setSaveMessage(error.message),
    );
  }, [user]);

  const primaryPermits = useMemo(() => [
    ...defaultPermitCatalog.filter((permit) => permit.category === "main"),
    ...configuration.customPermits.filter((permit) => permit.category === "main"),
  ], [configuration.customPermits]);

  function toggleCache(enabled: boolean) {
    setTrustedDeviceCache(enabled);
    setCacheEnabled(enabled);
    setCacheMessage("다음 로그인부터 적용됩니다. 공용 기기에서는 켜지 마세요.");
  }

  async function clearCache() {
    await clearTrustedDeviceCache();
    setCacheEnabled(false);
    setCacheMessage("이 기기의 영구 업무 캐시를 삭제했습니다.");
  }

  async function persist(next: OrganizationWorkflowConfiguration, message: string) {
    if (!user || !admin) return;
    setConfiguration(next);
    setSaving(true);
    setSaveMessage("");
    try {
      await saveOrganizationConfiguration(user.organizationId, user.isDemo, next, user.uid);
      setSaveMessage(message);
    } catch (reason) {
      setSaveMessage(reason instanceof Error ? reason.message : "조직 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function toggleReminder(offset: number) {
    const reminderOffsets = configuration.reminderOffsets.includes(offset)
      ? configuration.reminderOffsets.filter((item) => item !== offset)
      : [...configuration.reminderOffsets, offset];
    void persist({ ...configuration, reminderOffsets }, "조직 기본 알림을 저장했습니다.");
  }

  function addStatus() {
    const label = customStatus.trim();
    if (!label || configuration.customStatuses.some((status) => status.label === label)) return;
    const next = {
      ...configuration,
      customStatuses: [...configuration.customStatuses, {
        id: `custom-${crypto.randomUUID()}`,
        label,
        color: "#667085",
        order: 100 + configuration.customStatuses.length,
      }],
    };
    setCustomStatus("");
    void persist(next, `상태 '${label}'을 추가했습니다.`);
  }

  function removeStatus(id: string) {
    void persist({ ...configuration, customStatuses: configuration.customStatuses.filter((status) => status.id !== id) }, "상태를 삭제했습니다.");
  }

  function moveStatus(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= configuration.customStatuses.length) return;
    const customStatuses = [...configuration.customStatuses];
    [customStatuses[index], customStatuses[target]] = [customStatuses[target], customStatuses[index]];
    void persist({ ...configuration, customStatuses }, "상태 표시 순서를 저장했습니다.");
  }

  function addPermit() {
    const name = customPermit.trim();
    if (!name || configuration.customPermits.some((permit) => permit.name === name)) return;
    const permit: CustomPermitCatalogItem = {
      id: `custom-${crypto.randomUUID()}`,
      name,
      description: permitCategory === "main" ? "조직 추가 주허가" : "조직 추가 의제 후보",
      category: permitCategory,
      legalBasis: permitBasis.trim() || "근거 확인 필요",
      icon: "FileText",
      accent: permitCategory === "main" ? "blue" : "green",
      canBePrimary: permitCategory === "main",
      relatedPrimaryCatalogIds: permitCategory === "agenda" ? [relatedPrimary] : [],
      order: 100 + configuration.customPermits.length,
    };
    setCustomPermit("");
    setPermitBasis("");
    void persist({ ...configuration, customPermits: [...configuration.customPermits, permit] }, `허가 유형 '${name}'을 추가했습니다.`);
  }

  function removePermit(id: string) {
    void persist({ ...configuration, customPermits: configuration.customPermits.filter((permit) => permit.id !== id) }, "허가 유형을 삭제했습니다.");
  }

  return (
    <div className="simple-page settings-page">
      <header className="page-header"><div><span className="page-kicker">조직 기본값</span><h1>설정</h1><p>알림, 상태, 허가 카탈로그와 신뢰 기기 저장을 관리합니다.</p></div></header>
      {!admin && <div className="information-banner"><ShieldCheck /><div><strong>열람 전용 설정</strong><span>조직 설정은 관리자만 변경할 수 있습니다.</span></div></div>}
      {saveMessage && <div className="settings-save-message" role="status">{saving ? "저장 중…" : saveMessage}</div>}
      <div className="settings-layout">
        <section className="settings-section">
          <div className="settings-section-head"><span><BellRing /></span><div><h2>마감 알림</h2><p>조직의 기본 알림 시점을 정합니다.</p></div></div>
          <div className="reminder-options">{[7, 3, 1, 0, -1].map((offset) => <label key={offset}><input type="checkbox" checked={configuration.reminderOffsets.includes(offset)} disabled={!admin || saving} onChange={() => toggleReminder(offset)} /><span><Check size={14} /></span>{offset > 0 ? `D-${offset}` : offset === 0 ? "당일" : "지연"}</label>)}</div>
          <p className="setting-help">업무별로 기본값을 바꿀 수 있으며, 완료 항목은 발송하지 않습니다.</p>
        </section>
        <section className="settings-section">
          <div className="settings-section-head"><span><Database /></span><div><h2>신뢰 기기 오프라인 캐시</h2><p>영구 캐시는 사용자가 명시적으로 켠 기기에서만 사용합니다.</p></div></div>
          <div className="cache-setting"><div><strong>이 기기에 업무 캐시 저장</strong><span>공용 PC에서는 활성화하지 마세요.</span></div><button type="button" className={`toggle ${cacheEnabled ? "on" : ""}`} onClick={() => toggleCache(!cacheEnabled)} aria-pressed={cacheEnabled} disabled={!user || user.isDemo}><span /></button></div>
          <button type="button" className="button button-secondary compact" onClick={clearCache} disabled={user?.isDemo}>이 기기 캐시 삭제</button>
          {user?.isDemo && <p className="setting-help">체험 모드는 샘플 데이터를 브라우저 저장소에만 보관합니다.</p>}
          {cacheMessage && <p className="setting-success">{cacheMessage}</p>}
        </section>
        <section className="settings-section wide">
          <div className="settings-section-head"><span><ListChecks /></span><div><h2>업무 상태</h2><p>기본 상태 뒤에 조직 상태를 추가하고 표시 순서를 관리합니다.</p></div></div>
          <div className="settings-chips">{defaultStatuses.map((status) => <span key={status.id}><i style={{ background: status.color }} />{status.label}</span>)}</div>
          {configuration.customStatuses.length > 0 && <div className="sortable-settings-list">{configuration.customStatuses.map((status, index) => <article key={status.id}><span><i style={{ background: status.color }} />{status.label}</span><div><button type="button" onClick={() => moveStatus(index, -1)} disabled={!admin || index === 0 || saving} aria-label={`${status.label} 위로`}><ArrowUp size={15} /></button><button type="button" onClick={() => moveStatus(index, 1)} disabled={!admin || index === configuration.customStatuses.length - 1 || saving} aria-label={`${status.label} 아래로`}><ArrowDown size={15} /></button><button type="button" onClick={() => removeStatus(status.id)} disabled={!admin || saving} aria-label={`${status.label} 삭제`}><Trash2 size={15} /></button></div></article>)}</div>}
          {admin && <div className="setting-add"><input value={customStatus} onChange={(event) => setCustomStatus(event.target.value)} placeholder="조직 상태 이름" /><button type="button" onClick={addStatus} disabled={saving}><Plus size={16} /> 추가</button></div>}
        </section>
        <section className="settings-section wide">
          <div className="settings-section-head"><span><Plus /></span><div><h2>허가 카탈로그</h2><p>조직 허가 유형과 주허가·의제 관계를 관리합니다.</p></div></div>
          <div className="catalog-list">{defaultPermitCatalog.map((permit) => <article key={permit.id}><div><strong>{permit.name}</strong><small>{permit.category === "main" ? "기본 주허가" : "기본 의제 후보"} · {permit.legalBasis}</small></div><span>기본</span></article>)}{configuration.customPermits.map((permit) => <article key={permit.id}><div><strong>{permit.name}</strong><small>{permit.category === "main" ? "조직 주허가" : `조직 의제 · 연계 ${primaryPermits.find((item) => item.id === permit.relatedPrimaryCatalogIds[0])?.name ?? "모든 주허가"}`} · {permit.legalBasis}</small></div><button type="button" onClick={() => removePermit(permit.id)} disabled={!admin || saving} aria-label={`${permit.name} 삭제`}><Trash2 size={15} /></button></article>)}</div>
          {admin && <div className="permit-setting-form"><input value={customPermit} onChange={(event) => setCustomPermit(event.target.value)} placeholder="추가 허가 유형" /><select value={permitCategory} onChange={(event) => setPermitCategory(event.target.value as "main" | "agenda")} aria-label="허가 분류"><option value="main">주허가</option><option value="agenda">의제 후보</option></select><input value={permitBasis} onChange={(event) => setPermitBasis(event.target.value)} placeholder="법적 근거" />{permitCategory === "agenda" && <select value={relatedPrimary} onChange={(event) => setRelatedPrimary(event.target.value)} aria-label="연계 주허가">{primaryPermits.map((permit) => <option value={permit.id} key={permit.id}>{permit.name}에 연계</option>)}</select>}<button type="button" onClick={addPermit} disabled={saving}><Plus size={16} /> 추가</button></div>}
        </section>
      </div>
    </div>
  );
}
