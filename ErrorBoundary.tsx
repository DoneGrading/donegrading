import React from 'react';

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: any, info: any) {
    // TODO: hook up to real logging (e.g., Sentry) if desired
    console.error('Unhandled error in DoneGrading app:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-6">
          <div className="max-w-sm w-full bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 shadow-xl text-center space-y-3">
            <h1 className="text-lg font-black tracking-tight">
              Something went wrong
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Your scans and grades are safe. Please reload the app and try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase tracking-[0.12em] text-[12px] shadow-sm hover:-translate-y-0.5 transition-all"
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

