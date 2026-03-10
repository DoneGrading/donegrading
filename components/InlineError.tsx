import React from 'react';
import { AlertCircle } from 'lucide-react';

type InlineErrorProps = {
  message: string;
  onRetry?: () => void;
  className?: string;
};

export function InlineError({ message, onRetry, className = '' }: InlineErrorProps): React.ReactElement {
  return (
    <div
      role="alert"
      className={`rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/30 p-3 flex items-start gap-2 ${className}`}
    >
      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-800 dark:text-red-200">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-xs font-bold text-red-600 dark:text-red-300 underline underline-offset-2"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
