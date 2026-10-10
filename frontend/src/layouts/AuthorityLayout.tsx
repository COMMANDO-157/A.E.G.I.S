/**
 * A.E.G.I.S 4.0 — Authority Portal Layout
 * WP-4.1.2 | Guardian Design System Visual Foundation
 *
 * Identity: Structured, analytical, efficient.
 * Motto: "Assess. Protect. Resolve."
 */

import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { MobileNav } from '@/components/navigation/MobileNav';
import { Button } from '@/components/ui/Button';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import styles from './AuthorityLayout.module.css';

export default function AuthorityLayout() {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();

  const roleLabels: Record<string, string> = {
    HOD: t.roles.HOD,
    Dean: t.roles.Dean,
    'Higher Authority': t.roles['Higher Authority'],
  };

  const navItems = [
    { to: '/authority', label: t.common.dashboard, end: true, icon: '📊' },
    { to: '/authority/cases', label: t.authority.assignedCasesTitle, icon: '📋' },
    { to: '/authority/review', label: t.authority.verificationReviewsTitle, icon: '🔍' },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const roleLabel = user ? (roleLabels[user.role] ?? user.role) : '';

  const getBreadcrumbs = () => {
    const crumbs: { label: string; to?: string | undefined }[] = [
      { label: `${t.authority.portalBadge}`, to: '/authority' },
    ];
    if (location.pathname === '/authority/cases') {
      crumbs.push({ label: t.authority.assignedCasesTitle });
    } else if (location.pathname === '/authority/review') {
      crumbs.push({ label: t.authority.verificationReviewsTitle });
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
          <strong>{t.app.name} {t.authority.portalBadge}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
          <LanguageSelector variant="light" />
          <MobileNav
            items={navItems}
            portalTitle={`${t.authority.portalBadge}`}
            portalBadge="Authority"
            footerContent={
              <Button variant="outline" size="sm" fullWidth onClick={handleLogout}>
                {t.common.signOut}
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
            <span className={styles.brandText}>{t.app.name}</span>
          </Link>
          <span className={styles.brandPortal}>{t.authority.portalBadge}</span>
          <span className={styles.motto}>{t.taglines.authority}</span>
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
            <p className={styles.userRole}>{roleLabel}</p>
            <p className={styles.userDept}>{user?.department}</p>
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
          {location.pathname !== '/authority' && <Breadcrumbs items={getBreadcrumbs()} />}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
