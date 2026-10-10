
/**
 * A.E.G.I.S 4.0 — Student Reporting Information
 * WP-4.1.5
 *
 * Informational shell only. No incident submission.
 */

import { Link } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';
import { COMPLAINT_CATEGORIES } from '@/api/types';

export default function StudentReportPage() {
  const { t } = useLocale();

  return (
    <main
      className="container"
      style={{ maxWidth: 'var(--layout-content-width)' }}
    >
      <section className="card">
        <span className="badge badge-primary">
          {t.roles.student} Reporting
        </span>

        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            marginTop: 'var(--spacing-3)',
          }}
        >
          {t.student.reportingHeader}
        </h1>

        <p style={{ color: 'var(--color-text-secondary)' }}>
          {t.student.reportingDesc}
        </p>

        <div
          className="alert alert-warning"
          role="status"
          style={{ marginTop: 'var(--spacing-6)' }}
        >
          <div>
            <strong>{t.student.reportingDisabledAlertTitle}</strong>
            <p>
              {t.student.reportingDisabledAlertDesc}
            </p>
          </div>
        </div>

        <section
          aria-labelledby="report-categories"
          style={{ marginTop: 'var(--spacing-6)' }}
        >
          <h2
            id="report-categories"
            style={{
              fontSize: 'var(--font-size-lg)',
              marginBottom: 'var(--spacing-3)',
            }}
          >
            {t.student.plannedCategories}
          </h2>

          <ul
            style={{
              display: 'grid',
              gap: 'var(--spacing-2)',
              paddingLeft: 'var(--spacing-6)',
            }}
          >
            {COMPLAINT_CATEGORIES.map((category) => (
              <li key={category}>{category}</li>
            ))}
          </ul>
        </section>

        <div style={{ marginTop: 'var(--spacing-6)' }}>
          <Link to="/student" className="btn btn-secondary">
            {t.student.backToDashboard}
          </Link>
        </div>
      </section>
    </main>
  );
}
