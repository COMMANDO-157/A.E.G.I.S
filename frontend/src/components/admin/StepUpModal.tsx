import { Dialog } from '@/components/ui/Dialog';
import { useLocale } from '@/context/LocaleContext';
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
  title,
  description,
}: StepUpModalProps) {
  const {t}=useLocale();
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
      setError(t.phase1.badTotp);
      return;
    }
    if (!/^\d{5}$/.test(pin)) {
      setError(t.phase1.badPin);
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
      setError(t.phase1.error);
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
    <Dialog isOpen={isOpen} onClose={handleClose} title={title || t.phase1.stepUpTitle} description={description || t.phase1.stepUpHelp}>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-1)' }}>
          {description || t.phase1.stepUpHelp}
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
              {t.phase1.totp}
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
              {t.phase1.pin}
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
              {t.phase1.cancel}
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t.phase1.busy : t.phase1.authorize}
            </button>
          </div>
        </form>
    </Dialog>
  );
}
