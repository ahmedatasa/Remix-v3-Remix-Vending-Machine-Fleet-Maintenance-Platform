import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorBannerProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  title = 'An error occurred',
  message,
  onRetry,
  className = ''
}) => {
  return (
    <div className={`flex items-start justify-between gap-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 ${className}`}>
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-xs font-semibold text-rose-200">{title}</h4>
          <p className="text-xs text-rose-300/80 mt-0.5">{message}</p>
        </div>
      </div>

      {onRetry && (
        <Button variant="danger" size="sm" icon={RefreshCw} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
};
