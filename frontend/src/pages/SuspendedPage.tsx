/**
 * A.E.G.I.S 4.0 — Account Suspended Notice
 * WP-4.1.1
 */

import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';

export default function SuspendedPage() {
  const { logout } = useAuth();
  const { t } = useLocale();

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--spacing-6)',
        backgroundColor: 'var(--color-bg-page)',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 520,
          textAlign: 'center',
          borderColor: 'var(--color-warning-border)',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-4)' }} aria-hidden="true">
          ⚠️
        </div>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', color: 'var(--aegis-amber-700)', marginBottom: 'var(--spacing-2)' }}>
          {t.suspended.title}
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-6)' }}>
          {t.suspended.description}
        </p>

        <div className="alert alert-warning" style={{ textAlign: 'left', marginBottom: 'var(--spacing-6)' }}>
          <strong>{t.suspended.securityDispatch}:</strong> {t.emergency.police.number}<br />
          <strong>{t.suspended.antiRaggingHelpline}:</strong> {t.emergency.antiRagging.number}
        </div>

        <div style={{ display: 'flex', gap: 'var(--spacing-3)', justifyContent: 'center' }}>
          <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
            {t.common.signOut}
          </button>
          <Link to="/" className="btn btn-primary">
            {t.common.backToHome}
          </Link>
        </div>
      </div>
    </div>
  );
}
