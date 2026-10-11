/**
 * A.E.G.I.S 4.0 — Admin Campus-Wide Case Oversight
 * WP-4.1.1 & WP-4.5
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';
import { listComplaints } from '@/api/client';
import type { ApiComplaint } from '@/api/types';

export default function AdminCasesPage() {
  const { t } = useLocale();
  const [cases, setCases] = useState<ApiComplaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<ApiComplaint | null>(null);

  useEffect(() => {
    let active = true;
    async function loadAllCases() {
      setLoading(true);
      setError(null);
      try {
        const data = await listComplaints();
        if (active) {
          setCases(data);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Failed to retrieve platform grievance cases.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    loadAllCases();
    return () => { active = false; };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <div>
        <span className="badge badge-warning">{t.admin.casesBadge}</span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          {t.admin.casesHeading}
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          {t.admin.casesSubtitle}
        </p>
      </div>

      <div className="card">
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-4)' }}>
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-8)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Loading platform case overview…</span>
          </div>
        ) : cases.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">📊</div>
            <div className="empty-state-title">{t.admin.casesEmptyTitle}</div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', maxWidth: 440 }}>
              {t.admin.casesEmptyDesc}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                  <th style={{ padding: 'var(--spacing-3)' }}>Reference ID</th>
                  <th style={{ padding: 'var(--spacing-3)' }}>Category</th>
                  <th style={{ padding: 'var(--spacing-3)' }}>Authority Tier</th>
                  <th style={{ padding: 'var(--spacing-3)' }}>Severity / Urgency</th>
                  <th style={{ padding: 'var(--spacing-3)' }}>Action Status</th>
                  <th style={{ padding: 'var(--spacing-3)' }}>Verification</th>
                  <th style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>Inspection</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
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
                    <td style={{ padding: 'var(--spacing-3)', fontSize: 'var(--font-size-xs)' }}>
                      <div>Severity: <strong>{c.severity}</strong></div>
                      <div>Urgency: <strong>{c.urgency}</strong></div>
                    </td>
                    <td style={{ padding: 'var(--spacing-3)' }}>
                      <span className={`badge ${c.status === 'Resolved' ? 'badge-success' : c.status === 'Escalated' ? 'badge-error' : 'badge-navy'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td style={{ padding: 'var(--spacing-3)', fontSize: 'var(--font-size-xs)' }}>
                      <div>{c.verification_status}</div>
                      <div style={{ color: 'var(--color-text-secondary)' }}>{c.allegation_status}</div>
                    </td>
                    <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedCase(c)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Case Details Inspection Modal */}
      {selectedCase && (
        <div
          role="dialog"
          aria-modal="true"
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
          <div className="card" style={{ maxWidth: 580, width: '100%', background: '#fff' }}>
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

            <h3 style={{ fontSize: 'var(--font-size-xl)', marginTop: 'var(--spacing-2)' }}>
              {selectedCase.category}
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Assigned Authority: <strong>{selectedCase.assigned_authority}</strong> | Privacy Mode: <strong>{selectedCase.identity_mode}</strong>
            </p>

            <div style={{ marginTop: 'var(--spacing-4)', background: 'var(--color-bg-secondary)', padding: 'var(--spacing-3)', borderRadius: 'var(--radius-sm)' }}>
              <h4 style={{ fontSize: 'var(--font-size-sm)', margin: 0, color: 'var(--color-text-secondary)' }}>Factual Description</h4>
              <p style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-1)', whiteSpace: 'pre-wrap' }}>
                {selectedCase.description}
              </p>
            </div>

            <div style={{ marginTop: 'var(--spacing-4)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)', fontSize: 'var(--font-size-xs)' }}>
              <div>
                <strong>Evidence Status:</strong> {selectedCase.evidence_status}
              </div>
              <div>
                <strong>Allegation Status:</strong> {selectedCase.allegation_status}
              </div>
              <div>
                <strong>Date Created:</strong> {new Date(selectedCase.created_at).toLocaleString()}
              </div>
              <div>
                <strong>Last Updated:</strong> {new Date(selectedCase.updated_at).toLocaleString()}
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

      <div>
        <Link to="/admin" className="btn btn-secondary">
          &larr; {t.admin.backToOverview}
        </Link>
      </div>
    </div>
  );
}
