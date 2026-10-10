/**
 * A.E.G.I.S 4.0 — Owner/Admin Overview Placeholder
 * WP-4.1.1
 */

import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export default function AdminOverviewPage() {
  const { user } = useAuth();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <header className="card" style={{ borderColor: 'var(--aegis-amber-500)', background: 'linear-gradient(to right, #FFFFFF, var(--aegis-amber-50))' }}>
        <span className="badge badge-warning" style={{ marginBottom: 'var(--spacing-2)' }}>
          Root System Administrator
        </span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', color: 'var(--aegis-navy)', marginBottom: 'var(--spacing-1)' }}>
          Platform Governance &amp; Administration
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Root Administrator: <strong>{user?.email}</strong> · Session Security: <strong>HttpOnly Cookie Boundary</strong>
        </p>
      </header>

      {/* Admin Quick Panels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--spacing-4)' }}>
        <div className="card">
          <h2 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--spacing-2)' }}>
            User Roles &amp; Staff Requests
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-4)' }}>
            Manage student registrations, approve staff privilege requests, and promote faculty to authority tiers.
          </p>
          <Link to="/admin/users" className="btn btn-secondary btn-sm">
            Manage Users &rarr;
          </Link>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--spacing-2)' }}>
            System-Wide Case Oversight
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-4)' }}>
            Audit active grievances across all department branches and inspect escalation SLA compliance.
          </p>
          <Link to="/admin/cases" className="btn btn-secondary btn-sm">
            Oversight Console &rarr;
          </Link>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--spacing-2)' }}>
            Immutable Audit Trail
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-4)' }}>
            Review tamper-evident audit logs protected by PostgreSQL triggers.
          </p>
          <Link to="/admin/audit" className="btn btn-secondary btn-sm">
            Inspect Audit Logs &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
