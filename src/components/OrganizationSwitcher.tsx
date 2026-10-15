import { useMemo, useState } from "react";
import { Building2, Check, ChevronDown, LoaderCircle, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context";
import type { OrganizationWorkspace } from "../types";

const roleLabels = { admin: "관리자", editor: "편집자", viewer: "열람자" } as const;

export function OrganizationSwitcher() {
  const { user, switchOrganization } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState("");
  const [error, setError] = useState("");
  const organizations = useMemo<OrganizationWorkspace[]>(() => {
    if (!user) return [];
    if (user.organizations?.length) return user.organizations;
    return [{ id: user.organizationId, name: user.organizationName, role: user.role }];
  }, [user]);

  async function selectWorkspace(organizationId: string) {
    if (!user || organizationId === user.organizationId) {
      setOpen(false);
      return;
    }
    setPendingId(organizationId);
    setError("");
    try {
      await switchOrganization(organizationId);
      setOpen(false);
      navigate("/app");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "업무공간을 전환하지 못했습니다.");
    } finally {
      setPendingId("");
    }
  }

  if (user?.platformWorkspaceAccess) {
    return (
      <div className="workspace-switcher">
        <div className="organization-switcher platform-delegated-switcher" aria-label={`${user.organizationName} 사이트 관리자 대리 접속, ${roleLabels[user.role]} 권한`}>
          <span className="organization-icon">{user.organizationName.slice(0, 1) || "한"}</span>
          <span><strong>{user.organizationName}</strong><small>대리 접속 · {roleLabels[user.role]}</small></span>
          <ShieldCheck size={17} />
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-switcher">
      <button type="button" className="organization-switcher" aria-label={`업무공간 전환: ${user?.organizationName ?? "선택 필요"}, ${organizations.length}개`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((current) => !current)}>
        <span className="organization-icon">{user?.organizationName.slice(0, 1) || "한"}</span>
        <span><strong>{user?.organizationName}</strong><small>{user?.isDemo ? "샘플 업무공간" : `${organizations.length}개 업무공간`}</small></span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <section className="workspace-menu" aria-label="업무공간 선택">
          <header><Building2 size={16} /><strong>내 업무공간</strong><span>{organizations.length}</span></header>
          <div role="menu">
            {organizations.map((organization) => {
              const current = organization.id === user?.organizationId;
              return <button type="button" role="menuitem" aria-label={`${organization.name}, ${roleLabels[organization.role]}${organization.status === "suspended" ? ", 이용 정지" : ""}${current ? ", 현재 업무공간" : ""}`} key={organization.id} className={current ? "current" : ""} onClick={() => void selectWorkspace(organization.id)} disabled={Boolean(pendingId)}><span>{organization.name.slice(0, 1)}</span><div><strong>{organization.name}</strong><small>{roleLabels[organization.role]}{organization.status === "suspended" ? " · 이용 정지" : ""}</small></div>{pendingId === organization.id ? <LoaderCircle className="spin" size={16} /> : current ? <Check size={16} /> : null}</button>;
            })}
          </div>
          {error && <p role="alert">{error}</p>}
        </section>
      )}
    </div>
  );
}
