import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Brand } from "../components/Brand";
import { useAuth } from "../context";
import { firebaseConfigured } from "../services/firebase";

export function LoginPage() {
  const { user, loginWithGoogle, loginWithEmail, register, startDemo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const requestedReturnTo = new URLSearchParams(location.search).get("returnTo") ?? "";
  const destination = requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//")
    ? requestedReturnTo
    : "/app";
  const joiningInvitation = destination.startsWith("/invite?");

  useEffect(() => {
    if (user) navigate(destination, { replace: true });
  }, [destination, navigate, user]);

  const wantsDemo = new URLSearchParams(location.search).get("demo") === "1";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      if (mode === "register") await register(name, joiningInvitation ? "" : organizationName, email, password);
      else await loginWithEmail(email, password);
      navigate(destination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "로그인에 실패했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function googleLogin() {
    setPending(true);
    setError("");
    try {
      await loginWithGoogle();
      navigate(destination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Google 로그인에 실패했습니다.");
    } finally {
      setPending(false);
    }
  }

  function enterDemo() {
    startDemo();
    navigate("/app");
  }

  return (
    <div className="login-page">
      <div className="login-brand-panel">
        <Link className="back-link" to="/"><ArrowLeft size={17} /> 소개로 돌아가기</Link>
        <Brand />
        <div className="login-message">
          <span>한 사건, 한 흐름</span>
          <h1>흩어진 인허가 업무를<br />이어 관리하세요.</h1>
          <p>필지·허가·접수·보완·문서 버전을 조직 권한 안에서 함께 관리합니다.</p>
        </div>
        <div className="login-security"><ShieldCheck /> 실제 민원 자료는 로그인한 조직 구성원만 접근합니다.</div>
      </div>

      <main className="login-form-panel">
        <div className="login-card">
          <div className="login-card-head">
            <span>{mode === "login" ? "다시 만나 반갑습니다" : "업무 공간 시작하기"}</span>
            <h2>{mode === "login" ? "설계한눈 로그인" : "계정 만들기"}</h2>
            <p>{firebaseConfigured ? "조직 계정으로 업무 공간에 접속하세요." : "Firebase 연결 전에는 샘플 업무 공간을 이용할 수 있습니다."}</p>
          </div>

          {wantsDemo && (
            <div className="demo-login-callout">
              <div><strong>로그인 없이 먼저 둘러보세요</strong><span>브라우저에 저장되는 샘플 데이터만 사용합니다.</span></div>
              <button type="button" className="button button-primary" onClick={enterDemo}>샘플 업무 시작</button>
            </div>
          )}

          {firebaseConfigured && (
            <>
              <button type="button" className="google-button" onClick={googleLogin} disabled={pending}>
                <span className="google-g">G</span> Google로 계속
              </button>
              <div className="form-divider"><span>또는 이메일</span></div>
            </>
          )}

          <form onSubmit={submit}>
            {mode === "register" && (
              <>
                <label>이름<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>
                {!joiningInvitation && <label>조직 이름<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} autoComplete="organization" placeholder="예: 한눈 설계사무소" required /></label>}
              </>
            )}
            <label>
              이메일
              <span className="input-with-icon"><Mail size={18} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@company.com" required /></span>
            </label>
            <label>
              비밀번호
              <span className="input-with-icon"><LockKeyhole size={18} /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={6} placeholder="6자 이상" required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button type="submit" className="button button-primary button-full" disabled={pending || !firebaseConfigured}>
              {pending ? "확인 중…" : mode === "login" ? "로그인" : "계정 만들기"}
            </button>
          </form>

          {!firebaseConfigured && !wantsDemo && (
            <button type="button" className="button button-secondary button-full demo-entry" onClick={enterDemo}>샘플 업무 공간으로 시작</button>
          )}

          {firebaseConfigured && (
            <p className="mode-switch">
              {mode === "login" ? "처음 사용하시나요?" : "이미 계정이 있나요?"}
              <button type="button" onClick={() => setMode((current) => current === "login" ? "register" : "login")}>{mode === "login" ? "계정 만들기" : "로그인"}</button>
            </p>
          )}
          <p className="login-notice">접속하면 조직의 이용정책과 개인정보 처리방침에 동의하게 됩니다.</p>
        </div>
      </main>
    </div>
  );
}
