
/**
 * A.E.G.I.S 4.0 — Authority Verification Shell
 * WP-4.1.5
 */

import { Link } from 'react-router-dom';

export default function AuthorityReviewPage() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <header>
        <span className="badge badge-warning">
          Human Verification Protocol
        </span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          Evidence &amp; Allegation Review
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          This workspace is intended for authorized review of case evidence
          and verification findings.
        </p>
      </header>

      <section className="card">
        <div className="alert alert-warning" role="status">
          <div>
            <strong>Verification workspace not yet active</strong>
            <p>
              Pending reviews, evidence records, and verification findings
              are not connected to this interface. No decisions can be
              recorded here.
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
