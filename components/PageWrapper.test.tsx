import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PageWrapper, ThemeToggle } from './PageWrapper';

describe('ThemeToggle', () => {
  it('uses a stable accessible name and title for the theme control', () => {
    const setIsDarkMode = vi.fn();
    render(<ThemeToggle isDarkMode={false} setIsDarkMode={setIsDarkMode} />);
    const btn = screen.getByRole('button', { name: 'Toggle theme' });
    expect(btn).toHaveAttribute('title', 'Toggle theme');
    fireEvent.click(btn);
    expect(setIsDarkMode).toHaveBeenCalledWith(true);
  });
});

describe('PageWrapper', () => {
  it('announces offline state in the header status region', () => {
    render(
      <PageWrapper isOnline={false} isDarkMode={false} setIsDarkMode={vi.fn()}>
        <p>Body</p>
      </PageWrapper>
    );
    expect(
      screen.getByRole('status', {
        name: 'Offline. Connect to the internet for Google Classroom sync.',
      })
    ).toBeInTheDocument();
  });

  it('announces sync error and exposes Retry with an accessible name', () => {
    const onSyncClick = vi.fn();
    render(
      <PageWrapper
        isOnline
        isDarkMode={false}
        setIsDarkMode={vi.fn()}
        syncStatus="error"
        onSyncClick={onSyncClick}
      >
        <p>Body</p>
      </PageWrapper>
    );
    expect(
      screen.getByRole('status', {
        name: 'Online. Classroom sync error. Tap Retry beside this status to try again.',
      })
    ).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Retry Classroom sync' });
    fireEvent.click(retry);
    expect(onSyncClick).toHaveBeenCalledTimes(1);
  });

  it('renders back navigation with an accessible label when onBack is provided', () => {
    const onBack = vi.fn();
    render(
      <PageWrapper isOnline isDarkMode={false} setIsDarkMode={vi.fn()} onBack={onBack}>
        <p>Body</p>
      </PageWrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
