/**
 * A.E.G.I.S 4.0 — Admin Immutable Audit Log
 * WP-4.1.1 & WP-4.2
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';
import { useAuth } from '@/context/AuthContext';
import { listAuditLogs } from '@/api/client';
import type { AuditLog } from '@/api/types';

export default function AdminAuditPage() {
  const {user}=useAuth();
  const { t } = useLocale();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadLogs() {
      setLoading(true);
      setError(null);
      try {
        const data = await listAuditLogs();
        if (active) {
          setLogs(data);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Failed to retrieve immutable audit records.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    loadLogs();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <div>
        <span className="badge badge-warning">{t.admin.auditBadge}</span>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--spacing-2)' }}>
          {t.admin.auditHeading}
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          {t.admin.auditSubtitle}
        </p>
      </div>

      <div className="card">
        <div className="alert alert-info" style={{ marginBottom: 'var(--spacing-6)' }}>
          <div>
            <strong>{t.admin.auditIntegrityTitle}</strong>
            <p style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--spacing-1)' }}>
              {t.admin.auditIntegrityDesc}
            </p>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-4)' }}>
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-8)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Loading tamper-evident ledger…</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">🛡️</div>
            <div className="empty-state-title">{t.admin.auditEmptyTitle}</div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', maxWidth: 440 }}>
              {t.admin.auditEmptyDesc}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                  <th style={{ padding: 'var(--spacing-3)' }}>Timestamp</th>
                  <th style={{ padding: 'var(--spacing-3)' }}>Action</th>
                  <th style={{ padding: 'var(--spacing-3)' }}>Actor ID</th>
                  <th style={{ padding: 'var(--spacing-3)' }}>Complaint ID</th>
                  <th style={{ padding: 'var(--spacing-3)' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 'var(--spacing-3)', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td style={{ padding: 'var(--spacing-3)', fontWeight: 600 }}>
                      <span className="badge badge-info" style={{ fontFamily: 'monospace' }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: 'var(--spacing-3)', fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}>
                      {log.actor_id ? `${log.actor_id.slice(0, 8)}…` : 'System'}
                    </td>
                    <td style={{ padding: 'var(--spacing-3)', fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}>
                      {log.complaint_id ? `${log.complaint_id.slice(0, 8)}…` : '—'}
                    </td>
                    <td style={{ padding: 'var(--spacing-3)', fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', maxHeight: 60, overflowY: 'auto' }}>
                        {JSON.stringify(log.details)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <Link to={user?.is_primary_owner ? '/owner' : '/admin'} className="btn btn-secondary">
          &larr; {t.admin.backToOverview}
        </Link>
      </div>
    </div>
  );
}
