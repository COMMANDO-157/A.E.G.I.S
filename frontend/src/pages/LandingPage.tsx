/**
 * A.E.G.I.S 4.0 — Public Home Page
 * WP-4.1.3 | Professional Public Website
 *
 * Professional landing page communicating student protection, confidentiality,
 * institutional credibility, and transparent grievance escalation.
 */

import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { Button } from '@/components/ui/Button';
import { PageContainer } from '@/components/ui/PageContainer';
import styles from './LandingPage.module.css';

export default function LandingPage() {
  const { isAuthenticated, user } = useAuth();
  const { t } = useLocale();

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
            <span>{t.home.heroBadge}</span>
          </div>

          <h1 id="hero-title" className={styles.heroTitle}>
            {t.home.heroTitle}
          </h1>

          <p className={styles.heroTagline}>{t.home.heroTagline}</p>

          <p className={styles.heroSubtitle}>{t.home.heroSubtitle}</p>

          <div className={styles.heroActions}>
            {isAuthenticated ? (
              <Link to={getPortalTarget()} style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="lg" rightIcon={<span aria-hidden="true">→</span>}>
                  {t.nav.dashboard}
                </Button>
              </Link>
            ) : (
              <Link to="/login" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="lg" rightIcon={<span aria-hidden="true">→</span>}>
                  {t.home.getStartedCta}
                </Button>
              </Link>
            )}

            <Link to="/about" style={{ textDecoration: 'none' }}>
              <Button variant="secondary" size="lg">
                {t.home.learnMoreCta}
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
              {t.home.capabilitiesTitle}
            </h2>
            <p className={styles.sectionSubtitle}>
              {t.home.capabilitiesSubtitle}
            </p>
          </div>

          <div className={styles.gridCards}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon} aria-hidden="true">🔒</div>
              <h3 className={styles.featureTitle}>{t.home.feature1Title}</h3>
              <p className={styles.featureText}>{t.home.feature1Desc}</p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon} aria-hidden="true">⏱️</div>
              <h3 className={styles.featureTitle}>{t.home.feature2Title}</h3>
              <p className={styles.featureText}>{t.home.feature2Desc}</p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon} aria-hidden="true">📜</div>
              <h3 className={styles.featureTitle}>{t.home.feature3Title}</h3>
              <p className={styles.featureText}>{t.home.feature3Desc}</p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon} aria-hidden="true">⚖️</div>
              <h3 className={styles.featureTitle}>{t.home.feature4Title}</h3>
              <p className={styles.featureText}>{t.home.feature4Desc}</p>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* ─── How A.E.G.I.S Works ──────────────────────────────────── */}
      <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="how-it-works-title">
        <PageContainer>
          <div className={styles.sectionHeader}>
            <h2 id="how-it-works-title" className={styles.sectionTitle}>
              {t.home.howItWorksTitle}
            </h2>
            <p className={styles.sectionSubtitle}>
              {t.home.howItWorksSubtitle}
            </p>
          </div>

          <div className={styles.workflowGrid}>
            <div className={styles.workflowStep}>
              <div className={styles.stepNumber} aria-hidden="true">1</div>
              <h3 className={styles.featureTitle}>{t.home.step1Title}</h3>
              <p className={styles.featureText}>{t.home.step1Desc}</p>
            </div>

            <div className={styles.workflowStep}>
              <div className={styles.stepNumber} aria-hidden="true">2</div>
              <h3 className={styles.featureTitle}>{t.home.step2Title}</h3>
              <p className={styles.featureText}>{t.home.step2Desc}</p>
            </div>

            <div className={styles.workflowStep}>
              <div className={styles.stepNumber} aria-hidden="true">3</div>
              <h3 className={styles.featureTitle}>{t.home.step3Title}</h3>
              <p className={styles.featureText}>{t.home.step3Desc}</p>
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
                {t.home.confidentialityTitle}
              </h2>
              <p className={styles.sectionSubtitle} style={{ textAlign: 'left', marginBottom: 0 }}>
                {t.home.confidentialityDesc}
              </p>
            </div>
            <Link to="/about" style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="md" rightIcon={<span aria-hidden="true">→</span>}>
                {t.home.learnGovernanceCta}
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
                🚨 {t.home.safetyBannerTitle}
              </h2>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', maxWidth: '640px' }}>
                {t.home.safetyBannerDesc}
              </p>
            </div>
            <Link to="/safety" style={{ textDecoration: 'none' }}>
              <Button variant="destructive" size="md" rightIcon={<span aria-hidden="true">→</span>}>
                {t.home.safetyBannerCta}
              </Button>
            </Link>
          </div>
        </PageContainer>
      </section>
    </div>
  );
}
