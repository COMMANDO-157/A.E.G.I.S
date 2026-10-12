/**
 * A.E.G.I.S 4.0 — Student Registration & Enrollment Information
 * WP-4.1.3 | Public Website Redesign
 *
 * Explains student verification, institutional enrollment linking, and anti-retaliation onboarding.
 * Clearly articulates that administrative/authority roles cannot be self-selected.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { PageContainer } from '@/components/ui/PageContainer';
import { registerStudent } from '@/api/client';
import styles from './RegisterPage.module.css';

export default function RegisterPage() {
  const { t } = useLocale();
  const { refreshUser } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await registerStudent({
        name: name.trim(),
        email: email.trim(),
        password,
        department: department.trim()
      });
      await refreshUser();
      navigate('/student', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

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
            {t.register.title}
          </h1>

          <p className={styles.heroSubtitle}>{t.register.subtitle}</p>
        </div>
      </section>

      {/* ─── Interactive Registration Form ──────────────────────── */}
      <section className={styles.section} aria-labelledby="form-heading">
        <PageContainer>
          <div style={{ maxWidth: '480px', margin: '0 auto', background: 'var(--color-surface-card)', padding: 'var(--spacing-8)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--shadow-lg)' }}>
            <h2 id="form-heading" style={{ fontSize: 'var(--font-size-xl)', color: 'var(--aegis-navy)', marginBottom: 'var(--spacing-2)', textAlign: 'center' }}>
              Create Student Account
            </h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: 'var(--spacing-6)' }}>
              Restricted to verified campus students. Faculty & administration are provisioned separately.
            </p>

            {error && (
              <div className="alert alert-danger" role="alert" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 'var(--spacing-4)' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                  Full Legal Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Aditi Sharma"
                  style={{ width: '100%', padding: 'var(--spacing-2) var(--spacing-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-default)', fontSize: 'var(--font-size-sm)', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                  Institutional Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="aditi.22cs@college.edu.in"
                  style={{ width: '100%', padding: 'var(--spacing-2) var(--spacing-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-default)', fontSize: 'var(--font-size-sm)', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                  Academic Department
                </label>
                <input
                  type="text"
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Computer Science and Engineering"
                  style={{ width: '100%', padding: 'var(--spacing-2) var(--spacing-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-default)', fontSize: 'var(--font-size-sm)', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 10 chars, uppercase, lowercase, number, symbol"
                  style={{ width: '100%', padding: 'var(--spacing-2) var(--spacing-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-default)', fontSize: 'var(--font-size-sm)', boxSizing: 'border-box' }}
                />
              </div>

              <Button type="submit" variant="primary" size="md" disabled={loading} style={{ marginTop: 'var(--spacing-2)' }}>
                {loading ? 'Creating Student Account…' : 'Register Student Account'}
              </Button>
            </form>

            <div style={{ marginTop: 'var(--spacing-6)', textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--spacing-4)' }}>
              Already have an institutional account?{' '}
              <Link to="/login" style={{ color: 'var(--aegis-teal-600)', fontWeight: 600, textDecoration: 'none' }}>
                Sign In →
              </Link>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* ─── 3-Step Verification Process ─────────────────────────── */}
      <section className={styles.section} aria-labelledby="process-title">
        <PageContainer>
          <div className={styles.sectionHeader}>
            <h2 id="process-title" className={styles.sectionTitle}>
              {t.register.processTitle}
            </h2>
            <p className={styles.sectionSubtitle}>
              To preserve credibility and eliminate malicious spoofing, access to A.E.G.I.S is bound to active campus credentials.
            </p>
          </div>

          <div className={styles.stepsGrid}>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber} aria-hidden="true">1</div>
              <h3 className={styles.stepTitle}>{t.register.step1}</h3>
              <p className={styles.stepText}>{t.register.step1Desc}</p>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepNumber} aria-hidden="true">2</div>
              <h3 className={styles.stepTitle}>{t.register.step2}</h3>
              <p className={styles.stepText}>{t.register.step2Desc}</p>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepNumber} aria-hidden="true">3</div>
              <h3 className={styles.stepTitle}>{t.register.step3}</h3>
              <p className={styles.stepText}>{t.register.step3Desc}</p>
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
                {t.register.rolesAdvisoryTitle}
              </h2>
              <p className={styles.noticeText}>
                {t.register.rolesAdvisoryDesc}
              </p>
            </div>
          </div>
        </PageContainer>
      </section>
    </div>
  );
}
