
/**
 * A.E.G.I.S 4.0 — Authority Cases Shell
 * WP-4.1.5
 */

import { Link } from 'react-router-dom';

export default function AuthorityCasesPage() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <header>
        <span className="badge badge-navy">Case Management</span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          Assigned Case Workspace
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          A dedicated workspace for cases assigned to your authorized jurisdiction.
        </p>
      </header>

      <section className="card">
        <div className="alert alert-info" role="status">
          <div>
            <strong>Case roster not connected</strong>
            <p>
              Assigned case records, severity indicators, and escalation deadlines
              are not being retrieved in this release. The absence of displayed
              cases does not indicate that your queue is empty.
            </p>
          </div>
        </div>
      </section>

      <Link to="/authority" className="btn btn-secondary">
        Back to Authority Dashboard
      </Link>
    </main>
  );
}
