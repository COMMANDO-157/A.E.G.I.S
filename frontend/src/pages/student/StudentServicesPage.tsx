import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import {
  fetchLocalServicesCatalog,
  fetchLocalStudentRequests,
  createLocalStudentRequest,
  transitionLocalServiceRequest
} from '@/api/client';
import type {
  StudentServiceCatalogItem,
  StudentServiceRequestItem
} from '@/api/types';
import {
  createStudentServicesRehearsal,
  type ServiceKind,
  type DemoRequest,
  type DemoSupport
} from '@/utils/student-services';
import styles from './StudentServicesPage.module.css';

const demoCatalogue: { kind: ServiceKind; title: string; description: string }[] = [
  { kind: 'academic', title: 'Academic guidance', description: 'Explore a request for help finding the appropriate academic support office.' },
  { kind: 'accessibility', title: 'Accessibility support', description: 'Explore a request to discuss access needs with an approved service.' },
  { kind: 'financial', title: 'Financial support information', description: 'Explore a request for information about available student assistance.' },
];

export default function StudentServicesPage() {
  const { user } = useAuth();
  const { t } = useLocale();

  // Mode: In-Memory Synthetic Demonstration vs Connected Local Services MVP
  const [activeTab, setActiveTab] = useState<'connected' | 'demo'>('connected');

  // ─── Connected Local API State ───
  const [catalog, setCatalog] = useState<StudentServiceCatalogItem[]>([]);
  const [realRequests, setRealRequests] = useState<StudentServiceRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiSuccess, setApiSuccess] = useState<string | null>(null);

  // New Request Form
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ─── Demonstration Rehearsal State ───
  const holder = useRef<ReturnType<typeof createStudentServicesRehearsal> | null>(null);
  if (holder.current === null) holder.current = createStudentServicesRehearsal();
  const demo = holder as { current: ReturnType<typeof createStudentServicesRehearsal> };
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>([]);
  const [support, setSupport] = useState<DemoSupport | null>(null);
  const [consent, setConsent] = useState(false);
  const [demoMessage, setDemoMessage] = useState('No demonstration requests yet.');

  useEffect(() => {
    if (activeTab === 'connected') {
      loadConnectedData();
    }
  }, [activeTab]);

  async function loadConnectedData() {
    setLoading(true);
    setApiError(null);
    try {
      const [cat, reqs] = await Promise.all([
        fetchLocalServicesCatalog(user?.institution_id ?? undefined).catch(() => []),
        fetchLocalStudentRequests().catch(() => [])
      ]);
      setCatalog(cat);
      setRealRequests(reqs);
    } catch (err: any) {
      setApiError(err.message || 'Unable to load local services.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedServiceId || !subject.trim() || !details.trim()) {
      setApiError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    setApiError(null);
    setApiSuccess(null);
    try {
      const institutionId = user?.institution_id || '00000000-0000-0000-0000-000000000001';
      const departmentCode = user?.department || user?.department_code || 'GEN';
      const req = await createLocalStudentRequest({
        institutionId,
        departmentCode,
        serviceId: selectedServiceId,
        subject: subject.trim(),
        details: details.trim()
      });
      setApiSuccess(`Service request created successfully (${req.reference_number}).`);
      setSubject('');
      setDetails('');
      setSelectedServiceId('');
      await loadConnectedData();
    } catch (err: any) {
      setApiError(err.message || 'Failed to submit service request.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelRequest(req: StudentServiceRequestItem) {
    if (!confirm(`Are you sure you want to cancel request ${req.reference_number}?`)) return;
    setLoading(true);
    setApiError(null);
    try {
      await transitionLocalServiceRequest(req.id, {
        expectedVersion: req.version,
        nextState: 'cancelled'
      });
      setApiSuccess(`Request ${req.reference_number} cancelled.`);
      await loadConnectedData();
    } catch (err: any) {
      setApiError(err.message || 'Failed to cancel request.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Demonstration Helpers ───
  function actDemo(action: () => void, announcement: string) {
    try {
      action();
      setDemoRequests(demo.current.list('student'));
      setSupport(demo.current.readSupport('student'));
      setDemoMessage(announcement);
    } catch {
      setDemoMessage('That demonstration action is unavailable. Reset the demonstration to start again.');
    }
  }

  function resetDemo() {
    demo.current = createStudentServicesRehearsal();
    setDemoRequests([]);
    setSupport(null);
    setConsent(false);
    setDemoMessage('Demonstration cleared. No request was sent.');
  }

  return (
    <div className={styles.container} lang="en">
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1>Student Services &amp; Routine Support</h1>
          <div className={styles.modeToggle} role="tablist" aria-label="Mode selection">
            <button
              role="tab"
              aria-selected={activeTab === 'connected'}
              className={`${styles.tabBtn} ${activeTab === 'connected' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('connected')}
            >
              Local Operational MVP
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'demo'}
              className={`${styles.tabBtn} ${activeTab === 'demo' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('demo')}
            >
              In-Memory Rehearsal
            </button>
          </div>
        </div>
        <p className={styles.subtitle}>
          Routine student assistance, academic inquiries, and campus facilities. Separated from confidential grievances and protected well-being.
        </p>
      </header>

      {activeTab === 'connected' ? (
        <div className={styles.contentGrid}>
          {/* Left Column: Create Request */}
          <section className={styles.card} aria-labelledby="create-request-heading">
            <h2 id="create-request-heading">Submit Routine Service Request</h2>
            <p className={styles.cardHelp}>
              Select a service from your institution&apos;s verified catalogue.
            </p>

            {apiError && <div className={styles.alertError} role="alert">{apiError}</div>}
            {apiSuccess && <div className={styles.alertSuccess} role="status">{apiSuccess}</div>}

            <form onSubmit={handleCreateRequest} className={styles.form}>
              <div className={styles.formGroup}>
                <label htmlFor="service-select">Service Category &amp; Type *</label>
                <select
                  id="service-select"
                  value={selectedServiceId}
                  onChange={e => setSelectedServiceId(e.target.value)}
                  required
                  disabled={submitting}
                  className={styles.input}
                >
                  <option value="">-- Select an available service --</option>
                  {catalog.map(c => (
                    <option key={c.id} value={c.id}>
                      [{c.category.toUpperCase()}] {c.title} (SLA: {c.sla_hours}h)
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="request-subject">Subject *</label>
                <input
                  id="request-subject"
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Brief summary of your request"
                  required
                  minLength={3}
                  maxLength={200}
                  disabled={submitting}
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="request-details">Details *</label>
                <textarea
                  id="request-details"
                  rows={4}
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  placeholder="Provide specific information regarding your inquiry..."
                  required
                  minLength={10}
                  maxLength={5000}
                  disabled={submitting}
                  className={styles.textarea}
                />
                <span className={styles.fieldHint}>Minimum 10 characters. Avoid entering sensitive personal or medical info.</span>
              </div>

              <button
                type="submit"
                disabled={submitting || !selectedServiceId}
                className={styles.primaryBtn}
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </form>
          </section>

          {/* Right Column: Track Requests */}
          <section className={styles.card} aria-labelledby="track-requests-heading">
            <h2 id="track-requests-heading">Your Service Requests</h2>
            <p className={styles.cardHelp}>
              View current status, assigned staff, and resolution updates.
            </p>

            {loading && <p role="status">Loading requests...</p>}

            {!loading && realRequests.length === 0 && (
              <div className={styles.emptyState}>
                <p>No active service requests found for your account.</p>
              </div>
            )}

            {!loading && realRequests.length > 0 && (
              <ul className={styles.requestList}>
                {realRequests.map(r => (
                  <li key={r.id} className={styles.requestItem}>
                    <div className={styles.requestHeader}>
                      <div>
                        <span className={styles.refNumber}>{r.reference_number}</span>
                        <span className={styles.serviceCategory}>[{r.service_category || 'SERVICE'}]</span>
                      </div>
                      <span className={`${styles.stateBadge} ${styles[r.state]}`}>
                        {r.state.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>

                    <h3 className={styles.requestTitle}>{r.subject}</h3>
                    <p className={styles.requestDesc}>{r.details}</p>

                    {r.resolution_notes && (
                      <div className={styles.resolutionBox}>
                        <strong>Resolution Note:</strong> {r.resolution_notes}
                      </div>
                    )}

                    <div className={styles.requestMeta}>
                      <span>Submitted: {new Date(r.created_at).toLocaleDateString()}</span>
                      {['requested', 'acknowledged'].includes(r.state) && (
                        <button
                          type="button"
                          className={styles.cancelBtn}
                          onClick={() => handleCancelRequest(r)}
                        >
                          Cancel Request
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        /* In-Memory Synthetic Demonstration */
        <div className={styles.demoWrapper}>
          <div className={styles.alertWarning} role="alert">
            <strong>Demonstration Mode:</strong> Uses synthetic in-memory fixtures only. No data is sent over the network or saved to database.
          </div>
          <p role="status" aria-live="polite" className={styles.statusAnnouncement}>{demoMessage}</p>

          <section aria-labelledby="demo-services-title" className={styles.card}>
            <h2 id="demo-services-title">Explore Student Services Demonstration</h2>
            <div className={styles.demoCatalogueList}>
              {demoCatalogue.map(item => (
                <div key={item.kind} className={styles.demoCatCard}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <button
                    className={styles.secondaryBtn}
                    disabled={demoRequests.some(r => r.kind === item.kind && ['requested', 'acknowledged'].includes(r.state))}
                    onClick={() => actDemo(() => { demo.current.request('student', item.kind); }, 'Sample request created.')}
                  >
                    Try {item.title.toLowerCase()}
                  </button>
                </div>
              ))}
            </div>

            <h3 className={styles.subHeading}>Sample Request Tracking</h3>
            {demoRequests.length === 0 ? (
              <p>No sample service requests.</p>
            ) : (
              <ul className={styles.demoReqList}>
                {demoRequests.map(r => (
                  <li key={r.id} className={styles.demoReqItem}>
                    <p>{demoCatalogue.find(c => c.kind === r.kind)?.title}: <strong>{r.state}</strong> ({r.id})</p>
                    <div className={styles.btnRow}>
                      {r.state === 'requested' && (
                        <button className={styles.smallBtn} onClick={() => actDemo(() => { demo.current.transition('service-officer', r.id, r.version, 'acknowledged'); }, 'Simulated office acknowledgment.')}>
                          Simulate Acknowledgment
                        </button>
                      )}
                      {r.state === 'acknowledged' && (
                        <button className={styles.smallBtn} onClick={() => actDemo(() => { demo.current.transition('service-officer', r.id, r.version, 'completed'); }, 'Simulated request completion.')}>
                          Simulate Completion
                        </button>
                      )}
                      {['requested', 'acknowledged'].includes(r.state) && (
                        <button className={styles.cancelBtn} onClick={() => actDemo(() => { demo.current.transition('student', r.id, r.version, 'cancelled'); }, 'Sample request cancelled.')}>
                          Cancel Sample
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Protected Well-Being Demonstration (Strictly Isolated) */}
          <section aria-labelledby="demo-wellbeing-title" className={styles.card}>
            <h2 id="demo-wellbeing-title">Protected Well-Being Support Demonstration</h2>
            <p className={styles.wellbeingNotice}>
              This separate sample workflow does not create a grievance. No counseling, monitoring, emergency response or appointment is provided here.
            </p>
            <p>If you need urgent help, contact local emergency services or a trusted person directly.</p>
            <label className={styles.consentCheckbox}>
              <input
                type="checkbox"
                checked={consent}
                disabled={Boolean(support?.consent)}
                onChange={e => setConsent(e.target.checked)}
              />
              {' '}I understand this is a sample consent demonstration and no person will be contacted.
            </label>
            <div className={styles.btnRow}>
              <button
                className={styles.secondaryBtn}
                disabled={!consent || Boolean(support?.consent)}
                onClick={() => actDemo(() => { demo.current.requestSupport('student', consent); }, 'Sample support request created.')}
              >
                Try Sample Support Request
              </button>
              {support?.state === 'requested' && (
                <button className={styles.smallBtn} onClick={() => actDemo(() => { demo.current.acknowledgeSupport('support-worker', support.version); }, 'Simulated support-worker acknowledgment.')}>
                  Simulate Support Acknowledgment
                </button>
              )}
              {support?.consent && (
                <button className={styles.cancelBtn} onClick={() => actDemo(() => { demo.current.withdrawSupport('student'); setConsent(false); }, 'Sample consent withdrawn.')}>
                  Withdraw Sample Consent
                </button>
              )}
            </div>
            {support && <p>Sample support status: <strong>{support.state}</strong></p>}
          </section>

          <div className={styles.demoFooter}>
            <button className={styles.secondaryBtn} onClick={resetDemo}>Reset Demonstration</button>
          </div>
        </div>
      )}

      <footer className={styles.footerLink}>
        <Link to="/student" className={styles.backLink}>&larr; Return to {t.roles.student} Dashboard</Link>
      </footer>
    </div>
  );
}
