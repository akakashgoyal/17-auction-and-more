import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[50vh] w-full flex items-center justify-center p-6 bg-[#FAF8F5]">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 border border-[#E2DDD2] shadow-xl text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-[#D89B30] border border-amber-200 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-serif text-lg sm:text-xl font-bold text-[#142533]">
                Something went wrong
              </h3>
              <p className="text-xs text-slate-500">
                An unexpected display issue occurred. You can refresh the view or return to the homepage safely.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#142533] hover:bg-[#203545] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#D89B30]" />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="py-2.5 px-4 rounded-xl bg-[#FAF1DE] hover:bg-[#F3E2BD] border border-[#D89B30]/40 text-[#9A6007] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Home</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
