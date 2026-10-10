
/**
 * A.E.G.I.S 4.0 — Student Tracking Placeholder
 * WP-4.1.5
 *
 * No live case queries or tracking operations.
 */

import { Link } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';

export default function StudentTrackPage() {
  const { t } = useLocale();

  return (
    <main
      className="container"
      style={{ maxWidth: 'var(--layout-content-width)' }}
    >
      <section className="card">
        <span className="badge badge-primary">
          {t.student.trackingBadge}
        </span>

        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            marginTop: 'var(--spacing-3)',
          }}
        >
          {t.student.trackingTitle}
        </h1>

        <p
          style={{
            color: 'var(--color-text-secondary)',
            marginTop: 'var(--spacing-2)',
          }}
        >
          {t.student.trackingDesc}
        </p>

        <div
          className="alert alert-warning"
          role="status"
          style={{ marginTop: 'var(--spacing-6)' }}
        >
          <div>
            <strong>{t.student.trackingDisabledTitle}</strong>
            <p>
              {t.student.trackingDisabledDesc}
            </p>
          </div>
        </div>

        <div style={{ marginTop: 'var(--spacing-6)' }}>
          <Link to="/student" className="btn btn-secondary">
            {t.student.backToDashboard}
          </Link>
        </div>
      </section>
    </main>
  );
}
