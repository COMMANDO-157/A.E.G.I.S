import { StepUpModal } from '@/components/admin/StepUpModal';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { useState, useEffect, useCallback } from 'react';
import { listAuthorityStudentRequests, reviewAuthorityStudentRequest } from '@/api/client';
import type { AuthorityStudentRequestItem } from '@/api/types';

export default function AuthorityStudentsPage() {
  const {user}=useAuth();
  const {t}=useLocale();
  const [stepUpOpen,setStepUpOpen]=useState(false);
  const canVerify=user?.role==='admin' && Boolean(user.is_primary_owner || user.permissions?.includes('department.students.verify'));
  const [requests, setRequests] = useState<AuthorityStudentRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Review Modal State
  const [selectedReq, setSelectedReq] = useState<AuthorityStudentRequestItem | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [verificationMethod, setVerificationMethod] = useState<'IN_PERSON_COLLEGE_ID' | 'PHYSICAL_OFFICE_VERIFICATION' | 'DEPT_ACADEMIC_RECORD' | 'FACULTY_ADVISOR_CONFIRMATION'>('IN_PERSON_COLLEGE_ID');
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('PENDING');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAuthorityStudentRequests();
      setRequests(data);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve student verification requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if(canVerify) fetchRequests();
  }, [fetchRequests,canVerify]);

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedReq) return;

    if (reviewNotes.trim().length < 15) {
      setError('Reviewer notes must contain at least 15 characters explaining the decision.');
      return;
    }

    if (decision === 'APPROVED' && selectedReq.claim_channel === 'STUDENT_MANUAL_CLAIM') {
      if (evidenceRef.trim().length < 5) {
        setError('Identity evidence reference or in-person verification record is required for manual claims.');
        return;
      }
      if (/^(https?:\/\/|\/|\\|\.\.|\w+:\/)/i.test(evidenceRef.trim())) {
        setError('Arbitrary URL or file path rejected. Document an official institutional credential or register record.');
        return;
      }
    }

    setStepUpOpen(true);
  }

  async function completeReview(stepUpToken:string) {
    if(!selectedReq)return;
    setSubmitting(true);
    setError(null);
    try {
      await reviewAuthorityStudentRequest(selectedReq.id, {
        decision,
        stepUpToken,
        notes: reviewNotes.trim(),
        identityEvidenceReference: decision === 'APPROVED' && evidenceRef.trim() ? evidenceRef.trim() : undefined,
        verificationMethod: decision === 'APPROVED' && selectedReq.claim_channel === 'STUDENT_MANUAL_CLAIM' ? verificationMethod : undefined,
      });

      setSuccessMsg(`Student verification request for ${selectedReq.register_number} (${selectedReq.user_email}) was marked as ${decision}.`);
      setSelectedReq(null);
      setReviewNotes('');
      setEvidenceRef('');
      await fetchRequests();
    } catch (err: any) {
      setError(err.message || 'Review submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = requests.filter(r => {
    if (filterStatus === 'ALL') return true;
    return r.status === filterStatus;
  });

  if(!canVerify) return <p role="status">{t.phase1.verificationAccessDenied}</p>;
  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <StepUpModal isOpen={stepUpOpen} onClose={()=>setStepUpOpen(false)} onSuccess={token=>{void completeReview(token);}} />
      <header>
        <span className="badge badge-navy">Student Identity Governance</span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          Department Student Verification Queue
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Review and verify institutional student identity claims scoped to your authorized departments.
        </p>
      </header>

      {/* Advisory Banner */}
      <section className="card">
        <div className="alert alert-warning" role="status">
          <div>
            <strong>Strict Department Scoping & Evidence Invariant</strong>
            <p style={{ marginTop: 'var(--spacing-1)', fontSize: 'var(--font-size-sm)' }}>
              {t.phase1.verificationAccessDenied}
              Manual claims require independently verified identity evidence (such as physical ID presentation or verified departmental records).
            </p>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginTop: 'var(--spacing-4)' }}>
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="alert alert-success" style={{ marginTop: 'var(--spacing-4)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{successMsg}</span>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ×
            </button>
          </div>
        )}

        {/* Filter controls */}
        <div style={{ marginTop: 'var(--spacing-4)', display: 'flex', gap: 'var(--spacing-3)', alignItems: 'center' }}>
          <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Filter by status:</label>
          <select
            className="input"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ width: 'auto', padding: 'var(--spacing-1) var(--spacing-2)' }}
          >
            <option value="PENDING">Pending Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="EXPIRED">Expired</option>
            <option value="ALL">All Records</option>
          </select>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={fetchRequests}
            disabled={loading}
          >
            Refresh Queue
          </button>
        </div>
      </section>

      {/* Queue Table */}
      <section className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Loading verification queue…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            No verification requests found matching the current criteria.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Register Number</th>
                <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Student Name & Email</th>
                <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Department</th>
                <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Claim Channel</th>
                <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Status</th>
                <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Submitted / Expires</th>
                <th style={{ padding: 'var(--spacing-3) var(--spacing-4)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(req => (
                <tr key={req.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 'var(--spacing-3) var(--spacing-4)', fontWeight: 600, fontFamily: 'monospace' }}>
                    {req.register_number}
                  </td>
                  <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                    <div><strong>{req.roster_name || req.user_name}</strong></div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                      Account: {req.user_email}
                    </div>
                    {req.institutional_email && (
                      <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>
                        Roster: {req.institutional_email}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                    <span className="badge badge-neutral">{req.department_code}</span>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                      {req.department_name}
                    </div>
                  </td>
                  <td style={{ padding: 'var(--spacing-3) var(--spacing-4)', fontSize: 'var(--font-size-xs)' }}>
                    {req.claim_channel}
                  </td>
                  <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                    <span className={`badge ${
                      req.status === 'APPROVED' ? 'badge-success' :
                      req.status === 'PENDING' ? 'badge-warning' :
                      req.status === 'REJECTED' ? 'badge-error' : 'badge-neutral'
                    }`}>
                      {req.status}
                    </span>
                  </td>
                  <td style={{ padding: 'var(--spacing-3) var(--spacing-4)', fontSize: 'var(--font-size-xs)' }}>
                    <div>{new Date(req.created_at).toLocaleDateString()}</div>
                    {req.status === 'PENDING' && (
                      <div style={{ color: 'var(--aegis-gold-600)' }}>
                        Exp: {new Date(req.expires_at).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: 'var(--spacing-3) var(--spacing-4)', textAlign: 'right' }}>
                    {req.status === 'PENDING' ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setSelectedReq(req);
                          setDecision('APPROVED');
                          setReviewNotes('');
                          setEvidenceRef('');
                          setError(null);
                        }}
                      >
                        Review Claim
                      </button>
                    ) : (
                      <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>
                        Resolved
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Review Modal */}
      {selectedReq && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--spacing-4)',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 580,
              width: '100%',
              backgroundColor: '#FFFFFF',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <h2 id="review-modal-title" style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--spacing-2)' }}>
              Review Student Verification Claim
            </h2>
            <div style={{ backgroundColor: 'var(--color-bg-secondary)', padding: 'var(--spacing-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--spacing-4)', fontSize: 'var(--font-size-sm)' }}>
              <div><strong>Register Number:</strong> {selectedReq.register_number}</div>
              <div><strong>Department:</strong> {selectedReq.department_code} — {selectedReq.department_name}</div>
              <div><strong>Claiming User:</strong> {selectedReq.user_name} ({selectedReq.user_email})</div>
              <div><strong>Roster Record:</strong> {selectedReq.roster_name} ({selectedReq.institutional_email})</div>
              {selectedReq.notes && (
                <div style={{ marginTop: 'var(--spacing-2)', fontStyle: 'italic', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-2)' }}>
                  Student Notes: "{selectedReq.notes}"
                </div>
              )}
            </div>

            <form onSubmit={handleReviewSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--spacing-1)' }}>
                    Action Decision
                  </label>
                  <div style={{ display: 'flex', gap: 'var(--spacing-4)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-sm)' }}>
                      <input
                        type="radio"
                        name="decision"
                        value="APPROVED"
                        checked={decision === 'APPROVED'}
                        onChange={() => setDecision('APPROVED')}
                      />
                      <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Approve & Bind Identity</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-sm)' }}>
                      <input
                        type="radio"
                        name="decision"
                        value="REJECTED"
                        checked={decision === 'REJECTED'}
                        onChange={() => setDecision('REJECTED')}
                      />
                      <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>Reject Claim</span>
                    </label>
                  </div>
                </div>

                {decision === 'APPROVED' && selectedReq.claim_channel === 'STUDENT_MANUAL_CLAIM' && (
                  <>
                    <div>
                      <label
                        htmlFor="verification-method"
                        style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--spacing-1)' }}
                      >
                        Institutional Verification Method *
                      </label>
                      <select
                        id="verification-method"
                        value={verificationMethod}
                        onChange={(e) => setVerificationMethod(e.target.value as any)}
                        style={{
                          width: '100%',
                          padding: 'var(--spacing-2)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--color-border)',
                        }}
                      >
                        <option value="IN_PERSON_COLLEGE_ID">In-Person College SmartCard / ID Verification</option>
                        <option value="PHYSICAL_OFFICE_VERIFICATION">Physical Office Visit & Identity Handshake</option>
                        <option value="DEPT_ACADEMIC_RECORD">Departmental Academic Ledger Cross-Reference</option>
                        <option value="FACULTY_ADVISOR_CONFIRMATION">Faculty Advisor Attestation & In-Person Confirmation</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="evidence-ref"
                        style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--spacing-1)' }}
                      >
                        Identity Evidence Reference * (Mandatory)
                      </label>
                      <input
                        id="evidence-ref"
                        type="text"
                        value={evidenceRef}
                        onChange={(e) => setEvidenceRef(e.target.value)}
                        placeholder="e.g. SmartCard ID #ECE-2022-887 or Office Register Vol 4 Pg 28"
                        required
                        style={{
                          width: '100%',
                          padding: 'var(--spacing-2)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--color-border)',
                        }}
                      />
                      <small style={{ color: 'var(--color-text-tertiary)', display: 'block', marginTop: 'var(--spacing-1)' }}>
                        Document genuine institutional evidence. Arbitrary URLs or file paths are prohibited and rejected.
                      </small>
                    </div>
                  </>
                )}

                <div>
                  <label
                    htmlFor="review-notes"
                    style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--spacing-1)' }}
                  >
                    Administrative Reviewer Remarks * (min 15 characters)
                  </label>
                  <textarea
                    id="review-notes"
                    rows={3}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Document justification for approving or rejecting this student identity claim..."
                    required
                    style={{
                      width: '100%',
                      padding: 'var(--spacing-2)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-2)' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setSelectedReq(null);
                      setError(null);
                    }}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`btn ${decision === 'APPROVED' ? 'btn-primary' : 'btn-danger'}`}
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting…' : decision === 'APPROVED' ? 'Confirm Approval' : 'Confirm Rejection'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
