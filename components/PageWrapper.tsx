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
    className={`p-2 rounded-full transition-colors ${className}`}
  >
    {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
  </button>
);

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
  isOnline: _isOnline,
  isDarkMode,
  setIsDarkMode,
  syncStatus: _syncStatus = 'idle',
  onSyncClick: _onSyncClick,
}) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden z-10 selection:bg-indigo-500/30">
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      </div>

      <div className="w-full max-w-lg h-full bg-transparent flex flex-col overflow-hidden animate-in zoom-in-[0.98] duration-500">
        <header className="h-16 shrink-0 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 -ml-1.5 rounded-full bg-white/10 dark:bg-black/10 backdrop-blur-md shadow-sm transition-all active:scale-90"
              >
                <ChevronRight className="w-5 h-5 rotate-180 text-slate-800 dark:text-slate-100" />
              </button>
            )}

            <div className="flex flex-col backdrop-blur-md bg-white/10 dark:bg-black/10 px-3 py-1.5 rounded-xl shadow-sm">
              <h1 className="text-lg font-black bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-200 text-transparent bg-clip-text tracking-tight truncate leading-none pb-0.5 drop-shadow-sm">
                {headerTitle}
              </h1>
              {headerSubtitle && (
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-800 dark:text-slate-200 mt-0.5 drop-shadow-sm min-w-0 max-w-[min(100%,280px)]">
                  {headerSubtitle}
                </p>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-hidden flex flex-col p-4 pb-24 relative">
          {children}
        </main>
      </div>
    </div>
  );
};
