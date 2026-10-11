import React, { useState } from 'react';
import { performStepUp } from '@/api/client';

interface StepUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (stepUpToken: string) => void;
  title?: string;
  description?: string;
}

export function StepUpModal({
  isOpen,
  onClose,
  onSuccess,
  title = 'Privileged Dual-Factor Authorization Required',
  description = 'Sensitive administrative operations strictly require concurrent fresh verification of your 6-digit TOTP MFA code and 5-digit Action PIN.',
}: StepUpModalProps) {
  const [pin, setPin] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedMfa = mfaCode.trim();
    if (!/^\d{6}$/.test(trimmedMfa)) {
      setError('MFA code must be exactly 6 digits.');
      return;
    }
    if (!/^\d{5}$/.test(pin)) {
      setError('Action PIN must be exactly 5 digits.');
      return;
    }

    setLoading(true);

    try {
      const res = await performStepUp({ code: trimmedMfa, pin });

      if (res && res.stepUpToken) {
        // Clear sensitive inputs immediately from memory
        setPin('');
        setMfaCode('');
        onSuccess(res.stepUpToken);
        onClose();
      } else {
        throw new Error('Dual-factor verification failed to issue authorization token.');
      }
    } catch (err: any) {
      setError(err.message || 'Authorization failed.');
      // Keep inputs or clear pin on failure for security
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setPin('');
    setMfaCode('');
    setError(null);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="step-up-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 'var(--spacing-4)',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 480,
          width: '100%',
          backgroundColor: 'var(--color-bg-surface, #ffffff)',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="badge badge-warning">Dual-Factor Step-Up Gate</span>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close step-up dialog"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 'var(--font-size-lg)',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
            }}
          >
            ✕
          </button>
        </div>

        <h2 id="step-up-title" style={{ fontSize: 'var(--font-size-xl)', marginTop: 'var(--spacing-2)' }}>
          {title}
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-1)' }}>
          {description}
        </p>

        {error && (
          <div className="alert alert-error" style={{ marginTop: 'var(--spacing-3)' }}>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: 'var(--spacing-4)' }}>
          <div>
            <label
              htmlFor="stepup-mfa-input"
              style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}
            >
              1. Enter 6-Digit Authenticator (TOTP) Code
            </label>
            <input
              id="stepup-mfa-input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              pattern="\d{6}"
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value)}
              placeholder="123456"
              autoComplete="one-time-code"
              required
              autoFocus
              style={{
                width: '100%',
                padding: 'var(--spacing-2) var(--spacing-3)',
                marginTop: 'var(--spacing-1)',
                fontSize: 'var(--font-size-lg)',
                letterSpacing: '0.25em',
                textAlign: 'center',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
              }}
            />
          </div>

          <div style={{ marginTop: 'var(--spacing-4)' }}>
            <label
              htmlFor="stepup-pin-input"
              style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}
            >
              2. Enter 5-Digit Action PIN
            </label>
            <input
              id="stepup-pin-input"
              type="password"
              inputMode="numeric"
              maxLength={5}
              pattern="\d{5}"
              value={pin}
              onChange={e => setPin(e.target.value)}
              placeholder="•••••"
              autoComplete="off"
              required
              style={{
                width: '100%',
                padding: 'var(--spacing-2) var(--spacing-3)',
                marginTop: 'var(--spacing-1)',
                fontSize: 'var(--font-size-lg)',
                letterSpacing: '0.25em',
                textAlign: 'center',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-5)' }}>
            <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Verifying Factors…' : 'Authorize Action'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
