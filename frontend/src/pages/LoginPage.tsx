/**
 * A.E.G.I.S 4.0 — Institutional Sign-In Page
 * WP-4.1.4 | Protected Routing & Authorization Foundation
 *
 * Provides institutional login shell, security guidance, and links to registration.
 * Validates post-login return paths against strict internal boundaries and role clearance.
 * Google Single Sign-On backend integration is scheduled for Stage 4.2.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { sanitizeReturnUrl } from '@/utils/url';
import { requestAuthChallenge, loginWithGoogle, loginWithPassword, requestPasswordReset, confirmPasswordReset } from '@/api/client';
import styles from './LoginPage.module.css';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            nonce?: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: string | number;
            },
          ) => void;
          prompt?: () => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const { isAuthenticated, loading, user, refreshUser } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();

  const [authMode, setAuthMode] = useState<'google' | 'password'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Password reset flow state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const [authError, setAuthError] = useState<string | null>(null);
  const [gisLoading, setGisLoading] = useState<boolean>(false);
  const [googleClientReady, setGoogleClientReady] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);

  // Redirect already-authenticated sessions to role-authorized destination
  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || !user) return;

    const stateFrom = (location.state as { from?: unknown } | null)?.from;
    const searchFrom = new URLSearchParams(location.search).get('from');
    const rawDestination = stateFrom || searchFrom;
    const safeDestination = rawDestination ? sanitizeReturnUrl(rawDestination, '') : '';

    let target = '/student';
    if (user.role === 'admin') {
      target = user.is_primary_owner ? '/owner' : '/admin';
    } else if (user.role === 'HOD') {
      target = '/hod';
    } else if (user.role === 'Dean') {
      target = '/dean';
    } else if (user.role === 'Higher Authority') {
      target = '/authority';
    }

    if (safeDestination) {
      if (safeDestination.startsWith('/owner') && user.role === 'admin' && user.is_primary_owner) {
        target = safeDestination;
      } else if (safeDestination.startsWith('/admin') && user.role === 'admin') {
        target = safeDestination;
      } else if (safeDestination.startsWith('/hod') && user.role === 'HOD') {
        target = safeDestination;
      } else if (safeDestination.startsWith('/dean') && user.role === 'Dean') {
        target = safeDestination;
      } else if (safeDestination.startsWith('/authority') && ['HOD', 'Dean', 'Higher Authority'].includes(user.role)) {
        target = safeDestination;
      } else if (safeDestination.startsWith('/student') && user.role === 'student') {
        target = safeDestination;
      }
    }

    navigate(target, { replace: true });
  }, [isAuthenticated, loading, user, location, navigate]);

  const handleCredentialResponse = useCallback(
    async (response: { credential: string }) => {
      setAuthError(null);
      setGisLoading(true);
      try {
        await loginWithGoogle(response.credential);
        await refreshUser();
      } catch (err: unknown) {
        setGisLoading(false);
        const rawMessage = err instanceof Error ? err.message : 'Google authentication failed.';
        let userMessage = rawMessage;
        if (rawMessage.toLowerCase().includes('challenge') || rawMessage.toLowerCase().includes('nonce')) {
          userMessage = 'Authentication challenge expired or invalid. Please click Retry below to begin a fresh sign-in session.';
          initializedRef.current = false;
          setGoogleClientReady(false);
        }
        setAuthError(userMessage);
      }
    },
    [refreshUser],
  );

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setPasswordLoading(true);
    try {
      await loginWithPassword({ email: email.trim(), password });
      await refreshUser();
    } catch (err: unknown) {
      setPasswordLoading(false);
      setAuthError(err instanceof Error ? err.message : 'Authentication failed.');
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetMsg(null);
    setResetLoading(true);
    try {
      const res = await requestPasswordReset(resetEmail.trim());
      setResetMsg(res.message);
      if (res.resetToken) {
        setResetToken(res.resetToken);
        setResetStep('confirm');
      }
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : 'Password reset request failed.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetMsg(null);
    setResetLoading(true);
    try {
      await confirmPasswordReset({ token: resetToken.trim(), newPassword });
      setResetMsg('Password successfully updated! You can now sign in.');
      setTimeout(() => {
        setShowForgotModal(false);
        setResetStep('request');
        setResetToken('');
        setNewPassword('');
        setResetMsg(null);
      }, 2000);
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setResetLoading(false);
    }
  };

  // Helper function to reliably load the Google Identity Services SDK
  const loadGoogleSdk = useCallback(async (): Promise<void> => {
    if (window.google?.accounts?.id) return;

    return new Promise<void>((resolve, reject) => {
      const existingScript = document.getElementById('google-gis-sdk') as HTMLScriptElement | null;
      if (existingScript) {
        if (window.google?.accounts?.id) {
          resolve();
          return;
        }
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(new Error('Google Identity Services SDK failed to load. Check network or content blocker.')), { once: true });
        // Set a timeout in case script is already stalled
        setTimeout(() => {
          if (window.google?.accounts?.id) resolve();
          else reject(new Error('Google Identity Services SDK timed out while loading.'));
        }, 8000);
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-gis-sdk';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Google Identity Services SDK failed to load. Check network or content blocker.'));
      document.head.appendChild(script);

      setTimeout(() => {
        if (window.google?.accounts?.id) resolve();
        else reject(new Error('Google Identity Services SDK timed out while loading.'));
      }, 8000);
    });
  }, []);

  const initializedRef = useRef<boolean>(false);

  // Initialize Google Identity Services
  useEffect(() => {
    if (isAuthenticated || loading) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    let isMounted = true;

    async function setupGis() {
      setAuthError(null);
      try {
        const challenge = await requestAuthChallenge();
        if (!isMounted) return;

        if (!challenge.clientId) {
          setGoogleClientReady(false);
          setAuthError('Google Client ID is not configured on the institutional backend.');
          return;
        }

        // Dynamically load Google Identity Services
        await loadGoogleSdk();
        if (!isMounted) return;

        if (window.google?.accounts?.id && googleBtnContainerRef.current) {
          window.google.accounts.id.initialize({
            client_id: challenge.clientId,
            nonce: challenge.nonce,
            callback: handleCredentialResponse,
            cancel_on_tap_outside: true,
          });

          googleBtnContainerRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width: 360,
          });

          setGoogleClientReady(true);
        } else {
          throw new Error('Google Identity Services container or SDK is unavailable.');
        }
      } catch (err: unknown) {
        if (isMounted) {
          setGoogleClientReady(false);
          initializedRef.current = false; // Allow retry on failure
          const message = err instanceof Error ? err.message : 'Failed to initialize Google Single Sign-On.';
          setAuthError(message);
        }
      }
    }

    void setupGis();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, loading, handleCredentialResponse, loadGoogleSdk, retryCount]);

  if (loading) return null;

  return (
    <div className={styles.page}>
      {/* Top navigation back to home */}
      <div className={styles.topBar}>
        <Link to="/" className={styles.backHomeLink} aria-label="Return to A.E.G.I.S homepage">
          <span aria-hidden="true">←</span>
          <span>Back to Home</span>
        </Link>
      </div>

      <div className={styles.panel}>
        {/* Institutional Branding */}
        <header className={styles.header}>
          <div className={styles.shield} aria-hidden="true">🛡️</div>
          <h1 className={styles.title}>{t.app.name}</h1>
          <p className={styles.subtitle}>{t.login.title} — {t.app.fullName}</p>
        </header>

        {/* Security & Confidentiality Advisory */}
        <aside className={styles.securityBanner} aria-label="Privacy Advisory">
          <span aria-hidden="true">🔒</span>
          <span>{t.login.privacyNote}</span>
        </aside>

        {/* Error Notification */}
        {authError && (
          <div className="alert alert-danger" role="alert" style={{ fontSize: 'var(--font-size-xs)' }}>
            <span>{authError}</span>
          </div>
        )}

        {/* Dual Authentication Mode Switcher */}
        <div className={styles.authTabs} role="tablist" aria-label="Authentication Method">
          <button
            type="button"
            role="tab"
            aria-selected={authMode === 'password'}
            className={`${styles.tabBtn} ${authMode === 'password' ? styles.tabActive : ''}`}
            onClick={() => { setAuthMode('password'); setAuthError(null); }}
          >
            Password Sign-In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={authMode === 'google'}
            className={`${styles.tabBtn} ${authMode === 'google' ? styles.tabActive : ''}`}
            onClick={() => { setAuthMode('google'); setAuthError(null); }}
          >
            Google SSO
          </button>
        </div>

        {/* Mode A: Password Login Form */}
        {authMode === 'password' && (
          <section className={styles.signIn} aria-label="Password Authentication">
            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
              <div className={styles.inputGroup}>
                <label htmlFor="login-email" className={styles.inputLabel}>
                  Institutional Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@college.edu.in"
                  className={styles.textInput}
                />
              </div>

              <div className={styles.inputGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="login-password" className={styles.inputLabel}>
                    Password
                  </label>
                  <button
                    type="button"
                    className={styles.forgotLink}
                    onClick={() => { setShowForgotModal(true); setResetEmail(email); setResetError(null); setResetMsg(null); }}
                  >
                    Forgot Password?
                  </button>
                </div>
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className={styles.textInput}
                />
              </div>

              <button
                type="submit"
                disabled={passwordLoading}
                className={styles.submitBtn}
              >
                {passwordLoading ? 'Authenticating…' : 'Sign In'}
              </button>
            </form>
          </section>
        )}

        {/* Mode B: Google SSO Sign-In */}
        {authMode === 'google' && (
          <section className={styles.signIn} aria-label="Google Authentication">
            <p className={styles.signInLabel}>{t.login.subtitle}</p>

            {/* Render container for Google Identity Services Button */}
            <div
              ref={googleBtnContainerRef}
              style={{
                display: googleClientReady ? 'flex' : 'none',
                justifyContent: 'center',
                width: '100%',
                minHeight: '44px',
              }}
            />

            {/* Fallback button when Google Client is unconfigured or loading */}
            {!googleClientReady && (
              <button
                type="button"
                className={styles.googleBtn}
                disabled
                aria-disabled="true"
                aria-label="Google Sign-In"
                title={gisLoading ? 'Authenticating...' : 'Google Client configuration loading or unavailable in this environment'}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>{gisLoading ? 'Verifying with Google...' : t.login.googleBtnLabel}</span>
              </button>
            )}

            {!googleClientReady && (
              <p className={styles.stageNotice}>
                {t.login.devNotice}
              </p>
            )}

            {!googleClientReady && !gisLoading && (
              <button
                type="button"
                className={styles.retryBtn}
                onClick={() => {
                  initializedRef.current = false;
                  setRetryCount((prev) => prev + 1);
                }}
                aria-label="Retry Google Sign-In initialization"
              >
                ↻ Retry Google Sign-In
              </button>
            )}
          </section>
        )}

        {/* Password Reset Modal */}
        {showForgotModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: 'var(--spacing-4)'
            }}
          >
            <div
              style={{
                background: 'var(--color-surface-card)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--spacing-6)',
                maxWidth: '400px',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-4)',
                boxShadow: 'var(--shadow-xl)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, margin: 0 }}>
                  {resetStep === 'request' ? 'Reset Account Password' : 'Set New Password'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              {resetMsg && (
                <div className="alert alert-success" style={{ fontSize: 'var(--font-size-xs)' }}>
                  {resetMsg}
                </div>
              )}
              {resetError && (
                <div className="alert alert-danger" style={{ fontSize: 'var(--font-size-xs)' }}>
                  {resetError}
                </div>
              )}

              {resetStep === 'request' ? (
                <form onSubmit={handleResetRequest} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
                    Enter your verified institutional email to receive a secure single-use password reset link.
                  </p>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="user@college.edu.in"
                    className={styles.textInput}
                  />
                  <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
                    <button
                      type="button"
                      onClick={() => setResetStep('confirm')}
                      style={{ fontSize: 'var(--font-size-xs)', background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                    >
                      Already have a token?
                    </button>
                  </div>
                  <button type="submit" disabled={resetLoading} className={styles.submitBtn}>
                    {resetLoading ? 'Requesting…' : 'Generate Reset Token'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetConfirm} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
                  <input
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Single-use reset token"
                    className={styles.textInput}
                  />
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 10 chars, mixed case/symbol)"
                    className={styles.textInput}
                  />
                  <button type="submit" disabled={resetLoading} className={styles.submitBtn}>
                    {resetLoading ? 'Updating…' : 'Update Password'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Student Registration Prompt */}
        <div className={styles.registerPrompt}>
          <span>{t.login.noAccountPrompt}</span>
          <Link to="/register" className={styles.registerLink}>
            {t.login.registerLink} →
          </Link>
        </div>

        {/* Confidentiality Footer */}
        <footer className={styles.footer}>
          <p>
            Emergency crisis helpline: <a href={`tel:${t.emergency.police.number}`}>Police: {t.emergency.police.number}</a> ·{' '}
            <a href={`tel:${t.emergency.antiRagging.number}`}>Anti-Ragging: {t.emergency.antiRagging.number}</a>
          </p>
        </footer>
      </div>
    </div>
  );
}
