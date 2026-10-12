import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { LoadingScreen } from "./components/LoadingScreen";

const LandingPage = lazy(() => import("./pages/LandingPage").then((module) => ({ default: module.LandingPage })));
const AuthenticatedRoutes = lazy(() => import("./AuthenticatedRoutes"));

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen label="화면을 준비하고 있습니다" />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/*" element={<AuthenticatedRoutes />} />
      </Routes>
    </Suspense>
  );
}
