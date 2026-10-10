/**
 * A.E.G.I.S 4.0 — Authority Dashboard Placeholder
 * WP-4.1.1
 */

import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export default function AuthorityDashboardPage() {
  const { user } = useAuth();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <header className="card" style={{ borderColor: 'var(--authority-accent)', background: 'linear-gradient(to right, #FFFFFF, var(--authority-accent-soft))' }}>
        <span className="badge badge-navy" style={{ marginBottom: 'var(--spacing-2)' }}>
          Authority Tier: {user?.role}
        </span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', color: 'var(--aegis-navy)', marginBottom: 'var(--spacing-1)' }}>
          Incident Redressal Command Overview
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Officer: <strong>{user?.name}</strong> · Department Jurisdiction: <strong>{user?.department}</strong>
        </p>
      </header>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--spacing-4)' }}>
        <div className="card">
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Assigned Active Cases
          </span>
          <div style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--aegis-navy)', marginBlock: 'var(--spacing-1)' }}>
            0
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            Within departmental SLA
          </span>
        </div>

        <div className="card">
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Pending Verification
          </span>
          <div style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--aegis-amber-500)', marginBlock: 'var(--spacing-1)' }}>
            0
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            Requires human investigator review
          </span>
        </div>

        <div className="card">
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Escalation Tier
          </span>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--aegis-teal-500)', marginBlock: 'var(--spacing-2)' }}>
            {user?.role}
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            Authority boundary active
          </span>
        </div>
      </div>

      {/* Quick Navigation */}
      <div style={{ display: 'flex', gap: 'var(--spacing-4)', flexWrap: 'wrap' }}>
        <Link to="/authority/cases" className="btn btn-primary">
          View Active Cases &rarr;
        </Link>
        <Link to="/authority/review" className="btn btn-secondary">
          Verification Review Console &rarr;
        </Link>
      </div>
    </div>
  );
}
