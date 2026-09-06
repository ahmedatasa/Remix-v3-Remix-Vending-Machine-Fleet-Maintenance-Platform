import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

interface LoadingSpinnerProps {
  message?: string;
  fullPage?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl' | string;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message, 
  fullPage = false,
  size = 'md',
  className = ''
}) => {
  const { t } = useLanguage();

  const sizeClasses = {
    sm: 'w-5 h-5 border-2',
    md: 'w-10 h-10 border-3',
    lg: 'w-14 h-14 border-4',
    xl: 'w-20 h-20 border-4'
  }[size] || 'w-10 h-10 border-3';

  const content = (
    <div className={`flex flex-col items-center justify-center gap-3 p-8 ${className}`}>
      <div className="relative">
        <div className={`${sizeClasses} border-blue-500/20 border-t-blue-500 rounded-full animate-spin`} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
        </div>
      </div>
      {message !== '' && (
        <span className="text-xs font-medium text-slate-400 animate-pulse">
          {message || t('loading')}
        </span>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
        {content}
      </div>
    );
  }

  return content;
};
