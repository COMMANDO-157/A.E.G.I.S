/**
 * A.E.G.I.S 4.0 — Student Incident Reporting Form
 * WP-4.1.5 & WP-4.3
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { getConfig, submitComplaint, updateProfile } from '@/api/client';
import { COMPLAINT_CATEGORIES, type ComplaintCategory, type IdentityMode, type ApiComplaint } from '@/api/types';

export default function StudentReportPage() {
  const { user, refreshUser } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();

  const [intakeActive, setIntakeActive] = useState<boolean>(false);
  const [loadingConfig, setLoadingConfig] = useState<boolean>(true);

  // Form State
  const [category, setCategory] = useState<ComplaintCategory>(COMPLAINT_CATEGORIES[0]);
  const [department, setDepartment] = useState<string>(user?.department || '');
  const [description, setDescription] = useState<string>('');
  const [identityMode, setIdentityMode] = useState<IdentityMode>('confidential');
  const [immediateDanger, setImmediateDanger] = useState<boolean>(false);
  const [physicalThreat, setPhysicalThreat] = useState<boolean>(false);
  const [retaliation, setRetaliation] = useState<boolean>(false);
  const [repeatHarassment, setRepeatHarassment] = useState<boolean>(false);

  // Submission State
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [createdComplaint, setCreatedComplaint] = useState<ApiComplaint | null>(null);

  useEffect(() => {
    let active = true;
    async function checkConfig() {
      try {
        const config = await getConfig();
        if (active) {
          setIntakeActive(config.intakeEnabled);
        }
      } catch {
        if (active) setIntakeActive(false);
      } finally {
        if (active) setLoadingConfig(false);
      }
    }
    checkConfig();
    return () => { active = false; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (description.trim().length < 20) {
      setError('Please provide at least 20 characters in the description.');
      return;
    }

    setSubmitting(true);
    try {
      // Ensure department is saved if not yet set on profile
      if (!user?.department || user.department !== department.trim()) {
        await updateProfile({ department: department.trim() });
        await refreshUser();
      }

      const res = await submitComplaint({
        category,
        description: description.trim(),
        identityMode,
        riskFlags: {
          immediateDanger,
          physicalThreat,
          retaliation,
          repeatHarassment,
        },
      });

      setCreatedComplaint(res);
    } catch (err: any) {
      setError(err.message || 'Incident submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="container"
      style={{ maxWidth: 'var(--layout-content-width)' }}
    >
      <section className="card">
        <span className="badge badge-primary">
          {t.roles.student} Reporting
        </span>

        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            marginTop: 'var(--spacing-3)',
          }}
        >
          {t.student.reportingHeader}
        </h1>

        <p style={{ color: 'var(--color-text-secondary)' }}>
          {t.student.reportingDesc}
        </p>

        {/* Unverified Student Advisory */}
        {!user?.is_verified_student && (
          <div className="alert alert-error" role="status" style={{ marginTop: 'var(--spacing-4)' }}>
            <div>
              <strong>Institutional Verification Required</strong>
              <p style={{ marginTop: 'var(--spacing-1)', fontSize: 'var(--font-size-sm)' }}>
                You must verify your official student register number before submitting grievances. Please visit your{' '}
                <Link to="/student" style={{ textDecoration: 'underline', fontWeight: 600 }}>Student Dashboard</Link>{' '}
                to verify your institutional identity.
              </p>
            </div>
          </div>
        )}

        {/* Safety Disclaimer Banner */}
        <div
          className="alert alert-warning"
          role="status"
          style={{ marginTop: 'var(--spacing-4)' }}
        >
          <div>
            <strong>{t.student.reportingDisabledAlertTitle}</strong>
            <p>
              {t.student.reportingDisabledAlertDesc}
            </p>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginTop: 'var(--spacing-4)' }}>
            <span>{error}</span>
          </div>
        )}

        {/* Success Confirmation Modal / Card */}
        {createdComplaint ? (
          <div
            className="card"
            style={{
              marginTop: 'var(--spacing-6)',
              borderColor: 'var(--color-success)',
              backgroundColor: 'var(--color-bg-surface)',
            }}
          >
            <span className="badge badge-success">Grievance Registered</span>
            <h2 style={{ fontSize: 'var(--font-size-xl)', marginTop: 'var(--spacing-2)' }}>
              Case Reference: {createdComplaint.reference_id}
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-1)' }}>
              Your report has been secured and assigned to <strong>{createdComplaint.assigned_authority}</strong>. Initial status is <strong>{createdComplaint.status}</strong>.
            </p>
            <div style={{ marginTop: 'var(--spacing-4)', display: 'flex', gap: 'var(--spacing-3)' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/student/track')}
              >
                Go to Case Tracking
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setCreatedComplaint(null);
                  setDescription('');
                }}
              >
                Submit Another Report
              </button>
            </div>
          </div>
        ) : (
          /* Grievance Submission Form */
          <form onSubmit={handleSubmit} style={{ marginTop: 'var(--spacing-6)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
              <div>
                <label
                  htmlFor="report-category"
                  style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}
                >
                  Grievance Category
                </label>
                <select
                  id="report-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
                  className="input"
                  style={{ width: '100%', marginTop: 'var(--spacing-1)' }}
                  required
                >
                  {COMPLAINT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="report-dept"
                  style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}
                >
                  Academic Department
                </label>
                <input
                  id="report-dept"
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Computer Science, Mechanical Engineering"
                  required
                  style={{
                    width: '100%',
                    padding: 'var(--spacing-2)',
                    marginTop: 'var(--spacing-1)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="report-identity-mode"
                  style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}
                >
                  Identity & Privacy Mode
                </label>
                <select
                  id="report-identity-mode"
                  value={identityMode}
                  onChange={(e) => setIdentityMode(e.target.value as IdentityMode)}
                  className="input"
                  style={{ width: '100%', marginTop: 'var(--spacing-1)' }}
                  required
                >
                  <option value="confidential">Confidential (Visible only to authorized institutional officers)</option>
                  <option value="anonymous">Anonymous (Identity withheld from case records)</option>
                  <option value="standard">Standard Institutional Record</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="report-description"
                  style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}
                >
                  Detailed Description (min 20 characters)
                </label>
                <textarea
                  id="report-description"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide an objective, detailed account of the incident or safety concern..."
                  required
                  style={{
                    width: '100%',
                    padding: 'var(--spacing-2)',
                    marginTop: 'var(--spacing-1)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                  }}
                />
              </div>

              <div>
                <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--spacing-2)' }}>
                  Safety & Threat Indicators
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-sm)' }}>
                    <input
                      type="checkbox"
                      checked={immediateDanger}
                      onChange={(e) => setImmediateDanger(e.target.checked)}
                    />
                    <span>Immediate Danger (Triggers priority routing to Higher Authority)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-sm)' }}>
                    <input
                      type="checkbox"
                      checked={physicalThreat}
                      onChange={(e) => setPhysicalThreat(e.target.checked)}
                    />
                    <span>Physical Threat or Violence</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-sm)' }}>
                    <input
                      type="checkbox"
                      checked={retaliation}
                      onChange={(e) => setRetaliation(e.target.checked)}
                    />
                    <span>Fear of Retaliation / Coercion</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-sm)' }}>
                    <input
                      type="checkbox"
                      checked={repeatHarassment}
                      onChange={(e) => setRepeatHarassment(e.target.checked)}
                    />
                    <span>Repeated Harassment / Prior Occurrences</span>
                  </label>
                </div>
              </div>

              <div style={{ marginTop: 'var(--spacing-4)', display: 'flex', gap: 'var(--spacing-3)' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || (!intakeActive && !loadingConfig) || !user?.is_verified_student}
                >
                  {submitting ? 'Submitting Report…' : !user?.is_verified_student ? 'Verification Required' : intakeActive ? 'Submit Official Grievance' : 'Intake Paused (Simulation Only)'}
                </button>
                <Link to="/student" className="btn btn-secondary">
                  {t.student.backToDashboard}
                </Link>
              </div>
            </div>
          </form>
        )}

        <section
          aria-labelledby="report-categories"
          style={{ marginTop: 'var(--spacing-8)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-6)' }}
        >
          <h2
            id="report-categories"
            style={{
              fontSize: 'var(--font-size-lg)',
              marginBottom: 'var(--spacing-3)',
            }}
          >
            {t.student.plannedCategories}
          </h2>

          <ul
            style={{
              display: 'grid',
              gap: 'var(--spacing-2)',
              paddingLeft: 'var(--spacing-6)',
            }}
          >
            {COMPLAINT_CATEGORIES.map((cat) => (
              <li key={cat}>{cat}</li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
