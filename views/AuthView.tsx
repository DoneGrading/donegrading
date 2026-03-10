import React, { useState, useRef, useEffect } from 'react';
import { Timer, MessageCircle, LayoutDashboard, BookOpen, Calendar, Eye, EyeOff, Share2, UserPlus, LogIn } from 'lucide-react';

/** Official Google "G" logo for Sign in with Google button */
const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" className="shrink-0">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-7.98z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

/** Official Apple logo for Sign in with Apple button */
const AppleLogo = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" className="shrink-0 fill-current">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
  </svg>
);
import { AppPhase } from '../types';
import { useAppContext } from '../context/AppContext';
import { PageWrapper } from '../components/PageWrapper';

export function AuthView(): React.ReactElement {
  const app = useAppContext();
  const [showPassword, setShowPassword] = useState(false);

  if (app.isSignedIn) {
    const signedInVia = app.accessToken ? 'Google Classroom' : 'demo mode';
    const quickActions = [
      {
        key: 'plan' as const,
        label: 'Plan',
        icon: BookOpen,
        onClick: () => {
          app.bumpNavUsage('plan');
          app.setPhase(AppPhase.PLAN);
        },
      },
      {
        key: 'teach' as const,
        label: 'Teach',
        icon: Timer,
        onClick: () => {
          app.bumpNavUsage('teach');
          app.setPhase(AppPhase.CLASSROOM);
        },
      },
      {
        key: 'grade' as const,
        label: 'Grade',
        icon: LayoutDashboard,
        onClick: () => {
          app.bumpNavUsage('grade');
          app.setPhase(AppPhase.DASHBOARD);
        },
      },
      {
        key: 'schedule' as const,
        label: 'Schedule',
        icon: Calendar,
        onClick: () => {
          app.setPhase(AppPhase.SCHEDULE);
        },
      },
      {
        key: 'communicate' as const,
        label: 'Communicate',
        icon: MessageCircle,
        onClick: () => {
          app.bumpNavUsage('communicate');
          app.setPhase(AppPhase.RECORDS);
        },
      },
    ];

    const lesson = app.homeSummary.lesson;
    const upcoming = app.homeSummary.upcoming;

    const [activeSlide, setActiveSlide] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

    const slideCount = 4;

    useEffect(() => {
      if (isPaused) return;
      const t = setInterval(() => {
        setActiveSlide((prev) => (prev + 1) % slideCount);
      }, 4000);
      return () => clearInterval(t);
    }, [isPaused, slideCount]);

    useEffect(() => {
      const el = slideRefs.current[activeSlide];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }, [activeSlide]);

    return (
      <PageWrapper
        headerTitle={app.educatorName || 'Welcome'}
        headerSubtitle={app.todayLabel || undefined}
        isOnline={app.isOnline}
        isDarkMode={app.isDarkMode}
        setIsDarkMode={app.setIsDarkMode}
        syncStatus={app.syncStatus}
      >
        <div className="flex-1 min-h-0 w-full flex flex-col max-w-sm mx-auto py-0.5 sm:py-1 gap-0.5 sm:gap-1 overflow-hidden">
          <div className="shrink-0 flex flex-col items-center gap-0.5 sm:gap-1">
            <img
              src="/DoneGradingLogo.png"
              alt="DoneGrading"
              className="w-24 sm:w-28 max-w-full drop-shadow-lg object-contain shrink-0 mb-3"
            />
            <p className="text-center text-slate-700 dark:text-slate-200 font-semibold text-[14px] sm:text-[15px]">
              Welcome back, {app.educatorName || 'teacher'}.
            </p>
            <p className="text-center text-[11px] font-bold text-slate-500 dark:text-slate-400">
              You're signed in via {signedInVia}.
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 py-0.5 mt-1">
            <section
              className="relative rounded-2xl border border-white/70 dark:border-white/10 bg-gradient-to-br from-emerald-500/20 via-indigo-500/10 to-fuchsia-500/20 shadow-xl px-3.5 py-3.5 ring-1 ring-emerald-400/50 overflow-hidden"
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              onTouchStart={() => setIsPaused(true)}
              onTouchEnd={() => setIsPaused(false)}
            >
              <div className="absolute inset-x-6 -top-2 h-6 bg-gradient-to-r from-emerald-400/50 via-indigo-400/40 to-fuchsia-400/50 blur-xl opacity-70 pointer-events-none" />
              <p className="relative text-[10px] font-black uppercase tracking-[0.2em] text-emerald-900/80 dark:text-emerald-100/80 mb-1.5">
                Today — {app.homeSummary.todayShortLabel || 'Your day'}
              </p>
              <div className="relative">
                <div
                  ref={scrollContainerRef}
                  className="relative max-h-44 overflow-y-auto overflow-x-hidden custom-scrollbar pr-1.5 space-y-2 snap-y snap-mandatory scroll-smooth text-[11px] text-slate-800 dark:text-slate-100 [scroll-behavior:smooth]"
                >
                <div
                  ref={(el) => { slideRefs.current[0] = el; }}
                  className="snap-start snap-always min-h-[7.5rem] rounded-xl bg-white/90 dark:bg-slate-950/80 border border-emerald-200/70 dark:border-emerald-500/60 px-3 py-2.5 shadow-sm transition-shadow duration-300"
                >
                  <p className="font-semibold flex items-center gap-1">
                    <span role="img" aria-label="lesson">
                      📚
                    </span>
                    Lesson today
                  </p>
                  <p className="text-[11px]">
                    {lesson ? (
                      <>
                        {lesson.course && <span className="font-semibold">{lesson.course}</span>}
                        {lesson.course && ' — '}
                        <span>{lesson.title}</span>
                      </>
                    ) : (
                      'No lesson block scheduled for today yet.'
                    )}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {lesson ? lesson.timeLabel : 'Add a block in Schedule to see it here.'}
                  </p>
                  <button
                    type="button"
                    onClick={quickActions.find((q) => q.key === 'teach')?.onClick}
                    className="mt-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300 underline underline-offset-2"
                  >
                    Open Teach mode
                  </button>
                </div>

                <div
                  ref={(el) => { slideRefs.current[1] = el; }}
                  className="snap-start snap-always min-h-[7.5rem] rounded-xl bg-white/90 dark:bg-slate-950/80 border border-amber-200/80 dark:border-amber-500/60 px-3 py-2.5 shadow-sm transition-shadow duration-300"
                >
                  <p className="font-semibold flex items-center gap-1">
                    <span role="img" aria-label="grading">
                      📝
                    </span>
                    Assignments to grade
                  </p>
                  <p className="text-[11px]">
                    {app.homeSummary.assignmentsToGrade > 0 ? (
                      <>
                        <span className="font-semibold">
                          {app.homeSummary.assignmentsToGrade} submission
                          {app.homeSummary.assignmentsToGrade === 1 ? '' : 's'}
                        </span>{' '}
                        ready to review and sync.
                      </>
                    ) : (
                      'No work waiting to sync right now.'
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={quickActions.find((q) => q.key === 'grade')?.onClick}
                    className="mt-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300 underline underline-offset-2"
                  >
                    Scan &amp; grade
                  </button>
                </div>

                <div
                  ref={(el) => { slideRefs.current[2] = el; }}
                  className="snap-start snap-always min-h-[7.5rem] rounded-xl bg-white/90 dark:bg-slate-950/80 border border-emerald-200/80 dark:border-emerald-500/60 px-3 py-2.5 shadow-sm transition-shadow duration-300"
                >
                  <p className="font-semibold flex items-center gap-1">
                    <span role="img" aria-label="parents">
                      👪
                    </span>
                    Parents to contact
                  </p>
                  <p className="text-[11px]">
                    {app.homeSummary.parentsToContact > 0 ? (
                      <>
                        <span className="font-semibold">
                          {app.homeSummary.parentsToContact} follow‑up
                          {app.homeSummary.parentsToContact === 1 ? '' : 's'}
                        </span>{' '}
                        in your voice inbox.
                      </>
                    ) : (
                      'No parent follow‑ups logged yet.'
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={quickActions.find((q) => q.key === 'communicate')?.onClick}
                    className="mt-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300 underline underline-offset-2"
                  >
                    Send message
                  </button>
                </div>

                <div
                  ref={(el) => { slideRefs.current[3] = el; }}
                  className="snap-start snap-always min-h-[7.5rem] rounded-xl bg-white/90 dark:bg-slate-950/80 border border-sky-200/80 dark:border-sky-500/60 px-3 py-2.5 shadow-sm transition-shadow duration-300"
                >
                  <p className="font-semibold flex items-center gap-1">
                    <span role="img" aria-label="upcoming">
                      📅
                    </span>
                    Upcoming
                  </p>
                  <p className="text-[11px]">
                    {upcoming ? (
                      <>
                        <span className="font-semibold">{upcoming.title}</span>{' '}
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          · {upcoming.whenLabel}
                        </span>
                      </>
                    ) : (
                      'Add reminders or blocks in Schedule to see what’s coming next.'
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={quickActions.find((q) => q.key === 'schedule')?.onClick}
                    className="mt-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-300 underline underline-offset-2"
                  >
                    View schedule
                  </button>
                </div>
                </div>
                <div className="absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-emerald-500/10 via-transparent to-transparent pointer-events-none rounded-b-xl" aria-hidden />
              </div>
              <div className="flex justify-center gap-1.5 mt-2" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setActiveSlide(i); setIsPaused(true); setTimeout(() => setIsPaused(false), 6000); }}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === activeSlide
                        ? 'w-4 bg-emerald-500 dark:bg-emerald-400'
                        : 'w-1.5 bg-slate-300/80 dark:bg-slate-600/80'
                    }`}
                    aria-label={`Go to slide ${i + 1}`}
                  />
                ))}
              </div>
            </section>
          </div>

          <div className="shrink-0 pt-1 pb-1 space-y-1">
            <button
              type="button"
              onClick={app.handleShareApp}
              className="group relative w-full py-1.5 sm:py-2 overflow-hidden rounded-xl text-[11px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-[1.02] border-0"
            >
              <span
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-share-rainbow"
                aria-hidden
              />
              <span className="absolute inset-0 rounded-xl bg-white/0 group-hover:bg-white/20 transition-colors duration-300" aria-hidden />
              <span className="relative z-10 flex items-center justify-center gap-2">
                <Share2 className="w-4 h-4 text-white drop-shadow-sm group-hover:scale-110 transition-transform duration-300" />
                <span className="text-white drop-shadow-sm uppercase tracking-[0.12em]">Share DoneGrading</span>
              </span>
            </button>
            <button
              type="button"
              onClick={app.handleSignOut}
              className="w-full py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 underline underline-offset-2"
            >
              Sign out
            </button>
            <div className="w-full text-[12px] text-slate-500 dark:text-slate-400 text-center space-y-1">
              <p>
                <a
                  href="https://www.donegrading.com/Terms-of-Service"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  Terms of Service
                </a>
                {' | '}
                <a
                  href="https://www.donegrading.com/Privacy-Policy"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  Privacy Policy
                </a>
                {' | '}
                <a
                  href="http://donegrading.com/Contact"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  Contact
                </a>
              </p>
              <p>Copyright © 2026 DoneGrading LLC. All rights reserved.</p>
            </div>
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      headerTitle="Welcome"
      headerSubtitle={undefined}
      isOnline={app.isOnline}
      isDarkMode={app.isDarkMode}
      setIsDarkMode={app.setIsDarkMode}
      syncStatus={app.syncStatus}
    >
      <div className="flex-1 min-h-0 w-full flex flex-col max-w-sm mx-auto py-0.5 sm:py-1 gap-0.5 sm:gap-1 overflow-hidden">
        <div className="shrink-0 flex flex-col items-center gap-0.5 sm:gap-1">
          <img
            src="/DoneGradingLogo.png"
            alt="DoneGrading"
            className="w-24 sm:w-28 max-w-full drop-shadow-lg object-contain shrink-0 mb-3"
          />
          <p className="text-center text-slate-700 dark:text-slate-200 font-semibold text-[13px] sm:text-[14px]">
            Cut grading time & focus on teaching.
          </p>
          <p className="text-center text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">
            7-day free trial · then 67¢/day · Cancel anytime.
          </p>
          <p className="text-center text-[10px] text-slate-500 dark:text-slate-400 mb-1">
            <a href="https://www.donegrading.com/Privacy-Policy" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300">Privacy Policy</a>
            {' · '}
            <a href="https://www.donegrading.com/Terms-of-Service" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300">Terms of Service</a>
          </p>
          {app.authError && (
            <div className="mt-1 px-3 py-1.5 bg-red-500/10 border border-red-500/50 rounded-xl text-red-500 text-[10px] font-bold w-full text-center">
              {app.authError}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-1 py-0.5">
          <form onSubmit={app.handleEmailLogin} className="flex flex-col gap-1">
            {app.authMode === 'signup' && (
              <input
                type="text"
                placeholder="Full Name"
                value={app.fullName}
                onChange={(e) => app.setFullName(e.target.value)}
                autoComplete="name"
                className="mt-1 w-full h-10 min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 px-3 text-[10px] font-semibold bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-indigo-400 transition-all"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={app.email}
              onChange={(e) => app.setEmail(e.target.value)}
              className="mt-1 w-full h-10 min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 px-3 text-[10px] font-semibold bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-indigo-400 transition-all"
            />
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={app.password}
                onChange={(e) => app.setPassword(e.target.value)}
                className="w-full h-10 min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 px-3 pr-10 text-[10px] font-semibold bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-indigo-400 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="submit"
              className="w-full h-10 min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-semibold flex flex-col items-center justify-center gap-0.5 px-3 active:scale-[0.98] transition-all bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800"
            >
              <span className="font-bold uppercase tracking-[0.12em] text-center text-sm sm:text-base">
                {app.authMode === 'signup' ? 'Create account' : 'Sign in with Email'}
              </span>
            </button>
            <p className="text-[13px] text-slate-600 dark:text-slate-400 text-center mt-0 -mb-4">
              <button
                type="button"
                onClick={app.handlePasswordReset}
                className="underline underline-offset-2 font-semibold"
              >
                Reset password
              </button>
            </p>
            {app.authSuccessMessage && (
              <p className="text-[10px] font-semibold text-center mt-3 text-black dark:text-white">
                {app.authSuccessMessage}
              </p>
            )}
          </form>

          <button
            onClick={app.handleGoogleLogin}
            className="mt-8 w-full h-10 min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-semibold flex flex-col items-center justify-center gap-0.5 px-3 active:scale-[0.98] transition-all bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800"
          >
            <GoogleLogo />
            <span className="font-black uppercase tracking-[0.14em] text-center">Sign in with Google</span>
          </button>

          <button
            onClick={app.handleAppleLogin}
            className="w-full h-10 min-h-[40px] rounded-lg border border-black dark:border-white text-[10px] font-semibold flex flex-col items-center justify-center gap-0.5 px-3 active:scale-[0.98] transition-all bg-black dark:bg-white text-white dark:text-black hover:bg-slate-900 dark:hover:bg-slate-100 mb-2"
          >
            <AppleLogo />
            <span className="font-black uppercase tracking-[0.14em] text-center">Sign in with Apple</span>
          </button>

          {app.authMode === 'signin' && (
            <button
              type="button"
              onClick={() => app.setAuthMode('signup')}
              className="group relative w-auto px-6 py-1.5 sm:py-2 overflow-hidden rounded-xl text-[11px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-[1.02] border-0 mt-1 self-center"
            >
              <span
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-share-rainbow"
                aria-hidden
              />
              <span className="absolute inset-0 rounded-xl bg-white/0 group-hover:bg-white/20 transition-colors duration-300" aria-hidden />
              <span className="relative z-10 flex items-center justify-center gap-2">
                <UserPlus className="w-4 h-4 text-white drop-shadow-sm group-hover:scale-110 transition-transform duration-300" />
                <span className="text-white drop-shadow-sm uppercase tracking-[0.12em] text-sm sm:text-base">Sign up today!</span>
              </span>
            </button>
          )}

        </div>

        <div className="shrink-0 space-y-1 pt-0 pb-1 -mt-4">
          {app.authMode === 'signup' && (
            <button
              type="button"
              onClick={() => app.setAuthMode('signin')}
              className="group relative w-full py-1.5 sm:py-2 overflow-hidden rounded-xl text-[11px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-[1.02] border-0 -mt-1"
            >
              <span
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-share-rainbow"
                aria-hidden
              />
              <span className="absolute inset-0 rounded-xl bg-white/0 group-hover:bg-white/20 transition-colors duration-300" aria-hidden />
              <span className="relative z-10 flex items-center justify-center gap-2">
                <LogIn className="w-4 h-4 text-white drop-shadow-sm group-hover:scale-110 transition-transform duration-300" />
                <span className="text-white drop-shadow-sm uppercase tracking-[0.12em]">Already have an account? Sign in</span>
              </span>
            </button>
          )}
          <div className="w-full text-[12px] text-slate-500 dark:text-slate-400 text-center space-y-1">
            <p>
              <a
                href="https://www.donegrading.com/Terms-of-Service"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Terms of Service
              </a>
              {' | '}
              <a
                href="https://www.donegrading.com/Privacy-Policy"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Privacy Policy
              </a>
              {' | '}
              <a
                href="http://donegrading.com/Contact"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Contact
              </a>
            </p>
            <p>Copyright © 2026 DoneGrading LLC. All rights reserved.</p>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
