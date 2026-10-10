/**
 * A.E.G.I.S 4.0 — Student Portal Layout
 * WP-4.1.2 | Guardian Design System Visual Foundation
 *
 * Identity: Calm, supportive, confidential.
 * Motto: "Your Voice. Your Safety. Your Protection."
 */

import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { MobileNav } from '@/components/navigation/MobileNav';
import { Button } from '@/components/ui/Button';
import styles from './StudentLayout.module.css';

const NAV_ITEMS = [
  { to: '/student', label: 'Dashboard', end: true, icon: '🏠' },
  { to: '/student/report', label: 'Report an Incident', icon: '📝' },
  { to: '/student/track', label: 'Track Cases', icon: '🔍' },
];

export default function StudentLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const getBreadcrumbs = () => {
    const crumbs: { label: string; to?: string | undefined }[] = [
      { label: 'Student Portal', to: '/student' },
    ];
    if (location.pathname === '/student/report') {
      crumbs.push({ label: 'Report an Incident' });
    } else if (location.pathname === '/student/track') {
      crumbs.push({ label: 'Track Cases' });
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
              <span className={styles.brandText}>A.E.G.I.S</span>
              <span className={styles.brandPortal}>Student</span>
            </Link>
            <span className={styles.motto}>Your Voice. Your Safety. Your Protection.</span>
          </div>

          {/* Desktop Navigation */}
          <nav aria-label="Student portal navigation" className={styles.nav}>
            {NAV_ITEMS.map((item) => (
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
            <span className={styles.userName}>{user?.name}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
            >
              Sign Out
            </Button>
            <MobileNav
              items={NAV_ITEMS}
              portalTitle="Student Portal"
              portalBadge="Student"
              footerContent={
                <Button variant="outline" size="sm" fullWidth onClick={handleLogout}>
                  Sign Out
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
          Your reports are confidential. A.E.G.I.S is here to protect you.
        </p>
        <p className={styles.footerLinks}>
          <a href="tel:100">Police Emergency: 100</a>
          <span aria-hidden="true"> · </span>
          <a href="tel:1800-180-5522">National Anti-Ragging: 1800-180-5522</a>
          <span aria-hidden="true"> · </span>
          <a href="tel:1800-891-4132">MHRD Helpline: 1800-891-4132</a>
        </p>
      </footer>
    </div>
  );
}
