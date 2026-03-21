import React from 'react';
import type { AppPhase } from '../types';

export interface HomeSummary {
  todayShortLabel: string;
  lesson?: {
    title: string;
    course?: string;
    timeLabel?: string;
    /** Deep-link into Schedule (Agenda) for this occurrence. */
    scheduleItemId?: string;
    scheduleDate?: string;
  };
  assignmentsToGrade: number;
  assignmentsPrimaryLabel?: string;
  assignmentsSecondaryLabel?: string;
  parentsToContact: number;
  parentsLabel?: string;
  upcoming?: {
    title: string;
    whenLabel: string;
  };
}

/** Shared app state and handlers used by phase views. Extended as more views are extracted. */
export interface AppContextValue {
  phase: AppPhase;
  setPhase: (p: AppPhase) => void;
  isSignedIn: boolean;
  accessToken: string | null;
  educatorName: string;
  todayLabel: string;
  isOnline: boolean;
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
  syncStatus: 'idle' | 'ok' | 'error';
  navUsage: Record<string, number>;
  bumpNavUsage: (key: 'plan' | 'grade' | 'teach' | 'communicate') => void;
  /** Open Schedule on Agenda, jump cursor to date, scroll/highlight the item row. */
  openScheduleToItem: (scheduleItemId: string, dateISO: string) => void;
  homeSummary: HomeSummary;
  handleShareApp: () => void;
  handleSignOut: () => void;
  authError: string | null;
  authSuccessMessage: string | null;
  handleGoogleLogin: () => void;
  handleAppleLogin: () => void;
  showMoreAuthOptions: boolean;
  setShowMoreAuthOptions: (v: boolean) => void;
  handleEmailLogin: (e: React.FormEvent) => void;
  handlePasswordReset: () => void;
  authMode: 'signin' | 'signup';
  setAuthMode: (mode: 'signin' | 'signup') => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  fullName: string;
  setFullName: (v: string) => void;
}

export const AppContext = React.createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppContext.Provider');
  return ctx;
}
