/**
 * A.E.G.I.S 4.0 — 404 Not Found Page
 * WP-4.1.1
 */

import { Link } from 'react-router-dom';
import { en } from '@/locales/en';

export default function NotFoundPage() {
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
      <div className="card" style={{ maxWidth: 460, textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-4)' }} aria-hidden="true">
          🛡️
        </div>
        <h1 style={{ fontSize: 'var(--font-size-3xl)', color: 'var(--aegis-navy)', marginBottom: 'var(--spacing-2)' }}>
          404
        </h1>
        <h2 style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-4)' }}>
          Page Not Found
        </h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-6)' }}>
          The requested protective URL or resource does not exist or has been relocated.
        </p>
        <Link to="/" className="btn btn-primary">
          {en.common.backToHome}
        </Link>
      </div>
    </div>
  );
}
