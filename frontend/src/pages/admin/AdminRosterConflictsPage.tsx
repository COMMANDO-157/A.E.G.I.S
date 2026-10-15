import { useState, useEffect, useCallback } from 'react';
import {
  listRosterConflicts,
  resolveRosterConflict,
  importRosterBatch,
  listAdminDepartments,
  listAdminAuthorities,
  createAdminDepartment,
  assignAdminAuthority,
  previewRosterBatch,
  listOwnerInstitutions,
  createOwnerInstitution,
  updateOwnerInstitution,
  listOwnerVerificationClaims,
  reviewOwnerVerificationClaim,
  revokeOwnerVerificationClaim,
} from '@/api/client';
import type {
  RosterConflictItem,
  AdminDepartmentItem,
  AdminAuthorityAssignmentItem,
  RosterRecordInput,
  InstitutionItem,
  VerificationClaimItem,
  RosterPreviewResponse,
} from '@/api/types';
import { StepUpModal } from '@/components/admin/StepUpModal';
import { useAuth } from '@/context/AuthContext';

export default function AdminRosterConflictsPage() {
  const { user } = useAuth();
  const isPrimaryOwner = Boolean(user?.is_primary_owner);

  const [activeTab, setActiveTab] = useState<'claims' | 'conflicts' | 'import' | 'departments' | 'authorities' | 'institutions'>('conflicts');

  // Conflict state
  const [conflicts, setConflicts] = useState<RosterConflictItem[]>([]);
  const [loadingConflicts, setLoadingConflicts] = useState(true);
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Import state
  const [csvContent, setCsvContent] = useState('');
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<RosterPreviewResponse | null>(null);
  const [importResult, setImportResult] = useState<any | null>(null);

  // Verification Claims state (Owner)
  const [claims, setClaims] = useState<VerificationClaimItem[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [claimStatusFilter, setClaimStatusFilter] = useState<string>('PENDING');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewEvidence, setReviewEvidence] = useState('');
  const [revokeReason, setRevokeReason] = useState('');

  // Institutions state (Owner)
  const [institutions, setInstitutions] = useState<InstitutionItem[]>([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);
  const [instSlug, setInstSlug] = useState('');
  const [instName, setInstName] = useState('');
  const [instDomains, setInstDomains] = useState('');

  // Departments & Authorities state
  const [departments, setDepartments] = useState<AdminDepartmentItem[]>([]);
  const [authorities, setAuthorities] = useState<AdminAuthorityAssignmentItem[]>([]);
  const [deptCode, setDeptCode] = useState('');
  const [deptName, setDeptName] = useState('');
  const [authUserId, setAuthUserId] = useState('');
  const [authDeptCode, setAuthDeptCode] = useState('');
  const [authRole, setAuthRole] = useState<'HOD' | 'Dean' | 'Higher Authority'>('HOD');

  // Step-Up state
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpTitle, setStepUpTitle] = useState('Privileged Step-Up Required');
  const [stepUpDesc, setStepUpDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);


  const fetchConflicts = useCallback(async () => {
    setLoadingConflicts(true);
    try {
      const data = await listRosterConflicts();
      setConflicts(data);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve roster conflicts.');
    } finally {
      setLoadingConflicts(false);
    }
  }, []);

  const fetchDeptsAndAuths = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([
        listAdminDepartments(),
        listAdminAuthorities(),
      ]);
      setDepartments(d);
      setAuthorities(a);
    } catch {
      // Ignore if user lacks specific permission
    }
  }, []);

  const fetchClaims = useCallback(async () => {
    if (!isPrimaryOwner) return;
    setLoadingClaims(true);
    try {
      const data = await listOwnerVerificationClaims({ status: claimStatusFilter });
      setClaims(data);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve verification claims.');
    } finally {
      setLoadingClaims(false);
    }
  }, [isPrimaryOwner, claimStatusFilter]);

  const fetchInstitutions = useCallback(async () => {
    if (!isPrimaryOwner) return;
    setLoadingInstitutions(true);
    try {
      const data = await listOwnerInstitutions();
      setInstitutions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve institutions.');
    } finally {
      setLoadingInstitutions(false);
    }
  }, [isPrimaryOwner]);

  useEffect(() => {
    fetchConflicts();
    fetchDeptsAndAuths();
    if (isPrimaryOwner) {
      fetchClaims();
      fetchInstitutions();
    }
  }, [fetchConflicts, fetchDeptsAndAuths, fetchClaims, fetchInstitutions, isPrimaryOwner]);

  // Handle Claims Review (Owner Approval/Rejection)
  async function handleReviewClaim(claim: VerificationClaimItem, decision: 'APPROVED' | 'REJECTED') {
    triggerStepUp(
      `${decision === 'APPROVED' ? 'Approve' : 'Reject'} Student Verification Claim`,
      `Owner governance review for register number ${claim.register_number} (${claim.user_email}). Dual-factor step-up authentication required.`,
      async (stepUpToken) => {
        await reviewOwnerVerificationClaim(claim.id, {
          decision,
          notes: reviewNotes.trim() || `Owner ${decision.toLowerCase()} via institutional claims console.`,
          identityEvidenceReference: reviewEvidence.trim() || undefined,
          stepUpToken,
        });
        setSuccessMsg(`Claim for ${claim.register_number} has been ${decision}.`);
        setReviewNotes('');
        setReviewEvidence('');
        await fetchClaims();
      }
    );
  }

  // Handle Claims Revocation (Owner Revoke binding)
  async function handleRevokeClaim(claim: VerificationClaimItem) {
    if (!revokeReason.trim()) {
      setError('Please provide a specific justification reason for claim revocation.');
      return;
    }
    triggerStepUp(
      'Revoke Institutional Student Verification',
      `Revoking verification for register number ${claim.register_number} (${claim.user_email}). This will reset student privileges and immediately invalidate active student sessions.`,
      async (stepUpToken) => {
        await revokeOwnerVerificationClaim(claim.id, {
          reason: revokeReason.trim(),
          stepUpToken,
        });
        setSuccessMsg(`Verification for ${claim.register_number} successfully revoked.`);
        setRevokeReason('');
        await fetchClaims();
      }
    );
  }

  // Handle CSV Preview
  async function handlePreviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    const records = parseCsvRecords(csvContent);
    if (records.length === 0) {
      setError('Please provide at least one valid CSV row to preview.');
      return;
    }
    setPreviewing(true);
    setError(null);
    try {
      const res = await previewRosterBatch({ records, version: 'v2' });
      setPreviewResult(res);
      setSuccessMsg(`Preview analysis complete: ${res.validCount} valid records, ${res.conflictCount} conflict candidates.`);
    } catch (err: any) {
      setError(err.message || 'Preview generation failed.');
    } finally {
      setPreviewing(false);
    }
  }

  // Handle Add Institution
  async function handleCreateInstitution(e: React.FormEvent) {
    e.preventDefault();
    if (!instSlug.trim() || !instName.trim() || !instDomains.trim()) return;

    const domains = instDomains.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
    triggerStepUp(
      'Configure Institutional Domain Scope',
      `Registering institution ${instName.trim()} with domains: ${domains.join(', ')}.`,
      async (stepUpToken) => {
        await createOwnerInstitution({
          slug: instSlug.trim().toLowerCase(),
          name: instName.trim(),
          domains,
          stepUpToken,
        });
        setSuccessMsg(`Institution ${instName.trim()} registered.`);
        setInstSlug('');
        setInstName('');
        setInstDomains('');
        await fetchInstitutions();
      }
    );
  }

  // Handle Toggle Institution Active
  async function handleToggleInstitution(inst: InstitutionItem) {
    triggerStepUp(
      `${inst.active ? 'Deactivate' : 'Activate'} Institution`,
      `Updating institutional status for ${inst.name}.`,
      async (stepUpToken) => {
        await updateOwnerInstitution(inst.id, {
          active: !inst.active,
          stepUpToken,
        });
        setSuccessMsg(`Institution ${inst.name} is now ${!inst.active ? 'active' : 'inactive'}.`);
        await fetchInstitutions();
      }
    );
  }


  function triggerStepUp(
    title: string,
    desc: string,
    actionWithToken: (token: string) => Promise<void>,
  ) {
    setStepUpTitle(title);
    setStepUpDesc(desc);
    (window as any).__pendingRosterStepUpAction = actionWithToken;
    setStepUpOpen(true);
  }

  async function handleStepUpSuccess(stepUpToken: string) {
    const action = (window as any).__pendingRosterStepUpAction;
    if (action) {
      delete (window as any).__pendingRosterStepUpAction;
      try {
        setError(null);
        await action(stepUpToken);
      } catch (err: any) {
        setError(err.message || 'Step-up authorized action failed.');
      }
    }
  }

  // Handle Conflict Resolution
  async function handleResolveConflict(conflict: RosterConflictItem, action: 'ACCEPTED_UPDATE' | 'DISCARDED') {
    triggerStepUp(
      'Resolve Roster Import Conflict',
      `Authorizing ${action === 'ACCEPTED_UPDATE' ? 'overwriting active roster with quarantined update' : 'discarding quarantined conflict record'} for register number ${conflict.register_number}.`,
      async (stepUpToken) => {
        await resolveRosterConflict(conflict.id, {
          action,
          notes: resolutionNotes.trim() || undefined,
          stepUpToken,
        });
        setSuccessMsg(`Conflict for ${conflict.register_number} marked as ${action}.`);
        setResolutionNotes('');
        await fetchConflicts();
      }
    );
  }

  // Handle CSV Import
  function parseCsvRecords(text: string): RosterRecordInput[] {
    const lines = text.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const regIdx = headers.indexOf('registernumber') !== -1 ? headers.indexOf('registernumber') : headers.indexOf('reg_no');
    const emailIdx = headers.indexOf('institutionalemail') !== -1 ? headers.indexOf('institutionalemail') : headers.indexOf('email');
    const nameIdx = headers.indexOf('fullname') !== -1 ? headers.indexOf('fullname') : headers.indexOf('name');
    const deptIdx = headers.indexOf('departmentcode') !== -1 ? headers.indexOf('departmentcode') : headers.indexOf('dept');
    const batchIdx = headers.indexOf('batchyear') !== -1 ? headers.indexOf('batchyear') : headers.indexOf('batch');

    const records: RosterRecordInput[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim());
      if (parts.length >= 4) {
        records.push({
          registerNumber: parts[regIdx >= 0 ? regIdx : 0] || '',
          institutionalEmail: parts[emailIdx >= 0 ? emailIdx : 1] || '',
          fullName: parts[nameIdx >= 0 ? nameIdx : 2] || '',
          departmentCode: parts[deptIdx >= 0 ? deptIdx : 3] || '',
          batchYear: batchIdx >= 0 ? parts[batchIdx] : '2022-2026',
        });
      }
    }
    return records;
  }

  async function handleImportSubmit(e: React.FormEvent) {
    e.preventDefault();
    const records = parseCsvRecords(csvContent);
    if (records.length === 0) {
      setError('Please provide at least one valid CSV row (Header: registerNumber,institutionalEmail,fullName,departmentCode,batchYear).');
      return;
    }

    triggerStepUp(
      'Authorize Institutional Roster Import',
      `Importing ${records.length} institutional student records into authoritative roster.`,
      async (stepUpToken) => {
        setImporting(true);
        try {
          const res = await importRosterBatch({ records, stepUpToken });
          setImportResult(res);
          setSuccessMsg(`Import completed! Processed: ${res.totalProcessed}, Imported: ${res.importedCount}, Quarantined: ${res.conflictsQuarantined}`);
          setCsvContent('');
          await fetchConflicts();
        } finally {
          setImporting(false);
        }
      }
    );
  }

  // Handle Add Department
  async function handleCreateDept(e: React.FormEvent) {
    e.preventDefault();
    if (!deptCode || !deptName) return;

    triggerStepUp(
      'Create Academic Department',
      `Registering institutional department ${deptCode.toUpperCase()} (${deptName.trim()}).`,
      async (stepUpToken) => {
        await createAdminDepartment({
          code: deptCode.trim().toUpperCase(),
          name: deptName.trim(),
          stepUpToken,
        });
        setSuccessMsg(`Department ${deptCode.toUpperCase()} created successfully.`);
        setDeptCode('');
        setDeptName('');
        await fetchDeptsAndAuths();
      }
    );
  }

  // Handle Assign Authority
  async function handleAssignAuthority(e: React.FormEvent) {
    e.preventDefault();
    if (!authUserId || !authDeptCode) return;

    triggerStepUp(
      'Assign Department Authority',
      `Assigning user ${authUserId} as ${authRole} for department ${authDeptCode}.`,
      async (stepUpToken) => {
        await assignAdminAuthority({
          userId: authUserId.trim(),
          departmentCode: authDeptCode.trim().toUpperCase(),
          role: authRole,
          stepUpToken,
        });
        setSuccessMsg(`Authority scope granted.`);
        setAuthUserId('');
        await fetchDeptsAndAuths();
      }
    );
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <header>
        <span className="badge badge-navy">Institutional Governance</span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          Roster Import, Conflict Review & Department Administration
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Authoritative institutional roster management, conflict quarantine review, and departmental authority scopes.
        </p>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--spacing-2)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--spacing-2)', flexWrap: 'wrap' }}>
        {isPrimaryOwner && (
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'claims' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('claims')}
          >
            Verification Claims ({claims.length})
          </button>
        )}
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'conflicts' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('conflicts')}
        >
          Quarantined Conflicts ({conflicts.length})
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'import' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('import')}
        >
          CSV Roster Import
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'departments' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('departments')}
        >
          Departments ({departments.length})
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'authorities' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('authorities')}
        >
          Authority Scopes ({authorities.length})
        </button>
        {isPrimaryOwner && (
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'institutions' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('institutions')}
          >
            Institutions ({institutions.length})
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-error" role="status">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {successMsg && (
        <div className="alert alert-success" role="status">
          <span>{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* TAB 1: CONFLICT REVIEW */}
      {activeTab === 'conflicts' && (
        <section className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <div style={{ padding: 'var(--spacing-4)', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
            <h2 style={{ fontSize: 'var(--font-size-md)', margin: 0 }}>
              Quarantined Roster Import Conflicts
            </h2>
            <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-1)' }}>
              Discrepant CSV records are held in quarantine to prevent accidental corruption of verified student records. Sensitive resolutions require dual-factor Step-Up authorization.
            </p>
          </div>

          {loadingConflicts ? (
            <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              Loading conflict registry…
            </div>
          ) : conflicts.length === 0 ? (
            <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              No unresolved roster conflicts in quarantine.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Register Number</th>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Quarantined Email</th>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Department</th>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Conflict Type</th>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Details</th>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)', fontWeight: 600, fontFamily: 'monospace' }}>
                      {c.register_number}
                    </td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                      {c.institutional_email}
                    </td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                      <span className="badge badge-neutral">{c.department_code}</span>
                    </td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                      <span className="badge badge-warning">{c.conflict_type}</span>
                    </td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)', fontSize: 'var(--font-size-xs)', maxWidth: 260 }}>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {JSON.stringify(c.raw_payload, null, 2)}
                      </pre>
                    </td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 'var(--spacing-2)', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleResolveConflict(c, 'ACCEPTED_UPDATE')}
                        >
                          Accept Update
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleResolveConflict(c, 'DISCARDED')}
                        >
                          Discard
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* TAB 2: CSV ROSTER IMPORT */}
      {activeTab === 'import' && (
        <section className="card">
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-2)' }}>
            Batch Student Roster Import
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-4)' }}>
            Paste comma-separated student records. Must contain headers: <code>registerNumber, institutionalEmail, fullName, departmentCode, batchYear</code>.
          </p>

          <form onSubmit={handleImportSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
              <div>
                <textarea
                  rows={8}
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  placeholder={`registerNumber,institutionalEmail,fullName,departmentCode,batchYear\n22CS101,arun.k@college.edu.in,Arun Kumar,CSE,2022-2026\n22CS102,priya.s@college.edu.in,Priya Sharma,CSE,2022-2026`}
                  required
                  style={{
                    width: '100%',
                    padding: 'var(--spacing-2)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    fontFamily: 'monospace',
                    fontSize: 'var(--font-size-sm)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 'var(--spacing-3)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={previewing || importing}
                  onClick={handlePreviewSubmit}
                >
                  {previewing ? 'Analyzing CSV…' : 'Preview CSV Batch'}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={importing || previewing}
                >
                  {importing ? 'Processing Batch…' : 'Authenticate & Import Roster'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setCsvContent(''); setPreviewResult(null); setImportResult(null); }}
                >
                  Clear
                </button>
              </div>
            </div>
          </form>

          {previewResult && (
            <div style={{ marginTop: 'var(--spacing-6)', padding: 'var(--spacing-4)', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <h3 style={{ margin: 0, marginBottom: 'var(--spacing-2)', fontSize: 'var(--font-size-md)' }}>Pre-Import Validation Analysis</h3>
              <div style={{ display: 'flex', gap: 'var(--spacing-4)', marginBottom: 'var(--spacing-3)', fontSize: 'var(--font-size-sm)' }}>
                <span>Total records: <strong>{previewResult.total}</strong></span>
                <span>Valid: <strong style={{ color: 'var(--color-success)' }}>{previewResult.validCount}</strong></span>
                <span>Potential conflicts: <strong style={{ color: 'var(--color-warning)' }}>{previewResult.conflictCount}</strong></span>
                <span>Errors: <strong style={{ color: 'var(--color-danger)' }}>{previewResult.errorCount}</strong></span>
              </div>
              {previewResult.errors.length > 0 && (
                <div style={{ marginBottom: 'var(--spacing-3)' }}>
                  <h4 style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>Validation Errors:</h4>
                  <ul style={{ margin: 0, paddingLeft: 'var(--spacing-4)', fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
                    {previewResult.errors.map((e, idx) => (
                      <li key={idx}>Row {e.row}: {e.error}</li>
                    ))}
                  </ul>
                </div>
              )}
              {previewResult.validSample.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)', marginTop: 'var(--spacing-2)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                      <th style={{ padding: 'var(--spacing-1) var(--spacing-2)' }}>Register No</th>
                      <th style={{ padding: 'var(--spacing-1) var(--spacing-2)' }}>Institutional Email</th>
                      <th style={{ padding: 'var(--spacing-1) var(--spacing-2)' }}>Name</th>
                      <th style={{ padding: 'var(--spacing-1) var(--spacing-2)' }}>Dept</th>
                      <th style={{ padding: 'var(--spacing-1) var(--spacing-2)' }}>Batch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewResult.validSample.slice(0, 5).map((s, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: 'var(--spacing-1) var(--spacing-2)', fontFamily: 'monospace' }}>{s.registerNumber}</td>
                        <td style={{ padding: 'var(--spacing-1) var(--spacing-2)' }}>{s.institutionalEmail}</td>
                        <td style={{ padding: 'var(--spacing-1) var(--spacing-2)' }}>{s.fullName}</td>
                        <td style={{ padding: 'var(--spacing-1) var(--spacing-2)' }}>{s.departmentCode}</td>
                        <td style={{ padding: 'var(--spacing-1) var(--spacing-2)' }}>{s.batchYear}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {importResult && (
            <div style={{ marginTop: 'var(--spacing-6)', padding: 'var(--spacing-4)', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              <h3>Import Batch Summary</h3>
              <p>Batch ID: <code>{importResult.batchId}</code></p>
              <p>Total Rows: <strong>{importResult.totalProcessed}</strong></p>
              <p>Imported Successfully: <strong style={{ color: 'var(--color-success)' }}>{importResult.importedCount}</strong></p>
              <p>Quarantined into Conflicts: <strong style={{ color: 'var(--color-warning)' }}>{importResult.conflictsQuarantined}</strong></p>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: DEPARTMENTS */}
      {activeTab === 'departments' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
          <div className="card">
            <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-2)' }}>
              Register Institutional Academic Department
            </h2>
            <form onSubmit={handleCreateDept} style={{ display: 'flex', gap: 'var(--spacing-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Code (e.g. CSE, MECH)</label>
                <input
                  type="text"
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value.toUpperCase())}
                  placeholder="CSE"
                  required
                  style={{ padding: 'var(--spacing-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Department Name</label>
                <input
                  type="text"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="Computer Science and Engineering"
                  required
                  style={{ width: '100%', padding: 'var(--spacing-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                />
              </div>
              <button type="submit" className="btn btn-primary">
                Add Department
              </button>
            </form>
          </div>

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Code</th>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Department Name</th>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {departments.map(d => (
                  <tr key={d.code} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)', fontWeight: 600 }}>{d.code}</td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>{d.name}</td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                      <span className={`badge ${d.active ? 'badge-success' : 'badge-neutral'}`}>
                        {d.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 4: AUTHORITIES */}
      {activeTab === 'authorities' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
          <div className="card">
            <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-2)' }}>
              Assign Department Authority Scope
            </h2>
            <form onSubmit={handleAssignAuthority} style={{ display: 'flex', gap: 'var(--spacing-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Target User ID (UUID)</label>
                <input
                  type="text"
                  value={authUserId}
                  onChange={(e) => setAuthUserId(e.target.value)}
                  placeholder="User UUID from Directory"
                  required
                  style={{ width: '100%', padding: 'var(--spacing-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Department Code</label>
                <select
                  value={authDeptCode}
                  onChange={(e) => setAuthDeptCode(e.target.value)}
                  required
                  className="input"
                  style={{ padding: 'var(--spacing-2)' }}
                >
                  <option value="">Select Department</option>
                  {departments.map(d => (
                    <option key={d.code} value={d.code}>{d.code} — {d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Authority Role</label>
                <select
                  value={authRole}
                  onChange={(e) => setAuthRole(e.target.value as any)}
                  className="input"
                  style={{ padding: 'var(--spacing-2)' }}
                >
                  <option value="HOD">Head of Department (HOD)</option>
                  <option value="Dean">Dean of Students</option>
                  <option value="Higher Authority">Higher Authority</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary">
                Assign Authority Scope
              </button>
            </form>
          </div>

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Authority User</th>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Role</th>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Department Scope</th>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Assigned At</th>
                </tr>
              </thead>
              <tbody>
                {authorities.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                      <strong>{a.name}</strong> ({a.email})
                    </td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                      <span className="badge badge-navy">{a.role}</span>
                    </td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                      <span className="badge badge-neutral">{a.department_code}</span> {a.department_name}
                    </td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)', fontSize: 'var(--font-size-xs)' }}>
                      {new Date(a.assigned_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 5: OWNER VERIFICATION CLAIMS (G09.1) */}
      {isPrimaryOwner && activeTab === 'claims' && (
        <section className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <div style={{ padding: 'var(--spacing-4)', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-3)' }}>
            <div>
              <h2 style={{ fontSize: 'var(--font-size-md)', margin: 0 }}>
                Owner Student Verification Claims Governance
              </h2>
              <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-1)' }}>
                Path B student enrollments (personal Google accounts linked to authoritative roster) and disputed claims requiring explicit Primary Owner review.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'center' }}>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Status Filter:</label>
              <select
                value={claimStatusFilter}
                onChange={(e) => setClaimStatusFilter(e.target.value)}
                className="input"
                style={{ padding: '4px 8px', fontSize: 'var(--font-size-xs)' }}
              >
                <option value="ALL">All Claims</option>
                <option value="PENDING">Pending Review</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </div>

          <div style={{ padding: 'var(--spacing-3) var(--spacing-4)', backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 'var(--spacing-3)', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Review notes / justification..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              style={{ flex: 1, minWidth: 200, padding: '4px 8px', fontSize: 'var(--font-size-xs)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
            />
            <input
              type="text"
              placeholder="Identity evidence ref (e.g. ID card verified)..."
              value={reviewEvidence}
              onChange={(e) => setReviewEvidence(e.target.value)}
              style={{ flex: 1, minWidth: 200, padding: '4px 8px', fontSize: 'var(--font-size-xs)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
            />
            <input
              type="text"
              placeholder="Revocation reason (required for revoke)..."
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              style={{ flex: 1, minWidth: 200, padding: '4px 8px', fontSize: 'var(--font-size-xs)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
            />
          </div>

          {loadingClaims ? (
            <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              Loading verification claims…
            </div>
          ) : claims.length === 0 ? (
            <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              No claims found for status: {claimStatusFilter}.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Student User</th>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Register Number</th>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Channel & Match</th>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Department</th>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Status / Warnings</th>
                  <th style={{ padding: 'var(--spacing-3) var(--spacing-4)', textAlign: 'right' }}>Owner Action</th>
                </tr>
              </thead>
              <tbody>
                {claims.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                      <strong>{c.user_name}</strong>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{c.user_email}</div>
                    </td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)', fontWeight: 600, fontFamily: 'monospace' }}>
                      {c.register_number}
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', fontWeight: 'normal' }}>
                        Roster: {c.roster_name} ({c.institutional_email})
                      </div>
                    </td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                      <span className="badge badge-neutral" style={{ fontSize: '10px' }}>{c.claim_channel}</span>
                      {c.approved_personal_email && (
                        <div style={{ fontSize: '10px', color: 'var(--color-success)', marginTop: 2 }}>
                          Roster Approved: {c.approved_personal_email}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                      <span className="badge badge-navy">{c.department_code}</span>
                    </td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                      <span className={`badge ${c.status === 'APPROVED' ? 'badge-success' : c.status === 'PENDING' ? 'badge-warning' : 'badge-danger'}`}>
                        {c.status}
                      </span>
                      {c.binding_conflict && (
                        <span className="badge badge-warning" style={{ display: 'block', marginTop: 4, fontSize: '10px' }}>
                          Binding Conflict
                        </span>
                      )}
                    </td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 'var(--spacing-2)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {c.status === 'PENDING' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => handleReviewClaim(c, 'APPROVED')}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleReviewClaim(c, 'REJECTED')}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {c.status === 'APPROVED' && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                            onClick={() => handleRevokeClaim(c)}
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* TAB 6: OWNER INSTITUTION CONFIGURATION (G09.1) */}
      {isPrimaryOwner && activeTab === 'institutions' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
          <div className="card">
            <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-2)' }}>
              Configure Institutional Perimeters
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-4)' }}>
              Institutions define authorized institutional email domains and verification criteria. All changes require Owner step-up authorization.
            </p>
            <form onSubmit={handleCreateInstitution} style={{ display: 'flex', gap: 'var(--spacing-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Slug</label>
                <input
                  type="text"
                  value={instSlug}
                  onChange={(e) => setInstSlug(e.target.value.toLowerCase())}
                  placeholder="e.g. acet"
                  required
                  style={{ padding: 'var(--spacing-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Institution Name</label>
                <input
                  type="text"
                  value={instName}
                  onChange={(e) => setInstName(e.target.value)}
                  placeholder="Autonomous College of Engineering and Technology"
                  required
                  style={{ width: '100%', padding: 'var(--spacing-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Domains (comma separated)</label>
                <input
                  type="text"
                  value={instDomains}
                  onChange={(e) => setInstDomains(e.target.value)}
                  placeholder="college.edu.in, autocoll.ac.in"
                  required
                  style={{ width: '100%', padding: 'var(--spacing-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                />
              </div>
              <button type="submit" className="btn btn-primary">
                Add Institution
              </button>
            </form>
          </div>

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            {loadingInstitutions ? (
              <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                Loading institutions…
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                    <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Slug</th>
                    <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Institution Name</th>
                    <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Approved Domains</th>
                    <th style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>Status</th>
                    <th style={{ padding: 'var(--spacing-3) var(--spacing-4)', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {institutions.map(inst => (
                  <tr key={inst.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)', fontWeight: 600, fontFamily: 'monospace' }}>{inst.slug}</td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>{inst.name}</td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                      {inst.domains.map((d, i) => (
                        <span key={i} className="badge badge-neutral" style={{ marginRight: 4 }}>{d}</span>
                      ))}
                    </td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)' }}>
                      <span className={`badge ${inst.active ? 'badge-success' : 'badge-neutral'}`}>
                        {inst.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: 'var(--spacing-3) var(--spacing-4)', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleToggleInstitution(inst)}
                      >
                        {inst.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </div>
        </section>
      )}

      {/* Mandatory Dual-Factor Step-Up Modal */}
      <StepUpModal
        isOpen={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        onSuccess={handleStepUpSuccess}
        title={stepUpTitle}
        description={stepUpDesc}
      />
    </main>
  );
}
