import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { STATIC_PAGES } from '../../components/captacao/content';
import { CTAS, expectPageBasics, pageText, renderCaptacao } from './render';

// Demo mode even when a developer's .env.local configures Supabase
vi.mock('../../lib/supabase', () => ({ supabase: null, backendEnabled: false }));

const PAGES = STATIC_PAGES.map(page => [page.path, page] as const);

describe('acquisition pages in demo mode', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(PAGES)('%s shows its entry, its call to action and an ordered outline', async (_path, page) => {
    vi.stubEnv('VITE_CONCIERGE_WHATSAPP', '');
    const view = renderCaptacao(page.path);
    await expectPageBasics(page, view);
    expect(screen.getByText(/Nesta versão de demonstração/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
  });

  it.each(PAGES)('%s prints no price and no limit: nothing is real without a backend', async (_path, page) => {
    vi.stubEnv('VITE_CONCIERGE_WHATSAPP', '');
    const view = renderCaptacao(page.path);
    await screen.findByText(/Nesta demonstração não há valores reais/);
    const text = pageText(view.container);
    expect(text).not.toMatch(/R\$/);
    expect(text).not.toMatch(/\b\d+\s+(?:dias?|propostas?)\b/);
  });

  it('says on the Pro section where the values will be', async () => {
    renderCaptacao('/para-profissionais');
    expect(await screen.findByText(/O valor aparece na tela de assinatura, depois do cadastro/)).toBeInTheDocument();
    expect(screen.getByText(/Quando a plataforma oferece teste grátis, a tela de assinatura informa o prazo/)).toBeInTheDocument();
    expect(screen.getByText(/A forma de cobrança prevista para cada ocupação aparece na página do serviço/)).toBeInTheDocument();
  });

  it('explains the weekly limit without a number', async () => {
    renderCaptacao('/para-familias');
    expect(await screen.findByText(/é definido pela plataforma/)).toBeInTheDocument();
    expect(screen.getByText(/Isto não é orientação jurídica/)).toBeInTheDocument();
    expect(screen.getByText(/Plantões cancelados não contam/)).toBeInTheDocument();
  });

  it('says a request has a limit of proposals, without saying which', async () => {
    renderCaptacao('/como-funciona');
    expect(await screen.findByText(/Cada pedido recebe um número limitado de propostas/)).toBeInTheDocument();
  });

  it('tells how the request works in the demo, with and without the concierge number', async () => {
    vi.stubEnv('VITE_CONCIERGE_WHATSAPP', '');
    const first = renderCaptacao('/como-funciona');
    expect(await screen.findByText(/o pedido online ainda não está disponível/)).toBeInTheDocument();
    first.unmount();

    vi.stubEnv('VITE_CONCIERGE_WHATSAPP', '5511999999999');
    renderCaptacao('/como-funciona');
    expect(await screen.findByText(/o pedido vira uma mensagem de WhatsApp para a equipe/)).toBeInTheDocument();
  });

  it.each(PAGES)('%s offers the concierge WhatsApp when the number is configured, with the message of the page', async (path) => {
    vi.stubEnv('VITE_CONCIERGE_WHATSAPP', '5511999999999');
    renderCaptacao(path);
    const links = await screen.findAllByRole('link', { name: /Falar com a equipe pelo WhatsApp/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const url = new URL(link.getAttribute('href') ?? '');
      expect(url.origin).toBe('https://wa.me');
      expect(url.pathname).toBe('/5511999999999');
      expect(url.searchParams.get('text')).toBe(CTAS[path].message);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toMatch(/noopener/);
      expect(link.getAttribute('rel')).toMatch(/noreferrer/);
      // the new tab is said to who cannot see it
      expect(link).toHaveAccessibleName(/abre em outra aba/);
    }
  });

  it('offers no chat for a malformed number', async () => {
    vi.stubEnv('VITE_CONCIERGE_WHATSAPP', '123');
    renderCaptacao('/para-profissionais');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
  });

  it('puts the previous tab title back when the page goes away', async () => {
    document.title = 'Antes';
    const view = renderCaptacao('/como-funciona');
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(document.title).toBe('Como funciona: pedido, propostas e atendimento | WorkEasy'));
    view.unmount();
    expect(document.title).toBe('Antes');
  });
});
