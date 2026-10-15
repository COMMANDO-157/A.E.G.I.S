import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { getStudentVerificationStatus, submitStudentVerificationRequest, getConfig } from '@/api/client';
import type { StudentVerificationStatusResponse } from '@/api/types';

export default function StudentDashboardPage() {
  const { user, refreshUser } = useAuth();
  const { t } = useLocale();

  const [vStatus, setVStatus] = useState<StudentVerificationStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [intakeActive, setIntakeActive] = useState<boolean>(true);
  const [claimOpen, setClaimOpen] = useState(false);
  const [registerNumber, setRegisterNumber] = useState('');
  const [claimNotes, setClaimNotes] = useState('');
  const [submittingClaim, setSubmittingClaim] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccessMsg, setClaimSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadStatus() {
      try {
        const [res, cfg] = await Promise.all([
          getStudentVerificationStatus().catch(() => null),
          getConfig().catch(() => null),
        ]);
        if (active) {
          if (res) setVStatus(res);
          if (cfg) setIntakeActive(cfg.intakeEnabled);
        }
      } finally {
        if (active) setLoadingStatus(false);
      }
    }
    loadStatus();
    return () => { active = false; };
  }, [user]);

  async function handleClaimSubmit(e: React.FormEvent) {
    e.preventDefault();
    setClaimError(null);
    setClaimSuccessMsg(null);

    const reg = registerNumber.trim();
    if (!/^[A-Za-z0-9]{6,30}$/.test(reg)) {
      setClaimError('Register number must contain 6 to 30 alphanumeric characters without symbols.');
      return;
    }

    setSubmittingClaim(true);
    try {
      const res = await submitStudentVerificationRequest({
        registerNumber: reg,
        notes: claimNotes.trim() || undefined,
      });

      if (res.status === 'APPROVED') {
        setClaimSuccessMsg(`Institutional verification confirmed automatically! Register number ${res.registerNumber} bound to your account.`);
        await refreshUser();
      } else {
        setClaimSuccessMsg(`Verification request submitted for ${res.registerNumber}. Your claim is pending review by the Primary Owner under institutional governance.`);
      }

      const refreshed = await getStudentVerificationStatus();
      setVStatus(refreshed);
      setClaimOpen(false);
      setRegisterNumber('');
      setClaimNotes('');
    } catch (err: any) {
      setClaimError(err.message || 'Verification claim submission failed.');
    } finally {
      setSubmittingClaim(false);
    }
  }

  const isVerified = Boolean(user?.is_verified_student || vStatus?.isVerified);
  const pendingRequest = vStatus?.activeRequest?.status === 'PENDING' ? vStatus.activeRequest : null;

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      {/* Welcome Banner */}
      <section className="card" style={{ borderColor: 'var(--sanctuary-border)', background: 'linear-gradient(135deg, #FFFFFF 0%, var(--sanctuary-surface-subtle) 100%)', borderRadius: 'var(--radius-xl)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--spacing-4)' }}>
          <div>
            <span className="badge badge-primary" style={{ marginBottom: 'var(--spacing-2)' }}>
              {t.student.badge}
            </span>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', color: 'var(--color-text-primary)', marginBottom: 'var(--spacing-1)' }}>
              {t.student.welcomeBack}, {user?.name ?? t.roles.student}
            </h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              {t.student.departmentLabel}: <strong>{user?.department || 'Unassigned'}</strong> · {t.student.statusLabel}:{' '}
              <span className="badge badge-success">{user?.account_status}</span>
              {' · '}
              Verification:{' '}
              {isVerified ? (
                <span className="badge badge-success">Verified Student</span>
              ) : pendingRequest ? (
                <span className="badge badge-warning">Verification Pending</span>
              ) : (
                <span className="badge badge-neutral">Unverified</span>
              )}
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

      {/* Institutional Verification Onboarding Banner */}
      {!loadingStatus && !isVerified && (
        <section
          className="card"
          style={{
            borderColor: pendingRequest ? 'var(--sanctuary-highlight)' : 'var(--sanctuary-border)',
            backgroundColor: pendingRequest ? 'var(--sanctuary-surface-subtle)' : '#FFFFFF',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--spacing-4)' }}>
            <div>
              <span className={`badge ${pendingRequest ? 'badge-warning' : 'badge-primary'}`} style={{ marginBottom: 'var(--spacing-2)' }}>
                {pendingRequest ? 'Review in Progress' : 'Action Required'}
              </span>
              <h2 style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-text-primary)', marginBottom: 'var(--spacing-1)' }}>
                {pendingRequest ? 'Verification Claim Pending Review' : 'Verify Your Institutional Student Identity'}
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                {pendingRequest
                  ? `Your claim for register number ${pendingRequest.register_number} (${pendingRequest.department_name}) was submitted on ${new Date(pendingRequest.created_at).toLocaleDateString()} and expires on ${new Date(pendingRequest.expires_at).toLocaleDateString()}. Path B enrollment requires explicit Primary Owner approval before student protections and grievance filing are activated.`
                  : 'Grievance filing requires a verified institutional register number linked to your student account. Path A (institutional email match) verifies immediately; Path B (personal Google account) requires Primary Owner approval.'}
              </p>
            </div>
            {!pendingRequest && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setClaimOpen(true)}
              >
                Verify Register Number
              </button>
            )}
          </div>
        </section>
      )}

      {claimSuccessMsg && (
        <div className="alert alert-success" role="status">
          <span>{claimSuccessMsg}</span>
        </div>
      )}

      {/* Claim Modal / Dialog */}
      {claimOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="claim-modal-title"
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
              maxWidth: 520,
              width: '100%',
              backgroundColor: '#FFFFFF',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <h2 id="claim-modal-title" style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--spacing-2)' }}>
              Institutional Student Verification
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-4)' }}>
              Enter your official college register number. Verification requests remain valid for 7 days.
            </p>

            {claimError && (
              <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-4)' }}>
                <span>{claimError}</span>
              </div>
            )}

            <form onSubmit={handleClaimSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <div>
                  <label
                    htmlFor="claim-reg-number"
                    style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--spacing-1)' }}
                  >
                    Official Register Number
                  </label>
                  <input
                    id="claim-reg-number"
                    type="text"
                    value={registerNumber}
                    onChange={(e) => setRegisterNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. 22CS101, 717822P101"
                    required
                    style={{
                      width: '100%',
                      padding: 'var(--spacing-2)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      fontFamily: 'monospace',
                    }}
                  />
                  <small style={{ color: 'var(--color-text-tertiary)', display: 'block', marginTop: 'var(--spacing-1)' }}>
                    6-30 alphanumeric characters as registered in institutional records.
                  </small>
                </div>

                <div>
                  <label
                    htmlFor="claim-notes"
                    style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--spacing-1)' }}
                  >
                    Verification Notes (Optional for in-person identification)
                  </label>
                  <textarea
                    id="claim-notes"
                    rows={3}
                    value={claimNotes}
                    onChange={(e) => setClaimNotes(e.target.value)}
                    placeholder="Provide details if claiming from an alternate or personal email..."
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
                      setClaimOpen(false);
                      setClaimError(null);
                    }}
                    disabled={submittingClaim}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submittingClaim}
                  >
                    {submittingClaim ? 'Submitting Claim…' : 'Submit Verification Claim'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reporting availability advisory - displayed only if intake is paused/disabled on backend */}
      {!intakeActive && (
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
      )}

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
