/**
 * A.E.G.I.S 4.0 — Hardened Authentication Context & State Machine
 * WP-4.1.4 | Protected Routing & Authorization Foundation
 *
 * Implements an explicit state machine for session lifecycle management:
 *   'initializing'   — Session determination in-flight on initial boot
 *   'authenticated'  — Active, verified session returned by /api/me
 *   'unauthenticated'— No session cookie or 401 unauthenticated
 *   'forbidden'      — 403 authorization failure from backend
 *   'suspended'      — Account suspended by administration
 *   'expired'        — Session TTL expired (requires re-login)
 *   'unavailable'    — Backend / database unavailable or network offline
 *   'error'          — Unexpected server payload or fatal schema error
 *
 * SECURITY INVARIANTS:
 * - Session state is owned exclusively by the backend (HttpOnly cookies).
 * - Credentials/tokens are NEVER stored in localStorage or sessionStorage.
 * - Stale async responses are discarded via sequence tracking.
 * - Network errors do not silently log users out into unauthenticated states.
 * - Logout does not claim success if server-side revocation fails.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  getCurrentUser,
  logout as apiLogout,
  SessionExpiredError,
  AccountSuspendedError,
  ApiRequestError,
  ApiNetworkError,
} from '@/api/client';
import type { ApiUser, UserRole } from '@/api/types';

// ─── State Definitions ────────────────────────────────────────────────────────

export type AuthStatus =
  | 'initializing'
  | 'authenticated'
  | 'unauthenticated'
  | 'forbidden'
  | 'suspended'
  | 'expired'
  | 'unavailable'
  | 'error';

export interface AuthState {
  /** User object when authenticated; null otherwise */
  user: ApiUser | null;
  /** Current state machine phase */
  status: AuthStatus;
  /** Backwards-compatible loading flag: true only while initializing */
  loading: boolean;
  /** Error message associated with the current non-authenticated state */
  error: string | null;
  /** True strictly when status === 'authenticated' and user is active */
  isAuthenticated: boolean;
  /** Role checks */
  isStudent: boolean;
  isAuthority: boolean;
  isAdmin: boolean;
  /** Re-verify session (e.g. after Google SSO) */
  refreshUser: () => Promise<void>;
  /** Sign out server-side session */
  logout: () => Promise<void>;
  /** Manual retry when status is 'unavailable' or 'error' */
  retry: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface AuthProviderProps {
  children: ReactNode;
}

const AUTHORITY_ROLES: readonly UserRole[] = ['HOD', 'Dean', 'Higher Authority'] as const;

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [error, setError] = useState<string | null>(null);

  // Sequence tracking to prevent stale asynchronous race conditions
  const seqRef = useRef<number>(0);

  const fetchSession = useCallback(async () => {
    const currentSeq = ++seqRef.current;
    setError(null);

    try {
      const fetchedUser = await getCurrentUser();

      // Guard against stale response
      if (currentSeq !== seqRef.current) return;

      if (fetchedUser) {
        if (fetchedUser.account_status === 'suspended') {
          setUser(fetchedUser);
          setStatus('suspended');
          setError('Your account is currently suspended pending review.');
        } else {
          setUser(fetchedUser);
          setStatus('authenticated');
          setError(null);
        }
      } else {
        setUser(null);
        setStatus('unauthenticated');
        setError(null);
      }
    } catch (err: unknown) {
      if (currentSeq !== seqRef.current) return;

      setUser(null);

      if (err instanceof SessionExpiredError) {
        setStatus('expired');
        setError(err.message);
      } else if (err instanceof AccountSuspendedError) {
        setStatus('suspended');
        setError(err.message);
      } else if (err instanceof ApiRequestError) {
        if (err.status === 403) {
          setStatus('forbidden');
          setError(err.message);
        } else if (err.status >= 500) {
          setStatus('unavailable');
          setError(err.message);
        } else {
          setStatus('error');
          setError(err.message);
        }
      } else if (err instanceof ApiNetworkError) {
        setStatus('unavailable');
        setError(err.message);
      } else {
        setStatus('error');
        setError('An unexpected error occurred while verifying your session.');
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  const refreshUser = useCallback(async () => {
    await fetchSession();
  }, [fetchSession]);

  const retry = useCallback(async () => {
    setStatus('initializing');
    await fetchSession();
  }, [fetchSession]);

  const logout = useCallback(async () => {
    // Attempt server-side session revocation
    await apiLogout();

    // Increment sequence to invalidate any pending in-flight queries
    seqRef.current++;
    setUser(null);
    setStatus('unauthenticated');
    setError(null);
  }, []);

  const value = useMemo<AuthState>(() => {
    const isAuthenticated = status === 'authenticated' && user !== null;
    const role = user?.role;

    return {
      user,
      status,
      loading: status === 'initializing',
      error,
      isAuthenticated,
      isStudent: isAuthenticated && role === 'student',
      isAuthority: isAuthenticated && !!role && AUTHORITY_ROLES.includes(role as UserRole),
      isAdmin: isAuthenticated && role === 'admin',
      refreshUser,
      logout,
      retry,
    };
  }, [user, status, error, refreshUser, logout, retry]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
