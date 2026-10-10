/**
 * A.E.G.I.S 4.0 — Public Home Page
 * WP-4.1.3 | Professional Public Website
 *
 * Professional landing page communicating student protection, confidentiality,
 * institutional credibility, and transparent grievance escalation.
 */

import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { en } from '@/locales/en';
import { Button } from '@/components/ui/Button';
import { PageContainer } from '@/components/ui/PageContainer';
import styles from './LandingPage.module.css';

export default function LandingPage() {
  const { isAuthenticated, user } = useAuth();

  const getPortalTarget = () => {
    if (!isAuthenticated || !user) return '/login';
    if (user.role === 'admin') return '/admin';
    if (['HOD', 'Dean', 'Higher Authority'].includes(user.role)) return '/authority';
    return '/student';
  };

  return (
    <div className={styles.page}>
      {/* ─── Hero Section ────────────────────────────────────────── */}
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroInner}>
          <div className={styles.heroBadge}>
            <span aria-hidden="true">🛡️</span>
            <span>{en.home.heroBadge}</span>
          </div>

          <h1 id="hero-title" className={styles.heroTitle}>
            {en.home.heroTitle}
          </h1>

          <p className={styles.heroTagline}>{en.home.heroTagline}</p>

          <p className={styles.heroSubtitle}>{en.home.heroSubtitle}</p>

          <div className={styles.heroActions}>
            {isAuthenticated ? (
              <Link to={getPortalTarget()} style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="lg" rightIcon={<span aria-hidden="true">→</span>}>
                  {en.nav.dashboard}
                </Button>
              </Link>
            ) : (
              <Link to="/login" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="lg" rightIcon={<span aria-hidden="true">→</span>}>
                  {en.home.getStartedCta}
                </Button>
              </Link>
            )}

            <Link to="/about" style={{ textDecoration: 'none' }}>
              <Button variant="secondary" size="lg">
                {en.home.learnMoreCta}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Core Platform Capabilities ───────────────────────────── */}
      <section className={styles.section} aria-labelledby="capabilities-title">
        <PageContainer>
          <div className={styles.sectionHeader}>
            <h2 id="capabilities-title" className={styles.sectionTitle}>
              {en.home.capabilitiesTitle}
            </h2>
            <p className={styles.sectionSubtitle}>
              {en.home.capabilitiesSubtitle}
            </p>
          </div>

          <div className={styles.gridCards}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon} aria-hidden="true">🔒</div>
              <h3 className={styles.featureTitle}>Confidential Identity Modes</h3>
              <p className={styles.featureText}>
                Submit reports using standard, confidential, or anonymous identities.
                Access controls prevent unauthorized peers or faculty from viewing sensitive reporter records.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon} aria-hidden="true">⏱️</div>
              <h3 className={styles.featureTitle}>Automated Escalation Timers</h3>
              <p className={styles.featureText}>
                Every grievance carries an institutional SLA countdown. If a tier fails to act within the mandatory window,
                the case escalates autonomously to higher administrative tiers.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon} aria-hidden="true">📜</div>
              <h3 className={styles.featureTitle}>Immutable Audit Trails</h3>
              <p className={styles.featureText}>
                All case movements, tier escalations, and status transitions are recorded in permanent tamper-evident audit logs
                to ensure total institutional accountability.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon} aria-hidden="true">⚖️</div>
              <h3 className={styles.featureTitle}>Three-Tier Administrative Hierarchy</h3>
              <p className={styles.featureText}>
                Grievances are directed based on severity: Head of Department (Tier 1), Dean of Students (Tier 2),
                and Senior Institutional Authorities (Tier 3).
              </p>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* ─── How A.E.G.I.S Works ──────────────────────────────────── */}
      <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="how-it-works-title">
        <PageContainer>
          <div className={styles.sectionHeader}>
            <h2 id="how-it-works-title" className={styles.sectionTitle}>
              {en.home.howItWorksTitle}
            </h2>
            <p className={styles.sectionSubtitle}>
              {en.home.howItWorksSubtitle}
            </p>
          </div>

          <div className={styles.workflowGrid}>
            <div className={styles.workflowStep}>
              <div className={styles.stepNumber} aria-hidden="true">1</div>
              <h3 className={styles.featureTitle}>{en.home.step1Title}</h3>
              <p className={styles.featureText}>{en.home.step1Desc}</p>
            </div>

            <div className={styles.workflowStep}>
              <div className={styles.stepNumber} aria-hidden="true">2</div>
              <h3 className={styles.featureTitle}>{en.home.step2Title}</h3>
              <p className={styles.featureText}>{en.home.step2Desc}</p>
            </div>

            <div className={styles.workflowStep}>
              <div className={styles.stepNumber} aria-hidden="true">3</div>
              <h3 className={styles.featureTitle}>{en.home.step3Title}</h3>
              <p className={styles.featureText}>{en.home.step3Desc}</p>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* ─── Confidentiality Information ──────────────────────────── */}
      <section className={styles.section} aria-labelledby="confidentiality-title">
        <PageContainer>
          <div className={styles.confidentialityCard}>
            <div className={styles.confidentialityText}>
              <h2 id="confidentiality-title" className={styles.sectionTitle} style={{ textAlign: 'left' }}>
                {en.home.confidentialityTitle}
              </h2>
              <p className={styles.sectionSubtitle} style={{ textAlign: 'left', marginBottom: 0 }}>
                {en.home.confidentialityDesc}
              </p>
            </div>
            <Link to="/about" style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="md" rightIcon={<span aria-hidden="true">→</span>}>
                Learn About Institutional Governance
              </Button>
            </Link>
          </div>
        </PageContainer>
      </section>

      {/* ─── Safety & Support Resource Callout ──────────────────────── */}
      <section className={styles.section} style={{ paddingTop: 0 }} aria-labelledby="safety-callout-title">
        <PageContainer>
          <div className={styles.safetyCallout}>
            <div>
              <h2 id="safety-callout-title" style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-danger-text)', margin: '0 0 var(--spacing-2)' }}>
                🚨 {en.home.safetyBannerTitle}
              </h2>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', maxWidth: '640px' }}>
                {en.home.safetyBannerDesc}
              </p>
            </div>
            <Link to="/safety" style={{ textDecoration: 'none' }}>
              <Button variant="destructive" size="md" rightIcon={<span aria-hidden="true">→</span>}>
                {en.home.safetyBannerCta}
              </Button>
            </Link>
          </div>
        </PageContainer>
      </section>
    </div>
  );
}
