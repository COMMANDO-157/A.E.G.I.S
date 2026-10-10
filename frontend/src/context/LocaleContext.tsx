/**
 * A.E.G.I.S 4.0 — Locale Context and Provider
 * WP-4.1.6 | Localization Implementation
 *
 * Provides reactive language state ('en' | 'ta' | 'te'), dictionary access,
 * and sets the HTML document lang attribute.
 * Persists user preference in non-sensitive localStorage key 'aegis_lang'.
 */

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { en, LocalizationDictionary } from '@/locales/en';
import { ta } from '@/locales/ta';
import { te } from '@/locales/te';

export type SupportedLocale = 'en' | 'ta' | 'te';

export interface LocaleContextType {
  locale: SupportedLocale;
  setLocale: (next: SupportedLocale) => void;
  t: LocalizationDictionary;
  availableLocales: { code: SupportedLocale; label: string; nativeName: string }[];
}

const DICTIONARIES: Record<SupportedLocale, LocalizationDictionary> = {
  en,
  ta,
  te,
};

const AVAILABLE_LOCALES: { code: SupportedLocale; label: string; nativeName: string }[] = [
  { code: 'en', label: 'English', nativeName: 'English' },
  { code: 'ta', label: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', label: 'Telugu', nativeName: 'తెలుగు' },
];

const STORAGE_KEY = 'aegis_lang';

const LocaleContext = createContext<LocaleContextType | null>(null);

function getInitialLocale(): SupportedLocale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ta' || saved === 'te' || saved === 'en') {
      return saved;
    }
  } catch {
    // localStorage unavailable or restricted
  }
  return 'en';
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(getInitialLocale);

  const setLocale = (next: SupportedLocale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignored if storage full/blocked
    }
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextType>(() => {
    const activeDict = DICTIONARIES[locale] || DICTIONARIES.en;
    return {
      locale,
      setLocale,
      t: activeDict,
      availableLocales: AVAILABLE_LOCALES,
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextType {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Return graceful fallback if consumed outside Provider (e.g. in isolated component tests)
    return {
      locale: 'en',
      setLocale: () => {},
      t: DICTIONARIES.en,
      availableLocales: AVAILABLE_LOCALES,
    };
  }
  return ctx;
}
