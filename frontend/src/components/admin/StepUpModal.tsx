import React, { useState } from 'react';
import { performStepUp, verifyMfa, verifyActionPin } from '@/api/client';

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
  title = 'Privileged Step-Up Authorization Required',
  description = 'This sensitive administrative operation requires verification of your MFA code or 5-digit Action PIN.',
}: StepUpModalProps) {
  const [method, setMethod] = useState<'pin' | 'mfa'>('pin');
  const [pin, setPin] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let res;
      if (method === 'pin') {
        if (!/^\d{5}$/.test(pin)) {
          throw new Error('Action PIN must be exactly 5 digits.');
        }
        // Try unified admin step-up or direct pin verify
        try {
          res = await performStepUp({ type: 'pin', pin });
        } catch (err: any) {
          // Fallback to direct pin verification if admin step-up reports prerequisite or distinct endpoint
          if (err.message && err.message.includes('prerequisite')) {
            throw err;
          }
          res = await verifyActionPin(pin);
        }
      } else {
        if (!/^\d{6}$/.test(mfaCode.trim())) {
          throw new Error('MFA code must be exactly 6 digits.');
        }
        try {
          res = await performStepUp({ type: 'mfa', code: mfaCode.trim() });
        } catch (err: any) {
          if (err.message && err.message.includes('prerequisite')) {
            throw err;
          }
          res = await verifyMfa({ code: mfaCode.trim() });
        }
      }

      if (res && res.stepUpToken) {
        onSuccess(res.stepUpToken);
        onClose();
      } else {
        throw new Error('Step-up verification failed to issue authorization token.');
      }
    } catch (err: any) {
      setError(err.message || 'Authorization failed.');
    } finally {
      setLoading(false);
    }
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
          <span className="badge badge-warning">Step-Up Gate</span>
          <button
            type="button"
            onClick={onClose}
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

        <div style={{ display: 'flex', gap: 'var(--spacing-2)', marginTop: 'var(--spacing-4)' }}>
          <button
            type="button"
            className={`btn btn-sm ${method === 'pin' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setMethod('pin'); setError(null); }}
          >
            5-Digit Action PIN
          </button>
          <button
            type="button"
            className={`btn btn-sm ${method === 'mfa' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setMethod('mfa'); setError(null); }}
          >
            TOTP MFA Code
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 'var(--spacing-4)' }}>
          {method === 'pin' ? (
            <div>
              <label
                htmlFor="stepup-pin-input"
                style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}
              >
                Enter 5-Digit Action PIN
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
          ) : (
            <div>
              <label
                htmlFor="stepup-mfa-input"
                style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}
              >
                Enter 6-Digit Authenticator (TOTP) Code
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
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-5)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Verifying…' : 'Authorize Action'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
