import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BellRing,
  Building2,
  CalendarClock,
  Check,
  Database,
  FileCheck2,
  History,
  ListChecks,
  MapPinned,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useAuth } from "../context";
import { defaultStatuses } from "../domain/status";
import { defaultPermitCatalog } from "../domain/permits";
import {
  defaultDeadlineDefaults,
  defaultNotificationDefaults,
  defaultRegionProfiles,
  validateRegionProfile,
  type OrganizationAuditEntry,
  type OrganizationRegionProfileRecord,
} from "../domain/organizationAdmin";
import {
  clearTrustedDeviceCache,
  isTrustedDeviceCacheEnabled,
  setTrustedDeviceCache,
} from "../services/firebase";
import {
  saveOrganizationConfiguration,
  saveOrganizationProfile,
  subscribeOrganizationAudit,
  subscribeOrganizationConfiguration,
  subscribeOrganizationProfile,
  type CustomPermitCatalogItem,
  type OrganizationWorkflowConfiguration,
} from "../services/organizationRepository";
import "../admin.css";

const initialConfiguration: OrganizationWorkflowConfiguration = {
  reminderOffsets: [7, 3, 1, 0, -1],
  customStatuses: [],
  customPermits: [],
  deadlineDefaults: defaultDeadlineDefaults,
  notificationDefaults: defaultNotificationDefaults,
  regionProfiles: defaultRegionProfiles,
};

const emptyRegion = (): OrganizationRegionProfileRecord => ({
  id: `region-${crypto.randomUUID()}`,
  jurisdictionCode: "",
  jurisdictionName: "",
  status: "unverified",
  effectiveDate: "",
  checkedAt: "",
  sourceLabel: "",
  sourceUrl: "",
  guidance: "",
  legalAutomationAllowed: false,
});

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function formatAuditDate(value: string): string {
  if (!value) return "시간 정보 없음";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export function SettingsPage() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [cacheEnabled, setCacheEnabled] = useState(isTrustedDeviceCacheEnabled());
  const [cacheMessage, setCacheMessage] = useState("");
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [organizationName, setOrganizationName] = useState(user?.organizationName ?? "");
  const [savedOrganizationName, setSavedOrganizationName] = useState(user?.organizationName ?? "");
  const [customStatus, setCustomStatus] = useState("");
  const [customPermit, setCustomPermit] = useState("");
  const [permitCategory, setPermitCategory] = useState<"main" | "agenda">("main");
  const [permitBasis, setPermitBasis] = useState("");
  const [relatedPrimary, setRelatedPrimary] = useState("development");
  const [customReminder, setCustomReminder] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [regionDraft, setRegionDraft] = useState(emptyRegion);
  const [auditEntries, setAuditEntries] = useState<OrganizationAuditEntry[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.organizationId) return;
    return subscribeOrganizationConfiguration(user.organizationId, user.isDemo, (next) => {
      setConfiguration({
        ...initialConfiguration,
        ...next,
        deadlineDefaults: { ...defaultDeadlineDefaults, ...next.deadlineDefaults },
        notificationDefaults: { ...defaultNotificationDefaults, ...next.notificationDefaults },
        regionProfiles: next.regionProfiles ?? defaultRegionProfiles,
      });
    }, (error) => setSaveMessage(error.message));
  }, [user]);

  useEffect(() => {
    if (!user?.organizationId) return;
    return subscribeOrganizationProfile(user.organizationId, user.isDemo, (profile) => {
      setOrganizationName(profile.name);
      setSavedOrganizationName(profile.name);
    }, (error) => setSaveMessage(error.message));
  }, [user]);

  useEffect(() => {
    if (!user?.organizationId || !admin) return;
    return subscribeOrganizationAudit(user.organizationId, user.isDemo, setAuditEntries, (error) => setSaveMessage(error.message));
  }, [admin, user]);

  const primaryPermits = useMemo(() => [
    ...defaultPermitCatalog.filter((permit) => permit.category === "main"),
    ...configuration.customPermits.filter((permit) => permit.category === "main"),
  ], [configuration.customPermits]);

  const deadline = configuration.deadlineDefaults ?? defaultDeadlineDefaults;
  const notification = configuration.notificationDefaults ?? defaultNotificationDefaults;
  const regions = configuration.regionProfiles ?? defaultRegionProfiles;

  function patchConfiguration(patch: Partial<OrganizationWorkflowConfiguration>) {
    if (!admin) return;
    setConfiguration((current) => ({ ...current, ...patch }));
    setSaveMessage("저장되지 않은 변경사항이 있습니다.");
  }

  async function saveAll() {
    if (!user || !admin) return;
    const invalidRegion = regions.map(validateRegionProfile).find(Boolean);
    if (invalidRegion) {
      setSaveMessage(invalidRegion);
      return;
    }
    if (!configuration.reminderOffsets.length) {
      setSaveMessage("알림 시점을 한 개 이상 선택해 주세요.");
      return;
    }
    setSaving(true);
    setSaveMessage("");
    try {
      await saveOrganizationConfiguration(user.organizationId, user.isDemo, configuration, user.uid, user.displayName);
      if (organizationName.trim() !== savedOrganizationName) {
        await saveOrganizationProfile(user.organizationId, user.isDemo, organizationName, user.uid, user.displayName);
        setSavedOrganizationName(organizationName.trim());
      }
      setSaveMessage("관리자 설정을 모두 저장했습니다.");
    } catch (reason) {
      setSaveMessage(reason instanceof Error ? reason.message : "조직 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function toggleReminder(offset: number) {
    const reminderOffsets = configuration.reminderOffsets.includes(offset)
      ? configuration.reminderOffsets.filter((item) => item !== offset)
      : [...configuration.reminderOffsets, offset].sort((a, b) => b - a);
    patchConfiguration({ reminderOffsets });
  }

  function addCustomReminder() {
    const offset = Math.max(0, Math.min(365, Math.trunc(Number(customReminder))));
    if (!Number.isFinite(offset) || configuration.reminderOffsets.includes(offset)) return;
    patchConfiguration({ reminderOffsets: [...configuration.reminderOffsets, offset].sort((a, b) => b - a) });
    setCustomReminder("");
  }

  function addStatus() {
    const label = customStatus.trim();
    if (!label || configuration.customStatuses.some((status) => status.label === label)) return;
    patchConfiguration({
      customStatuses: [...configuration.customStatuses, {
        id: `custom-${crypto.randomUUID()}`,
        label,
        color: "#5267d8",
        order: 100 + configuration.customStatuses.length,
      }],
    });
    setCustomStatus("");
  }

  function updateStatus(id: string, patch: { label?: string; color?: string; isTerminal?: boolean }) {
    patchConfiguration({ customStatuses: configuration.customStatuses.map((status) => status.id === id ? { ...status, ...patch } : status) });
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
    patchConfiguration({ customPermits: [...configuration.customPermits, permit] });
    setCustomPermit("");
    setPermitBasis("");
  }

  function updatePermit(id: string, patch: Partial<CustomPermitCatalogItem>) {
    patchConfiguration({ customPermits: configuration.customPermits.map((permit) => permit.id === id ? { ...permit, ...patch } : permit) });
  }

  function addHoliday() {
    if (!holidayDate || deadline.holidays.includes(holidayDate)) return;
    patchConfiguration({ deadlineDefaults: { ...deadline, holidays: [...deadline.holidays, holidayDate].sort() } });
    setHolidayDate("");
  }

  function addRegion() {
    const error = validateRegionProfile(regionDraft);
    if (error) {
      setSaveMessage(error);
      return;
    }
    if (regions.some((profile) => profile.jurisdictionCode === regionDraft.jurisdictionCode)) {
      setSaveMessage("같은 관할 코드의 지역 프로필이 이미 있습니다.");
      return;
    }
    patchConfiguration({ regionProfiles: [...regions, regionDraft] });
    setRegionDraft(emptyRegion());
  }

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

  return (
    <div className="simple-page settings-page admin-console">
      <header className="page-header admin-page-header">
        <div><span className="page-kicker">관리자 콘솔</span><h1>조직 운영 설정</h1><p>업무공간, 기한, 알림, 상태, 허가·의제, 지역 기준과 감사 이력을 관리합니다.</p></div>
        {admin && <button type="button" className="button button-primary" onClick={() => void saveAll()} disabled={saving}><Save size={18} /> {saving ? "저장 중…" : "전체 설정 저장"}</button>}
      </header>

      {!admin && <div className="information-banner"><ShieldCheck /><div><strong>열람 전용 관리자 화면</strong><span>설정 내용은 볼 수 있지만 변경은 관리자만 가능합니다.</span></div></div>}
      {saveMessage && <div className="settings-save-message" role="status">{saveMessage}</div>}

      <div className="admin-summary-grid" aria-label="관리 설정 요약">
        <article><Building2 /><span>업무공간</span><strong>{organizationName || "이름 없음"}</strong></article>
        <article><CalendarClock /><span>기본 처리기한</span><strong>{deadline.days}일 · {deadline.mode === "business-days" ? "업무일" : "달력일"}</strong></article>
        <article><ListChecks /><span>사용자 정의</span><strong>상태 {configuration.customStatuses.length} · 허가 {configuration.customPermits.length}</strong></article>
        <article><MapPinned /><span>지역 프로필</span><strong>{regions.length}개</strong></article>
      </div>

      <div className="admin-section-grid">
        <section className="settings-section admin-card">
          <div className="settings-section-head"><span><Building2 /></span><div><h2>업무공간 정보</h2><p>구성원에게 표시되는 조직 이름입니다.</p></div></div>
          <label className="admin-field">업무공간 이름<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} maxLength={80} disabled={!admin} /></label>
          <div className="admin-readonly-row"><span>조직 식별자</span><code>{user?.organizationId}</code></div>
          <div className="admin-readonly-row"><span>서비스 이용기간</span><strong>{user?.subscriptionExpiresAt ? `${new Date(user.subscriptionExpiresAt).toLocaleDateString("ko-KR")}까지` : "기간 미설정"}</strong></div>
          <p className="setting-help">이용기간과 입금 확인은 설계한눈 사이트 관리자가 관리합니다.</p>
        </section>

        <section className="settings-section admin-card">
          <div className="settings-section-head"><span><BellRing /></span><div><h2>알림 기본값</h2><p>신규 업무에 적용할 기본 알림을 설정합니다.</p></div></div>
          <div className="reminder-options">{[7, 3, 1, 0, -1].map((offset) => <label key={offset}><input type="checkbox" checked={configuration.reminderOffsets.includes(offset)} disabled={!admin} onChange={() => toggleReminder(offset)} /><span><Check size={14} /></span>{offset > 0 ? `D-${offset}` : offset === 0 ? "당일" : "지연"}</label>)}</div>
          <div className="admin-inline-form"><input type="number" min="0" max="365" value={customReminder} onChange={(event) => setCustomReminder(event.target.value)} placeholder="추가 D-일" disabled={!admin} /><button type="button" onClick={addCustomReminder} disabled={!admin}><Plus size={15} /> 추가</button></div>
          <div className="admin-toggle-row"><label><input type="checkbox" checked={notification.inAppEnabled} disabled={!admin} onChange={(event) => patchConfiguration({ notificationDefaults: { ...notification, inAppEnabled: event.target.checked } })} /> 인앱 알림</label><label><input type="checkbox" checked={notification.emailEnabled} disabled={!admin} onChange={(event) => patchConfiguration({ notificationDefaults: { ...notification, emailEnabled: event.target.checked } })} /> 이메일 알림</label></div>
          {notification.emailEnabled && <p className="setting-help">SMTP Secret이 설정되지 않으면 이메일만 실패하고 업무 저장과 인앱 알림은 계속 동작합니다.</p>}
        </section>

        <section className="settings-section admin-card wide">
          <div className="settings-section-head"><span><CalendarClock /></span><div><h2>처리기한·휴일</h2><p>자동 계산의 조직 기본값이며 업무별 근거와 수정 이력이 우선합니다.</p></div></div>
          <div className="admin-form-grid four">
            <label>계산 방식<select value={deadline.mode} disabled={!admin} onChange={(event) => patchConfiguration({ deadlineDefaults: { ...deadline, mode: event.target.value as "calendar-days" | "business-days" } })}><option value="business-days">업무일</option><option value="calendar-days">달력일</option></select></label>
            <label>기본 일수<input type="number" min="1" max="365" value={deadline.days} disabled={!admin} onChange={(event) => patchConfiguration({ deadlineDefaults: { ...deadline, days: Number(event.target.value) } })} /></label>
            <label className="checkbox-field"><input type="checkbox" checked={deadline.includeStartDate} disabled={!admin} onChange={(event) => patchConfiguration({ deadlineDefaults: { ...deadline, includeStartDate: event.target.checked } })} /> 접수일 포함</label>
            <label>근거 이름<input value={deadline.sourceLabel} disabled={!admin} onChange={(event) => patchConfiguration({ deadlineDefaults: { ...deadline, sourceLabel: event.target.value } })} /></label>
          </div>
          <label className="admin-field">근거 URL<input type="url" value={deadline.sourceUrl} disabled={!admin} placeholder="https://..." onChange={(event) => patchConfiguration({ deadlineDefaults: { ...deadline, sourceUrl: event.target.value } })} /></label>
          {deadline.mode === "business-days" && <div className="weekday-options">{[[0, "일"], [1, "월"], [2, "화"], [3, "수"], [4, "목"], [5, "금"], [6, "토"]].map(([value, label]) => <label key={value}><input type="checkbox" checked={deadline.excludedWeekdays.includes(Number(value))} disabled={!admin} onChange={() => patchConfiguration({ deadlineDefaults: { ...deadline, excludedWeekdays: deadline.excludedWeekdays.includes(Number(value)) ? deadline.excludedWeekdays.filter((day) => day !== Number(value)) : [...deadline.excludedWeekdays, Number(value)] } })} /> {label} 제외</label>)}</div>}
          <div className="admin-inline-form"><input type="date" value={holidayDate} onChange={(event) => setHolidayDate(event.target.value)} disabled={!admin} /><button type="button" onClick={addHoliday} disabled={!admin}><Plus size={15} /> 휴일 추가</button></div>
          <div className="admin-tag-list">{deadline.holidays.length ? deadline.holidays.map((date) => <span key={date}>{date}<button type="button" aria-label={`${date} 휴일 삭제`} disabled={!admin} onClick={() => patchConfiguration({ deadlineDefaults: { ...deadline, holidays: deadline.holidays.filter((item) => item !== date) } })}>×</button></span>) : <small>추가 휴일이 없습니다.</small>}</div>
        </section>

        <section className="settings-section admin-card wide">
          <div className="settings-section-head"><span><ListChecks /></span><div><h2>업무 상태</h2><p>기본 상태는 유지하고 조직 전용 상태를 편집·정렬합니다.</p></div></div>
          <div className="settings-chips">{defaultStatuses.map((status) => <span key={status.id}><i style={{ background: status.color }} />{status.label}<small>기본</small></span>)}</div>
          <div className="admin-edit-list">{configuration.customStatuses.map((status, index) => <article key={status.id}>
            <input type="color" value={status.color} disabled={!admin} aria-label={`${status.label} 색상`} onChange={(event) => updateStatus(status.id, { color: event.target.value })} />
            <input value={status.label} disabled={!admin} aria-label="상태 이름" onChange={(event) => updateStatus(status.id, { label: event.target.value })} />
            <label><input type="checkbox" checked={Boolean(status.isTerminal)} disabled={!admin} onChange={(event) => updateStatus(status.id, { isTerminal: event.target.checked })} /> 종료 상태</label>
            <div><button type="button" onClick={() => patchConfiguration({ customStatuses: moveItem(configuration.customStatuses, index, -1) })} disabled={!admin || index === 0} aria-label={`${status.label} 위로`}><ArrowUp size={15} /></button><button type="button" onClick={() => patchConfiguration({ customStatuses: moveItem(configuration.customStatuses, index, 1) })} disabled={!admin || index === configuration.customStatuses.length - 1} aria-label={`${status.label} 아래로`}><ArrowDown size={15} /></button><button type="button" onClick={() => patchConfiguration({ customStatuses: configuration.customStatuses.filter((item) => item.id !== status.id) })} disabled={!admin} aria-label={`${status.label} 삭제`}><Trash2 size={15} /></button></div>
          </article>)}</div>
          {admin && <div className="admin-inline-form"><input value={customStatus} onChange={(event) => setCustomStatus(event.target.value)} placeholder="조직 상태 이름" /><button type="button" onClick={addStatus}><Plus size={16} /> 상태 추가</button></div>}
        </section>

        <section className="settings-section admin-card wide">
          <div className="settings-section-head"><span><FileCheck2 /></span><div><h2>허가·의제 카탈로그</h2><p>조직 유형을 편집하고 의제가 연결될 주허가를 지정합니다.</p></div></div>
          <details className="admin-default-catalog"><summary>기본 카탈로그 {defaultPermitCatalog.length}개 보기</summary><div className="catalog-list">{defaultPermitCatalog.map((permit) => <article key={permit.id}><div><strong>{permit.name}</strong><small>{permit.category === "main" ? "주허가" : "의제 후보"} · {permit.legalBasis}</small></div><span>기본</span></article>)}</div></details>
          <div className="admin-permit-list">{configuration.customPermits.map((permit, index) => <article key={permit.id}>
            <input value={permit.name} disabled={!admin} aria-label="허가 이름" onChange={(event) => updatePermit(permit.id, { name: event.target.value })} />
            <select value={permit.category} disabled={!admin} aria-label={`${permit.name} 분류`} onChange={(event) => { const category = event.target.value as "main" | "agenda"; updatePermit(permit.id, { category, canBePrimary: category === "main", relatedPrimaryCatalogIds: category === "agenda" ? [relatedPrimary] : [] }); }}><option value="main">주허가</option><option value="agenda">의제</option></select>
            <input value={permit.legalBasis} disabled={!admin} aria-label={`${permit.name} 법적 근거`} onChange={(event) => updatePermit(permit.id, { legalBasis: event.target.value })} />
            {permit.category === "agenda" && <select value={permit.relatedPrimaryCatalogIds[0] ?? ""} disabled={!admin} aria-label={`${permit.name} 연계 주허가`} onChange={(event) => updatePermit(permit.id, { relatedPrimaryCatalogIds: event.target.value ? [event.target.value] : [] })}><option value="">모든 주허가</option>{primaryPermits.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>}
            <div><button type="button" onClick={() => patchConfiguration({ customPermits: moveItem(configuration.customPermits, index, -1) })} disabled={!admin || index === 0}><ArrowUp size={15} /></button><button type="button" onClick={() => patchConfiguration({ customPermits: moveItem(configuration.customPermits, index, 1) })} disabled={!admin || index === configuration.customPermits.length - 1}><ArrowDown size={15} /></button><button type="button" onClick={() => patchConfiguration({ customPermits: configuration.customPermits.filter((item) => item.id !== permit.id) })} disabled={!admin}><Trash2 size={15} /></button></div>
          </article>)}</div>
          {admin && <div className="admin-form-grid permit-add-grid"><label>유형명<input value={customPermit} onChange={(event) => setCustomPermit(event.target.value)} placeholder="추가 허가 유형" /></label><label>분류<select value={permitCategory} onChange={(event) => setPermitCategory(event.target.value as "main" | "agenda")}><option value="main">주허가</option><option value="agenda">의제 후보</option></select></label><label>법적 근거<input value={permitBasis} onChange={(event) => setPermitBasis(event.target.value)} placeholder="법령·조례" /></label>{permitCategory === "agenda" && <label>연계 주허가<select value={relatedPrimary} onChange={(event) => setRelatedPrimary(event.target.value)}>{primaryPermits.map((permit) => <option value={permit.id} key={permit.id}>{permit.name}</option>)}</select></label>}<button type="button" onClick={addPermit}><Plus size={16} /> 유형 추가</button></div>}
        </section>

        <section className="settings-section admin-card wide">
          <div className="settings-section-head"><span><MapPinned /></span><div><h2>지역 기준 프로필</h2><p>공식 출처와 확인일을 기록하며 미검증 지역은 자동 적합 판정을 허용하지 않습니다.</p></div></div>
          <div className="region-profile-list">{regions.map((profile) => <article key={profile.id}><div><strong>{profile.jurisdictionName}</strong><small>{profile.jurisdictionCode} · {profile.status === "verified-sample" ? "검증 표본" : "미검증"}</small></div><a href={profile.sourceUrl} target="_blank" rel="noreferrer">{profile.sourceLabel}</a><span>시행 {profile.effectiveDate || "미입력"} · 확인 {profile.checkedAt || "미입력"}</span><button type="button" disabled={!admin} onClick={() => patchConfiguration({ regionProfiles: regions.filter((item) => item.id !== profile.id) })} aria-label={`${profile.jurisdictionName} 삭제`}><Trash2 size={15} /></button></article>)}</div>
          {admin && <details className="admin-region-add"><summary><Plus size={16} /> 지역 프로필 추가</summary><div className="admin-form-grid four"><label>관할 코드<input value={regionDraft.jurisdictionCode} onChange={(event) => setRegionDraft({ ...regionDraft, jurisdictionCode: event.target.value })} /></label><label>관할명<input value={regionDraft.jurisdictionName} onChange={(event) => setRegionDraft({ ...regionDraft, jurisdictionName: event.target.value })} /></label><label>검증 상태<select value={regionDraft.status} onChange={(event) => setRegionDraft({ ...regionDraft, status: event.target.value as "verified-sample" | "unverified", legalAutomationAllowed: false })}><option value="unverified">미검증</option><option value="verified-sample">검증 표본</option></select></label><label>시행일<input type="date" value={regionDraft.effectiveDate} onChange={(event) => setRegionDraft({ ...regionDraft, effectiveDate: event.target.value })} /></label><label>확인일<input type="date" value={regionDraft.checkedAt} onChange={(event) => setRegionDraft({ ...regionDraft, checkedAt: event.target.value })} /></label><label>출처 이름<input value={regionDraft.sourceLabel} onChange={(event) => setRegionDraft({ ...regionDraft, sourceLabel: event.target.value })} /></label><label className="span-two">공식 출처 URL<input type="url" value={regionDraft.sourceUrl} onChange={(event) => setRegionDraft({ ...regionDraft, sourceUrl: event.target.value })} placeholder="https://..." /></label><label className="span-four">운영 안내<textarea value={regionDraft.guidance} onChange={(event) => setRegionDraft({ ...regionDraft, guidance: event.target.value })} /></label></div><button type="button" className="button button-secondary compact" onClick={addRegion}>프로필 추가</button></details>}
        </section>

        <section className="settings-section admin-card">
          <div className="settings-section-head"><span><Database /></span><div><h2>신뢰 기기 캐시</h2><p>현재 기기에만 적용되는 사용자 설정입니다.</p></div></div>
          <div className="cache-setting"><div><strong>영구 업무 캐시 저장</strong><span>공용 PC에서는 활성화하지 마세요.</span></div><button type="button" className={`toggle ${cacheEnabled ? "on" : ""}`} onClick={() => toggleCache(!cacheEnabled)} aria-pressed={cacheEnabled} disabled={!user || user.isDemo}><span /></button></div>
          <button type="button" className="button button-secondary compact" onClick={() => void clearCache()} disabled={user?.isDemo}>이 기기 캐시 삭제</button>
          {cacheMessage && <p className="setting-success">{cacheMessage}</p>}
        </section>

        <section className="settings-section admin-card audit-card">
          <div className="settings-section-head"><span><History /></span><div><h2>관리자 변경 이력</h2><p>최근 100건의 조직 설정·권한 변경을 표시합니다.</p></div></div>
          {admin ? <div className="admin-audit-list">{auditEntries.length ? auditEntries.slice(0, 12).map((entry) => <article key={entry.id}><span>{entry.action}</span><strong>{entry.detail}</strong><small>{entry.actorName} · {formatAuditDate(entry.createdAt)}</small></article>) : <p className="setting-help">아직 기록된 관리자 변경이 없습니다.</p>}</div> : <p className="setting-help">감사 이력은 관리자만 볼 수 있습니다.</p>}
        </section>
      </div>
    </div>
  );
}
