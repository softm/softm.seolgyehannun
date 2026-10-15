import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChevronDown,
  CircleHelp,
  FileStack,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth, useCases } from "../context";
import { deadlineDistance } from "../domain/deadline";
import {
  markInAppNotificationRead,
  subscribeInAppNotifications,
  type InAppNotification,
} from "../services/notificationRepository";
import { Brand } from "./Brand";
import { OrganizationSwitcher } from "./OrganizationSwitcher";

const navigation = [
  { to: "/app", end: true, label: "대시보드", icon: LayoutDashboard },
  { to: "/app/cases", label: "업무", icon: FolderKanban },
  { to: "/app/documents", label: "문서", icon: FileStack },
  { to: "/app/team", label: "구성원", icon: Users },
  { to: "/app/settings", label: "설정", icon: Settings },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const { cases, selectCase } = useCases();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);

  const demoNotifications = useMemo<InAppNotification[]>(() => cases
    .filter((caseRecord) => caseRecord.nextDeadlineAt && deadlineDistance(caseRecord.nextDeadlineAt) <= 3 && caseRecord.status !== "completed")
    .map((caseRecord) => {
      const dueAt = caseRecord.nextDeadlineAt!;
      const distance = deadlineDistance(dueAt);
      return {
        id: `demo-${caseRecord.id}-${dueAt}`,
        caseId: caseRecord.id,
        title: distance < 0 ? `${Math.abs(distance)}일 지연된 업무가 있습니다.` : distance === 0 ? "오늘 마감인 업무가 있습니다." : `${distance}일 남은 업무가 있습니다.`,
        body: `${caseRecord.title} · ${caseRecord.nextAction}`,
        dueAt,
        createdAt: caseRecord.updatedAt,
        readAt: null,
      };
    })
    .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "")), [cases]);

  useEffect(() => {
    if (!user?.organizationId) return;
    if (user.isDemo) {
      setNotifications((current) => demoNotifications.map((item) => ({
        ...item,
        readAt: current.find((existing) => existing.id === item.id)?.readAt ?? null,
      })));
      return;
    }
    return subscribeInAppNotifications(
      user.organizationId,
      user.uid,
      cases.map((caseRecord) => caseRecord.id),
      setNotifications,
    );
  }, [cases, demoNotifications, user]);

  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  async function openNotification(notification: InAppNotification) {
    setNotifications((current) => current.map((item) => item.id === notification.id
      ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
      : item));
    if (user && !user.isDemo && !notification.readAt) {
      try {
        await markInAppNotificationRead(user.organizationId, notification.caseId, notification.id);
      } catch {
        // Opening the related case remains available even if the read marker cannot be saved.
      }
    }
    selectCase(notification.caseId);
    setNotificationOpen(false);
    navigate("/app");
  }

  return (
    <div className="app-frame">
      <aside className={`app-sidebar ${mobileNavOpen ? "open" : ""}`}>
        <div className="sidebar-head">
          <Brand compact to="/app" />
          <button type="button" className="icon-button sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="메뉴 닫기"><X size={20} /></button>
        </div>
        <OrganizationSwitcher />
        <nav className="app-navigation" aria-label="업무 앱 메뉴">
          <small>업무 공간</small>
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setMobileNavOpen(false)}>
              <Icon size={19} /> {label}
            </NavLink>
          ))}
          {user?.platformRole && <><small>사이트 운영</small><NavLink to="/site-admin" onClick={() => setMobileNavOpen(false)}><ShieldCheck size={19} /> 전체 관리자</NavLink></>}
        </nav>
        <div className="sidebar-foot">
          <button type="button"><CircleHelp size={18} /> 도움말</button>
          <div className="user-mini-card">
            <span>{user?.displayName.slice(0, 1)}</span>
            <div><strong>{user?.displayName}</strong><small>{user?.role === "admin" ? "관리자" : user?.role === "editor" ? "편집자" : "열람자"}</small></div>
            <button type="button" onClick={handleLogout} aria-label="로그아웃"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      {mobileNavOpen && <button type="button" className="nav-backdrop" aria-label="메뉴 닫기" onClick={() => setMobileNavOpen(false)} />}

      <div className="app-content-frame">
        <header className="app-topbar">
          <button type="button" className="icon-button mobile-menu-button" onClick={() => setMobileNavOpen(true)} aria-label="메뉴 열기"><Menu size={21} /></button>
          {user?.isDemo && <div className="demo-mode-pill">체험 데이터</div>}
          <div className="topbar-spacer" />
          <div className="notification-center">
            <button type="button" className="notification-button" aria-label={`알림 ${unreadCount}개`} aria-expanded={notificationOpen} onClick={() => { setNotificationOpen((current) => !current); setUserMenuOpen(false); }}><Bell size={19} />{unreadCount > 0 && <span>{unreadCount > 9 ? "9+" : unreadCount}</span>}</button>
            {notificationOpen && <section className="notification-dropdown" aria-label="알림 목록"><header><strong>알림</strong><span>{unreadCount ? `읽지 않음 ${unreadCount}개` : "모두 확인했습니다"}</span></header><div>{notifications.length ? notifications.map((notification) => <button type="button" className={notification.readAt ? "read" : ""} key={notification.id} onClick={() => void openNotification(notification)}><i aria-hidden="true" /><span><strong>{notification.title}</strong><small>{notification.body}</small>{notification.dueAt && <time>{notification.dueAt}</time>}</span></button>) : <p>새 알림이 없습니다.</p>}</div></section>}
          </div>
          <div className="topbar-user">
            <button type="button" onClick={() => { setUserMenuOpen((current) => !current); setNotificationOpen(false); }} aria-expanded={userMenuOpen}>
              <span>{user?.displayName.slice(0, 1)}</span><strong>{user?.displayName}</strong><ChevronDown size={15} />
            </button>
            {userMenuOpen && (
              <div className="user-dropdown">
                <div><strong>{user?.displayName}</strong><small>{user?.email}</small></div>
                {user?.platformRole && <NavLink to="/site-admin" onClick={() => setUserMenuOpen(false)}><ShieldCheck size={17} /> 사이트 관리</NavLink>}
                <NavLink to="/app/settings" onClick={() => setUserMenuOpen(false)}><Settings size={17} /> 설정</NavLink>
                <button type="button" onClick={handleLogout}><LogOut size={17} /> 로그아웃</button>
              </div>
            )}
          </div>
        </header>
        <main className="app-main"><Outlet /></main>
      </div>
    </div>
  );
}
