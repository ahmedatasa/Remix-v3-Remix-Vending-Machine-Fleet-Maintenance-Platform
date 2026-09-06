import React, { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  noPadding?: boolean;
  onClick?: () => void;
  id?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  action,
  className = '',
  noPadding = false,
  onClick,
  id
}) => {
  return (
    <div
      id={id}
      onClick={onClick}
      className={`bg-slate-900/80 dark:bg-slate-900/80 border border-slate-800 rounded-xl shadow-lg backdrop-blur-sm transition-all duration-200 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80">
          <div>
            {title && <h3 className="text-base font-semibold text-slate-100 tracking-tight">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-5'}>
        {children}
      </div>
    </div>
  );
};
