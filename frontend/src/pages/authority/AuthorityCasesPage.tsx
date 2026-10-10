/**
 * A.E.G.I.S 4.0 — Authority Active Cases Placeholder
 * WP-4.1.1
 */

import { Link } from 'react-router-dom';

export default function AuthorityCasesPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <div>
        <span className="badge badge-navy">Case Management</span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          Active Case Roster
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Assigned cases routed according to severity, escalation SLA, and departmental jurisdiction.
        </p>
      </div>

      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">📋</div>
          <div className="empty-state-title">No Active Cases in Queue</div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', maxWidth: 460 }}>
            There are currently no open cases assigned to your authority jurisdiction requiring action.
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
