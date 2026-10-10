/**
 * A.E.G.I.S 4.0 — Institutional Sign-In Page
 * WP-4.1.4 | Protected Routing & Authorization Foundation
 *
 * Provides institutional login shell, security guidance, and links to registration.
 * Validates post-login return paths against strict internal boundaries and role clearance.
 * Google Single Sign-On backend integration is scheduled for Stage 4.2.
 */

import { useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { sanitizeReturnUrl } from '@/utils/url';
import { en } from '@/locales/en';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect already-authenticated sessions to role-authorized destination
  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || !user) return;

    // Check for return path in navigation state or query parameter
    const stateFrom = (location.state as { from?: unknown } | null)?.from;
    const searchFrom = new URLSearchParams(location.search).get('from');
    const rawDestination = stateFrom || searchFrom;
    const safeDestination = rawDestination ? sanitizeReturnUrl(rawDestination, '') : '';

    // Determine default portal based strictly on verified server role
    let target = '/student';
    if (user.role === 'admin') {
      target = '/admin';
    } else if (['HOD', 'Dean', 'Higher Authority'].includes(user.role)) {
      target = '/authority';
    }

    // Only honour specific return destination if user's role matches that portal
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
          <h1 className={styles.title}>{en.app.name}</h1>
          <p className={styles.subtitle}>{en.login.title} — {en.app.fullName}</p>
        </header>

        {/* Security & Confidentiality Advisory */}
        <aside className={styles.securityBanner} aria-label="Privacy Advisory">
          <span aria-hidden="true">🔒</span>
          <span>{en.login.privacyNote}</span>
        </aside>

        {/* Sign-In Area */}
        <section className={styles.signIn} aria-label="Google Authentication">
          <p className={styles.signInLabel}>{en.login.subtitle}</p>

          <button
            type="button"
            className={styles.googleBtn}
            disabled
            aria-disabled="true"
            aria-label="Google Sign-In (Integration activating in Stage 4.2)"
            title="Google Single Sign-On backend integration scheduled for Stage 4.2"
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
            <span>{en.login.googleBtnLabel}</span>
          </button>

          <p className={styles.stageNotice}>
            {en.login.devNotice}
          </p>
        </section>

        {/* Student Registration Prompt */}
        <div className={styles.registerPrompt}>
          <span>{en.login.noAccountPrompt}</span>
          <Link to="/register" className={styles.registerLink}>
            {en.login.registerLink} →
          </Link>
        </div>

        {/* Confidentiality Footer */}
        <footer className={styles.footer}>
          <p>
            Emergency crisis helpline: <a href={`tel:${en.emergency.police.number}`}>Police: {en.emergency.police.number}</a> ·{' '}
            <a href={`tel:${en.emergency.antiRagging.number}`}>Anti-Ragging: {en.emergency.antiRagging.number}</a>
          </p>
        </footer>
      </div>
    </div>
  );
}
