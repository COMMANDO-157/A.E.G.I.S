/**
 * A.E.G.I.S 4.0 — Dean Portal Layout
 * Route: /dean
 * Clearance: role === 'Dean'
 */

import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { MobileNav } from '@/components/navigation/MobileNav';
import { Button } from '@/components/ui/Button';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import styles from './AuthorityLayout.module.css';

export default function DeanLayout() {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { to: '/dean', label: 'Dean Dashboard', end: true, icon: '📊' },
    { to: '/dean/cases', label: 'Escalated Cases (72h SLA)', icon: '📋' },
    { to: '/dean/students', label: 'Student Claims Review', icon: '🎓' },
    { to: '/dean/review', label: 'Findings & Resolution', icon: '🔍' },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const getBreadcrumbs = () => {
    const crumbs: { label: string; to?: string | undefined }[] = [
      { label: 'Dean Portal', to: '/dean' },
    ];
    if (location.pathname === '/dean/cases') {
      crumbs.push({ label: 'Escalated Cases' });
    } else if (location.pathname === '/dean/students') {
      crumbs.push({ label: 'Student Claims' });
    } else if (location.pathname === '/dean/review') {
      crumbs.push({ label: 'Findings & Resolution' });
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
          <strong>{t.app.name} Dean Portal</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
          <LanguageSelector variant="light" />
          <MobileNav
            items={navItems}
            portalTitle="Dean Portal"
            portalBadge="Dean"
            footerContent={
              <Button variant="outline" size="sm" fullWidth onClick={handleLogout}>
                {t.common.signOut}
              </Button>
            }
          />
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className={styles.sidebar} aria-label="Dean portal navigation">
        <div className={styles.sidebarBrand}>
          <Link to="/dean" aria-label="A.E.G.I.S Dean portal home">
            <span className={styles.brandMark} aria-hidden="true">🛡️</span>
            <span className={styles.brandText}>{t.app.name}</span>
          </Link>
          <span className={styles.brandPortal} style={{ background: 'var(--aegis-navy-800)', color: 'white' }}>
            DEAN OF STUDENTS
          </span>
          <span className={styles.motto}>Tier 2 Campus-Wide Oversight</span>
        </div>

        <nav className={styles.nav} aria-label="Navigation">
          {navItems.map((item) => (
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
          <div style={{ marginBottom: 'var(--spacing-3)' }}>
            <LanguageSelector variant="dark" />
          </div>
          <div className={styles.userInfo}>
            <p className={styles.userName}>{user?.name}</p>
            <p className={styles.userRole}>Dean of Students</p>
            <p className={styles.userDept}>Institution-Wide Clearance</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            style={{ color: 'var(--aegis-neutral-200)', justifyContent: 'flex-start', paddingLeft: 0 }}
          >
            {t.common.signOut}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <div className={styles.mainInner}>
          {location.pathname !== '/dean' && <Breadcrumbs items={getBreadcrumbs()} />}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
