
/**
 * A.E.G.I.S 4.0 — Authority Cases Shell
 * WP-4.1.5
 */

import { Link } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';

export default function AuthorityCasesPage() {
  const { t } = useLocale();

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <header>
        <span className="badge badge-navy">{t.authority.casesBadge}</span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          {t.authority.casesTitle}
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          {t.authority.casesSubtitle}
        </p>
      </header>

      <section className="card">
        <div className="alert alert-info" role="status">
          <div>
            <strong>{t.authority.casesAlertTitle}</strong>
            <p>
              {t.authority.casesAlertDesc}
            </p>
          </div>
        </div>
      </section>

      <Link to="/authority" className="btn btn-secondary">
        {t.authority.backToDashboard}
      </Link>
    </main>
  );
}
