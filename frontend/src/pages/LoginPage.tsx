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
import { requestAuthChallenge, loginWithGoogle } from '@/api/client';
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
      target = '/admin';
    } else if (['HOD', 'Dean', 'Higher Authority'].includes(user.role)) {
      target = '/authority';
    }

    if (safeDestination) {
      if ((safeDestination.startsWith('/admin') || safeDestination.startsWith('/owner')) && user.role === 'admin') {
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
          // Reset initialized state to enable fresh challenge acquisition
          initializedRef.current = false;
          setGoogleClientReady(false);
        }
        setAuthError(userMessage);
      }
    },
    [refreshUser],
  );

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

        {/* Sign-In Area */}
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
