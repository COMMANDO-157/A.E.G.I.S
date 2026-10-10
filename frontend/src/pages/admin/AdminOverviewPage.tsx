
/**
 * A.E.G.I.S 4.0 — Owner Governance Dashboard
 * WP-4.1.5
 *
 * Presentation only. No privileged actions or data queries.
 */

import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const governanceSections = [
  {
    title: 'User & Role Governance',
    description:
      'Review the planned account directory, staff verification, and authority role management workspace.',
    path: '/admin/users',
    action: 'View user workspace',
  },
  {
    title: 'Case Oversight',
    description:
      'Explore the case oversight workspace. Live grievance records and escalation metrics are not connected.',
    path: '/admin/cases',
    action: 'View oversight workspace',
  },
  {
    title: 'Security Audit',
    description:
      'Access the audit viewer placeholder. Live audit records are not displayed in this release.',
    path: '/admin/audit',
    action: 'View audit workspace',
  },
] as const;

export default function AdminOverviewPage() {
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
          borderColor: 'var(--aegis-amber-500)',
          background: 'var(--aegis-amber-50)',
        }}
      >
        <span className="badge badge-warning">
          Owner Administration
        </span>

        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            color: 'var(--aegis-navy)',
            marginTop: 'var(--spacing-3)',
          }}
        >
          Platform Governance
        </h1>

        <p style={{ color: 'var(--color-text-secondary)' }}>
          Signed in as: {user?.email ?? 'Unavailable'}
        </p>
      </header>

      <section className="alert alert-warning" role="status">
        <div>
          <strong>Administrative controls not yet enabled</strong>
          <p>
            This dashboard is a navigation shell. Staff approvals,
            role changes, live case oversight, and audit queries
            require verified backend integration and additional
            owner security controls.
          </p>
        </div>
      </section>

      <section aria-labelledby="governance-heading">
        <h2
          id="governance-heading"
          style={{
            fontSize: 'var(--font-size-xl)',
            marginBottom: 'var(--spacing-4)',
          }}
        >
          Governance Workspaces
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: 'var(--spacing-4)',
          }}
        >
          {governanceSections.map((section) => (
            <article className="card" key={section.path}>
              <h3
                style={{
                  fontSize: 'var(--font-size-lg)',
                  marginBottom: 'var(--spacing-3)',
                }}
              >
                {section.title}
              </h3>

              <p
                style={{
                  color: 'var(--color-text-secondary)',
                  marginBottom: 'var(--spacing-4)',
                }}
              >
                {section.description}
              </p>

              <Link
                to={section.path}
                className="btn btn-secondary btn-sm"
              >
                {section.action}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="security-heading">
        <h2 id="security-heading">Security Readiness</h2>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Owner MFA, action PIN verification, and privileged
          workflow approvals are pending implementation
          and security testing.
        </p>
        <span className="badge badge-warning">
          Activation pending
        </span>
      </section>
    </main>
  );
}
