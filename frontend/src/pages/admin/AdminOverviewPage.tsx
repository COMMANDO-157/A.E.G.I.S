/**
 * A.E.G.I.S 4.0 — Owner Governance Dashboard & Security Setup
 * WP-4.1.5 & WP-4.2
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { setupMfa, verifyMfa, setupActionPin, verifyActionPin } from '@/api/client';
import type { MfaSetupResponse } from '@/api/types';

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const { t } = useLocale();

  // Security Credentials Setup State
  const [mfaData, setMfaData] = useState<MfaSetupResponse | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSuccess, setMfaSuccess] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  const [pin, setPin] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  async function handleStartMfaSetup() {
    setMfaError(null);
    setMfaLoading(true);
    try {
      const data = await setupMfa();
      setMfaData(data);
    } catch (err: any) {
      setMfaError(err.message || 'Failed to initialize MFA setup.');
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleConfirmMfa(e: React.FormEvent) {
    e.preventDefault();
    setMfaError(null);
    setMfaLoading(true);
    try {
      await verifyMfa({ code: mfaCode.trim() });
      setMfaSuccess(true);
      setMfaData(null);
    } catch (err: any) {
      setMfaError(err.message || 'MFA verification failed.');
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleSetPin(e: React.FormEvent) {
    e.preventDefault();
    setPinError(null);
    setPinLoading(true);
    try {
      if (!/^\d{5}$/.test(pin)) {
        throw new Error('PIN must be exactly 5 digits.');
      }
      await setupActionPin(pin);
      // Verify immediately to establish session authorization
      await verifyActionPin(pin);
      setPinSuccess(true);
      setPin('');
    } catch (err: any) {
      setPinError(err.message || 'Action PIN setup failed.');
    } finally {
      setPinLoading(false);
    }
  }

  const governanceSections = [
    {
      title: t.admin.usersTitle,
      description: t.admin.usersDesc,
      path: user?.is_primary_owner ? '/owner/users' : '/admin/users',
      action: t.admin.viewUsersAction,
    },
    {
      title: t.admin.casesTitle,
      description: t.admin.casesDesc,
      path: user?.is_primary_owner ? '/owner/cases' : '/admin/cases',
      action: t.admin.viewCasesAction,
    },
    {
      title: t.admin.auditTitle,
      description: t.admin.auditDesc,
      path: user?.is_primary_owner ? '/owner/audit' : '/admin/audit',
      action: t.admin.viewAuditAction,
    },
  ] as const;

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-6)',
      }}
    >
      <header
        className="card"
        style={{
          borderColor: 'var(--aegis-amber-500)',
          background: 'var(--aegis-amber-50)',
        }}
      >
        <span className="badge badge-warning">
          {t.admin.badge}
        </span>

        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            color: 'var(--aegis-navy)',
            marginTop: 'var(--spacing-3)',
          }}
        >
          {t.admin.overviewTitle}
        </h1>

        <p style={{ color: 'var(--color-text-secondary)' }}>
          {t.admin.signedInAs}: {user?.email ?? 'Unavailable'}
        </p>
      </header>

      <section className="alert alert-warning" role="status">
        <div>
          <strong>{t.admin.controlsNotEnabledTitle}</strong>
          <p>
            {t.admin.controlsNotEnabledDesc}
          </p>
        </div>
      </section>

      {/* Security Credentials Enrollment Console */}
      <section className="card" aria-labelledby="security-heading">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id="security-heading">{t.admin.securityHeading}</h2>
          <span className="badge badge-primary">Prerequisite Controls</span>
        </div>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-1)' }}>
          {t.admin.securityDesc}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--spacing-4)', marginTop: 'var(--spacing-4)' }}>
          {/* TOTP MFA Card */}
          <div className="card" style={{ background: 'var(--color-bg-secondary)' }}>
            <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>1. TOTP Authenticator (RFC 6238)</h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-1)' }}>
              Required prerequisite before privileged step-up tokens can be issued.
            </p>

            {mfaSuccess && (
              <div className="alert alert-success" style={{ marginTop: 'var(--spacing-2)', fontSize: 'var(--font-size-xs)' }}>
                ✅ MFA Enrolled & Active for this account.
              </div>
            )}

            {mfaError && (
              <div className="alert alert-error" style={{ marginTop: 'var(--spacing-2)', fontSize: 'var(--font-size-xs)' }}>
                {mfaError}
              </div>
            )}

            {!mfaData && !mfaSuccess && !user?.mfa_enrolled && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 'var(--spacing-3)' }}
                onClick={handleStartMfaSetup}
                disabled={mfaLoading}
              >
                {mfaLoading ? 'Generating Secret…' : 'Enroll Authenticator App'}
              </button>
            )}

            {mfaData && (
              <form onSubmit={handleConfirmMfa} style={{ marginTop: 'var(--spacing-3)' }}>
                <p style={{ fontSize: 'var(--font-size-xs)', wordBreak: 'break-all' }}>
                  Secret Key: <code style={{ userSelect: 'all' }}>{mfaData.secret}</code>
                </p>
                <div style={{ marginTop: 'var(--spacing-2)' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    required
                    style={{ width: '100%', padding: 'var(--spacing-2)', fontSize: 'var(--font-size-sm)' }}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: 'var(--spacing-2)' }}
                  disabled={mfaLoading}
                >
                  {mfaLoading ? 'Verifying…' : 'Confirm Enrollment'}
                </button>
              </form>
            )}
          </div>

          {/* 5-Digit Action PIN Card */}
          <div className="card" style={{ background: 'var(--color-bg-secondary)' }}>
            <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>2. 5-Digit Action PIN</h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-1)' }}>
              Salted scrypt hash with automatic 15-minute lockout protection.
            </p>

            {pinSuccess && (
              <div className="alert alert-success" style={{ marginTop: 'var(--spacing-2)', fontSize: 'var(--font-size-xs)' }}>
                ✅ Action PIN established and active.
              </div>
            )}

            {pinError && (
              <div className="alert alert-error" style={{ marginTop: 'var(--spacing-2)', fontSize: 'var(--font-size-xs)' }}>
                {pinError}
              </div>
            )}

            {user?.is_primary_owner ? <p>Your access PIN is managed through verified owner entry. Contact the trusted operator for recovery.</p> : <form onSubmit={handleSetPin} style={{ marginTop: 'var(--spacing-3)' }}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={5}
                pattern="\d{5}"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="5-digit PIN (•••••)"
                required
                style={{ width: '100%', padding: 'var(--spacing-2)', fontSize: 'var(--font-size-sm)', letterSpacing: '0.2em' }}
              />
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{ marginTop: 'var(--spacing-2)' }}
                disabled={pinLoading}
              >
                {pinLoading ? 'Saving…' : 'Save & Activate PIN'}
              </button>
            </form>}
          </div>
        </div>
      </section>

      <section aria-labelledby="governance-heading">
        <h2
          id="governance-heading"
          style={{
            fontSize: 'var(--font-size-xl)',
            marginBottom: 'var(--spacing-4)',
          }}
        >
          {t.admin.workspacesHeading}
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: 'var(--spacing-4)',
          }}
        >
          {governanceSections.map((section) => (
            <article className="card" key={section.path}>
              <h3
                style={{
                  fontSize: 'var(--font-size-lg)',
                  marginBottom: 'var(--spacing-3)',
                }}
              >
                {section.title}
              </h3>

              <p
                style={{
                  color: 'var(--color-text-secondary)',
                  marginBottom: 'var(--spacing-4)',
                }}
              >
                {section.description}
              </p>

              <Link
                to={section.path}
                className="btn btn-secondary btn-sm"
              >
                {section.action}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
