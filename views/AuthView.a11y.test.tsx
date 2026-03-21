import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppContext } from '../context/AppContext';
import { createMockAppContext } from '../test/appContextMocks';
import { AuthView } from './AuthView';

function renderAuthView(overrides: Parameters<typeof createMockAppContext>[0] = {}) {
  const value = createMockAppContext(overrides);
  return render(
    <AppContext.Provider value={value}>
      <AuthView />
    </AppContext.Provider>
  );
}

describe('AuthView — a11y & offline', () => {
  it('disables Google sign-in when offline with explanatory aria-label and title', () => {
    renderAuthView({ isOnline: false });

    const google = screen.getByRole('button', { name: 'Sign in with Google (unavailable offline)' });
    expect(google).toBeDisabled();
    expect(google).toHaveAttribute(
      'title',
      'Connect to the internet to sign in with Google.'
    );
  });

  it('enables Google sign-in when online with a concise aria-label', () => {
    renderAuthView({ isOnline: true });

    const google = screen.getByRole('button', { name: 'Sign in with Google' });
    expect(google).not.toBeDisabled();
    expect(google).toHaveAttribute(
      'title',
      'Sign in with your Google account for Classroom, Drive, and Gmail'
    );
  });

  it('disables the home “Send message” shortcut when offline with offline-specific copy', () => {
    renderAuthView({
      isSignedIn: true,
      isOnline: false,
      educatorName: 'Test Teacher',
    });

    const send = screen.getByRole('button', { name: 'Send message (online)' });
    expect(send).toBeDisabled();
    expect(send).toHaveAttribute(
      'title',
      'Communicate needs the internet for Classroom and messaging.'
    );
  });

  it('enables the home “Send message” shortcut when online', () => {
    renderAuthView({
      isSignedIn: true,
      isOnline: true,
      educatorName: 'Test Teacher',
    });

    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send).not.toBeDisabled();
    expect(send).toHaveAttribute('title', 'Open Communicate');
  });
});
