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
import { useLocale } from '@/context/LocaleContext';
import styles from './AuthScreens.module.css';

// ─── Loading Screen ───────────────────────────────────────────────────────────

export function AuthLoadingScreen() {
  const { t } = useLocale();

  return (
    <div
      className={styles.screenWrapper}
      aria-label={`${t.authScreens.loadingTitle}…`}
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
          {t.authScreens.loadingTitle}
        </h1>
        <p className={styles.description} style={{ fontSize: 'var(--font-size-sm)' }}>
          {t.authScreens.loadingDesc}
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
  const { t } = useLocale();

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
          {t.authScreens.accessDeniedTitle}
        </h1>
        <p className={styles.description}>
          {customMessage || t.authScreens.accessDeniedDesc}
        </p>

        {(requiredRole || userRole) && (
          <div className={styles.metaBox}>
            {requiredRole && <div><strong>{t.authScreens.requiredClearance}:</strong> {requiredRole}</div>}
            {userRole && <div><strong>{t.authScreens.currentRole}:</strong> {userRole}</div>}
          </div>
        )}

        <div className={styles.actions}>
          <Link to={getPortalTarget()} style={{ textDecoration: 'none' }}>
            <Button variant="primary">{t.authScreens.returnToPortal}</Button>
          </Link>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">{t.common.backToHome}</Button>
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
  const { t } = useLocale();
  const loginUrl = returnUrl ? `/login?from=${encodeURIComponent(returnUrl)}` : '/login';

  return (
    <div className={styles.screenWrapper} role="alert" aria-labelledby="session-expired-title">
      <div className={styles.panel}>
        <div className={styles.icon} aria-hidden="true">⏱️</div>
        <h1 id="session-expired-title" className={`${styles.title} ${styles.titleWarning}`}>
          {t.authScreens.sessionExpiredTitle}
        </h1>
        <p className={styles.description}>
          {t.authScreens.sessionExpiredDesc}
        </p>

        <div className={styles.actions}>
          <Link to={loginUrl} style={{ textDecoration: 'none' }}>
            <Button variant="primary">{t.authScreens.signInAgain}</Button>
          </Link>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">{t.common.backToHome}</Button>
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
  const { t } = useLocale();

  return (
    <div className={styles.screenWrapper} role="alert" aria-labelledby="service-unavailable-title">
      <div className={styles.panel}>
        <div className={styles.icon} aria-hidden="true">📡</div>
        <h1 id="service-unavailable-title" className={styles.title}>
          {t.authScreens.serviceUnavailableTitle}
        </h1>
        <p className={styles.description}>
          {errorMessage || t.authScreens.serviceUnavailableDesc}
        </p>

        <div className={styles.emergencyBanner}>
          <strong>{t.authScreens.immediateSafetyConcern}</strong> {t.authScreens.callCampusDispatch}{' '}
          <a href={`tel:${t.emergency.police.number}`}>Police {t.emergency.police.number}</a> ·{' '}
          <a href={`tel:${t.emergency.antiRagging.number}`}>Anti-Ragging {t.emergency.antiRagging.number}</a>
        </div>

        <div className={styles.actions}>
          {onRetry && (
            <Button variant="primary" onClick={onRetry}>
              {t.authScreens.retryConnection}
            </Button>
          )}
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">{t.common.backToHome}</Button>
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
  const { t } = useLocale();

  return (
    <div className={styles.screenWrapper} role="alert" aria-labelledby="unknown-role-title">
      <div className={styles.panel}>
        <div className={styles.icon} aria-hidden="true">⚠️</div>
        <h1 id="unknown-role-title" className={`${styles.title} ${styles.titleWarning}`}>
          {t.authScreens.unknownRoleTitle}
        </h1>
        <p className={styles.description}>
          {t.authScreens.unknownRoleDesc}
        </p>

        {role && (
          <div className={styles.metaBox}>
            <strong>{t.authScreens.reportedRole}:</strong> {role}
          </div>
        )}

        <p className={styles.description} style={{ fontSize: 'var(--font-size-xs)' }}>
          {t.authScreens.contactAdmin}
        </p>

        <div className={styles.actions}>
          {onLogout ? (
            <Button variant="outline" onClick={onLogout}>
              {t.common.signOut}
            </Button>
          ) : (
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <Button variant="outline">{t.authScreens.signOutAndReturn}</Button>
            </Link>
          )}
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">{t.common.backToHome}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
