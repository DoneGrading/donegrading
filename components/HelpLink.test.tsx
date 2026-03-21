import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelpLink } from './HelpLink';

describe('HelpLink', () => {
  it('exposes support links with clear visible labels', () => {
    render(<HelpLink />);
    const faq = screen.getByRole('link', { name: /faq/i });
    expect(faq).toHaveAttribute('href', 'https://donegrading.com/faq');
    expect(faq).toHaveAttribute('target', '_blank');
    expect(faq).toHaveAttribute('rel', 'noreferrer');

    expect(screen.getByRole('link', { name: 'Email support' })).toHaveAttribute(
      'href',
      'mailto:donegrading@gmail.com'
    );

    expect(screen.getByRole('link', { name: 'Google services status' })).toHaveAttribute(
      'href',
      'https://www.google.com/appsstatus/dashboard/'
    );
  });
});
