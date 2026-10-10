/**
 * A.E.G.I.S 4.0 — Owner/Admin Portal Layout
 * WP-4.1.2 | Guardian Design System Visual Foundation
 *
 * Identity: Administrative, secure, controlled.
 * Motto: "Govern. Secure. Oversee."
 */

import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { MobileNav } from '@/components/navigation/MobileNav';
import { Button } from '@/components/ui/Button';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import styles from './OwnerLayout.module.css';

export default function OwnerLayout() {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { to: '/admin', label: t.admin.overviewTitle, end: true, icon: '🏛️' },
    { to: '/admin/users', label: t.admin.usersBadge, icon: '👥' },
    { to: '/admin/cases', label: t.admin.casesBadge, icon: '📊' },
    { to: '/admin/audit', label: t.admin.auditBadge, icon: '📜' },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const getBreadcrumbs = () => {
    const crumbs: { label: string; to?: string | undefined }[] = [
      { label: `${t.admin.badge}`, to: '/admin' },
    ];
    if (location.pathname === '/admin/users') {
      crumbs.push({ label: t.admin.usersBadge });
    } else if (location.pathname === '/admin/cases') {
      crumbs.push({ label: t.admin.casesBadge });
    } else if (location.pathname === '/admin/audit') {
      crumbs.push({ label: t.admin.auditBadge });
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
              <span className={styles.brandText}>{t.app.name}</span>
              <span className={styles.brandPortal}>{t.admin.badge}</span>
            </Link>
            <span className={styles.motto}>{t.taglines.owner}</span>
          </div>

          <nav className={styles.nav} aria-label="Admin portal navigation">
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
              {t.common.signOut}
            </Button>
            <MobileNav
              items={navItems}
              portalTitle={`${t.admin.badge}`}
              portalBadge="Admin"
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
          {location.pathname !== '/admin' && <Breadcrumbs items={getBreadcrumbs()} />}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
