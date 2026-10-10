/**
 * A.E.G.I.S 4.0 — Owner/Admin Portal Layout
 * WP-4.1.2 | Guardian Design System Visual Foundation
 *
 * Identity: Administrative, secure, controlled.
 * Motto: "Govern. Secure. Oversee."
 */

import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { MobileNav } from '@/components/navigation/MobileNav';
import { Button } from '@/components/ui/Button';
import styles from './OwnerLayout.module.css';

const NAV_ITEMS = [
  { to: '/admin', label: 'Overview', end: true, icon: '🏛️' },
  { to: '/admin/users', label: 'User Management', icon: '👥' },
  { to: '/admin/cases', label: 'All Cases', icon: '📊' },
  { to: '/admin/audit', label: 'Audit Log', icon: '📜' },
];

export default function OwnerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const getBreadcrumbs = () => {
    const crumbs: { label: string; to?: string | undefined }[] = [
      { label: 'Admin Portal', to: '/admin' },
    ];
    if (location.pathname === '/admin/users') {
      crumbs.push({ label: 'User Management' });
    } else if (location.pathname === '/admin/cases') {
      crumbs.push({ label: 'All Cases' });
    } else if (location.pathname === '/admin/audit') {
      crumbs.push({ label: 'Audit Log' });
    }
    return crumbs;
  };

  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Header */}
      <header className={styles.header} role="banner">
        <div className={styles.headerInner}>
          <div className={styles.brandGroup}>
            <Link to="/admin" className={styles.brand} aria-label="A.E.G.I.S admin portal home">
              <span className={styles.brandMark} aria-hidden="true">🛡️</span>
              <span className={styles.brandText}>A.E.G.I.S</span>
              <span className={styles.brandPortal}>Owner Admin</span>
            </Link>
            <span className={styles.motto}>Govern. Secure. Oversee.</span>
          </div>

          <nav className={styles.nav} aria-label="Admin portal navigation">
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

          <div className={styles.userMenu}>
            <div className={styles.userBadge} aria-label="Logged in as admin">
              <span className={styles.userEmail}>{user?.email}</span>
              <span className={styles.adminBadge}>ADMIN</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              style={{ color: 'var(--aegis-neutral-100)', borderColor: 'rgba(255,255,255,0.2)' }}
            >
              Sign Out
            </Button>
            <MobileNav
              items={NAV_ITEMS}
              portalTitle="Admin Portal"
              portalBadge="Admin"
              footerContent={
                <Button variant="outline" size="sm" fullWidth onClick={handleLogout}>
                  Sign Out
                </Button>
              }
            />
          </div>
        </div>
      </header>

      {/* Main */}
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <div className={styles.mainInner}>
          {location.pathname !== '/admin' && <Breadcrumbs items={getBreadcrumbs()} />}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
