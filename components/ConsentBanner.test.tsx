import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { ConsentBanner } from './ConsentBanner';

describe('ConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('uses an accessible dialog, labeled actions, and dismisses until remount', async () => {
    const { unmount } = render(<ConsentBanner />);
    const dialogs = await screen.findAllByRole('dialog', { name: 'Cookie consent' });
    expect(dialogs.length).toBeGreaterThanOrEqual(1);

    const first = dialogs[0];
    expect(within(first).getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'Decline' })).toBeInTheDocument();

    // StrictMode (or double mount) can render two trees; accept every visible banner.
    screen.getAllByRole('button', { name: 'Accept' }).forEach((btn) => fireEvent.click(btn));

    await waitFor(() => {
      expect(screen.queryAllByRole('dialog', { name: 'Cookie consent' })).toHaveLength(0);
    });
    expect(localStorage.getItem('dg_consent_banner_seen')).toBe('1');

    unmount();
    render(<ConsentBanner />);
    expect(screen.queryAllByRole('dialog', { name: 'Cookie consent' })).toHaveLength(0);
  });
});
