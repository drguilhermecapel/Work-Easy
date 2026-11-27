import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriverDossier from '../../pages/mobilidade/DriverDossier';
import RideDriverIdentity from '../../pages/mobilidade/RideDriverIdentity';
import * as api from '../../services/driverDossier';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authUser: { id: 'self' } }) }));
vi.mock('../../services/driverDossier', async (original) => ({
  ...(await original<typeof api>()),
  getDriverDossier: vi.fn(),
  beginDriverDossier: vi.fn(),
  uploadDriverFile: vi.fn(),
  decideDriverDossier: vi.fn(),
  getDriverIdentity: vi.fn(),
  getDossierPhoto: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());
describe('dossiê de motorista e identificação do passageiro', () => {
  it('mantém dados pessoais e seleção de arquivos fora do formulário quando a coleta está fechada', async () => {
    vi.mocked(api.getDriverDossier).mockResolvedValue({ open: false });
    render(
      <MemoryRouter>
        <DriverDossier onChanged={vi.fn()} />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/coleta de documentos de condutor está fechada/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome a exibir ao passageiro')).not.toBeInTheDocument();
  });

  it('abre ficha após ciência da versão e permite apenas os dados de identificação definidos', async () => {
    vi.mocked(api.getDriverDossier).mockResolvedValue({ open: true, version: 'teste-1', dossier: null });
    render(
      <MemoryRouter>
        <DriverDossier onChanged={vi.fn()} />
      </MemoryRouter>,
    );
    await userEvent.type(await screen.findByLabelText('Nome a exibir ao passageiro'), 'Nome Teste');
    await userEvent.type(screen.getByLabelText('Número municipal do condutor'), 'TESTE-123');
    await userEvent.type(screen.getByLabelText('Modelo do veículo'), 'Modelo Teste');
    await userEvent.type(screen.getByLabelText('Placa do veículo'), 'ABC1D23');
    const open = screen.getByRole('button', { name: 'Abrir dossiê de verificação' });
    expect(open).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(open);
    expect(api.beginDriverDossier).toHaveBeenCalledWith(
      { name: 'Nome Teste', number: 'TESTE-123', model: 'Modelo Teste', plate: 'ABC1D23' },
      'teste-1',
    );
  });

  it('não pede URL de prova para observador sem projeção de identidade', async () => {
    vi.mocked(api.getDriverIdentity).mockResolvedValue(null);
    render(
      <MemoryRouter>
        <RideDriverIdentity legId="trecho" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /foto/ })).not.toBeInTheDocument();
    expect(api.getDossierPhoto).not.toHaveBeenCalled();
  });

  it('solicita URL curta apenas para a foto escolhida e o trecho atribuído', async () => {
    vi.mocked(api.getDriverIdentity).mockResolvedValue({
      name: 'Motorista Teste',
      number: 'Teste-123',
      plate: 'ABC1D23',
      model: 'Sedã',
      photos: { driver_photo: 'foto-condutor', vehicle_photo: 'foto-veiculo' },
    });
    vi.mocked(api.getDossierPhoto).mockResolvedValue({ url: 'https://example.test/foto-assinada' });
    render(
      <MemoryRouter>
        <RideDriverIdentity legId="trecho" />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Motorista Teste' });
    expect(api.getDossierPhoto).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Ver foto do veículo' }));
    expect(await screen.findByRole('img', { name: 'Foto do veículo' })).toHaveAttribute('src', 'https://example.test/foto-assinada');
    expect(api.getDossierPhoto).toHaveBeenCalledWith('foto-veiculo', 'trecho');
  });
});
