import { ArrowLeft, LogOut, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Brand } from "../components/Brand";
import { OrganizationSwitcher } from "../components/OrganizationSwitcher";
import { useAuth } from "../context";
import "../platform-admin.css";

export function OrganizationSuspendedPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const otherWorkspaces = (user?.organizations ?? []).filter((item) => item.id !== user?.organizationId && item.status !== "suspended");

  async function leave() {
    await logout();
    navigate("/login");
  }

  return (
    <main className="service-suspended-page">
      <header><Brand /></header>
      <section aria-labelledby="service-suspended-title">
        <span className="service-suspended-icon"><ShieldAlert size={30} /></span>
        <p className="page-kicker">이용 상태 안내</p>
        <h1 id="service-suspended-title">{user?.organizationName}의 이용 확인이 필요합니다.</h1>
        <p>이용기간이 만료되었거나 사이트 관리자에 의해 이용이 정지되었습니다. 업무 자료는 삭제되지 않으며 입금 확인 후 기간이 연장되거나 이용이 재개되면 다시 접근할 수 있습니다.</p>
        {user?.subscriptionExpiresAt && <div className="service-suspended-expiry"><span>등록된 이용 만료일</span><strong>{new Date(user.subscriptionExpiresAt).toLocaleDateString("ko-KR")}</strong></div>}
        {otherWorkspaces.length > 0 && <div className="service-suspended-switch"><span>접근 가능한 다른 업무공간</span><OrganizationSwitcher /></div>}
        <div className="service-suspended-actions">
          {user?.platformRole && <button type="button" className="button button-primary" onClick={() => navigate("/site-admin")}><ArrowLeft size={17} /> 사이트 관리로 이동</button>}
          <button type="button" className="button button-secondary" onClick={() => void leave()}><LogOut size={17} /> 로그아웃</button>
        </div>
      </section>
    </main>
  );
}
