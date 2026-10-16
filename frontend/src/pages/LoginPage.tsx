/**
 * A.E.G.I.S 4.0 — Institutional Sign-In Page
 * WP-4.1.4 | Protected Routing & Authorization Foundation
 *
 * Provides institutional login shell, security guidance, and links to registration.
 * Validates post-login return paths against strict internal boundaries and role clearance.
 * Google is the primary journey; existing password accounts remain available.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { sanitizeReturnUrl } from '@/utils/url';
import { requestAuthChallenge, loginWithGoogle, loginWithPassword, requestPasswordReset, confirmPasswordReset } from '@/api/client';
import { Dialog } from '@/components/ui/Dialog';
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

  const [authMode, setAuthMode] = useState<'google' | 'password'>('google');
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
        const rawMessage = err instanceof Error ? err.message : t.phase1.error;
        let userMessage = rawMessage;
        if (rawMessage.toLowerCase().includes('challenge') || rawMessage.toLowerCase().includes('nonce')) {
          userMessage = t.phase1.googleUnavailable;
          initializedRef.current = false;
          setGoogleClientReady(false);
          challengeRef.current = null;
        }
        setAuthError(userMessage);
      }
    },
    [refreshUser, t.phase1.error],
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
      setAuthError(err instanceof Error ? err.message : t.phase1.error);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetMsg(null);
    setResetLoading(true);
    try {
      const res = await requestPasswordReset(resetEmail.trim());
      setResetMsg(t.phase1.resetHelp);
      if (res.resetToken) {
        setResetToken(res.resetToken);
        setResetStep('confirm');
      }
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : t.phase1.error);
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
      setResetMsg(t.phase1.resetDone);
      setNewPassword('');
      setResetToken('');

    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : t.phase1.error);
    } finally {
      setResetLoading(false);
    }
  };

  // Helper function to reliably load the Google Identity Services SDK
  const loadGoogleSdk = useCallback(async (): Promise<void> => {
    if (window.google?.accounts?.id) return;

    return new Promise<void>((resolve, reject) => {
      // Check for any existing GIS script (from index.html or dynamic creation)
      const existingScript = document.getElementById('google-gis-sdk') as HTMLScriptElement | null ||
        document.querySelector('script[src*="accounts.google.com/gsi/client"]') as HTMLScriptElement | null;
      if (existingScript) {
        if (window.google?.accounts?.id) {
          resolve();
          return;
        }
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(new Error('Google Identity Services SDK failed to load. Check network or content blocker.')), { once: true });
        // Poll briefly in case script loaded without event dispatch
        const checkInterval = setInterval(() => {
          if (window.google?.accounts?.id) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 200);
        setTimeout(() => {
          clearInterval(checkInterval);
          if (window.google?.accounts?.id) resolve();
          else reject(new Error('Google Identity Services SDK timed out while loading.'));
        }, 10000);
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
      }, 10000);
    });
  }, []);

  const initializedRef = useRef<boolean>(false);
  const challengeRef = useRef<{ clientId: string; nonce: string } | null>(null);

  // Initialize Google Identity Services
  useEffect(() => {
    if (isAuthenticated || loading || authMode !== 'google') return;

    let isMounted = true;

    async function setupGis() {
      try {
        if (!challengeRef.current) {
          const challenge = await requestAuthChallenge();
          if (!isMounted) return;
          if (!challenge.clientId) {
            setGoogleClientReady(false);
            setAuthError(t.phase1.googleUnavailable);
            return;
          }
          challengeRef.current = challenge;
        }

        const challenge = challengeRef.current;

        // Dynamically ensure Google Identity Services SDK is loaded
        await loadGoogleSdk();
        if (!isMounted) return;

        if (window.google?.accounts?.id) {
          if (!initializedRef.current) {
            window.google.accounts.id.initialize({
              client_id: challenge.clientId,
              nonce: challenge.nonce,
              callback: handleCredentialResponse,
              cancel_on_tap_outside: true,
            });
            initializedRef.current = true;
          }

          if (googleBtnContainerRef.current) {
            googleBtnContainerRef.current.innerHTML = '';
            window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
              type: 'standard',
              theme: 'outline',
              size: 'large',
              text: 'continue_with',
              shape: 'rectangular',
              logo_alignment: 'left',
              width: Math.max(200, Math.min(360, googleBtnContainerRef.current.clientWidth)),
            });
            setGoogleClientReady(true);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          setGoogleClientReady(false);
          initializedRef.current = false; // Allow retry on failure
          challengeRef.current = null;
          // Only show error if on Google auth mode
          if (authMode === 'google') {
            setAuthError(t.phase1.googleUnavailable);
          }
        }
      }
    }

    void setupGis();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, loading, handleCredentialResponse, loadGoogleSdk, retryCount, authMode, t.phase1.googleUnavailable]);

  if (loading) return <p role="status">{t.phase1.busy}</p>;
  return <div className={styles.page} data-theme="sanctuary">
    <Link to="/" className={styles.backHomeLink}>{t.phase1.back}</Link>
    <div className={styles.panel}>
      <h1 className={styles.title}>{t.app.name}</h1>
      <p className={styles.subtitle}>{t.login.title}</p>
      <p className={styles.securityBanner}>{t.phase1.privacy}</p>
      {authError && <p className="alert alert-danger" role="alert">{authError}</p>}
      <button className="btn btn-secondary" type="button" aria-pressed={authMode==='google'} onClick={()=>{setAuthMode('google');setAuthError(null);}}>{t.phase1.google}</button>
      {authMode==='google' && <section className={styles.signIn} aria-label={t.phase1.google} aria-busy={gisLoading}>
        <div ref={googleBtnContainerRef} style={{width:'100%',minHeight:44,display:googleClientReady?'flex':'none',justifyContent:'center'}} />
        {!googleClientReady && <p role="status">{authError ? t.phase1.googleUnavailable : t.phase1.busy}</p>}
        {gisLoading && <p role="status">{t.phase1.busy}</p>}
        {!googleClientReady && <button type="button" className="btn btn-secondary" onClick={()=>{initializedRef.current=false;challengeRef.current=null;setAuthError(null);setRetryCount(n=>n+1);}}>{t.phase1.retry}</button>}
      </section>}
      <button className={styles.forgotLink} type="button" aria-expanded={authMode==='password'} onClick={()=>{setAuthMode('password');setAuthError(null);}}>{t.phase1.passwordPath}</button>
      {authMode==='password' && <form onSubmit={handlePasswordSubmit} className={styles.signIn}>
        <label htmlFor="login-email">{t.phase1.email}</label><input id="login-email" className={styles.textInput} type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} />
        <label htmlFor="login-password">{t.phase1.password}</label><input id="login-password" className={styles.textInput} type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} />
        <button className={styles.submitBtn} disabled={passwordLoading}>{passwordLoading?t.phase1.busy:t.phase1.signIn}</button>
        <button type="button" className={styles.forgotLink} onClick={()=>{setShowForgotModal(true);setResetEmail(email);setResetStep('request');setResetError(null);setResetMsg(null);}}>{t.phase1.forgot}</button>
      </form>}
      <Dialog isOpen={showForgotModal} onClose={()=>{if(!resetLoading){setShowForgotModal(false);setResetToken('');setNewPassword('');}}} title={t.phase1.reset}>
        {resetMsg && <p role="status">{resetMsg}</p>}{resetError && <p role="alert">{resetError}</p>}
        {resetStep==='request' ? <form onSubmit={handleResetRequest}>
          <p>{t.phase1.resetHelp}</p><label htmlFor="reset-email">{t.phase1.email}</label><input id="reset-email" type="email" required autoComplete="email" className={styles.textInput} value={resetEmail} onChange={e=>setResetEmail(e.target.value)} />
          <button className="btn btn-primary" disabled={resetLoading}>{resetLoading?t.phase1.busy:t.phase1.sendReset}</button>
          <button type="button" className="btn btn-secondary" onClick={()=>setResetStep('confirm')}>{t.phase1.haveToken}</button>
        </form>:<form onSubmit={handleResetConfirm}>
          <label htmlFor="reset-token">{t.phase1.token}</label><input id="reset-token" type="text" required className={styles.textInput} value={resetToken} onChange={e=>setResetToken(e.target.value)} />
          <label htmlFor="reset-password">{t.phase1.newPassword}</label><input id="reset-password" type="password" required minLength={10} autoComplete="new-password" className={styles.textInput} value={newPassword} onChange={e=>setNewPassword(e.target.value)} aria-describedby="reset-hint" />
          <p id="reset-hint">{t.phase1.resetHint}</p><button className="btn btn-primary" disabled={resetLoading}>{resetLoading?t.phase1.busy:t.phase1.savePassword}</button>
        </form>}
      </Dialog>
      <Link to="/register">{t.phase1.accountCreate}</Link>
    </div>
  </div>;
}
