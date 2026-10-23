import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import AppShell from '../../AppShell';
import { LEGAL_DOCS } from '../../config/legal';

// Demo mode even when a developer's .env.local configures Supabase (Vitest loads it like Vite)
vi.mock('../../lib/supabase', () => ({ supabase: null, backendEnabled: false }));

// The page tests do not depend on the wording of the real texts in content/legal
vi.mock('../../pages/legal/sources', () => {
  const SAMPLE: Record<string, string> = {
    termos: [
      '# Termos de Uso do exemplo',
      '',
      'Texto de abertura com **destaque** e um [link para o SAC](/sac).',
      '',
      '## 1. Definições',
      '',
      '1. Primeiro item',
      '2. Segundo item',
      '',
      '| Item | Valor |',
      '|---|---|',
      '| a | b |',
      '',
      '### Subseção',
      '',
      '<script>alert(1)</script> e [fora](javascript:alert(1)).',
    ].join('\n'),
    privacidade: '# Política de exemplo\n\nTexto da política.',
    sac: '# SAC de exemplo\n\nTexto do SAC.',
  };
  // like the real loader, hand out the same promise every time: React's use() needs it to be stable
  const promises = new Map<string, Promise<string>>();
  return {
    loadLegalSource: (id: string) => {
      if (!promises.has(id)) promises.set(id, Promise.resolve(SAMPLE[id]));
      return promises.get(id) as Promise<string>;
    },
  };
});

const renderAt = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppShell />
      </MemoryRouter>
    </AuthProvider>,
  );

const DRAFT_NOTICE = /Rascunho em revisão jurídica/;

describe('/legal index', () => {
  it('lists the three legal texts with their versions and links', async () => {
    renderAt('/legal');
    expect(await screen.findByRole('heading', { name: 'Documentos legais' })).toBeInTheDocument();
    expect(screen.getByText(/Documentos em elaboração/)).toBeInTheDocument();
    const main = within(screen.getByRole('main'));
    for (const doc of LEGAL_DOCS) {
      expect(main.getByRole('link', { name: doc.title })).toHaveAttribute('href', doc.route);
    }
    expect(screen.getAllByText('Versão 2026-10-rascunho')).toHaveLength(LEGAL_DOCS.length);
  });
});

describe('legal text pages', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(LEGAL_DOCS.map(doc => [doc.route, doc.title] as const))('%s shows the title, the version and the draft notice', async (route, title) => {
    renderAt(route);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText('Versão 2026-10-rascunho')).toBeInTheDocument();
    expect(screen.getByText(DRAFT_NOTICE)).toBeInTheDocument();
    // the title of the file is not repeated: one h1 per page
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('renders the Markdown of the text: headings one level down, lists, tables and in-app links', async () => {
    renderAt('/termos');
    expect(await screen.findByRole('heading', { level: 2, name: '1. Definições' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Subseção' })).toBeInTheDocument();
    expect(screen.getByText('destaque').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(expect.arrayContaining(['Primeiro item', 'Segundo item']));
    expect(screen.getByRole('columnheader', { name: 'Valor' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'link para o SAC' })).toHaveAttribute('href', '/sac');
  });

  it('shows raw HTML as text and refuses a link that could run code', async () => {
    const { container } = renderAt('/termos');
    await screen.findByRole('heading', { level: 2, name: '1. Definições' });
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'fora' })).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('offers to print on the website but not in the native shells', async () => {
    const { unmount } = renderAt('/privacidade');
    expect(await screen.findByRole('button', { name: 'Imprimir' })).toBeInTheDocument();
    unmount();
    vi.stubEnv('VITE_ROUTER', 'hash');
    renderAt('/privacidade');
    await screen.findByRole('heading', { level: 1, name: 'Política de Privacidade' });
    expect(screen.queryByRole('button', { name: 'Imprimir' })).toBeNull();
  });

  it('has a way back to the index', async () => {
    renderAt('/privacidade');
    expect(await screen.findByRole('link', { name: /Documentos legais/ })).toHaveAttribute('href', '/legal');
  });

  it('drops the draft notice and the draft marker once the texts are declared in force', async () => {
    vi.stubEnv('VITE_LEGAL_STATUS', 'vigente');
    renderAt('/termos');
    expect(await screen.findByRole('heading', { level: 1, name: 'Termos de Uso' })).toBeInTheDocument();
    expect(screen.queryByText(DRAFT_NOTICE)).toBeNull();
    expect(screen.getByText('Versão 2026-10')).toBeInTheDocument();
  });

  it('keeps the draft notice for any other status', async () => {
    vi.stubEnv('VITE_LEGAL_STATUS', 'Vigente');
    renderAt('/privacidade');
    expect(await screen.findByText(DRAFT_NOTICE)).toBeInTheDocument();
  });

  it('prints the company identification at the end of the text when it is configured', async () => {
    vi.stubEnv('VITE_COMPANY_NAME', 'Acme Serviços Ltda');
    vi.stubEnv('VITE_COMPANY_CNPJ', '12.345.678/0001-95');
    vi.stubEnv('VITE_COMPANY_ADDRESS', 'Rua Exemplo, 100, São Paulo, SP');
    vi.stubEnv('VITE_SAC_EMAIL', 'sac@example.com');
    const { container } = renderAt('/privacidade');
    await screen.findByRole('heading', { level: 1, name: 'Política de Privacidade' });
    const article = container.querySelector('article') as HTMLElement;
    const identification = within(article).getByText(/Acme Serviços Ltda · CNPJ 12\.345\.678\/0001-95/);
    expect(identification).toBeInTheDocument();
    expect(within(article).getByText('Rua Exemplo, 100, São Paulo, SP')).toBeInTheDocument();
    expect(within(article).getByRole('link', { name: 'sac@example.com' })).toHaveAttribute('href', 'mailto:sac@example.com');
  });

  it('lists the SAC channels on the SAC page', async () => {
    vi.stubEnv('VITE_SAC_EMAIL', 'sac@example.com');
    vi.stubEnv('VITE_SAC_WHATSAPP', '5511999999999');
    renderAt('/sac');
    const section = (await screen.findByRole('heading', { name: 'Canais de atendimento' })).closest('section') as HTMLElement;
    expect(within(section).getByRole('link', { name: 'sac@example.com' })).toHaveAttribute('href', 'mailto:sac@example.com');
    const whatsapp = within(section).getByRole('link', { name: '(11) 99999-9999' });
    expect(whatsapp).toHaveAttribute('href', 'https://wa.me/5511999999999');
    expect(whatsapp).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows no channels section when none is configured', async () => {
    vi.stubEnv('VITE_SAC_EMAIL', '');
    vi.stubEnv('VITE_SAC_WHATSAPP', '');
    renderAt('/sac');
    await screen.findByRole('heading', { level: 1, name: /SAC/ });
    expect(screen.queryByRole('heading', { name: 'Canais de atendimento' })).toBeNull();
  });
});
