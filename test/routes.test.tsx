import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import AppShell from '../AppShell';

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
  ['/search?category=health', /Profissionais de Saúde e Bem-estar/],
  ['/health', /Encontre o especialista certo/],
  ['/doctor/doc-1', /CRM: SP 000000 \(DEMO\)/],
  ['/profile/1', /Serviços e Preços/],
  ['/dashboard', /Meus Pedidos/],
  ['/verification', /Como será a verificação/],
  ['/legal', /Documentos em elaboração/],
  ['/register-provider', /Cadastro de Profissional/],
  ['/teleconsultation/demo', /Funcionalidade futura/],
  ['/medical-records', /Área restrita/],
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
});
