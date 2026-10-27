import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import {
  fetchLocalStaffQueue,
  fetchLocalServiceRequestDetails,
  transitionLocalServiceRequest
} from '@/api/client';
import type {
  StudentServiceRequestItem,
  StudentServiceAuditLog,
  StudentServiceState
} from '@/api/types';
import styles from './AuthorityServicesPage.module.css';

export default function AuthorityServicesPage() {
  const { user } = useAuth();
  const { t } = useLocale();

  const [queue, setQueue] = useState<StudentServiceRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [filterState, setFilterState] = useState<string>('');
  const [filterDept, setFilterDept] = useState<string>('');

  // Selected request details modal / drawer
  const [selectedReq, setSelectedReq] = useState<StudentServiceRequestItem | null>(null);
  const [auditLogs, setAuditLogs] = useState<StudentServiceAuditLog[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Transition form
  const [nextState, setNextState] = useState<StudentServiceState>('acknowledged');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    loadQueue();
  }, [filterState, filterDept]);

  async function loadQueue() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLocalStaffQueue({
        state: filterState || undefined,
        departmentCode: filterDept || undefined
      });
      setQueue(data);
    } catch (err: any) {
      setError(err.message || 'Unable to load service queue.');
    } finally {
      setLoading(false);
    }
  }

  async function openRequestDetails(req: StudentServiceRequestItem) {
    setSelectedReq(req);
    setLoadingDetails(true);
    setResolutionNotes('');
    // Default next legal state
    if (req.state === 'requested') setNextState('acknowledged');
    else if (req.state === 'acknowledged') setNextState('in_progress');
    else if (req.state === 'in_progress') setNextState('completed');
    else setNextState('cancelled');

    try {
      const res = await fetchLocalServiceRequestDetails(req.id);
      setSelectedReq(res.request);
      setAuditLogs(res.auditLogs);
    } catch (err: any) {
      setError(err.message || 'Failed to load request audit history.');
    } finally {
      setLoadingDetails(false);
    }
  }

  async function handleTransition(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedReq) return;
    if (nextState === 'completed' && resolutionNotes.trim().length < 5) {
      setError('Resolution notes (at least 5 characters) are required to complete a request.');
      return;
    }

    setTransitioning(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await transitionLocalServiceRequest(selectedReq.id, {
        expectedVersion: selectedReq.version,
        nextState,
        resolutionNotes: resolutionNotes.trim() || undefined,
        assignedStaffId: user?.id
      });
      setSuccess(`Request ${updated.reference_number} updated to ${updated.state}.`);
      await openRequestDetails(updated);
      await loadQueue();
    } catch (err: any) {
      setError(err.message || 'State transition failed.');
    } finally {
      setTransitioning(false);
    }
  }

  return (
    <div className={styles.container} lang="en">
      <header className={styles.header}>
        <div>
          <h1>Student Services Stewardship Queue</h1>
          <p className={styles.subtitle}>
            {t.authority.portalBadge} — Review, acknowledge, assign, and resolve routine student inquiries and administrative services.
          </p>
        </div>
      </header>

      {error && <div className={styles.alertError} role="alert">{error}</div>}
      {success && <div className={styles.alertSuccess} role="status">{success}</div>}

      {/* Filter Toolbar */}
      <section className={styles.filterBar} aria-label="Queue filters">
        <div className={styles.filterGroup}>
          <label htmlFor="filter-state">Status:</label>
          <select
            id="filter-state"
            value={filterState}
            onChange={e => setFilterState(e.target.value)}
            className={styles.select}
          >
            <option value="">All Active Statuses</option>
            <option value="requested">Requested</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="filter-dept">Department:</label>
          <input
            id="filter-dept"
            type="text"
            placeholder="e.g. CSE"
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            className={styles.input}
          />
        </div>

        <button type="button" onClick={loadQueue} className={styles.refreshBtn}>
          Refresh Queue
        </button>
      </section>

      {/* Main Layout: Queue Table & Inspector */}
      <div className={styles.mainLayout}>
        <section className={styles.tableCard} aria-labelledby="queue-heading">
          <h2 id="queue-heading" className="sr-only">Service Requests List</h2>
          {loading && <p role="status">Loading requests...</p>}

          {!loading && queue.length === 0 && (
            <div className={styles.emptyQueue}>
              <p>No student service requests pending in this queue.</p>
            </div>
          )}

          {!loading && queue.length > 0 && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Student</th>
                  <th scope="col">Service / Subject</th>
                  <th scope="col">Dept</th>
                  <th scope="col">Status</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {queue.map(req => (
                  <tr
                    key={req.id}
                    className={selectedReq?.id === req.id ? styles.selectedRow : ''}
                  >
                    <td className={styles.refCell}>{req.reference_number}</td>
                    <td>
                      <div><strong>{req.student_name || 'Student'}</strong></div>
                      <small className={styles.emailText}>{req.student_email}</small>
                    </td>
                    <td>
                      <div><strong>{req.subject}</strong></div>
                      <small className={styles.serviceTag}>[{req.service_category || 'SERVICE'}] {req.service_title}</small>
                    </td>
                    <td><span className={styles.deptBadge}>{req.department_code}</span></td>
                    <td>
                      <span className={`${styles.stateBadge} ${styles[req.state]}`}>
                        {req.state.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td>{new Date(req.created_at).toLocaleDateString()}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => openRequestDetails(req)}
                        className={styles.reviewBtn}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Request Inspector & Workflow Actions */}
        {selectedReq && (
          <aside className={styles.inspectorCard} aria-labelledby="inspector-heading">
            <div className={styles.inspectorHeader}>
              <h2 id="inspector-heading">Request Details</h2>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setSelectedReq(null)}
                aria-label="Close inspector"
              >
                &times;
              </button>
            </div>

            {loadingDetails ? (
              <p>Loading history...</p>
            ) : (
              <div className={styles.inspectorContent}>
                <div className={styles.detailBlock}>
                  <div className={styles.metaRow}>
                    <span>Reference: <strong>{selectedReq.reference_number}</strong></span>
                    <span className={`${styles.stateBadge} ${styles[selectedReq.state]}`}>
                      {selectedReq.state.toUpperCase()}
                    </span>
                  </div>
                  <h3>{selectedReq.subject}</h3>
                  <p className={styles.detailText}>{selectedReq.details}</p>
                </div>

                {selectedReq.resolution_notes && (
                  <div className={styles.resolutionCard}>
                    <strong>Resolution Note:</strong>
                    <p>{selectedReq.resolution_notes}</p>
                  </div>
                )}

                {/* Workflow State Transition Form */}
                {!['completed', 'cancelled'].includes(selectedReq.state) && (
                  <form onSubmit={handleTransition} className={styles.actionForm}>
                    <h3>Update Status</h3>
                    <div className={styles.formGroup}>
                      <label htmlFor="next-state">Next Transition *</label>
                      <select
                        id="next-state"
                        value={nextState}
                        onChange={e => setNextState(e.target.value as StudentServiceState)}
                        className={styles.select}
                        required
                      >
                        {selectedReq.state === 'requested' && (
                          <>
                            <option value="acknowledged">Acknowledge Request</option>
                            <option value="cancelled">Cancel Request</option>
                          </>
                        )}
                        {selectedReq.state === 'acknowledged' && (
                          <>
                            <option value="in_progress">Mark In Progress</option>
                            <option value="cancelled">Cancel Request</option>
                          </>
                        )}
                        {selectedReq.state === 'in_progress' && (
                          <>
                            <option value="completed">Complete Request</option>
                            <option value="cancelled">Cancel Request</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label htmlFor="resolution-notes">
                        {nextState === 'completed' ? 'Resolution Notes (Required) *' : 'Internal Staff Notes'}
                      </label>
                      <textarea
                        id="resolution-notes"
                        rows={3}
                        value={resolutionNotes}
                        onChange={e => setResolutionNotes(e.target.value)}
                        placeholder="Detail actions taken or outcome communicated..."
                        required={nextState === 'completed'}
                        className={styles.textarea}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={transitioning}
                      className={styles.actionBtn}
                    >
                      {transitioning ? 'Saving...' : 'Apply Transition'}
                    </button>
                  </form>
                )}

                {/* Durable Audit Trail */}
                <div className={styles.auditSection}>
                  <h3>Audit History ({auditLogs.length})</h3>
                  <ul className={styles.auditList}>
                    {auditLogs.map(log => (
                      <li key={log.id} className={styles.auditItem}>
                        <div className={styles.auditTop}>
                          <strong>{log.action}</strong>
                          <span className={styles.auditTime}>
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className={styles.auditActor}>
                          By: {log.actor_name || 'System'} ({log.actor_role || 'staff'})
                        </div>
                        {log.details && (
                          <div className={styles.auditDetails}>
                            {typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
