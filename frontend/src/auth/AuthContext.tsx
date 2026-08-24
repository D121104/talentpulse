import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { authApi, configureRefreshHandler } from '../lib/api';
import type { AuthSession, AuthUser, LoginInput } from './types';

type AuthStatus = 'loading' | 'authenticated' | 'guest';

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  status: AuthStatus;
  login: (input: LoginInput) => Promise<AuthSession>;
  completeGoogleLogin: (code: string) => Promise<AuthSession>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const refreshPromise = useRef<Promise<string | null> | null>(null);

  const applySession = (session: AuthSession) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus('authenticated');
    return session;
  };

  const clearSession = () => {
    setAccessToken(null);
    setUser(null);
    setStatus('guest');
  };

  const refreshSession = async () => {
    if (refreshPromise.current) return refreshPromise.current;

    refreshPromise.current = authApi
      .refresh()
      .then((session) => applySession(session).accessToken)
      .catch(() => {
        clearSession();
        return null;
      })
      .finally(() => {
        refreshPromise.current = null;
      });

    return refreshPromise.current;
  };

  useEffect(() => {
    configureRefreshHandler(refreshSession);
    void refreshSession();

    return () => configureRefreshHandler(null);
  }, []);

  const value: AuthContextValue = {
    user,
    accessToken,
    status,
    login: async (input) => applySession(await authApi.login(input)),
    completeGoogleLogin: async (code) =>
      applySession(await authApi.exchangeGoogleCode(code)),
    logout: async () => {
      try {
        if (accessToken) await authApi.logout(accessToken);
      } finally {
        clearSession();
      }
    },
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
