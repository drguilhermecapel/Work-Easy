import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import AppShell from '../AppShell';
import { findArea } from '../catalog';

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
