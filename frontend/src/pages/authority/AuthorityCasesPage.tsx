/**
 * A.E.G.I.S 4.0 — Authority Cases Management Console
 * WP-4.1.5 & WP-4.4
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { listComplaints, updateComplaintStatus, overrideComplaintRouting } from '@/api/client';
import type { ApiComplaint } from '@/api/types';

export default function AuthorityCasesPage() {
  const { user } = useAuth();
  const { t } = useLocale();

  const [cases, setCases] = useState<ApiComplaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Status Update Modal State
  const [selectedCase, setSelectedCase] = useState<ApiComplaint | null>(null);
  const [newStatus, setNewStatus] = useState<string>('In Review');
  const [statusNotes, setStatusNotes] = useState<string>('');
  const [updating, setUpdating] = useState<boolean>(false);

  // Manual Escalation State
  const [escalateCase, setEscalateCase] = useState<ApiComplaint | null>(null);
  const [targetTier, setTargetTier] = useState<string>('Dean');
  const [escalationReason, setEscalationReason] = useState<string>('');

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listComplaints();
      setCases(data);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve assigned cases.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  async function handleStatusSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCase) return;
    if (statusNotes.trim().length < 5) {
      setError('Please provide administrative remarks for the status update.');
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await updateComplaintStatus(selectedCase.id, newStatus, statusNotes.trim());
      setSuccessMsg(`Updated status of case ${selectedCase.reference_id} to "${newStatus}".`);
      setSelectedCase(null);
      setStatusNotes('');
      await fetchCases();
    } catch (err: any) {
      setError(err.message || 'Failed to update case status.');
    } finally {
      setUpdating(false);
    }
  }

  async function handleEscalationSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!escalateCase) return;
    if (escalationReason.trim().length < 15) {
      setError('A detailed administrative justification is required for escalation overrides (minimum 15 characters).');
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await overrideComplaintRouting(escalateCase.id, targetTier, escalationReason.trim());
      setSuccessMsg(`Escalated case ${escalateCase.reference_id} to ${targetTier}.`);
      setEscalateCase(null);
      setEscalationReason('');
      await fetchCases();
    } catch (err: any) {
      setError(err.message || 'Escalation failed.');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <header>
        <span className="badge badge-navy">{t.authority.casesBadge}</span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          {t.authority.casesTitle}
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          {t.authority.casesSubtitle} (Officer: {user?.name || user?.email} | Jurisdiction: {user?.department || 'Institution-Wide'})
        </p>
      </header>

      {/* Safety Notice Banner */}
      <section className="card">
        <div className="alert alert-info" role="status">
          <div>
            <strong>{t.authority.casesAlertTitle}</strong>
            <p>
              {t.authority.casesAlertDesc}
            </p>
          </div>
        </div>

        {successMsg && (
          <div className="alert alert-success" style={{ marginTop: 'var(--spacing-4)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{successMsg}</span>
            <button type="button" onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {error && (
          <div className="alert alert-error" style={{ marginTop: 'var(--spacing-4)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* Case Queue Table */}
        <div style={{ marginTop: 'var(--spacing-6)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 'var(--spacing-8)' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Loading jurisdiction case roster…</span>
            </div>
          ) : cases.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--spacing-8)', textAlign: 'center' }}>
              <div className="empty-state-icon" aria-hidden="true" style={{ fontSize: '2rem' }}>📂</div>
              <h3 style={{ fontSize: 'var(--font-size-lg)', marginTop: 'var(--spacing-2)' }}>Case Queue Empty</h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', maxWidth: 440, margin: 'var(--spacing-2) auto' }}>
                No complaints are currently pending action in your assigned authority jurisdiction.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    <th style={{ padding: 'var(--spacing-3)' }}>Reference ID</th>
                    <th style={{ padding: 'var(--spacing-3)' }}>Category</th>
                    <th style={{ padding: 'var(--spacing-3)' }}>Department</th>
                    <th style={{ padding: 'var(--spacing-3)' }}>Severity / Urgency</th>
                    <th style={{ padding: 'var(--spacing-3)' }}>Current Status</th>
                    <th style={{ padding: 'var(--spacing-3)' }}>Verification</th>
                    <th style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>Actions</th>
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
                        <span className="badge badge-info">{user?.department || 'Institution'}</span>
                      </td>
                      <td style={{ padding: 'var(--spacing-3)', fontSize: 'var(--font-size-xs)' }}>
                        <div>Severity: <strong style={{ color: c.severity === 'Critical' ? 'var(--color-error)' : 'inherit' }}>{c.severity}</strong></div>
                        <div>Urgency: <strong>{c.urgency}</strong></div>
                      </td>
                      <td style={{ padding: 'var(--spacing-3)' }}>
                        <span className={`badge ${c.status === 'Resolved' ? 'badge-success' : c.status === 'Escalated' ? 'badge-error' : 'badge-navy'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td style={{ padding: 'var(--spacing-3)', fontSize: 'var(--font-size-xs)' }}>
                        {c.verification_status}
                      </td>
                      <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 'var(--spacing-2)', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setSelectedCase(c);
                              setNewStatus('In Review');
                              setStatusNotes('');
                            }}
                          >
                            Update Status
                          </button>
                          {user?.role !== 'Higher Authority' && (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                setEscalateCase(c);
                                setTargetTier(user?.role === 'HOD' ? 'Dean' : 'Higher Authority');
                                setEscalationReason('');
                              }}
                            >
                              Escalate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Status Transition Modal */}
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
          <div className="card" style={{ maxWidth: 500, width: '100%', background: '#fff' }}>
            <h3 style={{ fontSize: 'var(--font-size-xl)' }}>
              Update Case Status
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Case: <strong>{selectedCase.reference_id}</strong> (Current Status: {selectedCase.status})
            </p>

            <form onSubmit={handleStatusSubmit} style={{ marginTop: 'var(--spacing-4)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                  New Case Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="input"
                  style={{ width: '100%', marginTop: 'var(--spacing-1)' }}
                  required
                >
                  <option value="In Review">In Review</option>
                  <option value="Under Investigation">Under Investigation</option>
                  <option value="Action Taken">Action Taken</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                  Administrative Action Remarks
                </label>
                <textarea
                  rows={3}
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  placeholder="Record justification and next institutional actions taken..."
                  required
                  style={{ width: '100%', marginTop: 'var(--spacing-1)', padding: 'var(--spacing-2)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-4)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setSelectedCase(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={updating}>
                  {updating ? 'Saving…' : 'Record Status Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Escalation Modal */}
      {escalateCase && (
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
          <div className="card" style={{ maxWidth: 500, width: '100%', background: '#fff' }}>
            <h3 style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-error)' }}>
              Escalate Authority Tier
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Escalating: <strong>{escalateCase.reference_id}</strong> (Current Tier: {escalateCase.assigned_authority})
            </p>

            <form onSubmit={handleEscalationSubmit} style={{ marginTop: 'var(--spacing-4)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                  Target Authority Tier
                </label>
                <select
                  value={targetTier}
                  onChange={(e) => setTargetTier(e.target.value)}
                  className="input"
                  style={{ width: '100%', marginTop: 'var(--spacing-1)' }}
                  required
                >
                  {user?.role === 'HOD' && <option value="Dean">Dean (Tier 2)</option>}
                  <option value="Higher Authority">Higher Authority (Tier 3)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                  Mandatory Administrative Justification (min 15 characters)
                </label>
                <textarea
                  rows={3}
                  value={escalationReason}
                  onChange={(e) => setEscalationReason(e.target.value)}
                  placeholder="State the complex findings, jurisdiction limits, or severity indicators requiring higher authority..."
                  required
                  style={{ width: '100%', marginTop: 'var(--spacing-1)', padding: 'var(--spacing-2)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-4)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEscalateCase(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={updating}>
                  {updating ? 'Escalating…' : 'Confirm Escalation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Link to="/authority" className="btn btn-secondary">
        {t.authority.backToDashboard}
      </Link>
    </main>
  );
}
