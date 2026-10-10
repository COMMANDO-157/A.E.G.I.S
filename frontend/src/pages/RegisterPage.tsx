/**
 * A.E.G.I.S 4.0 — Student Registration & Enrollment Information
 * WP-4.1.3 | Public Website Redesign
 *
 * Explains student verification, institutional enrollment linking, and anti-retaliation onboarding.
 * Clearly articulates that administrative/authority roles cannot be self-selected.
 */

import { Link } from 'react-router-dom';
import { en } from '@/locales/en';
import { Button } from '@/components/ui/Button';
import { PageContainer } from '@/components/ui/PageContainer';
import styles from './RegisterPage.module.css';

export default function RegisterPage() {
  return (
    <div className={styles.page}>
      {/* ─── Hero Section ────────────────────────────────────────── */}
      <section className={styles.hero} aria-labelledby="register-hero-title">
        <div className={styles.heroInner}>
          <div className={styles.heroBadge}>
            <span aria-hidden="true">📝</span>
            <span>ENROLLMENT & VERIFICATION</span>
          </div>

          <h1 id="register-hero-title" className={styles.heroTitle}>
            {en.register.title}
          </h1>

          <p className={styles.heroSubtitle}>{en.register.subtitle}</p>
        </div>
      </section>

      {/* ─── 3-Step Verification Process ─────────────────────────── */}
      <section className={styles.section} aria-labelledby="process-title">
        <PageContainer>
          <div className={styles.sectionHeader}>
            <h2 id="process-title" className={styles.sectionTitle}>
              {en.register.processTitle}
            </h2>
            <p className={styles.sectionSubtitle}>
              To preserve credibility and eliminate malicious spoofing, access to A.E.G.I.S is bound to active campus credentials.
            </p>
          </div>

          <div className={styles.stepsGrid}>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber} aria-hidden="true">1</div>
              <h3 className={styles.stepTitle}>{en.register.step1}</h3>
              <p className={styles.stepText}>{en.register.step1Desc}</p>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepNumber} aria-hidden="true">2</div>
              <h3 className={styles.stepTitle}>{en.register.step2}</h3>
              <p className={styles.stepText}>{en.register.step2Desc}</p>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepNumber} aria-hidden="true">3</div>
              <h3 className={styles.stepTitle}>{en.register.step3}</h3>
              <p className={styles.stepText}>{en.register.step3Desc}</p>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* ─── Role Advisory ───────────────────────────────────────── */}
      <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="roles-advisory-title">
        <PageContainer>
          <div className={styles.rolesNotice} role="note">
            <div className={styles.noticeIcon} aria-hidden="true">⚠️</div>
            <div>
              <h2 id="roles-advisory-title" className={styles.noticeTitle}>
                {en.register.rolesAdvisoryTitle}
              </h2>
              <p className={styles.noticeText}>
                {en.register.rolesAdvisoryDesc}
              </p>
            </div>
          </div>

          <div className={styles.ctaBox}>
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <Button variant="primary" size="lg" rightIcon={<span aria-hidden="true">→</span>}>
                {en.register.cta}
              </Button>
            </Link>
          </div>
        </PageContainer>
      </section>
    </div>
  );
}
