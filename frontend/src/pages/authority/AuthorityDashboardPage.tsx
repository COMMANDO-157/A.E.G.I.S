
/**
 * A.E.G.I.S 4.0 — Authority Dashboard Shell
 * WP-4.1.5
 *
 * Presentation only. No case data is fetched or modified.
 */

import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export default function AuthorityDashboardPage() {
  const { user } = useAuth();

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-6)',
      }}
    >
      <header
        className="card"
        style={{
          borderColor: 'var(--authority-accent)',
          background: 'var(--authority-accent-soft)',
        }}
      >
        <span className="badge badge-navy">
          Authority: {user?.role ?? 'Unassigned'}
        </span>

        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            marginTop: 'var(--spacing-3)',
            color: 'var(--aegis-navy)',
          }}
        >
          Authority Dashboard
        </h1>

        <p style={{ color: 'var(--color-text-secondary)' }}>
          Officer: {user?.name ?? 'Unknown'}
        </p>

        <p style={{ color: 'var(--color-text-secondary)' }}>
          Department: {user?.department ?? 'Not assigned'}
        </p>
      </header>

      <section className="alert alert-info" role="status">
        <div>
          <strong>Dashboard integration pending</strong>
          <p>
            Live case assignments, verification queues, and
            escalation metrics are not yet connected.
            No case totals are displayed.
          </p>
        </div>
      </section>

      <section aria-labelledby="authority-sections">
        <h2
          id="authority-sections"
          style={{
            fontSize: 'var(--font-size-xl)',
            marginBottom: 'var(--spacing-4)',
          }}
        >
          Workspace
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: 'var(--spacing-4)',
          }}
        >
          <article className="card">
            <h3>Assigned Cases</h3>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              Case information is unavailable until
              secure backend integration is completed.
            </p>
            <Link
              to="/authority/cases"
              className="btn btn-secondary btn-sm"
            >
              View workspace
            </Link>
          </article>

          <article className="card">
            <h3>Verification Reviews</h3>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              Verification decisions and evidence review
              are not available in this release.
            </p>
            <Link
              to="/authority/review"
              className="btn btn-secondary btn-sm"
            >
              View review information
            </Link>
          </article>

          <article className="card">
            <h3>Escalation Oversight</h3>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              Escalation timelines and SLA statistics
              will appear after verified integration.
            </p>
            <span className="badge badge-warning">
              Not connected
            </span>
          </article>
        </div>
      </section>
    </main>
  );
}
