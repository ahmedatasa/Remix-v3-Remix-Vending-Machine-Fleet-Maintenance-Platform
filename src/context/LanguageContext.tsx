import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language, translations } from '../i18n/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: keyof typeof translations.en | string, defaultVal?: string) => string;
  isRTL: boolean;
  dir: 'ltr' | 'rtl';
  formatNumber: (val: number) => string;
  formatCurrency: (val: number) => string;
  formatDate: (val: string | Date | undefined | null) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('vending_fleet_lang');
    return (saved === 'ar' || saved === 'en') ? saved : 'en';
  });

  const isRTL = language === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';

  useEffect(() => {
    localStorage.setItem('vending_fleet_lang', language);
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
  }, [language, dir]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const toggleLanguage = () => {
    setLanguageState(prev => (prev === 'en' ? 'ar' : 'en'));
  };

  const t = (key: keyof typeof translations.en | string, defaultVal?: string): string => {
    const dict = translations[language];
    if (key in dict) {
      return (dict as any)[key];
    }
    const enDict = translations.en;
    if (key in enDict) {
      return (enDict as any)[key];
    }
    return defaultVal || key;
  };

  const formatNumber = (val: number): string => {
    if (val === undefined || val === null || isNaN(val)) return '0';
    return new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-US').format(val);
  };

  const formatCurrency = (val: number): string => {
    if (val === undefined || val === null || isNaN(val)) return '$0.00';
    return new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-US', {
      style: 'currency',
      currency: language === 'ar' ? 'SAR' : 'USD',
      maximumFractionDigits: 2
    }).format(val);
  };

  const formatDate = (val: string | Date | undefined | null): string => {
    if (!val) return '—';
    try {
      const d = typeof val === 'string' ? new Date(val) : val;
      if (isNaN(d.getTime())) return '—';
      return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(d);
    } catch {
      return String(val);
    }
  };

  return (
    <LanguageContext.Provider value={{
      language,
      setLanguage,
      toggleLanguage,
      t,
      isRTL,
      dir,
      formatNumber,
      formatCurrency,
      formatDate
    }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
