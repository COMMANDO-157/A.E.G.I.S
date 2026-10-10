/**
 * A.E.G.I.S 4.0 — Admin All Cases Placeholder
 * WP-4.1.1
 */

import { Link } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';

export default function AdminCasesPage() {
  const { t } = useLocale();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <div>
        <span className="badge badge-warning">{t.admin.casesBadge}</span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          {t.admin.casesHeading}
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          {t.admin.casesSubtitle}
        </p>
      </div>

      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">📊</div>
          <div className="empty-state-title">{t.admin.casesEmptyTitle}</div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', maxWidth: 440 }}>
            {t.admin.casesEmptyDesc}
          </p>
        </div>
      </div>

      <div>
        <Link to="/admin" className="btn btn-secondary">
          &larr; {t.admin.backToOverview}
        </Link>
      </div>
    </div>
  );
}
