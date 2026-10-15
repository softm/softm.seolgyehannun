import { addMonths } from "date-fns";
import {
  ArrowLeft,
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Users,
  X,
} from "lucide-react";
import { type SubmitEvent as ReactSubmitEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Brand } from "../components/Brand";
import { useAuth } from "../context";
import {
  confirmPlatformPayment,
  getPlatformAdminDashboard,
  updatePlatformOrganizationStatus,
  type PlatformDashboardData,
  type PlatformOrganizationSummary,
  type PlatformServiceStatus,
} from "../services/platformAdminRepository";
import "../platform-admin.css";

const statusLabels: Record<PlatformServiceStatus, string> = {
  active: "이용 중",
  trial: "체험 중",
  expiring: "만료 임박",
  expired: "기간 만료",
  suspended: "이용 정지",
  unconfigured: "기간 미설정",
};

function koreanDate(value: string | null): string {
  if (!value) return "미설정";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "미설정" : date.toLocaleDateString("ko-KR");
}

function koreanDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

function won(value: number): string {
  return `${Math.max(0, value).toLocaleString("ko-KR")}원`;
}

function todayInKorea(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function paymentPreview(organization: PlatformOrganizationSummary, months: number): string {
  const now = new Date();
  const current = organization.expiresAt ? new Date(organization.expiresAt) : null;
  const base = current && !Number.isNaN(current.getTime()) && current > now ? current : now;
  return addMonths(base, months).toLocaleDateString("ko-KR");
}

export function PlatformAdminPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<PlatformDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PlatformServiceStatus>("all");
  const [paymentTarget, setPaymentTarget] = useState<PlatformOrganizationSummary | null>(null);
  const [statusTarget, setStatusTarget] = useState<PlatformOrganizationSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [amount, setAmount] = useState("");
  const [months, setMonths] = useState(1);
  const [depositedAt, setDepositedAt] = useState(todayInKorea());
  const [depositorName, setDepositorName] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [suspensionReason, setSuspensionReason] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      setDashboard(await getPlatformAdminDashboard());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "사이트 운영 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredOrganizations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (dashboard?.organizations ?? []).filter((organization) => {
      const statusMatches = statusFilter === "all" || organization.serviceStatus === statusFilter;
      const queryMatches = !normalized || [organization.name, organization.ownerName, organization.ownerEmail, organization.id]
        .some((value) => value.toLowerCase().includes(normalized));
      return statusMatches && queryMatches;
    });
  }, [dashboard, query, statusFilter]);

  const summary = useMemo(() => {
    const organizations = dashboard?.organizations ?? [];
    return {
      total: organizations.length,
      using: organizations.filter((item) => ["active", "trial", "expiring"].includes(item.serviceStatus)).length,
      expiring: organizations.filter((item) => item.serviceStatus === "expiring" || item.serviceStatus === "expired").length,
      suspended: organizations.filter((item) => item.serviceStatus === "suspended").length,
    };
  }, [dashboard]);

  function openPayment(organization: PlatformOrganizationSummary) {
    setPaymentTarget(organization);
    setAmount("");
    setMonths(1);
    setDepositedAt(todayInKorea());
    setDepositorName(organization.name);
    setPaymentNote("");
    setMessage("");
    setError("");
  }

  async function submitPayment(event: ReactSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paymentTarget) return;
    const numericAmount = Number(amount.replace(/[^0-9]/g, ""));
    setPending(true);
    setError("");
    try {
      const result = await confirmPlatformPayment({
        organizationId: paymentTarget.id,
        amount: numericAmount,
        months,
        depositedAt,
        depositorName: depositorName.trim(),
        note: paymentNote.trim(),
      });
      setMessage(`${paymentTarget.name} 입금을 확인하고 ${koreanDate(result.extendedExpiresAt)}까지 연장했습니다.`);
      setPaymentTarget(null);
      await load(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "입금 확인을 저장하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function changeStatus(event: ReactSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statusTarget) return;
    const nextStatus = statusTarget.platformStatus === "suspended" ? "active" : "suspended";
    setPending(true);
    setError("");
    try {
      await updatePlatformOrganizationStatus(statusTarget.id, nextStatus, nextStatus === "suspended" ? suspensionReason.trim() : "사이트 관리자 재개");
      setMessage(`${statusTarget.name}의 이용을 ${nextStatus === "suspended" ? "정지" : "재개"}했습니다.`);
      setStatusTarget(null);
      setSuspensionReason("");
      await load(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "이용 상태를 변경하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function leave() {
    await logout();
    navigate("/login?returnTo=%2Fsite-admin");
  }

  if (loading) return <div className="platform-admin-loading"><LoaderCircle className="spin" /><span>가입 설계사무소를 불러오고 있습니다.</span></div>;

  return (
    <div className="platform-admin-page">
      <header className="platform-admin-topbar">
        <div><Brand compact to="/site-admin" /><span className="platform-admin-badge"><ShieldCheck size={15} /> 사이트 관리자</span></div>
        <nav aria-label="사이트 관리자 작업">
          {user?.organizationId && <button type="button" onClick={() => navigate("/app")}><ArrowLeft size={17} /> 업무공간</button>}
          <button type="button" onClick={() => void load(true)} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : ""} size={17} /> 새로고침</button>
          <button type="button" onClick={() => void leave()}><LogOut size={17} /> 로그아웃</button>
        </nav>
      </header>

      <main className="platform-admin-main">
        <section className="platform-admin-hero">
          <div><p className="page-kicker">설계한눈 운영</p><h1>가입 설계사무소와 이용기간 관리</h1><p>조직 가입 현황을 확인하고, 입금 내역을 근거로 이용기간을 연장합니다. 모든 조치는 사이트 관리자 이력에 기록됩니다.</p></div>
          <div className="platform-admin-identity"><span>{user?.displayName.slice(0, 1)}</span><div><strong>{user?.displayName}</strong><small>{user?.platformRole === "owner" ? "최고 관리자" : "운영 관리자"} · {user?.email}</small></div></div>
        </section>

        {message && <div className="platform-admin-message success" role="status"><CheckCircle2 /> {message}</div>}
        {error && <div className="platform-admin-message error" role="alert"><ShieldOff /> {error}</div>}

        <section className="platform-summary-grid" aria-label="전체 운영 현황">
          <article><span><Building2 /></span><div><small>가입 설계사무소</small><strong>{summary.total.toLocaleString("ko-KR")}</strong></div></article>
          <article><span><ShieldCheck /></span><div><small>이용 중</small><strong>{summary.using.toLocaleString("ko-KR")}</strong></div></article>
          <article><span><CalendarClock /></span><div><small>만료 임박·만료</small><strong>{summary.expiring.toLocaleString("ko-KR")}</strong></div></article>
          <article><span><ShieldOff /></span><div><small>이용 정지</small><strong>{summary.suspended.toLocaleString("ko-KR")}</strong></div></article>
          <article><span><CircleDollarSign /></span><div><small>이번 달 확인 입금</small><strong>{won(dashboard?.monthlyRevenue ?? 0)}</strong></div></article>
        </section>

        <section className="platform-panel platform-organizations" aria-labelledby="platform-organizations-title">
          <header>
            <div><h2 id="platform-organizations-title">설계사무소</h2><p>가입 조직 {dashboard?.organizations.length ?? 0}개 중 {filteredOrganizations.length}개 표시</p></div>
            <div className="platform-filters">
              <label><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="사무소·관리자·이메일 검색" /></label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="이용 상태 필터">
                <option value="all">전체 상태</option>
                {Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </div>
          </header>

          <div className="platform-org-table" role="table" aria-label="가입 설계사무소 목록">
            <div className="platform-org-table-head" role="row"><span role="columnheader">설계사무소</span><span role="columnheader">이용 상태</span><span role="columnheader">현황</span><span role="columnheader">이용 만료일</span><span role="columnheader">관리</span></div>
            {filteredOrganizations.length ? filteredOrganizations.map((organization) => (
              <article role="row" key={organization.id}>
                <div className="platform-org-name" role="cell"><span>{organization.name.slice(0, 1)}</span><div><strong>{organization.name}</strong><small>{organization.ownerName || "관리자 미확인"}{organization.ownerEmail ? ` · ${organization.ownerEmail}` : ""}</small><code>{organization.id}</code></div></div>
                <div role="cell"><span className={`platform-status ${organization.serviceStatus}`}>{statusLabels[organization.serviceStatus]}</span>{organization.suspendedReason && <small className="platform-suspended-reason">{organization.suspendedReason}</small>}</div>
                <div className="platform-org-counts" role="cell"><span><Users size={15} /> {organization.memberCount}명</span><span><Building2 size={15} /> 업무 {organization.caseCount}건</span></div>
                <div className="platform-org-expiry" role="cell"><strong>{koreanDate(organization.expiresAt)}</strong><small>가입 {koreanDate(organization.createdAt)}</small></div>
                <div className="platform-org-actions" role="cell">
                  <button type="button" className="primary" onClick={() => openPayment(organization)}><Banknote size={16} /> 입금 확인</button>
                  <button type="button" onClick={() => { setStatusTarget(organization); setSuspensionReason(""); setError(""); }}>{organization.platformStatus === "suspended" ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}{organization.platformStatus === "suspended" ? "재개" : "정지"}</button>
                </div>
              </article>
            )) : <div className="platform-empty">조건에 맞는 설계사무소가 없습니다.</div>}
          </div>
        </section>

        <section className="platform-panel platform-payments" aria-labelledby="platform-payments-title">
          <header><div><h2 id="platform-payments-title">최근 입금 확인 이력</h2><p>사이트 관리자가 확인한 최근 30건입니다.</p></div></header>
          <div className="platform-payment-list">
            {dashboard?.recentPayments.length ? dashboard.recentPayments.map((payment) => <article key={payment.id}><span><Banknote /></span><div><strong>{payment.organizationName}</strong><small>{payment.depositorName} · 입금일 {payment.depositedAt} · {payment.months}개월</small></div><div><strong>{won(payment.amount)}</strong><small>{koreanDate(payment.extendedExpiresAt)}까지 · {koreanDateTime(payment.confirmedAt)}</small></div></article>) : <p className="platform-empty">아직 확인한 입금 내역이 없습니다.</p>}
          </div>
        </section>
      </main>

      {paymentTarget && <div className="platform-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setPaymentTarget(null); }}><aside className="platform-drawer" role="dialog" aria-modal="true" aria-labelledby="payment-dialog-title"><header><div><span><Banknote /></span><div><p>수동 입금 확인</p><h2 id="payment-dialog-title">{paymentTarget.name}</h2></div></div><button type="button" aria-label="닫기" onClick={() => setPaymentTarget(null)} disabled={pending}><X /></button></header><form onSubmit={submitPayment}>
        <div className="platform-current-period"><span>현재 이용 만료일</span><strong>{koreanDate(paymentTarget.expiresAt)}</strong></div>
        <div className="platform-form-grid"><label>입금자명<input value={depositorName} onChange={(event) => setDepositorName(event.target.value)} maxLength={80} required autoFocus /></label><label>입금일<input type="date" value={depositedAt} onChange={(event) => setDepositedAt(event.target.value)} required /></label><label>입금액<input inputMode="numeric" value={amount ? Number(amount).toLocaleString("ko-KR") : ""} onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))} placeholder="0" required /></label><label>연장 기간<select value={months} onChange={(event) => setMonths(Number(event.target.value))}>{[1, 3, 6, 12, 24, 36].map((value) => <option value={value} key={value}>{value}개월</option>)}</select></label></div>
        <label>관리 메모<textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} maxLength={500} placeholder="입금 계좌, 확인 내용 등 운영 메모" /></label>
        <div className="platform-extension-preview"><CalendarClock /><div><span>입금 확인 후 예상 만료일</span><strong>{paymentPreview(paymentTarget, months)}</strong><small>현재 만료일이 남아 있으면 그 다음 기간부터 연장합니다.</small></div></div>
        <footer><button type="button" onClick={() => setPaymentTarget(null)} disabled={pending}>취소</button><button type="submit" className="primary" disabled={pending || !depositorName.trim() || !depositedAt || !amount}>{pending ? <LoaderCircle className="spin" /> : <CheckCircle2 />} 입금 확인 및 기간 연장</button></footer>
      </form></aside></div>}

      {statusTarget && <div className="platform-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setStatusTarget(null); }}><section className="platform-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="status-dialog-title"><span className={statusTarget.platformStatus === "suspended" ? "reactivate" : "suspend"}>{statusTarget.platformStatus === "suspended" ? <ShieldCheck /> : <ShieldOff />}</span><h2 id="status-dialog-title">{statusTarget.name} 이용 {statusTarget.platformStatus === "suspended" ? "재개" : "정지"}</h2><p>{statusTarget.platformStatus === "suspended" ? "구성원이 업무 자료에 다시 접근할 수 있습니다." : "정지 즉시 모든 구성원의 업무·문서·첨부 접근이 차단되며 자료는 그대로 보관됩니다."}</p><form onSubmit={changeStatus}>{statusTarget.platformStatus !== "suspended" && <label>정지 사유<textarea value={suspensionReason} onChange={(event) => setSuspensionReason(event.target.value)} maxLength={300} required autoFocus placeholder="예: 이용기간 만료 및 입금 미확인" /></label>}<footer><button type="button" onClick={() => setStatusTarget(null)} disabled={pending}>취소</button><button type="submit" className={statusTarget.platformStatus === "suspended" ? "primary" : "danger"} disabled={pending || (statusTarget.platformStatus !== "suspended" && !suspensionReason.trim())}>{pending ? <LoaderCircle className="spin" /> : null}{statusTarget.platformStatus === "suspended" ? "이용 재개" : "이용 정지"}</button></footer></form></section></div>}
    </div>
  );
}
