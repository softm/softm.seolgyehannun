import { useState, type FormEvent } from "react";
import { ArrowRight, Building2, LogOut, ShieldCheck } from "lucide-react";
import { Brand } from "../components/Brand";
import { useAuth } from "../context";

export function OrganizationSetupPage() {
  const { user, createOrganization, logout } = useAuth();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await createOrganization(name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "업무 공간을 만들지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="organization-setup-page">
      <div className="organization-setup-brand"><Brand /></div>
      <section className="organization-setup-card" aria-labelledby="organization-setup-title">
        <span className="organization-setup-icon"><Building2 size={25} /></span>
        <p className="page-kicker">첫 설정</p>
        <h1 id="organization-setup-title">조직 업무 공간을 만드세요</h1>
        <p>{user?.displayName}님과 함께 일할 구성원, 업무, 문서를 한 조직 안에서 안전하게 관리합니다.</p>
        <form onSubmit={submit}>
          <label>
            조직 이름
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} autoComplete="organization" placeholder="예: 한눈 설계사무소" required autoFocus />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button type="submit" className="button button-primary button-full" disabled={pending || name.trim().length < 2}>
            {pending ? "만드는 중…" : <>업무 공간 만들기 <ArrowRight size={18} /></>}
          </button>
        </form>
        <div className="organization-setup-note"><ShieldCheck size={17} /><span>생성자는 관리자가 되며, 이후 구성원 역할을 설정할 수 있습니다.</span></div>
        <button type="button" className="organization-setup-logout" onClick={logout}><LogOut size={16} /> 다른 계정으로 로그인</button>
      </section>
    </main>
  );
}
