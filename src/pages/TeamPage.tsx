import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Copy, MailPlus, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { useAuth } from "../context";
import {
  createOrganizationInvitation,
  subscribeOrganizationMembers,
  updateOrganizationMemberRole,
  type InvitationResult,
  type OrganizationMemberRecord,
} from "../services/organizationRepository";
import { buildInvitationUrl } from "../domain/invitationUrl";
import type { OrganizationRole } from "../types";

const roleLabels: Record<OrganizationRole, string> = {
  admin: "관리자",
  editor: "편집자",
  viewer: "열람자",
};

export function TeamPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<OrganizationMemberRecord[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationRole>("editor");
  const [result, setResult] = useState<InvitationResult | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user?.organizationId) return;
    return subscribeOrganizationMembers(
      user.organizationId,
      user.isDemo,
      setMembers,
      (error) => setMessage(error.message),
    );
  }, [user]);

  const inviteUrl = useMemo(() => result && user
    ? buildInvitationUrl(
      window.location.origin,
      user.organizationId,
      result.token,
      import.meta.env.VITE_DEPLOY_TARGET === "github-pages",
    )
    : "", [result, user]);

  async function submitInvitation(event: FormEvent) {
    event.preventDefault();
    if (!user || user.role !== "admin") return;
    setPending(true);
    setMessage("");
    try {
      setResult(await createOrganizationInvitation(user.organizationId, email.trim(), role, user.isDemo));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "초대를 만들지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function changeRole(memberId: string, nextRole: OrganizationRole) {
    if (!user || user.role !== "admin" || memberId === user.uid) return;
    setMessage("");
    try {
      await updateOrganizationMemberRole(user.organizationId, memberId, nextRole, user.isDemo);
      setMessage("구성원 역할을 저장했습니다.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "역할을 저장하지 못했습니다.");
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setMessage("초대 링크를 복사했습니다.");
    } catch {
      setMessage("링크를 직접 선택해 복사해 주세요.");
    }
  }

  function closeDialog() {
    setInviteOpen(false);
    setResult(null);
    setEmail("");
  }

  return (
    <div className="simple-page team-page">
      <header className="page-header"><div><span className="page-kicker">조직 권한</span><h1>구성원</h1><p>업무 수정 범위를 관리자·편집자·열람자로 나눕니다.</p></div>{user?.role === "admin" && <button type="button" className="button button-primary" onClick={() => setInviteOpen(true)}><MailPlus size={18} /> 구성원 초대</button>}</header>
      <div className="role-grid"><article><span><ShieldCheck /></span><strong>관리자</strong><p>구성원·상태·허가 카탈로그와 모든 업무를 관리합니다.</p></article><article><span><UsersRound /></span><strong>편집자</strong><p>업무와 첨부를 수정하지만 구성원 설정은 변경하지 못합니다.</p></article><article><span><UserRound /></span><strong>열람자</strong><p>업무 조회와 권한 있는 문서 다운로드만 할 수 있습니다.</p></article></div>
      {message && <div className="settings-save-message" role="status">{message}</div>}
      <section className="table-card"><div className="table-toolbar"><strong>{user?.organizationName}</strong><span>{members.length}명</span></div><div className="member-table">{members.map((member) => <article key={member.id}><span className="member-avatar">{member.displayName.slice(0, 1)}</span><div><strong>{member.displayName}{member.id === user?.uid && <em>나</em>}</strong><small>{member.email}</small></div><select className="member-role-select" value={member.role} disabled={user?.role !== "admin" || member.id === user.uid || member.status === "pending"} onChange={(event) => void changeRole(member.id, event.target.value as OrganizationRole)} aria-label={`${member.displayName} 역할`}><option value="admin">관리자</option><option value="editor">편집자</option><option value="viewer">열람자</option></select><span className={`member-status ${member.status === "pending" ? "pending" : ""}`}>{member.status === "pending" ? "초대 대기" : "사용 중"}</span></article>)}</div></section>
      {inviteOpen && <div className="modal-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title"><h2 id="invite-title">구성원 초대</h2><p>{result ? "초대 링크를 전달하세요. 링크는 7일 동안 유효합니다." : "초대받은 계정이 링크를 수락하면 조직 멤버십이 생성됩니다."}</p>{result ? <div className="invitation-result"><div className="dialog-success"><Check /> {result.emailStatus === "not-configured" ? "이메일 설정 전이므로 링크를 직접 전달해 주세요." : "체험용 초대가 생성되었습니다."}</div><label>초대 링크<div className="copy-field"><input value={inviteUrl} readOnly /><button type="button" onClick={copyInvite} aria-label="초대 링크 복사"><Copy size={17} /></button></div></label></div> : <form onSubmit={submitInvitation}><label>이메일<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@company.com" required /></label><label>역할<select value={role} onChange={(event) => setRole(event.target.value as OrganizationRole)}>{Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button type="submit" className="button button-primary button-full" disabled={pending}>{pending ? "생성 중…" : "초대 만들기"}</button></form>}<div className="dialog-actions"><button type="button" className="button button-secondary" onClick={closeDialog}>닫기</button></div></div></div>}
    </div>
  );
}
