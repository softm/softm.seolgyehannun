import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AppUser, CaseRecord } from "./types";
import {
  bootstrapUserOrganization,
  endSession,
  observeUser,
  reloadCurrentUser,
  registerWithEmail,
  signInWithEmail,
  signInWithGoogle,
  startDemoSession,
  switchCurrentOrganization,
} from "./services/auth";
import { saveCase, subscribeCases } from "./services/caseRepository";

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  register: (name: string, organizationName: string, email: string, password: string) => Promise<void>;
  startDemo: () => void;
  createOrganization: (name: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => observeUser((nextUser) => {
    setUser(nextUser);
    setLoading(false);
  }), []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    loginWithGoogle: async () => setUser(await signInWithGoogle()),
    loginWithEmail: async (email, password) => setUser(await signInWithEmail(email, password)),
    register: async (name, organizationName, email, password) => setUser(await registerWithEmail(name, organizationName, email, password)),
    startDemo: () => setUser(startDemoSession()),
    createOrganization: async (name) => setUser(await bootstrapUserOrganization(name)),
    refreshUser: async () => setUser(await reloadCurrentUser()),
    switchOrganization: async (organizationId) => setUser(await switchCurrentOrganization(organizationId)),
    logout: async () => {
      await endSession();
      setUser(null);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider 안에서 useAuth를 사용해야 합니다.");
  return value;
}

interface CasesContextValue {
  cases: CaseRecord[];
  loading: boolean;
  error: string;
  selectedCaseId: string | null;
  selectedCase: CaseRecord | null;
  selectCase: (caseId: string | null) => void;
  persistCase: (caseRecord: CaseRecord) => Promise<CaseRecord>;
}

const CasesContext = createContext<CasesContextValue | null>(null);

export function CasesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.organizationId) {
      setCases([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    return subscribeCases(
      user.organizationId,
      user.isDemo,
      (nextCases) => {
        setCases(nextCases);
        setSelectedCaseId((current) => current && nextCases.some((item) => item.id === current)
          ? current
          : nextCases[0]?.id ?? null);
        setLoading(false);
      },
      (reason) => {
        setError(reason.message);
        setLoading(false);
      },
    );
  }, [user]);

  const persistCase = useCallback(async (caseRecord: CaseRecord) => {
    if (!user) throw new Error("로그인이 필요합니다.");
    const saved = await saveCase(caseRecord, user.isDemo);
    setCases((current) => {
      const existing = current.findIndex((item) => item.id === saved.id);
      if (existing < 0) return [saved, ...current];
      const next = [...current];
      next[existing] = saved;
      return next;
    });
    setSelectedCaseId(saved.id);
    return saved;
  }, [user]);

  const selectedCase = cases.find((item) => item.id === selectedCaseId) ?? null;
  const value = useMemo<CasesContextValue>(() => ({
    cases,
    loading,
    error,
    selectedCaseId,
    selectedCase,
    selectCase: setSelectedCaseId,
    persistCase,
  }), [cases, loading, error, selectedCaseId, selectedCase, persistCase]);

  return <CasesContext.Provider value={value}>{children}</CasesContext.Provider>;
}

export function useCases(): CasesContextValue {
  const value = useContext(CasesContext);
  if (!value) throw new Error("CasesProvider 안에서 useCases를 사용해야 합니다.");
  return value;
}
