/**
 * A.E.G.I.S 4.0 — Student Case Tracking Placeholder
 * WP-4.1.1
 *
 * Foundation placeholder for tracking submitted cases.
 */

import { Link } from 'react-router-dom';

export default function StudentTrackPage() {
  return (
    <div className="container" style={{ maxWidth: 'var(--layout-content-width)' }}>
      <div className="card">
        <div style={{ marginBottom: 'var(--spacing-6)' }}>
          <span className="badge badge-primary">Case Tracking</span>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
            Track Your Reported Cases
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-1)' }}>
            Monitor real-time escalation status, assigned authority tiers, and verification notices.
          </p>
        </div>

        <div className="empty-state" style={{ background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-lg)' }}>
          <div className="empty-state-icon" aria-hidden="true">🗂️</div>
          <div className="empty-state-title">No Active Cases Found</div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', maxWidth: 400 }}>
            You do not currently have any open incident reports. If you need assistance, submit a new report.
          </p>
          <Link to="/student/report" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--spacing-4)' }}>
            Submit a Report
          </Link>
        </div>

        <div style={{ marginTop: 'var(--spacing-8)' }}>
          <Link to="/student" className="btn btn-secondary">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
