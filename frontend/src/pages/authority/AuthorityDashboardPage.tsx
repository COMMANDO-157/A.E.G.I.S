
/**
 * A.E.G.I.S 4.0 — Authority Dashboard Shell
 * WP-4.1.5
 *
 * Presentation only. No case data is fetched or modified.
 */

import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';

export default function AuthorityDashboardPage() {
  const { user } = useAuth();
  const { t } = useLocale();

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
          {t.authority.portalBadge}: {user?.role ?? t.authority.unassigned}
        </span>

        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            marginTop: 'var(--spacing-3)',
            color: 'var(--aegis-navy)',
          }}
        >
          {t.authority.dashboardTitle}
        </h1>

        <p style={{ color: 'var(--color-text-secondary)' }}>
          {t.authority.officerLabel}: {user?.name ?? 'Unknown'}
        </p>

        <p style={{ color: 'var(--color-text-secondary)' }}>
          {t.authority.deptLabel}: {user?.department ?? t.authority.notAssigned}
        </p>
      </header>

      <section className="alert alert-info" role="status">
        <div>
          <strong>{t.authority.pendingNoticeTitle}</strong>
          <p>
            {t.authority.pendingNoticeDesc}
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
          {t.authority.workspaceHeading}
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
            <h3>{t.authority.assignedCasesTitle}</h3>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {t.authority.assignedCasesDesc}
            </p>
            <Link
              to="/authority/cases"
              className="btn btn-secondary btn-sm"
            >
              {t.authority.viewWorkspace}
            </Link>
          </article>

          <article className="card">
            <h3>{t.authority.verificationReviewsTitle}</h3>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {t.authority.verificationReviewsDesc}
            </p>
            <Link
              to="/authority/review"
              className="btn btn-secondary btn-sm"
            >
              {t.authority.viewReviewInfo}
            </Link>
          </article>

          <article className="card">
            <h3>{t.authority.escalationOversightTitle}</h3>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {t.authority.escalationOversightDesc}
            </p>
            <span className="badge badge-warning">
              {t.authority.notConnected}
            </span>
          </article>
        </div>
      </section>
    </main>
  );
}
