
/**
 * A.E.G.I.S 4.0 — Student Reporting Information
 * WP-4.1.5
 *
 * Informational shell only. No incident submission.
 */

import { Link } from 'react-router-dom';
import { COMPLAINT_CATEGORIES } from '@/api/types';

export default function StudentReportPage() {
  return (
    <main
      className="container"
      style={{ maxWidth: 'var(--layout-content-width)' }}
    >
      <section className="card">
        <span className="badge badge-primary">
          Student Reporting
        </span>

        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            marginTop: 'var(--spacing-3)',
          }}
        >
          Report an Incident
        </h1>

        <p style={{ color: 'var(--color-text-secondary)' }}>
          A.E.G.I.S is preparing a structured reporting
          service for campus safety concerns and grievances.
        </p>

        <div
          className="alert alert-warning"
          role="status"
          style={{ marginTop: 'var(--spacing-6)' }}
        >
          <div>
            <strong>Incident submission is disabled</strong>
            <p>
              This page is informational only. No report
              can be submitted, and no evidence can be
              uploaded through this interface.
              Reporting will be enabled only after
              security and privacy verification.
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
            Planned Reporting Categories
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
            Back to Student Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
