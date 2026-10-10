/**
 * A.E.G.I.S 4.0 — Admin Immutable Audit Log Placeholder
 * WP-4.1.1
 */

import { Link } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';

export default function AdminAuditPage() {
  const { t } = useLocale();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <div>
        <span className="badge badge-warning">{t.admin.auditBadge}</span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          {t.admin.auditHeading}
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          {t.admin.auditSubtitle}
        </p>
      </div>

      <div className="card">
        <div className="alert alert-info" style={{ marginBottom: 'var(--spacing-6)' }}>
          <div>
            <strong>{t.admin.auditIntegrityTitle}</strong>
            <p style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--spacing-1)' }}>
              {t.admin.auditIntegrityDesc}
            </p>
          </div>
        </div>

        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">🛡️</div>
          <div className="empty-state-title">{t.admin.auditEmptyTitle}</div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', maxWidth: 440 }}>
            {t.admin.auditEmptyDesc}
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
