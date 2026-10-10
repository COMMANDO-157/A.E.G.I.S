/**
 * A.E.G.I.S 4.0 — Authority Verification Review Placeholder
 * WP-4.1.1
 */

import { Link } from 'react-router-dom';

export default function AuthorityReviewPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <div>
        <span className="badge badge-warning">Human Verification Protocol</span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          Evidence &amp; Allegation Review Console
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Record findings, substantiate allegations, and verify supporting evidence under institutional anti-ragging standards.
        </p>
      </div>

      <div className="card">
        <div className="alert alert-info" style={{ marginBottom: 'var(--spacing-6)' }}>
          <div>
            <strong>Verification Review Boundary</strong>
            <p style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--spacing-1)' }}>
              Authority officers record verification decisions via <code>/api/complaints/:id/verification</code>.
              Interactive findings recording and status updates activate in WP-4.2.
            </p>
          </div>
        </div>

        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">🔍</div>
          <div className="empty-state-title">No Cases Pending Review</div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', maxWidth: 440 }}>
            All currently assigned grievances have up-to-date verification findings.
          </p>
        </div>
      </div>

      <div>
        <Link to="/authority" className="btn btn-secondary">
          &larr; Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
