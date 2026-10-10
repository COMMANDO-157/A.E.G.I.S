/**
 * A.E.G.I.S 4.0 — Language Selector Component
 * WP-4.1.6 | Accessible Language Selection
 *
 * Fully keyboard-navigable and accessible select control for switching
 * between English, தமிழ், and తెలుగు.
 */

import React from 'react';
import { useLocale, SupportedLocale } from '@/context/LocaleContext';
import styles from './LanguageSelector.module.css';

export interface LanguageSelectorProps {
  className?: string;
  variant?: 'light' | 'dark';
}

export function LanguageSelector({ className, variant = 'light' }: LanguageSelectorProps) {
  const { locale, setLocale, availableLocales } = useLocale();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocale(e.target.value as SupportedLocale);
  };

  return (
    <div className={[styles.container, styles[variant], className ?? ''].filter(Boolean).join(' ')}>
      <label htmlFor="aegis-language-select" className={styles.label}>
        <span aria-hidden="true" className={styles.globeIcon}>🌐</span>
        <span className="sr-only">Select display language / மொழியைத் தேர்ந்தெடுக்கவும் / భాషను ఎంచుకోండి</span>
      </label>
      <select
        id="aegis-language-select"
        value={locale}
        onChange={handleChange}
        className={styles.select}
        aria-label="Display Language"
      >
        {availableLocales.map((loc) => (
          <option key={loc.code} value={loc.code}>
            {loc.nativeName} ({loc.label})
          </option>
        ))}
      </select>
    </div>
  );
}
