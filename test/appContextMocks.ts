import { vi } from 'vitest';
import type { AppContextValue, HomeSummary } from '../context/AppContext';
import { AppPhase } from '../types';

const defaultHome: HomeSummary = {
  todayShortLabel: 'Wed',
  assignmentsToGrade: 0,
  parentsToContact: 0,
};

export function createMockAppContext(overrides: Partial<AppContextValue> = {}): AppContextValue {
  return {
    phase: AppPhase.AUTHENTICATION,
    setPhase: vi.fn(),
    isSignedIn: false,
    accessToken: null,
    educatorName: '',
    todayLabel: '',
    isOnline: true,
    isDarkMode: false,
    setIsDarkMode: vi.fn(),
    syncStatus: 'idle',
    navUsage: {},
    bumpNavUsage: vi.fn(),
    openScheduleToItem: vi.fn(),
    homeSummary: defaultHome,
    handleShareApp: vi.fn(),
    handleSignOut: vi.fn(),
    authError: null,
    authSuccessMessage: null,
    handleGoogleLogin: vi.fn(),
    handleAppleLogin: vi.fn(),
    showMoreAuthOptions: true,
    setShowMoreAuthOptions: vi.fn(),
    handleEmailLogin: vi.fn((e) => {
      e.preventDefault();
    }),
    handlePasswordReset: vi.fn(),
    authMode: 'signin',
    setAuthMode: vi.fn(),
    email: '',
    setEmail: vi.fn(),
    password: '',
    setPassword: vi.fn(),
    fullName: '',
    setFullName: vi.fn(),
    ...overrides,
  };
}
