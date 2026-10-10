/**
 * A.E.G.I.S 4.0 — Account Suspended Notice
 * WP-4.1.1
 */

import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { en } from '@/locales/en';

export default function SuspendedPage() {
  const { logout } = useAuth();

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
          Account Suspended
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-6)' }}>
          Your institutional portal access is currently restricted pending administrative review.
          If this is an urgent safety situation, please contact emergency campus dispatch immediately.
        </p>

        <div className="alert alert-warning" style={{ textAlign: 'left', marginBottom: 'var(--spacing-6)' }}>
          <strong>Campus Security Dispatch:</strong> {en.emergency.police.number}<br />
          <strong>Anti-Ragging Helpline:</strong> {en.emergency.antiRagging.number}
        </div>

        <div style={{ display: 'flex', gap: 'var(--spacing-3)', justifyContent: 'center' }}>
          <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
            {en.common.signOut}
          </button>
          <Link to="/" className="btn btn-primary">
            {en.common.backToHome}
          </Link>
        </div>
      </div>
    </div>
  );
}
