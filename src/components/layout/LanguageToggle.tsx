import React from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export const LanguageToggle: React.FC = () => {
  const { language, toggleLanguage, t } = useLanguage();

  return (
    <button
      onClick={toggleLanguage}
      title={language === 'en' ? 'Switch to Arabic' : 'التحويل للإنجليزية'}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-slate-100 text-xs font-medium transition-colors cursor-pointer"
    >
      <Globe className="w-3.5 h-3.5 text-blue-400" />
      <span>{t('switchLanguage')}</span>
    </button>
  );
};
