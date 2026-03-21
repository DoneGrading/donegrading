import React from 'react';
import { ChevronRight, Check } from 'lucide-react';
import { setOnboardingComplete } from '../lib/onboardingGate';

type OnboardingProps = {
  onComplete: () => void;
  onSkip: () => void;
};

const STEPS = [
  {
    title: 'Connect Google Classroom',
    body: 'Link your Google Classroom to import courses, assignments, students and their grades.',
  },
  {
    title: 'Select a course',
    body: 'Choose the course then the assignment you want to grade.',
  },
  {
    title: 'Scan Student Work',
    body: 'Point the device camera at your student work. DoneGrading will instantly grade it and provide a personalized feedback.',
  },
];

export function Onboarding({ onComplete, onSkip }: OnboardingProps): React.ReactElement {
  const [step, setStep] = React.useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      setOnboardingComplete();
      onComplete();
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]">
      <div className="w-full max-w-full md:max-w-lg lg:max-w-xl flex flex-col items-center">
        <div className="flex flex-col items-center gap-5 mb-4">
          <img
            src="/DoneGradingLogo.png"
            alt="DoneGrading logo"
            loading="lazy"
            decoding="async"
            className="w-48 max-w-full drop-shadow-lg"
          />
        </div>
        <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 text-center">
          {current?.title}
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 text-center">
          {current?.body}
        </p>
        <div className="flex gap-2 mt-6 w-full">
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1"
          >
            {isLast ? (
              <>
                <Check className="w-4 h-4" /> Get started
              </>
            ) : (
              <>
                Next <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
        <div className="flex gap-1.5 mt-4" aria-hidden>
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full w-6 ${i === step ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
