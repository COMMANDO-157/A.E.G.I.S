/**
 * A.E.G.I.S 4.0 — 404 Not Found Page
 * WP-4.1.1
 */

import { Link } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';

export default function NotFoundPage() {
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
      <div className="card" style={{ maxWidth: 460, textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-4)' }} aria-hidden="true">
          🛡️
        </div>
        <h1 style={{ fontSize: 'var(--font-size-3xl)', color: 'var(--aegis-navy)', marginBottom: 'var(--spacing-2)' }}>
          {t.notFound.heading}
        </h1>
        <h2 style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-4)' }}>
          {t.notFound.title}
        </h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-6)' }}>
          {t.notFound.description}
        </p>
        <Link to="/" className="btn btn-primary">
          {t.common.backToHome}
        </Link>
      </div>
    </div>
  );
}
