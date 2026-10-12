/**
 * A.E.G.I.S 4.0 — Primary Owner Portal Layout
 * Route: /owner
 * Clearance: Primary Owner Only
 */

import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { MobileNav } from '@/components/navigation/MobileNav';
import { Button } from '@/components/ui/Button';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import styles from './OwnerLayout.module.css';

export default function PrimaryOwnerLayout() {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { to: '/owner', label: 'System Overview', end: true, icon: '🏛️' },
    { to: '/owner/users', label: 'User & Role Management', icon: '👥' },
    { to: '/owner/roster-conflicts', label: 'Institutional Rosters', icon: '📋' },
    { to: '/owner/cases', label: 'System Cases & SLA', icon: '📊' },
    { to: '/owner/audit', label: 'Audit Log Ledger', icon: '📜' },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const getBreadcrumbs = () => {
    const crumbs: { label: string; to?: string | undefined }[] = [
      { label: 'Primary Owner', to: '/owner' },
    ];
    if (location.pathname === '/owner/users') {
      crumbs.push({ label: 'Users & Roles' });
    } else if (location.pathname === '/owner/cases') {
      crumbs.push({ label: 'System Cases' });
    } else if (location.pathname === '/owner/audit') {
      crumbs.push({ label: 'Audit Ledger' });
    } else if (location.pathname === '/owner/roster-conflicts') {
      crumbs.push({ label: 'Roster & Conflicts' });
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
            <Link to="/owner" className={styles.brand} aria-label="A.E.G.I.S Primary Owner home">
              <span className={styles.brandMark} aria-hidden="true">🛡️</span>
              <span className={styles.brandText}>{t.app.name}</span>
              <span className={styles.brandPortal} style={{ background: 'var(--aegis-amber-500)', color: 'black' }}>
                PRIMARY OWNER
              </span>
            </Link>
            <span className={styles.motto}>Institutional Command & Governance</span>
          </div>

          <nav className={styles.nav} aria-label="Primary Owner portal navigation">
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

          <div className={styles.userMenu}>
            <LanguageSelector variant="dark" />
            <div className={styles.userBadge} aria-label="Logged in as Primary Owner">
              <span className={styles.userEmail}>{user?.email}</span>
              <span className={styles.adminBadge} style={{ background: 'var(--aegis-amber-400)', color: 'black' }}>
                OWNER
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              style={{ color: 'var(--aegis-neutral-100)', borderColor: 'rgba(255,255,255,0.2)' }}
            >
              {t.common.signOut}
            </Button>
            <MobileNav
              items={navItems}
              portalTitle="Primary Owner Portal"
              portalBadge="Owner"
              footerContent={
                <Button variant="outline" size="sm" fullWidth onClick={handleLogout}>
                  {t.common.signOut}
                </Button>
              }
            />
          </div>
        </div>
      </header>

      {/* Main */}
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <div className={styles.mainInner}>
          {location.pathname !== '/owner' && <Breadcrumbs items={getBreadcrumbs()} />}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
