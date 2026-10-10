/**
 * A.E.G.I.S 4.0 — Admin Immutable Audit Log Placeholder
 * WP-4.1.1
 */

import { Link } from 'react-router-dom';

export default function AdminAuditPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <div>
        <span className="badge badge-warning">Security Audit</span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          Immutable Security Audit Log
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Tamper-evident system logs protected by PostgreSQL trigger <code>deny_audit_mutation</code>.
        </p>
      </div>

      <div className="card">
        <div className="alert alert-info" style={{ marginBottom: 'var(--spacing-6)' }}>
          <div>
            <strong>Append-Only Integrity Guarantee</strong>
            <p style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--spacing-1)' }}>
              The backend audit architecture is separate from this interface. Live audit records are not currently retrieved or displayed here. Audit integrity and access controls require integration verification. <code>GET /api/admin/audit</code>.
            </p>
          </div>
        </div>

        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">🛡️</div>
          <div className="empty-state-title">Audit Ledger Viewer</div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', maxWidth: 440 }}>
            The structured audit ledger viewer is not yet connected. Live audit records are not retrieved or displayed in this release.
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
