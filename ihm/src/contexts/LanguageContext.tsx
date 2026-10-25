'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { type SupportedLanguage, type TranslationKey, getTranslation } from '@/lib/i18n';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'fr',
  setLanguage: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>('fr');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('starvis-lang');
      if (stored === 'fr' || stored === 'en') {
        setLanguageState(stored);
      } else if (typeof navigator !== 'undefined' && navigator.language) {
        const browserLang = navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
        setLanguageState(browserLang);
      }
    } catch {
      // Ignore localStorage issues
    }
  }, []);

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('starvis-lang', lang);
    } catch {
      // Ignore
    }
  };

  const t = (key: TranslationKey, params?: Record<string, string | number>) => {
    return getTranslation(language, key, params);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
