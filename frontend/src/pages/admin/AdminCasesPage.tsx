/**
 * A.E.G.I.S 4.0 — Admin All Cases Placeholder
 * WP-4.1.1
 */

import { Link } from 'react-router-dom';

export default function AdminCasesPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <div>
        <span className="badge badge-warning">System Oversight</span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          Campus-Wide Case Oversight
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          High-level monitoring of all registered grievances, escalation SLAs, and resolution timelines.
        </p>
      </div>

      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">📊</div>
          <div className="empty-state-title">All Cases Registry</div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', maxWidth: 440 }}>
            Platform-wide case querying and status tracking table will activate in WP-4.2.
          </p>
        </div>
      </div>

      <div>
        <Link to="/admin" className="btn btn-secondary">
          &larr; Back to Overview
        </Link>
      </div>
    </div>
  );
}
