import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import AppShell from '../AppShell';
import { findArea } from '../catalog';

// Demo mode even when a developer's .env.local configures Supabase (Vitest loads it like Vite)
vi.mock('../lib/supabase', () => ({ supabase: null, backendEnabled: false }));

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const healthArea = findArea('health')?.name ?? 'Saúde';

const renderAt = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppShell />
      </MemoryRouter>
    </AuthProvider>,
  );

const ROUTES: Array<[path: string, expected: RegExp]> = [
  ['/', /Contrate serviços/],
  ['/search', /Todos os profissionais/],
  ['/search?category=health', new RegExp(`Profissionais de ${escape(healthArea)}`)],
  ['/health', /Encontre o especialista certo/],
  ['/doctor/doc-1', /CRM: SP 000000 \(DEMO\)/],
  ['/profile/1', /Serviços e Preços/],
  ['/dashboard', /Meus Pedidos/],
  ['/verification', /Como será a verificação/],
  ['/legal', /Documentos em elaboração/],
  ['/termos', /Versão 2026-10-rascunho/],
  ['/privacidade', /Versão 2026-10-rascunho/],
  ['/sac', /Versão 2026-10-rascunho/],
  ['/register-provider', /Cadastro de Profissional/],
  ['/teleconsultation/demo', /Funcionalidade futura/],
  ['/medical-records', /Área restrita/],
  ['/categorias', /Todas as categorias/],
  ['/categorias/limpeza', /serviços e profissões/],
  ['/servicos/diarista', /O que o WorkEasy vai pedir de quem presta este serviço/],
];

describe('routes', () => {
  it.each(ROUTES)('%s renders with the demo banner', async (path, expected) => {
    renderAt(path);
    expect(await screen.findByText(expected, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Dados fictícios, sem atendimento/)).toBeInTheDocument();
  });

  it('keeps the prototype footer, with the legal texts one click away', async () => {
    renderAt('/');
    const footer = await screen.findByRole('contentinfo');
    expect(footer).toHaveTextContent('Protótipo de demonstração');
    const links = within(within(footer).getByRole('navigation', { name: 'Rodapé' }));
    expect(links.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('href', '/termos');
    expect(links.getByRole('link', { name: 'Privacidade' })).toHaveAttribute('href', '/privacidade');
    expect(links.getByRole('link', { name: 'Trabalhe Conosco' })).toHaveAttribute('href', '/register-provider');
    expect(screen.queryByRole('link', { name: 'Pedir um serviço' })).not.toBeInTheDocument();
  });

  it('keeps the demo health search behind the health category of the home page', async () => {
    renderAt('/');
    (await screen.findByRole('button', { name: healthArea })).click();
    expect(await screen.findByText(/Encontre o especialista certo/)).toBeInTheDocument();
  });

  it('keeps the fictitious professionals and the search filters of the demo', async () => {
    renderAt('/search?q=pintor');
    expect(await screen.findByText('João Santos')).toBeInTheDocument();
    expect(screen.getByText(/profissionais de demonstração encontrados/)).toBeInTheDocument();
  });

  it('redirects unknown paths to the home page', async () => {
    renderAt('/does-not-exist');
    expect(await screen.findByText(/Contrate serviços/)).toBeInTheDocument();
  });

  it('lists health professionals in the health category search', async () => {
    renderAt('/search?category=health');
    expect(await screen.findByText('Dr. Roberto Costa')).toBeInTheDocument();
  });

  it('shows the domestic-work limit and background check for a housekeeper', async () => {
    renderAt('/servicos/diarista');
    expect(await screen.findByText(/limitar a 2 dias por semana na mesma casa/)).toBeInTheDocument();
    expect(screen.getByText('Certidão de antecedentes criminais')).toBeInTheDocument();
  });

  it('redirects unknown services and areas to the category list', async () => {
    renderAt('/servicos/nao-existe');
    expect(await screen.findByText('Todas as categorias')).toBeInTheDocument();
  });

  it('preselects the occupation when a provider signs up from a service page', async () => {
    renderAt('/register-provider?ocupacao=diarista');
    expect(await screen.findByText(/Cadastro de Profissional/)).toBeInTheDocument();
  });
});
