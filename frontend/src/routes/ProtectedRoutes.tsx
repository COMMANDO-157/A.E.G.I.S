/**
 * A.E.G.I.S 4.0 — Hardened Protected Route Guards
 * WP-4.1.4 | Protected Routing & Authorization Foundation
 *
 * Enforces role-based route access according to the authentication state machine:
 *   - ProtectedRoute: Any authenticated, non-suspended user with a recognized role
 *   - StudentRoute: Strict role === 'student'
 *   - AuthorityRoute: Strict role in ['HOD', 'Dean', 'Higher Authority']
 *   - AdminRoute / OwnerRoute: Strict role === 'admin'
 *   - GuestRoute: Only unauthenticated guests; redirects authenticated users to their portal
 *
 * FAILS CLOSED:
 * - Loading session displays an accessible loading screen
 * - Outage / network error displays ServiceUnavailable with retry
 * - Expired session displays SessionExpired with re-authentication link
 * - Suspended account redirects to /suspended
 * - Unknown / tampered roles fail closed to UnknownRoleScreen
 * - Unauthorized authenticated roles fail closed to AccessDeniedScreen (403)
 * - Safe return URL sanitization prevents open redirects
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  AuthLoadingScreen,
  AccessDeniedScreen,
  SessionExpiredScreen,
  ServiceUnavailableScreen,
  UnknownRoleScreen,
} from '@/components/auth/AuthScreens';
import { sanitizeReturnUrl } from '@/utils/url';
import type { UserRole } from '@/api/types';

const KNOWN_ROLES: readonly UserRole[] = [
  'student',
  'HOD',
  'Dean',
  'Higher Authority',
  'admin',
] as const;

// ─── Base Guard ────────────────────────────────────────────────────────────────

interface GuardProps {
  allowedRoles?: readonly UserRole[];
  requiredRoleName?: string;
}

function Guard({ allowedRoles, requiredRoleName }: GuardProps) {
  const { status, user, error, retry, logout } = useAuth();
  const location = useLocation();

  // 1. Initializing state
  if (status === 'initializing') {
    return <AuthLoadingScreen />;
  }

  // 2. Outage / Network failure
  if (status === 'unavailable') {
    return <ServiceUnavailableScreen onRetry={retry} errorMessage={error} />;
  }

  // 3. Expired session
  if (status === 'expired') {
    return (
      <SessionExpiredScreen
        returnUrl={sanitizeReturnUrl(location.pathname + location.search)}
      />
    );
  }

  // 4. Suspended account
  if (status === 'suspended' || user?.account_status === 'suspended') {
    return <Navigate to="/suspended" replace />;
  }

  // 5. Explicit forbidden status from backend
  if (status === 'forbidden') {
    return <AccessDeniedScreen customMessage={error ?? undefined} />;
  }

  // 6. Generic error
  if (status === 'error') {
    return <ServiceUnavailableScreen onRetry={retry} errorMessage={error} />;
  }

  // 7. Unauthenticated user
  if (status === 'unauthenticated' || user == null) {
    const safeFrom = sanitizeReturnUrl(location.pathname + location.search, '/');
    return <Navigate to="/login" state={{ from: safeFrom }} replace />;
  }

  // 8. Authenticated with unknown/unsupported role
  if (!KNOWN_ROLES.includes(user.role as UserRole)) {
    return <UnknownRoleScreen role={user.role} onLogout={logout} />;
  }

  // 9. Role authorization check
  if (allowedRoles && !allowedRoles.includes(user.role as UserRole)) {
    return (
      <AccessDeniedScreen
        requiredRole={requiredRoleName}
        userRole={user.role}
      />
    );
  }

  // 10. Clearance granted
  return <Outlet />;
}

// ─── Specific Guards ──────────────────────────────────────────────────────────

/** Any authenticated, non-suspended user with a valid role */
export function ProtectedRoute() {
  return <Guard />;
}

/** Students only */
export function StudentRoute() {
  return <Guard allowedRoles={['student']} requiredRoleName="Student" />;
}

/** Authority tiers: HOD, Dean, Higher Authority */
export function AuthorityRoute() {
  return (
    <Guard
      allowedRoles={['HOD', 'Dean', 'Higher Authority']}
      requiredRoleName="Authority Tier (HOD, Dean, or Senior Authority)"
    />
  );
}

/** Admin / Owner only */
export function AdminRoute() {
  return (
    <Guard
      allowedRoles={['admin']}
      requiredRoleName="Institutional Administrator / Owner"
    />
  );
}

/** OwnerRoute — alias for AdminRoute enforcing verified admin role */
export function OwnerRoute() {
  return <AdminRoute />;
}

// ─── Guest Route ──────────────────────────────────────────────────────────────

/**
 * GuestRoute — ensures unauthenticated access only.
 * Redirects authenticated users to their authorized portal.
 */
export function GuestRoute() {
  const { status, user, logout } = useAuth();

  if (status === 'initializing') {
    return <AuthLoadingScreen />;
  }

  if (status === 'authenticated' && user) {
    if (user.account_status === 'suspended') {
      return <Navigate to="/suspended" replace />;
    }

    if (user.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }

    if (['HOD', 'Dean', 'Higher Authority'].includes(user.role)) {
      return <Navigate to="/authority" replace />;
    }

    if (user.role === 'student') {
      return <Navigate to="/student" replace />;
    }

    return <UnknownRoleScreen role={user.role} onLogout={logout} />;
  }

  return <Outlet />;
}
