/**
 * A.E.G.I.S 4.0 — Authority Portal Layout
 * WP-4.1.2 | Guardian Design System Visual Foundation
 *
 * Identity: Structured, analytical, efficient.
 * Motto: "Assess. Protect. Resolve."
 */

import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { MobileNav } from '@/components/navigation/MobileNav';
import { Button } from '@/components/ui/Button';
import styles from './AuthorityLayout.module.css';

const ROLE_LABELS: Record<string, string> = {
  HOD: 'Head of Department',
  Dean: 'Dean of Students',
  'Higher Authority': 'Senior Authority',
};

const NAV_ITEMS = [
  { to: '/authority', label: 'Dashboard', end: true, icon: '📊' },
  { to: '/authority/cases', label: 'Active Cases', icon: '📋' },
  { to: '/authority/review', label: 'Verification Review', icon: '🔍' },
];

export default function AuthorityLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const roleLabel = user ? (ROLE_LABELS[user.role] ?? user.role) : '';

  const getBreadcrumbs = () => {
    const crumbs: { label: string; to?: string | undefined }[] = [
      { label: 'Authority Portal', to: '/authority' },
    ];
    if (location.pathname === '/authority/cases') {
      crumbs.push({ label: 'Active Cases' });
    } else if (location.pathname === '/authority/review') {
      crumbs.push({ label: 'Verification Review' });
    }
    return crumbs;
  };

  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Mobile Top Bar */}
      <div className={styles.mobileBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
          <span aria-hidden="true">🛡️</span>
          <strong>A.E.G.I.S Authority</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
          <MobileNav
            items={NAV_ITEMS}
            portalTitle="Authority Portal"
            portalBadge="Authority"
            footerContent={
              <Button variant="outline" size="sm" fullWidth onClick={handleLogout}>
                Sign Out
              </Button>
            }
          />
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className={styles.sidebar} aria-label="Authority portal navigation">
        <div className={styles.sidebarBrand}>
          <Link to="/authority" aria-label="A.E.G.I.S authority portal home">
            <span className={styles.brandMark} aria-hidden="true">🛡️</span>
            <span className={styles.brandText}>A.E.G.I.S</span>
          </Link>
          <span className={styles.brandPortal}>Authority</span>
          <span className={styles.motto}>Assess. Protect. Resolve.</span>
        </div>

        <nav className={styles.nav} aria-label="Navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                [styles.navLink, isActive ? styles.navActive : ''].filter(Boolean).join(' ')
              }
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User info at bottom of sidebar */}
        <div className={styles.sidebarUser}>
          <div className={styles.userInfo}>
            <p className={styles.userName}>{user?.name}</p>
            <p className={styles.userRole}>{roleLabel}</p>
            <p className={styles.userDept}>{user?.department}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            style={{ color: 'var(--aegis-neutral-200)', justifyContent: 'flex-start', paddingLeft: 0 }}
          >
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <div className={styles.mainInner}>
          {location.pathname !== '/authority' && <Breadcrumbs items={getBreadcrumbs()} />}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
