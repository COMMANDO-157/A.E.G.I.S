/**
 * A.E.G.I.S 4.0 — Admin User & Role Governance
 * WP-4.1.1 & WP-4.2
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import {
  listAdminUsers,
  assignRole,
  updateAdminPermissions,
  createAdminInvitation,
} from '@/api/client';
import type { AdminUser, UserRole, AccountStatus, DelegatedPermission } from '@/api/types';
import { StepUpModal } from '@/components/admin/StepUpModal';

const AVAILABLE_ROLES: { role: UserRole; label: string }[] = [
  { role: 'student', label: 'Student' },
  { role: 'HOD', label: 'Head of Department (HOD)' },
  { role: 'Dean', label: 'Dean' },
  { role: 'Higher Authority', label: 'Higher Authority' },
];

const ALL_DELEGATED_PERMISSIONS: { perm: DelegatedPermission; label: string }[] = [
  { perm: 'users.read', label: 'Read User Directory' },
  { perm: 'users.verify', label: 'Verify Student/Staff' },
  { perm: 'users.roles.assign', label: 'Assign Roles' },
  { perm: 'users.suspend', label: 'Suspend Accounts' },
  { perm: 'departments.manage', label: 'Manage Departments' },
  { perm: 'audit.read', label: 'Read Audit Logs' },
  { perm: 'authorities.assign', label: 'Assign Authority Scope' },
];

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const { t } = useLocale();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Step-Up Modal State
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpTitle, setStepUpTitle] = useState('Privileged Step-Up Required');
  const [stepUpDesc, setStepUpDesc] = useState('');

  // Selected User Editing State
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('student');
  const [editDept, setEditDept] = useState('');
  const [editStatus, setEditStatus] = useState<AccountStatus>('active');

  // Permission Editing State
  const [permUser, setPermUser] = useState<AdminUser | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<DelegatedPermission[]>([]);

  // Invitation State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePerms, setInvitePerms] = useState<DelegatedPermission[]>(['users.read']);
  const [inviteResult, setInviteResult] = useState<{ email: string; inviteToken: string } | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve user directory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  function triggerStepUp(
    title: string,
    desc: string,
    actionWithToken: (token: string) => Promise<void>,
  ) {
    setStepUpTitle(title);
    setStepUpDesc(desc);
    // Store action that accepts stepUpToken
    (window as any).__pendingStepUpAction = actionWithToken;
    setStepUpOpen(true);
  }

  async function handleStepUpSuccess(stepUpToken: string) {
    const action = (window as any).__pendingStepUpAction;
    if (action) {
      delete (window as any).__pendingStepUpAction;
      try {
        setError(null);
        await action(stepUpToken);
      } catch (err: any) {
        setError(err.message || 'Action failed after step-up.');
      }
    }
  }

  // 1. Role / Department / Status Assignment
  async function handleSaveRole(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    triggerStepUp(
      `Confirm Role & Boundary Assignment for ${editingUser.name || editingUser.email}`,
      `Assigning role "${editRole}" in department "${editDept}" with account status "${editStatus}".`,
      async (stepUpToken: string) => {
        await assignRole({
          userId: editingUser.id,
          role: editRole,
          department: editDept,
          account_status: editStatus,
          stepUpToken,
        });
        setSuccessMsg(`Successfully updated credentials for ${editingUser.name || editingUser.email}. Target sessions invalidated.`);
        setEditingUser(null);
        await fetchUsers();
      },
    );
  }

  // 2. Permission Updates (Primary Owner only)
  async function handleSavePermissions(e: React.FormEvent) {
    e.preventDefault();
    if (!permUser) return;

    triggerStepUp(
      `Authorize Admin Delegated Permissions for ${permUser.email}`,
      `Modifying administrative privileges. Assigned permissions: ${selectedPerms.join(', ') || 'None'}.`,
      async (stepUpToken: string) => {
        await updateAdminPermissions({
          userId: permUser.id,
          permissions: selectedPerms,
          stepUpToken,
        });
        setSuccessMsg(`Updated delegated permissions for ${permUser.email}. Sessions invalidated.`);
        setPermUser(null);
        await fetchUsers();
      },
    );
  }

  // 3. Admin Invitation (Primary Owner only)
  async function handleCreateInvitation(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.includes('@')) return;

    triggerStepUp(
      `Authorize Administrator Invitation for ${inviteEmail}`,
      `Issuing time-limited 48-hour administrator grant token with privileges: ${invitePerms.join(', ')}.`,
      async (stepUpToken: string) => {
        const res = await createAdminInvitation({
          email: inviteEmail,
          permissions: invitePerms,
          stepUpToken,
        });
        setInviteResult(res);
        setInviteEmail('');
        setShowInviteModal(false);
        setSuccessMsg(`Generated administrator invitation token for ${res.email}.`);
      },
    );
  }

  const isPrimaryOwner = Boolean(currentUser?.is_primary_owner);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--spacing-4)' }}>
        <div>
          <span className="badge badge-warning">{t.admin.usersBadge}</span>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
            {t.admin.usersHeading}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {t.admin.usersSubtitle}
          </p>
        </div>

        {isPrimaryOwner && (
          <div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => { setShowInviteModal(true); setInviteResult(null); }}
            >
              + Invite Delegated Admin
            </button>
          </div>
        )}
      </div>

      {successMsg && (
        <div className="alert alert-success" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Invitation Token Result Modal / Alert */}
      {inviteResult && (
        <div className="card" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-bg-surface)' }}>
          <h3 style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-primary)' }}>
            Administrator Invitation Issued
          </h3>
          <p style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-1)' }}>
            Deliver this secure token to <strong>{inviteResult.email}</strong>. It expires in 48 hours and can be accepted via registration.
          </p>
          <div style={{ marginTop: 'var(--spacing-3)', padding: 'var(--spacing-2)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {inviteResult.inviteToken}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ marginTop: 'var(--spacing-3)' }}
            onClick={() => setInviteResult(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="card">
        <div className="alert alert-info" style={{ marginBottom: 'var(--spacing-6)' }}>
          <div>
            <strong>{t.admin.roleBoundaryTitle}</strong>
            <p style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--spacing-1)' }}>
              {t.admin.roleBoundaryDesc}
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-8)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Loading verified institutional directory…</span>
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">👥</div>
            <div className="empty-state-title">{t.admin.usersEmptyTitle}</div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', maxWidth: 440 }}>
              {t.admin.usersEmptyDesc}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                  <th style={{ padding: 'var(--spacing-3)' }}>User / Identity</th>
                  <th style={{ padding: 'var(--spacing-3)' }}>Current Role</th>
                  <th style={{ padding: 'var(--spacing-3)' }}>Department</th>
                  <th style={{ padding: 'var(--spacing-3)' }}>Status</th>
                  <th style={{ padding: 'var(--spacing-3)' }}>Security Health</th>
                  <th style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isTargetOwner = Boolean(u.is_primary_owner);
                  const isTargetAdmin = u.role === 'admin';
                  const isSelf = u.id === currentUser?.id;

                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: 'var(--spacing-3)' }}>
                        <div style={{ fontWeight: 600 }}>{u.name || 'Unnamed Identity'}</div>
                        <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>{u.email}</div>
                        {u.staff_requested && (
                          <span className="badge badge-warning" style={{ marginTop: 'var(--spacing-1)', fontSize: '10px' }}>
                            Staff Requested
                          </span>
                        )}
                        {isTargetOwner && (
                          <span className="badge badge-primary" style={{ marginTop: 'var(--spacing-1)', fontSize: '10px' }}>
                            Primary Owner
                          </span>
                        )}
                      </td>
                      <td style={{ padding: 'var(--spacing-3)' }}>
                        <span className={`badge ${u.role === 'admin' ? 'badge-primary' : u.role === 'student' ? 'badge-info' : 'badge-warning'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: 'var(--spacing-3)' }}>
                        {u.department || '—'}
                      </td>
                      <td style={{ padding: 'var(--spacing-3)' }}>
                        <span className={`badge ${u.account_status === 'active' ? 'badge-success' : 'badge-error'}`}>
                          {u.account_status}
                        </span>
                      </td>
                      <td style={{ padding: 'var(--spacing-3)', fontSize: 'var(--font-size-xs)' }}>
                        <div>MFA: {u.mfa_enrolled ? '✅ Enrolled' : '❌ Not Set'}</div>
                        <div>PIN: {u.action_pin_set ? '✅ Active' : '❌ Not Set'}</div>
                      </td>
                      <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 'var(--spacing-2)', justifyContent: 'flex-end' }}>
                          {!isTargetOwner && !isTargetAdmin && !isSelf && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setEditingUser(u);
                                setEditRole(u.role);
                                setEditDept(u.department || '');
                                setEditStatus(u.account_status);
                              }}
                            >
                              Manage Role
                            </button>
                          )}

                          {isPrimaryOwner && isTargetAdmin && !isTargetOwner && !isSelf && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setPermUser(u);
                                setSelectedPerms(u.permissions || []);
                              }}
                            >
                              Permissions
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Role / Department / Status Modal */}
      {editingUser && (
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
              Manage Account & Role
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Target: <strong>{editingUser.name || editingUser.email}</strong> ({editingUser.email})
            </p>

            <form onSubmit={handleSaveRole} style={{ marginTop: 'var(--spacing-4)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                  Assigned Institutional Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="input"
                  style={{ width: '100%', marginTop: 'var(--spacing-1)' }}
                  required
                >
                  {AVAILABLE_ROLES.map(r => (
                    <option key={r.role} value={r.role}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                  Department Assignment
                </label>
                <input
                  type="text"
                  value={editDept}
                  onChange={(e) => setEditDept(e.target.value)}
                  placeholder="e.g. Computer Science, Mechanical"
                  required
                  style={{ width: '100%', marginTop: 'var(--spacing-1)', padding: 'var(--spacing-2)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                  Account Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as AccountStatus)}
                  className="input"
                  style={{ width: '100%', marginTop: 'var(--spacing-1)' }}
                  required
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended (Immediate Session Revocation)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-4)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingUser(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Review & Step-Up
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permissions Modal for Delegated Admins (Primary Owner only) */}
      {permUser && (
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
              Model A Delegated Permissions
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Administrator: <strong>{permUser.email}</strong>
            </p>

            <form onSubmit={handleSavePermissions} style={{ marginTop: 'var(--spacing-4)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
              {ALL_DELEGATED_PERMISSIONS.map(p => {
                const checked = selectedPerms.includes(p.perm);
                return (
                  <label key={p.perm} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-sm)' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPerms([...selectedPerms, p.perm]);
                        } else {
                          setSelectedPerms(selectedPerms.filter(x => x !== p.perm));
                        }
                      }}
                    />
                    <span>{p.label} <code style={{ fontSize: 'var(--font-size-xs)' }}>({p.perm})</code></span>
                  </label>
                );
              })}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-4)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setPermUser(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Review & Step-Up
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Admin Invitation Modal */}
      {showInviteModal && (
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
              Invite Delegated Administrator
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Issue a 48-hour single-use token granting restricted administrative access upon login.
            </p>

            <form onSubmit={handleCreateInvitation} style={{ marginTop: 'var(--spacing-4)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                  Institutional Email Address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="admin.delegate@campus.edu"
                  required
                  style={{ width: '100%', marginTop: 'var(--spacing-1)', padding: 'var(--spacing-2)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--spacing-2)' }}>
                  Granted Permissions
                </label>
                {ALL_DELEGATED_PERMISSIONS.map(p => {
                  const checked = invitePerms.includes(p.perm);
                  return (
                    <label key={p.perm} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-1)' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setInvitePerms([...invitePerms, p.perm]);
                          } else {
                            setInvitePerms(invitePerms.filter(x => x !== p.perm));
                          }
                        }}
                      />
                      <span>{p.label} <code style={{ fontSize: 'var(--font-size-xs)' }}>({p.perm})</code></span>
                    </label>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-4)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowInviteModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Review & Step-Up
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Step-Up Gate Modal */}
      <StepUpModal
        isOpen={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        onSuccess={handleStepUpSuccess}
        title={stepUpTitle}
        description={stepUpDesc}
      />

      <div>
        <Link to="/admin" className="btn btn-secondary">
          &larr; {t.admin.backToOverview}
        </Link>
      </div>
    </div>
  );
}
