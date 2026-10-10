
/**
 * A.E.G.I.S 4.0 — Owner Governance Dashboard
 * WP-4.1.5
 *
 * Presentation only. No privileged actions or data queries.
 */

import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const { t } = useLocale();

  const governanceSections = [
    {
      title: t.admin.usersTitle,
      description: t.admin.usersDesc,
      path: '/admin/users',
      action: t.admin.viewUsersAction,
    },
    {
      title: t.admin.casesTitle,
      description: t.admin.casesDesc,
      path: '/admin/cases',
      action: t.admin.viewCasesAction,
    },
    {
      title: t.admin.auditTitle,
      description: t.admin.auditDesc,
      path: '/admin/audit',
      action: t.admin.viewAuditAction,
    },
  ] as const;

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
          {t.admin.badge}
        </span>

        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            color: 'var(--aegis-navy)',
            marginTop: 'var(--spacing-3)',
          }}
        >
          {t.admin.overviewTitle}
        </h1>

        <p style={{ color: 'var(--color-text-secondary)' }}>
          {t.admin.signedInAs}: {user?.email ?? 'Unavailable'}
        </p>
      </header>

      <section className="alert alert-warning" role="status">
        <div>
          <strong>{t.admin.controlsNotEnabledTitle}</strong>
          <p>
            {t.admin.controlsNotEnabledDesc}
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
          {t.admin.workspacesHeading}
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
        <h2 id="security-heading">{t.admin.securityHeading}</h2>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          {t.admin.securityDesc}
        </p>
        <span className="badge badge-warning">
          {t.admin.activationPending}
        </span>
      </section>
    </main>
  );
}
