/**
 * A.E.G.I.S 4.0 — Student Portal Layout
 * WP-4.1.2 | Guardian Design System Visual Foundation
 *
 * Identity: Calm, supportive, confidential.
 * Motto: "Your Voice. Your Safety. Your Protection."
 */

import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { MobileNav } from '@/components/navigation/MobileNav';
import { Button } from '@/components/ui/Button';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import styles from './StudentLayout.module.css';

export default function StudentLayout() {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { to: '/student', label: t.common.dashboard, end: true, icon: '🏠' },
    { to: '/student/report', label: t.common.reportIncident, icon: '📝' },
    { to: '/student/track', label: t.common.trackCases, icon: '🔍' },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const getBreadcrumbs = () => {
    const crumbs: { label: string; to?: string | undefined }[] = [
      { label: `${t.roles.student} Portal`, to: '/student' },
    ];
    if (location.pathname === '/student/report') {
      crumbs.push({ label: t.common.reportIncident });
    } else if (location.pathname === '/student/track') {
      crumbs.push({ label: t.common.trackCases });
    }
    return crumbs;
  };

  return (
    <div className={styles.shell}>
      {/* Skip link for keyboard accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Navigation Header */}
      <header className={styles.header} role="banner">
        <div className={styles.headerInner}>
          {/* Brand */}
          <div className={styles.brandGroup}>
            <Link to="/student" className={styles.brand} aria-label="A.E.G.I.S student portal home">
              <span className={styles.brandMark} aria-hidden="true">🛡️</span>
              <span className={styles.brandText}>{t.app.name}</span>
              <span className={styles.brandPortal}>{t.roles.student}</span>
            </Link>
            <span className={styles.motto}>{t.app.motto}</span>
          </div>

          {/* Desktop Navigation */}
          <nav aria-label="Student portal navigation" className={styles.nav}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) =>
                  [styles.navLink, isActive ? styles.navActive : ''].filter(Boolean).join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* User Controls & Mobile Nav Trigger */}
          <div className={styles.userMenu}>
            <LanguageSelector variant="light" />
            <span className={styles.userName}>{user?.name}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
            >
              {t.common.signOut}
            </Button>
            <MobileNav
              items={navItems}
              portalTitle={`${t.roles.student} Portal`}
              portalBadge={t.roles.student}
              footerContent={
                <Button variant="outline" size="sm" fullWidth onClick={handleLogout}>
                  {t.common.signOut}
                </Button>
              }
            />
          </div>
        </div>
      </header>

      {/* Breadcrumb Trail */}
      {location.pathname !== '/student' && (
        <div className={styles.breadcrumbsContainer}>
          <Breadcrumbs items={getBreadcrumbs()} />
        </div>
      )}

      {/* Main content */}
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>

      {/* Footer */}
      <footer className={styles.footer} role="contentinfo">
        <p className={styles.footerText}>
          {t.common.confidentialNotice}
        </p>
        <p className={styles.footerLinks}>
          <a href={`tel:${t.emergency.police.number}`}>{t.emergency.police.label}: {t.emergency.police.number}</a>
          <span aria-hidden="true"> · </span>
          <a href={`tel:${t.emergency.antiRagging.number}`}>{t.emergency.antiRagging.label}: {t.emergency.antiRagging.number}</a>
          <span aria-hidden="true"> · </span>
          <a href={`tel:${t.emergency.mhrd.number}`}>{t.emergency.mhrd.label}: {t.emergency.mhrd.number}</a>
        </p>
      </footer>
    </div>
  );
}
