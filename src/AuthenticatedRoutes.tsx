import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { LoadingScreen } from "./components/LoadingScreen";
import { AuthProvider, CasesProvider, useAuth } from "./context";

const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const DocumentsPage = lazy(() => import("./pages/DocumentsPage").then((module) => ({ default: module.DocumentsPage })));
const NewCaseWizard = lazy(() => import("./pages/NewCaseWizard").then((module) => ({ default: module.NewCaseWizard })));
const OrganizationSetupPage = lazy(() => import("./pages/OrganizationSetupPage").then((module) => ({ default: module.OrganizationSetupPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const TeamPage = lazy(() => import("./pages/TeamPage").then((module) => ({ default: module.TeamPage })));
const InvitationPage = lazy(() => import("./pages/InvitationPage").then((module) => ({ default: module.InvitationPage })));

function ProtectedApp() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isDemo && !user.organizationId) return <OrganizationSetupPage />;
  return <CasesProvider><AppLayout /></CasesProvider>;
}

export default function AuthenticatedRoutes() {
  return (
    <AuthProvider>
      <Suspense fallback={<LoadingScreen label="업무 화면을 준비하고 있습니다" />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/invite" element={<InvitationPage />} />
          <Route path="/app" element={<ProtectedApp />}>
            <Route index element={<DashboardPage />} />
            <Route path="cases" element={<DashboardPage listOnly />} />
            <Route path="cases/new" element={<NewCaseWizard />} />
            <Route path="cases/:caseId/edit" element={<NewCaseWizard />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="documents/:caseId" element={<DocumentsPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
