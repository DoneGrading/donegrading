import React from 'react';
import { HelpCircle } from 'lucide-react';

const FAQ_URL = 'https://donegrading.com/faq';
const SUPPORT_EMAIL = 'mailto:donegrading@gmail.com';
const STATUS_URL = 'https://www.google.com/appsstatus/dashboard/';

export function HelpLink(): React.ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 p-3 space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
        Help &amp; support
      </p>
      <ul className="space-y-1.5 text-xs">
        <li>
          <a
            href={FAQ_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 underline underline-offset-2"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            FAQ
          </a>
        </li>
        <li>
          <a
            href={SUPPORT_EMAIL}
            className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 underline underline-offset-2"
          >
            Email support
          </a>
        </li>
        <li>
          <a
            href={STATUS_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-slate-600 dark:text-slate-300 underline underline-offset-2"
          >
            Google services status
          </a>
        </li>
      </ul>
    </div>
  );
}
