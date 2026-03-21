import React from 'react';
import { getAnalyticsConsent, setAnalyticsConsent } from '../analytics';

const CONSENT_BANNER_KEY = 'dg_consent_banner_seen';

export function ConsentBanner(): React.ReactElement | null {
  const [show, setShow] = React.useState(false);
  const consent = getAnalyticsConsent();

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = localStorage.getItem(CONSENT_BANNER_KEY);
    if (seen === '1' || consent) {
      setShow(false);
      return;
    }
    setShow(true);
  }, [consent]);

  const accept = () => {
    setAnalyticsConsent(true);
    localStorage.setItem(CONSENT_BANNER_KEY, '1');
    setShow(false);
  };

  const decline = () => {
    setAnalyticsConsent(false);
    localStorage.setItem(CONSENT_BANNER_KEY, '1');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed z-[80] rounded-none sm:rounded-2xl border-x-0 border-b-0 sm:border border-slate-200 dark:border-slate-700 bg-white/98 dark:bg-slate-900/98 p-3 sm:p-4 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] backdrop-blur-md left-0 right-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] sm:bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))]"
    >
      <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
        We use analytics to improve the app. You can accept or decline. No personal data is shared
        with third parties.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={accept}
          className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={decline}
          className="flex-1 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
