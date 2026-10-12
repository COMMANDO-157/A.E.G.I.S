/**
 * A.E.G.I.S 4.0 — Head of Department (HOD) Portal Layout
 * Route: /hod
 * Clearance: role === 'HOD'
 */

import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { MobileNav } from '@/components/navigation/MobileNav';
import { Button } from '@/components/ui/Button';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import styles from './AuthorityLayout.module.css';

export default function HodLayout() {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { to: '/hod', label: 'Department Dashboard', end: true, icon: '📊' },
    { to: '/hod/cases', label: 'Department Grievances (48h SLA)', icon: '📋' },
    { to: '/hod/students', label: 'Student Verifications', icon: '🎓' },
    { to: '/hod/review', label: 'Findings & Decisions', icon: '🔍' },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const getBreadcrumbs = () => {
    const crumbs: { label: string; to?: string | undefined }[] = [
      { label: 'HOD Portal', to: '/hod' },
    ];
    if (location.pathname === '/hod/cases') {
      crumbs.push({ label: 'Department Grievances' });
    } else if (location.pathname === '/hod/students') {
      crumbs.push({ label: 'Student Verifications' });
    } else if (location.pathname === '/hod/review') {
      crumbs.push({ label: 'Findings & Reviews' });
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
          <strong>{t.app.name} HOD Portal</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
          <LanguageSelector variant="light" />
          <MobileNav
            items={navItems}
            portalTitle="HOD Portal"
            portalBadge="HOD"
            footerContent={
              <Button variant="outline" size="sm" fullWidth onClick={handleLogout}>
                {t.common.signOut}
              </Button>
            }
          />
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className={styles.sidebar} aria-label="HOD portal navigation">
        <div className={styles.sidebarBrand}>
          <Link to="/hod" aria-label="A.E.G.I.S HOD portal home">
            <span className={styles.brandMark} aria-hidden="true">🛡️</span>
            <span className={styles.brandText}>{t.app.name}</span>
          </Link>
          <span className={styles.brandPortal} style={{ background: 'var(--aegis-teal-700)', color: 'white' }}>
            HEAD OF DEPARTMENT
          </span>
          <span className={styles.motto}>Tier 1 Departmental Jurisdiction</span>
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
            <p className={styles.userRole}>Head of Department</p>
            <p className={styles.userDept}>Dept: {user?.department || user?.department_code || 'Assigned'}</p>
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
          {location.pathname !== '/hod' && <Breadcrumbs items={getBreadcrumbs()} />}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
