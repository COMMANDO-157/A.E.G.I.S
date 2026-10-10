/**
 * A.E.G.I.S 4.0 — Student Incident Report Placeholder
 * WP-4.1.1
 *
 * Foundation placeholder for confidential reporting.
 * Full interactive multi-step submission activates in WP-4.2.
 */

import { Link } from 'react-router-dom';
import { en } from '@/locales/en';
import { COMPLAINT_CATEGORIES } from '@/api/types';

export default function StudentReportPage() {
  return (
    <div className="container" style={{ maxWidth: 'var(--layout-content-width)' }}>
      <div className="card">
        <div style={{ marginBottom: 'var(--spacing-6)' }}>
          <span className="badge badge-primary">Confidential Intake</span>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
            {en.common.reportIncident}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-1)' }}>
            Your safety and privacy are strictly safeguarded. Select a category below to understand how the platform processes your report.
          </p>
        </div>

        <div className="alert alert-warning" style={{ marginBottom: 'var(--spacing-6)' }}>
          <div>
            <strong>Confidential Intake Activation</strong>
            <p style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--spacing-1)' }}>
              The multi-step intake flow with identity anonymization options, evidence attachments,
              and real-time server escalation activates in WP-4.2.
            </p>
          </div>
        </div>

        <h2 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--spacing-3)' }}>
          Eligible Incident Categories
        </h2>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)', marginBottom: 'var(--spacing-8)' }}>
          {COMPLAINT_CATEGORIES.map((cat) => (
            <li
              key={cat}
              style={{
                padding: 'var(--spacing-3) var(--spacing-4)',
                background: 'var(--color-bg-subtle)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-2)',
              }}
            >
              <span aria-hidden="true" style={{ color: 'var(--aegis-teal)' }}>🛡️</span>
              {cat}
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', gap: 'var(--spacing-3)' }}>
          <Link to="/student" className="btn btn-secondary">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
