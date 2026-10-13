import { useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, LogOut, MailCheck } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Brand } from "../components/Brand";
import { useAuth } from "../context";
import { firebaseConfigured } from "../services/firebase";
import { acceptOrganizationInvitation } from "../services/organizationRepository";

export function InvitationPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const organizationId = params.get("organizationId") ?? "";
  const token = params.get("token") ?? "";
  const returnTo = `/invite?organizationId=${encodeURIComponent(organizationId)}&token=${encodeURIComponent(token)}`;
  const validLink = Boolean(organizationId && token);

  async function accept() {
    if (!validLink || !user || user.isDemo) return;
    setPending(true);
    setError("");
    try {
      await acceptOrganizationInvitation(organizationId, token);
      setAccepted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "초대를 수락하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function switchAccount() {
    setPending(true);
    setError("");
    try {
      await logout();
      navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "로그아웃하지 못했습니다. 다시 시도해 주세요.");
      setPending(false);
    }
  }

  return (
    <main className="invitation-page">
      <Link to="/" aria-label="설계한눈 홈"><Brand /></Link>
      <section className="invitation-card">
        <span className={`invitation-icon ${accepted ? "accepted" : ""}`}>{accepted ? <CheckCircle2 /> : <MailCheck />}</span>
        <span className="page-kicker">조직 초대</span>
        <h1>{accepted ? "초대를 수락했습니다" : "설계한눈 업무 공간에 참여하세요"}</h1>
        <p>{accepted ? "새 조직의 필지·허가·접수 업무를 열람할 수 있습니다." : "초대받은 이메일 계정으로 로그인한 뒤 조직 권한을 확인하고 수락합니다."}</p>
        {!validLink && <div className="form-error" role="alert"><CircleAlert size={17} /> 초대 링크에 필요한 정보가 없습니다.</div>}
        {error && <div className="form-error" role="alert"><CircleAlert size={17} /> {error}</div>}
        {accepted ? <Link className="button button-primary button-full" to="/app">업무 공간으로 이동 <ArrowRight size={18} /></Link> : !firebaseConfigured ? <div className="information-banner"><CircleAlert /><div><strong>Firebase 연결 후 사용할 수 있습니다.</strong><span>체험 모드는 실제 조직 초대를 수락하지 않습니다.</span></div></div> : !user ? <Link className="button button-primary button-full" to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>로그인하고 계속 <ArrowRight size={18} /></Link> : <><div className="invite-account"><span>{user.displayName.slice(0, 1)}</span><div><strong>{user.displayName}</strong><small>{user.email}</small></div></div><div className="invite-actions"><button type="button" className="button button-primary button-full" onClick={accept} disabled={!validLink || pending || user.isDemo}>{pending ? "처리 중…" : "초대 수락"}</button><button type="button" className="button button-secondary button-full" onClick={switchAccount} disabled={pending}><LogOut size={17} /> 다른 계정으로 로그인</button></div></>}
      </section>
    </main>
  );
}
