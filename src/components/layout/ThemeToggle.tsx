import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';

export const ThemeToggle: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();
  const { t } = useLanguage();

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? t('lightMode') : t('darkMode')}
      className="p-2 rounded-lg border border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-slate-100 transition-colors cursor-pointer"
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-amber-400" />
      ) : (
        <Moon className="w-4 h-4 text-blue-400" />
      )}
    </button>
  );
};
