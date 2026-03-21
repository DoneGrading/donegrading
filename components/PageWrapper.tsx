import React from 'react';
import { ChevronRight, Moon, Sun } from 'lucide-react';

export const ThemeToggle: React.FC<{
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  className?: string;
}> = ({ isDarkMode, setIsDarkMode, className = '' }) => (
  <button
    onClick={() => setIsDarkMode(!isDarkMode)}
    title="Toggle theme"
    aria-label="Toggle theme"
    type="button"
    className={`p-2 rounded-full transition-colors bg-white/15 dark:bg-black/20 backdrop-blur-md border border-white/20 dark:border-white/10 shadow-sm text-slate-800 dark:text-slate-100 hover:bg-white/25 dark:hover:bg-black/30 ${className}`}
  >
    {isDarkMode ? (
      <Sun className="w-5 h-5 sm:w-6 sm:h-6" />
    ) : (
      <Moon className="w-5 h-5 sm:w-6 sm:h-6" />
    )}
  </button>
);

/** Full viewport shell: edge-to-edge on phone/tablet with safe-area insets only (no outer margins). */
export const PageWrapper: React.FC<{
  children: React.ReactNode;
  headerTitle?: string;
  headerSubtitle?: string;
  onBack?: () => void;
  isOnline: boolean;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  syncStatus?: 'idle' | 'ok' | 'error';
  onSyncClick?: () => void;
}> = ({
  children,
  headerTitle = 'DoneGrading',
  headerSubtitle,
  onBack,
  isOnline,
  isDarkMode,
  setIsDarkMode,
  syncStatus = 'idle',
  onSyncClick,
}) => {
  return (
    <div className="fixed inset-0 z-10 flex flex-col overflow-hidden selection:bg-indigo-500/30">
      {/* Safe top inset (notch / status bar) */}
      <div
        className="shrink-0 bg-transparent"
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
        aria-hidden
      />

      <div className="relative flex-1 min-h-0 w-full max-w-[100vw] flex flex-col overflow-hidden">
        <div className="absolute z-50 top-1 right-[max(0.35rem,env(safe-area-inset-right,0px))] sm:top-1.5 sm:right-[max(0.5rem,env(safe-area-inset-right,0px))]">
          <ThemeToggle isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
        </div>

        <header className="h-12 sm:h-14 md:h-16 shrink-0 flex items-center justify-between pl-[max(0.5rem,env(safe-area-inset-left,0px))] pr-[max(2.75rem,env(safe-area-inset-right,0px))] sm:pr-[max(3rem,env(safe-area-inset-right,0px))]">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Go back"
                title="Back"
                className="p-1.5 sm:p-2 -ml-0.5 rounded-full bg-white/10 dark:bg-black/10 backdrop-blur-md shadow-sm transition-all active:scale-90 shrink-0"
              >
                <ChevronRight
                  className="w-5 h-5 sm:w-6 sm:h-6 rotate-180 text-slate-800 dark:text-slate-100"
                  aria-hidden
                />
              </button>
            )}

            <div className="flex items-center gap-2 min-w-0 flex-1">
              <img
                src="/DoneGradingLogo.png"
                alt=""
                className="h-8 w-auto sm:h-10 md:h-11 shrink-0 object-contain"
                aria-hidden
              />
              <div className="flex flex-row items-center gap-2 min-w-0 flex-1">
                <div className="flex flex-col backdrop-blur-md bg-white/10 dark:bg-black/10 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl shadow-sm min-w-0 flex-1">
                  <h1 className="text-base sm:text-lg md:text-xl font-black bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-200 text-transparent bg-clip-text tracking-tight truncate leading-tight pb-0.5 drop-shadow-sm">
                    {headerTitle}
                  </h1>
                  {headerSubtitle && (
                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] text-slate-800 dark:text-slate-200 mt-0.5 drop-shadow-sm min-w-0 truncate max-w-[min(100%,min(90vw,28rem))]">
                      {headerSubtitle}
                    </p>
                  )}
                </div>
                {/* Sync / connectivity hint (uses props for consistency across screens) */}
                <div
                  className="shrink-0 flex items-center gap-1"
                  role="status"
                  aria-live="polite"
                  aria-label={
                    !isOnline
                      ? 'Offline. Connect to the internet for Google Classroom sync.'
                      : syncStatus === 'error'
                        ? 'Online. Classroom sync error. Tap Retry beside this status to try again.'
                        : syncStatus === 'ok'
                          ? 'Online. Sync OK.'
                          : 'Online.'
                  }
                  title={
                    !isOnline
                      ? 'Offline'
                      : syncStatus === 'error'
                        ? 'Sync issue — tap Retry'
                        : syncStatus === 'ok'
                          ? 'Synced'
                          : 'Online'
                  }
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      !isOnline
                        ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                        : syncStatus === 'error'
                          ? 'bg-rose-500'
                          : syncStatus === 'ok'
                            ? 'bg-emerald-500'
                            : 'bg-emerald-400/90 dark:bg-emerald-500/80'
                    }`}
                    aria-hidden
                  />
                  {onSyncClick && syncStatus === 'error' && (
                    <button
                      type="button"
                      onClick={onSyncClick}
                      aria-label="Retry Classroom sync"
                      className="text-[9px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 underline"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main
          className="flex-1 min-h-0 w-full overflow-hidden flex flex-col relative pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]"
          style={{
            paddingLeft: 'max(0px, env(safe-area-inset-left, 0px))',
            paddingRight: 'max(0px, env(safe-area-inset-right, 0px))',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
};
