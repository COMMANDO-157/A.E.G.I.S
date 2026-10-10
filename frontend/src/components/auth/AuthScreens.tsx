/**
 * A.E.G.I.S 4.0 — Accessible Authentication Screens
 * WP-4.1.4 | Protected Routing & Authorization Foundation
 *
 * Dedicated screens for authentication state machine scenarios:
 *   - AuthLoadingScreen (Session verification in-flight)
 *   - AccessDeniedScreen (403 Role/Tier mismatch)
 *   - SessionExpiredScreen (401 Session TTL expired)
 *   - ServiceUnavailableScreen (503 / Network failure with retry)
 *   - UnknownRoleScreen (Authenticated user without assigned role)
 */

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { en } from '@/locales/en';
import styles from './AuthScreens.module.css';

// ─── Loading Screen ───────────────────────────────────────────────────────────

export function AuthLoadingScreen() {
  return (
    <div
      className={styles.screenWrapper}
      aria-label="Verifying institutional session…"
      aria-busy="true"
    >
      <div className={styles.panel} style={{ maxWidth: 360, gap: 'var(--spacing-4)' }}>
        <div
          className="loading-pulse"
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'var(--aegis-teal)',
            opacity: 0.8,
            margin: '0 auto',
          }}
          aria-hidden="true"
        />
        <h1 className={styles.title} style={{ fontSize: 'var(--font-size-xl)' }}>
          Verifying Session…
        </h1>
        <p className={styles.description} style={{ fontSize: 'var(--font-size-sm)' }}>
          Securing campus perimeter credentials.
        </p>
      </div>
    </div>
  );
}

// ─── Access Denied (403) ──────────────────────────────────────────────────────

export interface AccessDeniedScreenProps {
  requiredRole?: string | undefined;
  userRole?: string | undefined;
  customMessage?: string | undefined;
}

export function AccessDeniedScreen({
  requiredRole,
  userRole,
  customMessage,
}: AccessDeniedScreenProps) {
  const getPortalTarget = () => {
    if (!userRole) return '/';
    if (userRole === 'admin') return '/admin';
    if (['HOD', 'Dean', 'Higher Authority'].includes(userRole)) return '/authority';
    if (userRole === 'student') return '/student';
    return '/';
  };

  return (
    <div className={styles.screenWrapper} role="alert" aria-labelledby="access-denied-title">
      <div className={styles.panel}>
        <div className={styles.icon} aria-hidden="true">🚫</div>
        <h1 id="access-denied-title" className={`${styles.title} ${styles.titleDanger}`}>
          403 — Access Restricted
        </h1>
        <p className={styles.description}>
          {customMessage ||
            'You do not have the institutional clearance required to access this portal or resource.'}
        </p>

        {(requiredRole || userRole) && (
          <div className={styles.metaBox}>
            {requiredRole && <div><strong>Required Clearance:</strong> {requiredRole}</div>}
            {userRole && <div><strong>Your Current Role:</strong> {userRole}</div>}
          </div>
        )}

        <div className={styles.actions}>
          <Link to={getPortalTarget()} style={{ textDecoration: 'none' }}>
            <Button variant="primary">Return to Your Portal</Button>
          </Link>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">{en.common.backToHome}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Session Expired (401) ────────────────────────────────────────────────────

export interface SessionExpiredScreenProps {
  returnUrl?: string | undefined;
}

export function SessionExpiredScreen({ returnUrl }: SessionExpiredScreenProps) {
  const loginUrl = returnUrl ? `/login?from=${encodeURIComponent(returnUrl)}` : '/login';

  return (
    <div className={styles.screenWrapper} role="alert" aria-labelledby="session-expired-title">
      <div className={styles.panel}>
        <div className={styles.icon} aria-hidden="true">⏱️</div>
        <h1 id="session-expired-title" className={`${styles.title} ${styles.titleWarning}`}>
          Security Session Expired
        </h1>
        <p className={styles.description}>
          Your institutional security session has expired. To maintain student protection and confidentiality,
          please re-authenticate with your institutional credentials.
        </p>

        <div className={styles.actions}>
          <Link to={loginUrl} style={{ textDecoration: 'none' }}>
            <Button variant="primary">Sign In Again</Button>
          </Link>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">{en.common.backToHome}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Service Unavailable (503 / Network Failure) ─────────────────────────────

export interface ServiceUnavailableScreenProps {
  onRetry?: (() => void) | undefined;
  errorMessage?: string | null | undefined;
}

export function ServiceUnavailableScreen({
  onRetry,
  errorMessage,
}: ServiceUnavailableScreenProps) {
  return (
    <div className={styles.screenWrapper} role="alert" aria-labelledby="service-unavailable-title">
      <div className={styles.panel}>
        <div className={styles.icon} aria-hidden="true">📡</div>
        <h1 id="service-unavailable-title" className={styles.title}>
          Service Temporarily Unavailable
        </h1>
        <p className={styles.description}>
          {errorMessage ||
            'The institutional safety server is temporarily unreachable. Please check your network connection or try again shortly.'}
        </p>

        <div className={styles.emergencyBanner}>
          <strong>Immediate Safety Concern?</strong> Call emergency campus dispatch: <a href="tel:100">Police 100</a> · <a href="tel:1800-180-5522">Anti-Ragging 1800-180-5522</a>
        </div>

        <div className={styles.actions}>
          {onRetry && (
            <Button variant="primary" onClick={onRetry}>
              Retry Connection
            </Button>
          )}
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">{en.common.backToHome}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Unknown Role ─────────────────────────────────────────────────────────────

export interface UnknownRoleScreenProps {
  role?: string | undefined;
  onLogout?: (() => void) | undefined;
}

export function UnknownRoleScreen({ role, onLogout }: UnknownRoleScreenProps) {
  return (
    <div className={styles.screenWrapper} role="alert" aria-labelledby="unknown-role-title">
      <div className={styles.panel}>
        <div className={styles.icon} aria-hidden="true">⚠️</div>
        <h1 id="unknown-role-title" className={`${styles.title} ${styles.titleWarning}`}>
          Unassigned Institutional Role
        </h1>
        <p className={styles.description}>
          Your Google account is recognized, but no approved role (Student, Faculty HOD, Dean, or Administrator)
          has been provisioned for your profile.
        </p>

        {role && (
          <div className={styles.metaBox}>
            <strong>Reported Role:</strong> {role}
          </div>
        )}

        <p className={styles.description} style={{ fontSize: 'var(--font-size-xs)' }}>
          Please contact the Institutional Administrator to provision your department and access clearance.
        </p>

        <div className={styles.actions}>
          {onLogout ? (
            <Button variant="outline" onClick={onLogout}>
              Sign Out
            </Button>
          ) : (
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <Button variant="outline">Sign Out &amp; Return</Button>
            </Link>
          )}
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">{en.common.backToHome}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
