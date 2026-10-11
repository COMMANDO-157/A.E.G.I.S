/**
 * A.E.G.I.S 4.0 — Authority Evidence & Allegation Verification Console
 * WP-4.1.5 & WP-4.4
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';
import { listComplaints, recordVerificationDecision } from '@/api/client';
import type { ApiComplaint, VerificationStatus, AllegationStatus } from '@/api/types';

export default function AuthorityReviewPage() {
  const { t } = useLocale();

  const [cases, setCases] = useState<ApiComplaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Review Form Modal
  const [reviewCase, setReviewCase] = useState<ApiComplaint | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('Identity Verified');
  const [allegationStatus, setAllegationStatus] = useState<AllegationStatus>('Inconclusive');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listComplaints();
      setCases(data);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve cases for verification.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewCase) return;

    if (notes.trim().length < 15) {
      setError('Supporting administrative reasons must contain at least 15 characters.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await recordVerificationDecision(
        reviewCase.id,
        verificationStatus,
        notes.trim(),
        verificationStatus === 'Findings Recorded' ? allegationStatus : undefined,
      );
      setSuccessMsg(`Recorded verification decision "${verificationStatus}" for case ${reviewCase.reference_id}.`);
      setReviewCase(null);
      setNotes('');
      await fetchCases();
    } catch (err: any) {
      setError(err.message || 'Verification decision rejected by policy.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <header>
        <span className="badge badge-warning">
          {t.authority.reviewBadge}
        </span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          {t.authority.reviewTitle}
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          {t.authority.reviewSubtitle}
        </p>
      </header>

      {/* Safety Notice Banner */}
      <section className="card">
        <div className="alert alert-warning" role="status">
          <div>
            <strong>{t.authority.reviewAlertTitle}</strong>
            <p>
              {t.authority.reviewAlertDesc}
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

        <div style={{ marginTop: 'var(--spacing-6)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 'var(--spacing-8)' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Loading verification queue…</span>
            </div>
          ) : cases.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--spacing-8)', textAlign: 'center' }}>
              <div className="empty-state-icon" aria-hidden="true" style={{ fontSize: '2rem' }}>⚖️</div>
              <h3 style={{ fontSize: 'var(--font-size-lg)', marginTop: 'var(--spacing-2)' }}>Verification Queue Empty</h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', maxWidth: 440, margin: 'var(--spacing-2) auto' }}>
                All assigned complaints have completed current verification stages.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    <th style={{ padding: 'var(--spacing-3)' }}>Reference ID</th>
                    <th style={{ padding: 'var(--spacing-3)' }}>Category</th>
                    <th style={{ padding: 'var(--spacing-3)' }}>Verification Stage</th>
                    <th style={{ padding: 'var(--spacing-3)' }}>Allegation Finding</th>
                    <th style={{ padding: 'var(--spacing-3)' }}>Evidence Status</th>
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
                        <span className="badge badge-warning">{c.verification_status}</span>
                      </td>
                      <td style={{ padding: 'var(--spacing-3)' }}>
                        <span className={`badge ${c.allegation_status === 'Substantiated' ? 'badge-success' : c.allegation_status === 'Not Substantiated' ? 'badge-navy' : 'badge-info'}`}>
                          {c.allegation_status}
                        </span>
                      </td>
                      <td style={{ padding: 'var(--spacing-3)', fontSize: 'var(--font-size-xs)' }}>
                        {c.evidence_status}
                      </td>
                      <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                        {c.verification_status !== 'Resolved' && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setReviewCase(c);
                              // Next valid transition default
                              if (c.verification_status === 'Submitted') setVerificationStatus('Identity Verified');
                              else if (c.verification_status === 'Identity Verified') setVerificationStatus('Under Review');
                              else if (c.verification_status === 'Under Review') setVerificationStatus('Findings Recorded');
                              else setVerificationStatus('Resolved');
                              setNotes('');
                            }}
                          >
                            Advance Review
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Verification Transition Modal */}
      {reviewCase && (
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
          <div className="card" style={{ maxWidth: 540, width: '100%', background: '#fff' }}>
            <h3 style={{ fontSize: 'var(--font-size-xl)' }}>
              Record Verification Protocol Finding
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Case: <strong>{reviewCase.reference_id}</strong> (Current Stage: {reviewCase.verification_status})
            </p>

            <form onSubmit={handleReviewSubmit} style={{ marginTop: 'var(--spacing-4)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                  Target Verification Stage
                </label>
                <select
                  value={verificationStatus}
                  onChange={(e) => setVerificationStatus(e.target.value as VerificationStatus)}
                  className="input"
                  style={{ width: '100%', marginTop: 'var(--spacing-1)' }}
                  required
                >
                  <option value="Identity Verified">Identity Verified</option>
                  <option value="Evidence Pending">Evidence Pending</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Additional Information Requested">Additional Information Requested</option>
                  <option value="Findings Recorded">Findings Recorded</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </div>

              {verificationStatus === 'Findings Recorded' && (
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                    Allegation Finding Outcome
                  </label>
                  <select
                    value={allegationStatus}
                    onChange={(e) => setAllegationStatus(e.target.value as AllegationStatus)}
                    className="input"
                    style={{ width: '100%', marginTop: 'var(--spacing-1)' }}
                    required
                  >
                    <option value="Substantiated">Substantiated</option>
                    <option value="Not Substantiated">Not Substantiated</option>
                    <option value="Inconclusive">Inconclusive</option>
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                  Supporting Reasons & Factual Findings (min 15 characters)
                </label>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Record detailed objective reasons, witness review, or identity verification outcome..."
                  required
                  style={{ width: '100%', marginTop: 'var(--spacing-1)', padding: 'var(--spacing-2)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-4)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setReviewCase(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Recording…' : 'Submit Verification Finding'}
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
