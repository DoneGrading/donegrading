import React from 'react';

type EmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  className = '',
}: EmptyStateProps): React.ReactElement {
  return (
    <div
      className={`rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 p-6 text-center ${className}`}
    >
      {icon && (
        <div className="flex justify-center mb-3 text-slate-400 dark:text-slate-500">{icon}</div>
      )}
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
