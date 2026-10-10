
/**
 * A.E.G.I.S 4.0 — Student Tracking Placeholder
 * WP-4.1.5
 *
 * No live case queries or tracking operations.
 */

import { Link } from 'react-router-dom';

export default function StudentTrackPage() {
  return (
    <main
      className="container"
      style={{ maxWidth: 'var(--layout-content-width)' }}
    >
      <section className="card">
        <span className="badge badge-primary">
          Student Case Tracking
        </span>

        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            marginTop: 'var(--spacing-3)',
          }}
        >
          Track Your Reports
        </h1>

        <p
          style={{
            color: 'var(--color-text-secondary)',
            marginTop: 'var(--spacing-2)',
          }}
        >
          This workspace will allow students to view their
          submitted reports and follow institutional review
          and escalation progress.
        </p>

        <div
          className="alert alert-warning"
          role="status"
          style={{ marginTop: 'var(--spacing-6)' }}
        >
          <div>
            <strong>Case tracking is not yet available</strong>
            <p>
              Live case records and escalation statuses are
              not connected to this interface. No case
              information is being retrieved or displayed.
            </p>
          </div>
        </div>

        <div style={{ marginTop: 'var(--spacing-6)' }}>
          <Link to="/student" className="btn btn-secondary">
            Back to Student Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
