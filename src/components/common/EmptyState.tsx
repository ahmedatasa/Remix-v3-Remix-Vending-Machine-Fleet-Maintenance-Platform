import React, { ReactNode } from 'react';
import { LucideIcon, Inbox } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  actionText?: string;
  onAction?: () => void;
  actionIcon?: LucideIcon;
  extra?: ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon = Inbox,
  actionText,
  onAction,
  actionIcon,
  extra
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl">
      <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 mb-4 shadow-inner">
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-base font-semibold text-slate-200 tracking-tight">{title}</h3>
      <p className="text-xs text-slate-400 max-w-sm mt-1 mb-6 leading-relaxed">{description}</p>
      {actionText && onAction && (
        <Button variant="primary" size="sm" icon={actionIcon} onClick={onAction}>
          {actionText}
        </Button>
      )}
      {extra && <div className="mt-4">{extra}</div>}
    </div>
  );
};
