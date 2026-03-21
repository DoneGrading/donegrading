import React from 'react';
import { HelpCircle } from 'lucide-react';

const FAQ_URL = 'https://donegrading.com/faq';
const SUPPORT_EMAIL = 'mailto:donegrading@gmail.com';
const STATUS_URL = 'https://www.google.com/appsstatus/dashboard/';

export function HelpLink(): React.ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 p-3 space-y-3">
      <div className="rounded-lg border border-emerald-200/90 dark:border-emerald-800/80 bg-emerald-50/80 dark:bg-emerald-950/40 px-3 py-2.5">
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800 dark:text-emerald-200">
          First time grading?
        </p>
        <p className="mt-1 text-[10px] text-emerald-900/85 dark:text-emerald-100/90 leading-snug">
          Follow these once—then it becomes muscle memory.
        </p>
        <ol className="mt-2 space-y-1.5 pl-4 text-[11px] text-emerald-950 dark:text-emerald-50 list-decimal marker:font-bold marker:text-emerald-700 dark:marker:text-emerald-300">
          <li className="pl-1">
            Open <span className="font-bold">Grade</span> → pick a{' '}
            <span className="font-semibold">course</span>, then an{' '}
            <span className="font-semibold">assignment</span>.
          </li>
          <li className="pl-1">
            Add your <span className="font-semibold">rubric</span> (scan, paste, or AI).
          </li>
          <li className="pl-1">
            Use <span className="font-semibold">batch scan</span>—set student order, then capture
            papers in order.
          </li>
          <li className="pl-1">
            <span className="font-semibold">Review &amp; sync</span> to post grades to Google
            Classroom (Pro / trial).
          </li>
        </ol>
      </div>

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
