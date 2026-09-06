import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children?: React.ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center max-w-lg mx-auto my-12 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-rose-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-100 mb-2">
            {this.props.fallbackTitle || 'Component Rendering Interrupted'}
          </h3>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            {this.state.error?.message || 'An unexpected rendering error occurred. You can safely reload the view.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={this.handleReset}
            >
              Retry View
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Home}
              onClick={() => {
                this.handleReset();
                window.location.reload();
              }}
            >
              Refresh Application
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

