/**
 * A.E.G.I.S 4.0 — Campus Safety & Emergency Directory
 * WP-4.1.3 | Immediate Assistance & Evidence Preservation
 *
 * Dedicated safety resource center providing verified national emergency helplines,
 * guidance for incidents involving imminent physical danger, and responsible evidence preservation.
 */

import { Link } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';
import { Button } from '@/components/ui/Button';
import { PageContainer } from '@/components/ui/PageContainer';
import styles from './SafetyPage.module.css';

export default function SafetyPage() {
  const { t } = useLocale();
  return (
    <div className={styles.page}>
      {/* ─── Hero Section ────────────────────────────────────────── */}
      <section className={styles.hero} aria-labelledby="safety-hero-title">
        <div className={styles.heroInner}>
          <div className={styles.heroBadge}>
            <span aria-hidden="true">🚨</span>
            <span>CRISIS & EMERGENCY RESOURCES</span>
          </div>

          <h1 id="safety-hero-title" className={styles.heroTitle}>
            {t.safety.title}
          </h1>

          <p className={styles.heroSubtitle}>{t.safety.subtitle}</p>
        </div>
      </section>

      {/* ─── Imminent Danger Warning ─────────────────────────────── */}
      <section className={styles.section} style={{ paddingTop: 'var(--spacing-8)', paddingBottom: 'var(--spacing-8)' }}>
        <PageContainer>
          <div className={styles.dangerAlert} role="alert">
            <div className={styles.dangerIcon} aria-hidden="true">⚠️</div>
            <div>
              <h2 className={styles.dangerTitle}>{t.safety.dangerAlertTitle}</h2>
              <p className={styles.dangerText}>{t.safety.dangerAlertDesc}</p>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* ─── Verified Helplines ──────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="helplines-title">
        <PageContainer>
          <div className={styles.sectionHeader}>
            <h2 id="helplines-title" className={styles.sectionTitle}>
              {t.safety.helplinesTitle}
            </h2>
            <p className={styles.sectionSubtitle}>
              Authoritative, toll-free 24/7 helplines verified for student safety, crisis intervention, and anti-ragging support.
            </p>
          </div>

          <div className={styles.helplinesGrid}>
            {/* Police Emergency */}
            <div className={styles.helplineCard}>
              <div className={styles.helplineHeader}>
                <h3 className={styles.helplineName}>{t.emergency.police.label}</h3>
                <span className={styles.helplineBadge}>National 24/7</span>
              </div>
              <a href={`tel:${t.emergency.police.number}`} className={styles.helphoneNumber}>
                <span aria-hidden="true">📞</span> {t.emergency.police.number} / {t.emergency.police.alt}
              </a>
              <p className={styles.helplineMeta}>For imminent physical violence, theft, or police dispatch.</p>
            </div>

            {/* National Anti-Ragging Helpline */}
            <div className={styles.helplineCard}>
              <div className={styles.helplineHeader}>
                <h3 className={styles.helplineName}>{t.emergency.antiRagging.label}</h3>
                <span className={styles.helplineBadge}>UGC / Govt</span>
              </div>
              <a href={`tel:${t.emergency.antiRagging.number}`} className={styles.helphoneNumber}>
                <span aria-hidden="true">📞</span> {t.emergency.antiRagging.number}
              </a>
              <p className={styles.helplineMeta}>
                Toll-free 24/7 support. Email: <a href={`mailto:${t.emergency.antiRagging.email}`} style={{ color: 'var(--aegis-teal-600)' }}>{t.emergency.antiRagging.email}</a>
              </p>
            </div>

            {/* Women Helpline */}
            <div className={styles.helplineCard}>
              <div className={styles.helplineHeader}>
                <h3 className={styles.helplineName}>{t.emergency.womenHelpline.label}</h3>
                <span className={styles.helplineBadge}>Emergency</span>
              </div>
              <a href={`tel:${t.emergency.womenHelpline.number}`} className={styles.helphoneNumber}>
                <span aria-hidden="true">📞</span> {t.emergency.womenHelpline.number}
              </a>
              <p className={styles.helplineMeta}>Toll-free 24/7 crisis support and emergency assistance for women students.</p>
            </div>

            {/* MHRD Student Grievance Support */}
            <div className={styles.helplineCard}>
              <div className={styles.helplineHeader}>
                <h3 className={styles.helplineName}>{t.emergency.mhrd.label}</h3>
                <span className={styles.helplineBadge}>Institutional</span>
              </div>
              <a href={`tel:${t.emergency.mhrd.number}`} className={styles.helphoneNumber}>
                <span aria-hidden="true">📞</span> {t.emergency.mhrd.number}
              </a>
              <p className={styles.helplineMeta}>Ministry of Education national portal for higher education student concerns.</p>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* ─── Evidence Preservation Guidance ──────────────────────── */}
      <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="preservation-title">
        <PageContainer>
          <div className={styles.sectionHeader}>
            <h2 id="preservation-title" className={styles.sectionTitle}>
              {t.safety.guidanceTitle}
            </h2>
            <p className={styles.sectionSubtitle}>
              Proper documentation ensures your grievance can be verified by inquiry panels without dispute.
            </p>
          </div>

          <div className={styles.preservationGrid}>
            <div className={styles.preservationCard}>
              <div className={styles.preservationNumber} aria-hidden="true">1</div>
              <h3 className={styles.preservationTitle}>{t.safety.preservationStep1Title}</h3>
              <p className={styles.preservationText}>{t.safety.preservationStep1Desc}</p>
            </div>

            <div className={styles.preservationCard}>
              <div className={styles.preservationNumber} aria-hidden="true">2</div>
              <h3 className={styles.preservationTitle}>{t.safety.preservationStep2Title}</h3>
              <p className={styles.preservationText}>{t.safety.preservationStep2Desc}</p>
            </div>

            <div className={styles.preservationCard}>
              <div className={styles.preservationNumber} aria-hidden="true">3</div>
              <h3 className={styles.preservationTitle}>{t.safety.preservationStep3Title}</h3>
              <p className={styles.preservationText}>{t.safety.preservationStep3Desc}</p>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* ─── Confidentiality Expectations ────────────────────────── */}
      <section className={styles.section} aria-labelledby="confidentiality-expectations-title">
        <PageContainer>
          <div className={styles.confidentialityNotice}>
            <h2 id="confidentiality-expectations-title" style={{ fontSize: 'var(--font-size-xl)', color: 'var(--aegis-teal-800)', margin: '0 0 var(--spacing-2)' }}>
              🔒 {t.safety.confidentialityExpectationsTitle}
            </h2>
            <p style={{ margin: 0, color: 'var(--aegis-neutral-700)', fontSize: 'var(--font-size-base)', lineHeight: 'var(--line-height-relaxed)' }}>
              {t.safety.confidentialityExpectationsDesc}
            </p>
          </div>

          <div style={{ marginTop: 'var(--spacing-10)', textAlign: 'center' }}>
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <Button variant="primary" size="lg" rightIcon={<span aria-hidden="true">→</span>}>
                Access Secure Campus Portal
              </Button>
            </Link>
          </div>
        </PageContainer>
      </section>
    </div>
  );
}
