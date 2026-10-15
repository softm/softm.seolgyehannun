import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Ban,
  Check,
  Clock3,
  Copy,
  MailPlus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useAuth } from "../context";
import {
  cancelOrganizationInvitation,
  createOrganizationInvitation,
  removeOrganizationMember,
  subscribeOrganizationInvitations,
  subscribeOrganizationMembers,
  updateOrganizationMemberRole,
  updateOrganizationMemberStatus,
  type InvitationResult,
  type OrganizationInvitationRecord,
  type OrganizationMemberRecord,
} from "../services/organizationRepository";
import { buildInvitationUrl } from "../domain/invitationUrl";
import type { OrganizationRole } from "../types";
import "../admin.css";

const roleLabels: Record<OrganizationRole, string> = {
  admin: "관리자",
  editor: "편집자",
  viewer: "열람자",
};

const invitationStatusLabels: Record<OrganizationInvitationRecord["status"], string> = {
  pending: "수락 대기",
  accepted: "수락 완료",
  cancelled: "취소됨",
  expired: "만료됨",
};

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export function TeamPage() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [members, setMembers] = useState<OrganizationMemberRecord[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitationRecord[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationRole>("editor");
  const [result, setResult] = useState<InvitationResult | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");

  useEffect(() => {
    if (!user?.organizationId) return;
    return subscribeOrganizationMembers(user.organizationId, user.isDemo, setMembers, (error) => setMessage(error.message));
  }, [user]);

  useEffect(() => {
    if (!user?.organizationId || !admin) return;
    return subscribeOrganizationInvitations(user.organizationId, user.isDemo, setInvitations, (error) => setMessage(error.message));
  }, [admin, user]);

  const inviteUrl = useMemo(() => result && user
    ? buildInvitationUrl(
      window.location.origin,
      user.organizationId,
      result.token,
      import.meta.env.VITE_DEPLOY_TARGET === "github-pages",
    )
    : "", [result, user]);

  const activeAdmins = members.filter((member) => member.role === "admin" && member.status === "active").length;
  const visibleMembers = members.filter((member) => {
    if (member.status === "pending") return false;
    if (statusFilter !== "all" && member.status !== statusFilter) return false;
    const keyword = search.trim().toLowerCase();
    return !keyword || `${member.displayName} ${member.email}`.toLowerCase().includes(keyword);
  });

  async function submitInvitation(event: FormEvent) {
    event.preventDefault();
    if (!user || !admin) return;
    setPending(true);
    setMessage("");
    try {
      setResult(await createOrganizationInvitation(user.organizationId, email.trim().toLowerCase(), role, user.isDemo, user.uid, user.displayName));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "초대를 만들지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  function isLastActiveAdmin(member: OrganizationMemberRecord): boolean {
    return member.role === "admin" && member.status === "active" && activeAdmins <= 1;
  }

  async function changeRole(member: OrganizationMemberRecord, nextRole: OrganizationRole) {
    if (!user || !admin || member.id === user.uid) return;
    if (nextRole !== "admin" && isLastActiveAdmin(member)) {
      setMessage("마지막 관리자의 역할은 변경할 수 없습니다. 다른 관리자를 먼저 지정해 주세요.");
      return;
    }
    setMessage("");
    try {
      await updateOrganizationMemberRole(user.organizationId, member.id, nextRole, user.isDemo, user.uid, user.displayName);
      setMessage("구성원 역할을 저장했습니다.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "역할을 저장하지 못했습니다.");
    }
  }

  async function toggleMemberStatus(member: OrganizationMemberRecord) {
    if (!user || !admin || member.id === user.uid) return;
    if (member.status === "active" && isLastActiveAdmin(member)) {
      setMessage("마지막 관리자는 정지할 수 없습니다.");
      return;
    }
    const nextStatus = member.status === "suspended" ? "active" : "suspended";
    try {
      await updateOrganizationMemberStatus(user.organizationId, member.id, nextStatus, user.isDemo, user.uid, user.displayName);
      setMessage(nextStatus === "active" ? "구성원 사용을 재개했습니다." : "구성원 사용을 정지했습니다.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "구성원 상태를 변경하지 못했습니다.");
    }
  }

  async function removeMember(member: OrganizationMemberRecord) {
    if (!user || !admin || member.id === user.uid) return;
    if (isLastActiveAdmin(member)) {
      setMessage("마지막 관리자는 제거할 수 없습니다.");
      return;
    }
    if (!window.confirm(`${member.displayName} 구성원을 업무공간에서 제거할까요?`)) return;
    try {
      await removeOrganizationMember(user.organizationId, member.id, user.isDemo, user.uid, user.displayName);
      setMessage("구성원을 제거했습니다.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "구성원을 제거하지 못했습니다.");
    }
  }

  async function cancelInvitation(invitation: OrganizationInvitationRecord) {
    if (!user || !admin) return;
    try {
      await cancelOrganizationInvitation(user.organizationId, invitation.id, user.isDemo, user.uid, user.displayName);
      setMessage("초대를 취소했습니다.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "초대를 취소하지 못했습니다.");
    }
  }

  async function recreateInvitation(invitation: OrganizationInvitationRecord) {
    if (!user || !admin) return;
    setPending(true);
    try {
      if (invitation.status === "pending") await cancelOrganizationInvitation(user.organizationId, invitation.id, user.isDemo, user.uid, user.displayName);
      setEmail(invitation.email);
      setRole(invitation.role);
      setResult(await createOrganizationInvitation(user.organizationId, invitation.email, invitation.role, user.isDemo, user.uid, user.displayName));
      setInviteOpen(true);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "초대를 다시 만들지 못했습니다.");
    } finally {
      setPending(false);
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
    setRole("editor");
  }

  return (
    <div className="simple-page team-page admin-console">
      <header className="page-header admin-page-header"><div><span className="page-kicker">사용자·권한 관리</span><h1>구성원</h1><p>초대부터 역할, 사용 정지와 제거까지 업무공간 접근을 관리합니다.</p></div>{admin && <button type="button" className="button button-primary" onClick={() => setInviteOpen(true)}><MailPlus size={18} /> 구성원 초대</button>}</header>
      {!admin && <div className="information-banner"><ShieldCheck /><div><strong>구성원 조회 전용</strong><span>초대와 역할 변경은 관리자만 할 수 있습니다.</span></div></div>}
      {message && <div className="settings-save-message" role="status">{message}</div>}

      <div className="team-summary-grid">
        <article><UsersRound /><span>전체 구성원</span><strong>{members.filter((item) => item.status !== "pending").length}</strong></article>
        <article><ShieldCheck /><span>관리자</span><strong>{members.filter((item) => item.role === "admin" && item.status === "active").length}</strong></article>
        <article><UserRound /><span>사용 중</span><strong>{members.filter((item) => item.status === "active").length}</strong></article>
        <article><Clock3 /><span>초대 대기</span><strong>{invitations.filter((item) => item.status === "pending").length}</strong></article>
      </div>

      <div className="role-grid"><article><span><ShieldCheck /></span><strong>관리자</strong><p>구성원·상태·허가 카탈로그와 모든 업무를 관리합니다.</p></article><article><span><UsersRound /></span><strong>편집자</strong><p>업무와 첨부를 수정하지만 조직 설정은 변경하지 못합니다.</p></article><article><span><UserRound /></span><strong>열람자</strong><p>업무 조회와 권한 있는 문서 다운로드만 할 수 있습니다.</p></article></div>

      <section className="table-card admin-member-card">
        <div className="table-toolbar admin-member-toolbar"><strong>{user?.organizationName}</strong><div className="member-filter-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름 또는 이메일 검색" aria-label="구성원 검색" /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="구성원 상태 필터"><option value="all">전체 상태</option><option value="active">사용 중</option><option value="suspended">사용 정지</option></select><span>{visibleMembers.length}명</span></div>
        <div className="member-table enhanced-member-table">{visibleMembers.map((member) => {
          const self = member.id === user?.uid;
          return <article key={member.id} className={member.status === "suspended" ? "suspended" : ""}>
            <span className="member-avatar">{member.displayName.slice(0, 1)}</span>
            <div className="member-identity"><strong>{member.displayName}{self && <em>나</em>}</strong><small>{member.email}</small></div>
            <select className="member-role-select" value={member.role} disabled={!admin || self || member.status === "suspended"} onChange={(event) => void changeRole(member, event.target.value as OrganizationRole)} aria-label={`${member.displayName} 역할`}>{Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
            <span className={`member-status ${member.status}`}>{member.status === "suspended" ? "사용 정지" : "사용 중"}</span>
            {admin && <div className="member-actions"><button type="button" disabled={self} onClick={() => void toggleMemberStatus(member)} title={member.status === "suspended" ? "사용 재개" : "사용 정지"}>{member.status === "suspended" ? <RotateCcw size={16} /> : <Ban size={16} />}</button><button type="button" disabled={self} onClick={() => void removeMember(member)} title="구성원 제거"><Trash2 size={16} /></button></div>}
          </article>;
        })}</div>
      </section>

      {admin && <section className="table-card invitation-history-card">
        <div className="table-toolbar"><strong>초대 이력</strong><span>최근 {invitations.length}건</span></div>
        <div className="invitation-history-list">{invitations.length ? invitations.map((invitation) => <article key={invitation.id}><div><strong>{invitation.email}</strong><small>{roleLabels[invitation.role]} · 생성 {formatDate(invitation.createdAt)}</small></div><span className={`invitation-state ${invitation.status}`}>{invitationStatusLabels[invitation.status]}</span><small>만료 {formatDate(invitation.expiresAt)}</small><div>{invitation.status === "pending" && <button type="button" onClick={() => void cancelInvitation(invitation)}><X size={15} /> 취소</button>}{invitation.status !== "accepted" && <button type="button" onClick={() => void recreateInvitation(invitation)} disabled={pending}><RotateCcw size={15} /> 새 링크</button>}</div></article>) : <p className="empty-admin-list">초대 이력이 없습니다.</p>}</div>
      </section>}

      {inviteOpen && <div className="modal-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title"><div className="dialog-title-row"><h2 id="invite-title">구성원 초대</h2><button type="button" onClick={closeDialog} aria-label="초대 창 닫기"><X /></button></div><p>{result ? "초대 링크를 전달하세요. 링크는 7일 동안 유효합니다." : "초대받은 이메일 계정으로 로그인해야 수락할 수 있습니다."}</p>{result ? <div className="invitation-result"><div className="dialog-success"><Check /> {result.emailStatus === "not-configured" ? "이메일 설정 전이므로 링크를 직접 전달해 주세요." : "초대가 생성되었습니다."}</div><label>초대 링크<div className="copy-field"><input value={inviteUrl} readOnly /><button type="button" onClick={() => void copyInvite()} aria-label="초대 링크 복사"><Copy size={17} /></button></div></label></div> : <form onSubmit={(event) => void submitInvitation(event)}><label>이메일<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@company.com" required autoFocus /></label><label>역할<select value={role} onChange={(event) => setRole(event.target.value as OrganizationRole)}>{Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button type="submit" className="button button-primary button-full" disabled={pending}>{pending ? "생성 중…" : "초대 만들기"}</button></form>}<div className="dialog-actions"><button type="button" className="button button-secondary" onClick={closeDialog}>닫기</button></div></div></div>}
    </div>
  );
}
