
/**
 * A.E.G.I.S 4.0 — Authority Verification Shell
 * WP-4.1.5
 */

import { Link } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';

export default function AuthorityReviewPage() {
  const { t } = useLocale();

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <header>
        <span className="badge badge-warning">
          {t.authority.reviewBadge}
        </span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          {t.authority.reviewTitle}
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          {t.authority.reviewSubtitle}
        </p>
      </header>

      <section className="card">
        <div className="alert alert-warning" role="status">
          <div>
            <strong>{t.authority.reviewAlertTitle}</strong>
            <p>
              {t.authority.reviewAlertDesc}
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
