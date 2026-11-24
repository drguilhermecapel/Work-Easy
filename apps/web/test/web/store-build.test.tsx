import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { features } from '../../config/features';
import { ERROR_MESSAGES } from '../../lib/errors';
import ProposalAllowanceNote from '../../components/pro/ProposalAllowance';

// A build made for an app store (VITE_STORE_BUILD) sells nothing inside the app and leaves the
// care line out; VITE_LOGIN_METHODS chooses the sign-in tabs (docs/lojas/google-play.md, M04, M05, M09).

afterEach(() => vi.unstubAllEnvs());

const allowance = () =>
  render(
    <MemoryRouter>
      <ProposalAllowanceNote allowance={{ kind: 'limited', used: 5, limit: 5 }} />
    </MemoryRouter>,
  );

describe('store build flags', () => {
  it('is not a store build unless the variable names a store', () => {
    for (const value of ['', 'web', 'true', 'desktop']) {
      vi.stubEnv('VITE_STORE_BUILD', value);
      expect(features.storeBuild, value).toBeNull();
      expect(features.proSalesEnabled).toBe(true);
      expect(features.careLineInBuild).toBe(true);
    }
  });

  it.each(['android', 'ios', ' Android '])('turns the sale of Pro and the care line off for %s', value => {
    vi.stubEnv('VITE_STORE_BUILD', value);
    expect(features.storeBuild).toBe(value.trim().toLowerCase());
    expect(features.proSalesEnabled).toBe(false);
    expect(features.careLineInBuild).toBe(false);
  });

  it('leaves the AI assistants out of the iOS build only', () => {
    expect(features.aiAssistInBuild).toBe(true);
    vi.stubEnv('VITE_STORE_BUILD', 'android');
    expect(features.aiAssistInBuild).toBe(true);
    vi.stubEnv('VITE_STORE_BUILD', 'ios');
    expect(features.aiAssistInBuild).toBe(false);
  });

  it('does not point to the paid plan when the free proposals run out', () => {
    expect(ERROR_MESSAGES.free_proposal_limit).toContain('plano Pro');
    vi.stubEnv('VITE_STORE_BUILD', 'android');
    expect(ERROR_MESSAGES.free_proposal_limit).not.toMatch(/Pro|Assinatura|assin/);
    expect(ERROR_MESSAGES.free_proposal_limit).toContain('voltam no mês que vem');
  });

  it('shows the allowance with the link to the plan on the site, and without it in a store build', () => {
    const site = allowance();
    expect(screen.getByRole('link', { name: 'Ver o plano Pro' })).toHaveAttribute('href', '/pro/assinatura');
    site.unmount();

    vi.stubEnv('VITE_STORE_BUILD', 'ios');
    allowance();
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.body.textContent).toContain('Você usou 5 de 5 propostas grátis neste mês.');
    expect(document.body.textContent).not.toMatch(/plano Pro/);
  });
});

describe('sign-in methods of a build', () => {
  it('offers e-mail and phone unless the build says otherwise', () => {
    expect(features.loginMethods).toEqual(['email', 'phone']);
    vi.stubEnv('VITE_LOGIN_METHODS', 'sms, fax');
    expect(features.loginMethods).toEqual(['email', 'phone']);
  });

  it('follows the list and its order', () => {
    vi.stubEnv('VITE_LOGIN_METHODS', 'email');
    expect(features.loginMethods).toEqual(['email']);
    vi.stubEnv('VITE_LOGIN_METHODS', ' Phone , email, phone ');
    expect(features.loginMethods).toEqual(['phone', 'email']);
  });
});
