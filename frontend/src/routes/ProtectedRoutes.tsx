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
import OwnerEntryGate from '@/components/auth/OwnerEntryGate';

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
  children?: React.ReactNode;
}

function Guard({ allowedRoles, requiredRoleName, children }: GuardProps) {
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
  return children ?? <Outlet />;
}

// ─── Specific Guards ──────────────────────────────────────────────────────────

/** Any authenticated, non-suspended user with a valid role */
export function ProtectedRoute() {
  return <Guard />;
}

/** 1. Students only (/student) */
export function StudentRoute() {
  return <Guard allowedRoles={['student']} requiredRoleName="Student" />;
}

/** 2. Head of Department only (/hod) */
export function HodRoute() {
  return <Guard allowedRoles={['HOD']} requiredRoleName="Head of Department" />;
}

/** 3. Dean only (/dean) */
export function DeanRoute() {
  return <Guard allowedRoles={['Dean']} requiredRoleName="Dean of Students" />;
}

/** 4. Higher Authority only (/authority) */
export function HigherAuthorityRoute() {
  return <Guard allowedRoles={['Higher Authority']} requiredRoleName="Higher Authority" />;
}

/** Shared Authority guard for multi-tier authority workspace views */
export function AuthorityRoute() {
  return (
    <Guard
      allowedRoles={['HOD', 'Dean', 'Higher Authority']}
      requiredRoleName="Authority Tier (HOD, Dean, or Higher Authority)"
    />
  );
}

/** 5. Delegated Administrator (/admin) */
export function AdminRoute() {
  const {user}=useAuth();
  if(user?.role==='admin' && user.is_primary_owner) return <Navigate to="/owner" replace />;
  return (
    <Guard
      allowedRoles={['admin']}
      requiredRoleName="Institutional Administrator"
    />
  );
}

/** 6. Primary Owner strictly (/owner) — requires admin role AND is_primary_owner flag */
export function OwnerRoute() {
  const { user } = useAuth();
  if (user && user.role === 'admin' && !user.is_primary_owner) {
    // Delegated admin trying to access primary owner portal is rejected
    return <AccessDeniedScreen requiredRole="Primary Owner Clearance" userRole={user.role} />;
  }
  return (
    <Guard
      allowedRoles={['admin']}
      requiredRoleName="Primary Owner"
    ><OwnerEntryGate /></Guard>
  );
}

// ─── Guest Route ──────────────────────────────────────────────────────────────

/**
 * GuestRoute — ensures unauthenticated access only.
 * Redirects authenticated users to their specific authorized portal:
 * /owner for Primary Owner
 * /admin for Delegated Admin
 * /hod for Head of Department
 * /dean for Dean
 * /authority for Higher Authority
 * /student for Student
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
      return <Navigate to={user.is_primary_owner ? '/owner' : '/admin'} replace />;
    }

    if (user.role === 'HOD') {
      return <Navigate to="/hod" replace />;
    }

    if (user.role === 'Dean') {
      return <Navigate to="/dean" replace />;
    }

    if (user.role === 'Higher Authority') {
      return <Navigate to="/authority" replace />;
    }

    if (user.role === 'student') {
      return <Navigate to="/student" replace />;
    }

    return <UnknownRoleScreen role={user.role} onLogout={logout} />;
  }

  return <Outlet />;
}
