/**
 * A.E.G.I.S 4.0 — Student Dashboard Placeholder
 * WP-4.1.1
 */

import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { en } from '@/locales/en';

export default function StudentDashboardPage() {
  const { user } = useAuth();

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      {/* Welcome Banner */}
      <section className="card" style={{ borderColor: 'var(--aegis-teal-300)', background: 'linear-gradient(to right, #FFFFFF, var(--aegis-teal-50))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--spacing-4)' }}>
          <div>
            <span className="badge badge-primary" style={{ marginBottom: 'var(--spacing-2)' }}>
              Protected Student Account
            </span>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', color: 'var(--aegis-navy)', marginBottom: 'var(--spacing-1)' }}>
              Welcome back, {user?.name ?? 'Student'}
            </h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Department: <strong>{user?.department || 'Unassigned'}</strong> · Account Status:{' '}
              <span className="badge badge-success">{user?.account_status}</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--spacing-3)' }}>
            <Link to="/student/report" className="btn btn-primary">
              + {en.common.reportIncident}
            </Link>
            <Link to="/student/track" className="btn btn-secondary">
              {en.common.trackCases}
            </Link>
          </div>
        </div>
      </section>

      {/* Security & Confidentiality Advisory */}
      <div className="alert alert-info">
        <div>
          <strong>{en.common.confidentialNotice}</strong>
          <p style={{ marginTop: 'var(--spacing-1)', fontSize: 'var(--font-size-xs)' }}>
            All reports submitted through A.E.G.I.S follow strict anti-retaliation protocols.
            Your submissions are processed directly through the institutional escalation engine.
          </p>
        </div>
      </div>

      {/* Overview Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--spacing-6)' }}>
        <div className="card">
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-2)' }}>
            Confidential Reporting
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-4)' }}>
            Submit grievances regarding harassment, ragging, hostel issues, or academic coercion with full identity privacy.
          </p>
          <Link to="/student/report" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
            Open Reporting Form &rarr;
          </Link>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-2)' }}>
            Active Case Status
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-4)' }}>
            Track escalation timelines, authority assignments, and verification updates on your active reports.
          </p>
          <Link to="/student/track" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
            View Tracking Dashboard &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
