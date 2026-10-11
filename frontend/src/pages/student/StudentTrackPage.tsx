/**
 * A.E.G.I.S 4.0 — Student Case Tracking & Escalation History
 * WP-4.1.5 & WP-4.3
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';
import { listComplaints } from '@/api/client';
import type { ApiComplaint } from '@/api/types';

export default function StudentTrackPage() {
  const { t } = useLocale();
  const [complaints, setComplaints] = useState<ApiComplaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<ApiComplaint | null>(null);

  useEffect(() => {
    let active = true;
    async function fetchCases() {
      setLoading(true);
      setError(null);
      try {
        const data = await listComplaints();
        if (active) {
          setComplaints(data);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Failed to retrieve submitted complaints.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    fetchCases();
    return () => { active = false; };
  }, []);

  return (
    <main
      className="container"
      style={{ maxWidth: 'var(--layout-content-width)' }}
    >
      <section className="card">
        <span className="badge badge-primary">
          {t.student.trackingBadge}
        </span>

        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            marginTop: 'var(--spacing-3)',
          }}
        >
          {t.student.trackingTitle}
        </h1>

        <p
          style={{
            color: 'var(--color-text-secondary)',
            marginTop: 'var(--spacing-2)',
          }}
        >
          {t.student.trackingDesc}
        </p>

        {/* Safety Disclaimer Banner */}
        <div
          className="alert alert-warning"
          role="status"
          style={{ marginTop: 'var(--spacing-6)' }}
        >
          <div>
            <strong>{t.student.trackingDisabledTitle}</strong>
            <p>
              {t.student.trackingDisabledDesc}
            </p>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginTop: 'var(--spacing-4)' }}>
            <span>{error}</span>
          </div>
        )}

        {/* Case List or Empty State */}
        <div style={{ marginTop: 'var(--spacing-6)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 'var(--spacing-8)' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Loading case history…</span>
            </div>
          ) : complaints.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--spacing-8)', textAlign: 'center' }}>
              <div className="empty-state-icon" aria-hidden="true" style={{ fontSize: '2rem' }}>📁</div>
              <h2 style={{ fontSize: 'var(--font-size-lg)', marginTop: 'var(--spacing-2)' }}>No Reports Filed</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', maxWidth: 440, margin: 'var(--spacing-2) auto' }}>
                You have not submitted any grievance reports under this student account.
              </p>
              <Link to="/student/report" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--spacing-3)' }}>
                File a Report
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                      <th style={{ padding: 'var(--spacing-3)' }}>Reference ID</th>
                      <th style={{ padding: 'var(--spacing-3)' }}>Category</th>
                      <th style={{ padding: 'var(--spacing-3)' }}>Authority Tier</th>
                      <th style={{ padding: 'var(--spacing-3)' }}>Status</th>
                      <th style={{ padding: 'var(--spacing-3)' }}>Verification</th>
                      <th style={{ padding: 'var(--spacing-3)' }}>Date Submitted</th>
                      <th style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complaints.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: 'var(--spacing-3)', fontWeight: 600, fontFamily: 'monospace' }}>
                          {c.reference_id}
                        </td>
                        <td style={{ padding: 'var(--spacing-3)' }}>{c.category}</td>
                        <td style={{ padding: 'var(--spacing-3)' }}>
                          <span className={`badge ${c.assigned_authority === 'Higher Authority' ? 'badge-error' : c.assigned_authority === 'Dean' ? 'badge-warning' : 'badge-info'}`}>
                            {c.assigned_authority}
                          </span>
                        </td>
                        <td style={{ padding: 'var(--spacing-3)' }}>
                          <span className={`badge ${c.status === 'Resolved' ? 'badge-success' : c.status === 'Escalated' ? 'badge-error' : 'badge-navy'}`}>
                            {c.status}
                          </span>
                        </td>
                        <td style={{ padding: 'var(--spacing-3)', fontSize: 'var(--font-size-xs)' }}>
                          {c.verification_status}
                        </td>
                        <td style={{ padding: 'var(--spacing-3)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                          {new Date(c.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setSelectedCase(c)}
                          >
                            Timeline
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Selected Case Detail / Escalation Timeline Modal */}
        {selectedCase && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="case-timeline-title"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9000,
              padding: 'var(--spacing-4)',
            }}
          >
            <div className="card" style={{ maxWidth: 600, width: '100%', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="badge badge-primary">{selectedCase.reference_id}</span>
                <button
                  type="button"
                  onClick={() => setSelectedCase(null)}
                  style={{ background: 'none', border: 'none', fontSize: 'var(--font-size-lg)', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <h2 id="case-timeline-title" style={{ fontSize: 'var(--font-size-xl)', marginTop: 'var(--spacing-2)' }}>
                {selectedCase.category}
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                Assigned Authority: <strong>{selectedCase.assigned_authority}</strong> | Severity: <strong>{selectedCase.severity}</strong> | Urgency: <strong>{selectedCase.urgency}</strong>
              </p>

              <div style={{ marginTop: 'var(--spacing-4)', background: 'var(--color-bg-secondary)', padding: 'var(--spacing-3)', borderRadius: 'var(--radius-sm)' }}>
                <h4 style={{ fontSize: 'var(--font-size-sm)', margin: 0, color: 'var(--color-text-secondary)' }}>Description</h4>
                <p style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-1)', whiteSpace: 'pre-wrap' }}>
                  {selectedCase.description}
                </p>
              </div>

              {/* Lifecycle & Escalation Progression Stepper */}
              <div style={{ marginTop: 'var(--spacing-5)' }}>
                <h4 style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-3)' }}>Review & Escalation Progress</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                    <span>✅</span>
                    <span><strong>1. Report Submitted</strong> ({new Date(selectedCase.created_at).toLocaleDateString()})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                    <span>{selectedCase.verification_status !== 'Submitted' ? '✅' : '⏳'}</span>
                    <span><strong>2. Verification State:</strong> {selectedCase.verification_status}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                    <span>{selectedCase.status !== 'Pending' ? '✅' : '⏳'}</span>
                    <span><strong>3. Case Action Status:</strong> {selectedCase.status}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                    <span>{selectedCase.status === 'Resolved' ? '✅' : '⏳'}</span>
                    <span><strong>4. Resolution:</strong> {selectedCase.allegation_status !== 'Unreviewed' ? selectedCase.allegation_status : 'Pending review completion'}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 'var(--spacing-6)', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedCase(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 'var(--spacing-6)' }}>
          <Link to="/student" className="btn btn-secondary">
            {t.student.backToDashboard}
          </Link>
        </div>
      </section>
    </main>
  );
}
