/**
 * A.E.G.I.S 4.0 — Admin User Management Placeholder
 * WP-4.1.1
 */

import { Link } from 'react-router-dom';

export default function AdminUsersPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <div>
        <span className="badge badge-warning">User Administration</span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          User Directory &amp; Role Assignments
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Review registered accounts, departmental mappings, and faculty staff promotion requests.
        </p>
      </div>

      <div className="card">
        <div className="alert alert-info" style={{ marginBottom: 'var(--spacing-6)' }}>
          <div>
            <strong>Role Assignment Boundary</strong>
            <p style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--spacing-1)' }}>
              Server endpoint <code>PATCH /api/admin/roles</code> controls role permissions (student, HOD, Dean, Higher Authority).
              Role assignments activate interactive state management in WP-4.2.
            </p>
          </div>
        </div>

        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">👥</div>
          <div className="empty-state-title">User Management Console</div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', maxWidth: 440 }}>
            Interactive user directory table and role delegation tooling activate in WP-4.2.
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
