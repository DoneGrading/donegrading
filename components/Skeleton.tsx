import React from 'react';

export function SkeletonCard(): React.ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
      <div className="skeleton h-4 w-3/4" />
      <div className="skeleton h-3 w-1/2" />
      <div className="skeleton h-3 w-full" />
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }): React.ReactElement {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex items-center gap-3"
        >
          <div className="skeleton h-10 w-10 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="skeleton h-3 w-2/3" />
            <div className="skeleton h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonText({ lines = 2 }: { lines?: number }): React.ReactElement {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-3 w-full"
          style={{ width: i === lines - 1 && lines > 1 ? '75%' : '100%' }}
        />
      ))}
    </div>
  );
}
