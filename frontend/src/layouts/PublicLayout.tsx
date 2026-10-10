/**
 * A.E.G.I.S 4.0 — Public Website Layout Shell
 * WP-4.1.3 | Professional Public Website Redesign
 *
 * Provides the shared public navigation, emergency helpline alert strip,
 * accessible mobile navigation drawer, and comprehensive institutional footer.
 */

import { Link, NavLink, Outlet } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';
import { MobileNav } from '@/components/navigation/MobileNav';
import { Button } from '@/components/ui/Button';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import styles from './PublicLayout.module.css';

export default function PublicLayout() {
  const { t } = useLocale();

  const publicNavItems = [
    { to: '/', label: t.nav.home, end: true, icon: '🛡️' },
    { to: '/about', label: t.nav.about, icon: '🏛️' },
    { to: '/safety', label: t.nav.safety, icon: '🆘' },
    { to: '/register', label: t.nav.register, icon: '📝' },
  ];
  return (
    <div className={styles.shell}>
      {/* Skip link for keyboard navigation */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Emergency Alert Strip */}
      <aside className={styles.emergencyStrip} aria-label="Urgent Safety Notice">
        <div className={styles.emergencyStripInner}>
          <span>
            ⚠️ <strong>Emergency?</strong> If you are in active physical danger, call emergency services immediately:
          </span>
          <span>
            {t.emergency.police.label}:{' '}
            <a href={`tel:${t.emergency.police.number}`} className={styles.emergencyPhone}>
              {t.emergency.police.number}
            </a>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t.emergency.antiRagging.label}:{' '}
            <a href={`tel:${t.emergency.antiRagging.number}`} className={styles.emergencyPhone}>
              {t.emergency.antiRagging.number}
            </a>
          </span>
        </div>
      </aside>

      {/* Public Header */}
      <header className={styles.header} role="banner">
        <div className={styles.headerInner}>
          {/* Brand */}
          <Link to="/" className={styles.brand} aria-label="A.E.G.I.S Home">
            <span className={styles.brandShield} aria-hidden="true">🛡️</span>
            <div className={styles.brandTextGroup}>
              <span className={styles.brandName}>{t.app.name}</span>
              <span className={styles.brandTagline}>Campus Safety &amp; Grievance Shield</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className={styles.desktopNav} aria-label="Main Public Navigation">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                [styles.navLink, isActive ? styles.navActive : ''].filter(Boolean).join(' ')
              }
            >
              {t.nav.home}
            </NavLink>
            <NavLink
              to="/about"
              className={({ isActive }) =>
                [styles.navLink, isActive ? styles.navActive : ''].filter(Boolean).join(' ')
              }
            >
              {t.nav.about}
            </NavLink>
            <NavLink
              to="/safety"
              className={({ isActive }) =>
                [styles.navLink, isActive ? styles.navActive : ''].filter(Boolean).join(' ')
              }
            >
              {t.nav.safety}
            </NavLink>
          </nav>

          {/* Actions & Mobile Nav */}
          <div className={styles.headerActions}>
            <LanguageSelector variant="light" />
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="sm">
                {t.nav.login}
              </Button>
            </Link>
            <Link to="/register" style={{ textDecoration: 'none' }}>
              <Button variant="primary" size="sm">
                {t.nav.getStarted}
              </Button>
            </Link>

            <MobileNav
              items={publicNavItems}
              portalTitle={t.app.name}
              portalBadge="Public"
              footerContent={
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
                  <Link to="/login" style={{ textDecoration: 'none' }}>
                    <Button variant="primary" size="sm" fullWidth>
                      {t.nav.login}
                    </Button>
                  </Link>
                </div>
              }
            />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>

      {/* Comprehensive Public Footer */}
      <footer className={styles.footer} role="contentinfo">
        <div className={styles.footerInner}>
          <div className={styles.footerGrid}>
            {/* Col 1: Platform Summary */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', marginBottom: 'var(--spacing-2)' }}>
                <span style={{ fontSize: '1.5rem' }} aria-hidden="true">🛡️</span>
                <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--aegis-neutral-0)' }}>
                  {t.app.name}
                </span>
              </div>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--aegis-navy-200)', lineHeight: 'var(--line-height-relaxed)', maxWidth: 360 }}>
                {t.app.fullName}. {t.app.motto} A structured, confidential grievance management and incident response shield.
              </p>
            </div>

            {/* Col 2: Navigation Links */}
            <div>
              <div className={styles.footerColTitle}>Navigation</div>
              <ul className={styles.footerLinksList}>
                <li><Link to="/" className={styles.footerLink}>{t.nav.home}</Link></li>
                <li><Link to="/about" className={styles.footerLink}>{t.nav.about}</Link></li>
                <li><Link to="/safety" className={styles.footerLink}>{t.nav.safety}</Link></li>
                <li><Link to="/register" className={styles.footerLink}>{t.nav.register}</Link></li>
              </ul>
            </div>

            {/* Col 3: Portals */}
            <div>
              <div className={styles.footerColTitle}>Portals</div>
              <ul className={styles.footerLinksList}>
                <li><Link to="/login" className={styles.footerLink}>Institutional Sign-In</Link></li>
                <li><Link to="/student" className={styles.footerLink}>Student Portal</Link></li>
                <li><Link to="/authority" className={styles.footerLink}>Authority Portal</Link></li>
                <li><Link to="/admin" className={styles.footerLink}>Administrative Console</Link></li>
              </ul>
            </div>

            {/* Col 4: Verified Helplines Card */}
            <div>
              <div className={styles.footerColTitle}>Emergency Helplines</div>
              <div className={styles.emergencyCard}>
                <div><strong>Police Dispatch:</strong> <a href="tel:100" style={{ color: '#86EFAC' }}>100</a> / <a href="tel:112" style={{ color: '#86EFAC' }}>112</a></div>
                <div><strong>Anti-Ragging Helpline:</strong> <a href="tel:1800-180-5522" style={{ color: '#86EFAC' }}>1800-180-5522</a></div>
                <div><strong>Women Helpline:</strong> <a href="tel:1091" style={{ color: '#86EFAC' }}>1091</a></div>
                <div><strong>MHRD Student Grievance:</strong> <a href="tel:1800-891-4132" style={{ color: '#86EFAC' }}>1800-891-4132</a></div>
              </div>
            </div>
          </div>

          {/* Legal / Policy Disclaimer */}
          <div className={styles.disclaimerBar}>
            <div>{t.common.allRightsReserved}</div>
            <div style={{ maxWidth: 640 }}>
              <em>Notice:</em> {t.emergency.disclaimer}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
