/**
 * A.E.G.I.S 4.0 — Public About Page
 * WP-4.1.3 | Institutional Governance & Escalation
 *
 * Explains platform purpose, institutional stakeholders, the 3-tier escalation model,
 * and the balance of algorithmic routing with human investigative verification.
 */

import { Link } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';
import { Button } from '@/components/ui/Button';
import { PageContainer } from '@/components/ui/PageContainer';
import styles from './AboutPage.module.css';

export default function AboutPage() {
  const { t } = useLocale();
  return (
    <div className={styles.page}>
      {/* ─── Hero Section ────────────────────────────────────────── */}
      <section className={styles.hero} aria-labelledby="about-hero-title">
        <div className={styles.heroInner}>
          <div className={styles.heroBadge}>
            <span aria-hidden="true">🏛️</span>
            <span>INSTITUTIONAL GOVERNANCE</span>
          </div>

          <h1 id="about-hero-title" className={styles.heroTitle}>
            {t.about.title}
          </h1>

          <p className={styles.heroSubtitle}>{t.about.subtitle}</p>
        </div>
      </section>

      {/* ─── Why A.E.G.I.S Exists ─────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="mission-title">
        <PageContainer>
          <div className={styles.sectionHeader}>
            <h2 id="mission-title" className={styles.sectionTitle}>
              {t.about.missionTitle}
            </h2>
            <p className={styles.sectionSubtitle}>
              Empowering campus safety through accountability, transparency, and timely intervention.
            </p>
          </div>

          <div className={styles.narrativeCard}>
            <p className={styles.narrativeText}>
              {t.about.missionDesc}
            </p>
            <p className={styles.narrativeText}>
              A.E.G.I.S provides students with a protected reporting channel where cases cannot be silently ignored or arbitrarily closed.
              Every submission initiates an immutable lifecycle, ensuring that student concerns receive lawful and timely institutional review.
            </p>
          </div>
        </PageContainer>
      </section>

      {/* ─── The 3-Tier Escalation Hierarchy ───────────────────────── */}
      <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="tiers-title">
        <PageContainer>
          <div className={styles.sectionHeader}>
            <h2 id="tiers-title" className={styles.sectionTitle}>
              {t.about.tiersTitle}
            </h2>
            <p className={styles.sectionSubtitle}>
              {t.about.tiersSubtitle}
            </p>
          </div>

          <div className={styles.tierGrid}>
            <div className={styles.tierCard}>
              <div className={styles.tierBadge}>Tier 1</div>
              <h3 className={styles.tierTitle}>{t.about.tierHod}</h3>
              <p className={styles.tierText}>{t.about.tierHodDesc}</p>
            </div>

            <div className={styles.tierCard}>
              <div className={styles.tierBadge}>Tier 2</div>
              <h3 className={styles.tierTitle}>{t.about.tierDean}</h3>
              <p className={styles.tierText}>{t.about.tierDeanDesc}</p>
            </div>

            <div className={styles.tierCard}>
              <div className={styles.tierBadge}>Tier 3</div>
              <h3 className={styles.tierTitle}>{t.about.tierHigherAuth}</h3>
              <p className={styles.tierText}>{t.about.tierHigherAuthDesc}</p>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* ─── Roles & Responsibilities ────────────────────────────── */}
      <section className={styles.section} aria-labelledby="roles-title">
        <PageContainer>
          <div className={styles.sectionHeader}>
            <h2 id="roles-title" className={styles.sectionTitle}>
              {t.about.responsibilitiesTitle}
            </h2>
            <p className={styles.sectionSubtitle}>
              Clear separation of institutional duties ensures fairness, prevents conflicts of interest, and safeguards privacy.
            </p>
          </div>

          <div className={styles.rolesGrid}>
            <div className={styles.roleCard}>
              <div className={styles.roleIcon} aria-hidden="true">🎓</div>
              <h3 className={styles.roleTitle}>{t.about.studentsRole}</h3>
              <p className={styles.roleText}>{t.about.studentsRoleDesc}</p>
            </div>

            <div className={styles.roleCard}>
              <div className={styles.roleIcon} aria-hidden="true">👔</div>
              <h3 className={styles.roleTitle}>{t.about.authoritiesRole}</h3>
              <p className={styles.roleText}>{t.about.authoritiesRoleDesc}</p>
            </div>

            <div className={styles.roleCard}>
              <div className={styles.roleIcon} aria-hidden="true">🛡️</div>
              <h3 className={styles.roleTitle}>{t.about.ownerRole}</h3>
              <p className={styles.roleText}>{t.about.ownerRoleDesc}</p>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* ─── Responsible Evidence & Verification ─────────────────── */}
      <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="verification-title">
        <PageContainer>
          <div className={styles.verificationBox}>
            <div className={styles.verificationIcon} aria-hidden="true">⚖️</div>
            <div>
              <h2 id="verification-title" className={styles.sectionTitle} style={{ margin: '0 0 var(--spacing-2)' }}>
                {t.about.verificationTitle}
              </h2>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-base)', lineHeight: 'var(--line-height-relaxed)' }}>
                {t.about.verificationDesc}
              </p>
            </div>
          </div>

          <div style={{ marginTop: 'var(--spacing-10)', textAlign: 'center' }}>
            <Link to="/safety" style={{ textDecoration: 'none' }}>
              <Button variant="primary" size="lg" rightIcon={<span aria-hidden="true">→</span>}>
                View Emergency & Safety Resources
              </Button>
            </Link>
          </div>
        </PageContainer>
      </section>
    </div>
  );
}
