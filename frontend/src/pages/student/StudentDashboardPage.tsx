/**
 * A.E.G.I.S 4.0 â€” Student Dashboard Placeholder
 * WP-4.1.1
 */

import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const { t } = useLocale();

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      {/* Welcome Banner */}
      <section className="card" style={{ borderColor: 'var(--aegis-teal-300)', background: 'linear-gradient(to right, #FFFFFF, var(--aegis-teal-50))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--spacing-4)' }}>
          <div>
            <span className="badge badge-primary" style={{ marginBottom: 'var(--spacing-2)' }}>
              {t.student.badge}
            </span>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', color: 'var(--aegis-navy)', marginBottom: 'var(--spacing-1)' }}>
              {t.student.welcomeBack}, {user?.name ?? t.roles.student}
            </h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              {t.student.departmentLabel}: <strong>{user?.department || 'Unassigned'}</strong> · {t.student.statusLabel}:{' '}
              <span className="badge badge-success">{user?.account_status}</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--spacing-3)' }}>
            <Link to="/student/report" className="btn btn-primary">
              + {t.common.reportIncident}
            </Link>
            <Link to="/student/track" className="btn btn-secondary">
              {t.common.trackCases}
            </Link>
          </div>
        </div>
      </section>

      {/* Reporting availability advisory */}
      <div className="alert alert-warning" role="status">
        <div>
          <strong>{t.student.reportingDisabledTitle}</strong>
          <p
            style={{
              marginTop: 'var(--spacing-1)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            {t.student.reportingDisabledDesc}
          </p>
        </div>
      </div>

      {/* Overview Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--spacing-6)' }}>
        <div className="card">
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-2)' }}>
            {t.student.confidentialReportingTitle}
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-4)' }}>
            {t.student.confidentialReportingDesc}
          </p>
          <Link to="/student/report" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
            {t.student.openReportingForm} &rarr;
          </Link>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-2)' }}>
            {t.student.activeCaseStatusTitle}
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-4)' }}>
            {t.student.activeCaseStatusDesc}
          </p>
          <Link to="/student/track" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
            {t.student.viewTrackingDashboard} &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
