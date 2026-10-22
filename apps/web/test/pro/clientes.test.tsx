import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { baseTables, isEq, ok, providerRow, signInProvider, type ProFake, type TableCall } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createProFake } = await import('./fake');
  return { supabase: createProFake(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { renderPro } = await import('./render');
const fake = supabase as unknown as ProFake;

let clients: Array<Record<string, unknown>>;

const client = (overrides: Record<string, unknown> = {}) => ({
  id: 'cli-1',
  client_id: null,
  name: 'Carlos Dias',
  phone: '+5511987654321',
  email: 'carlos@example.com',
  notes: 'Prefere de manhã',
  origin: 'own',
  created_at: '2026-10-01T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  fake.reset();
  signInProvider(fake);
  clients = [];
  fake.tables = {
    ...baseTables({ provider: providerRow() }),
    provider_clients: (call: TableCall) => {
      if (call.op === 'insert') {
        const row = client({ id: `cli-${clients.length + 1}`, origin: 'own', client_id: null, ...(call.payload as object) });
        clients = [...clients, row];
        return ok(row);
      }
      if (call.op === 'update') {
        clients = clients.map(item => (isEq(call, 'id', item.id) ? { ...item, ...(call.payload as object) } : item));
        return ok(clients.find(item => isEq(call, 'id', item.id)) ?? null);
      }
      if (call.op === 'delete') {
        clients = clients.filter(item => !isEq(call, 'id', item.id));
        return ok(null);
      }
      return ok(clients);
    },
  };
});

describe('/pro/clientes (CRM)', () => {
  it('explains the empty state', async () => {
    renderPro('/pro/clientes');
    expect(await screen.findByText(/Você ainda não tem clientes cadastrados/)).toBeInTheDocument();
  });

  it('creates a client keeping only contact data and the phone in E.164', async () => {
    const user = userEvent.setup();
    renderPro('/pro/clientes');
    await user.click(await screen.findByRole('button', { name: /Novo cliente/ }));
    await user.type(await screen.findByLabelText('Nome'), '  Carlos Dias ');
    await user.type(screen.getByLabelText('Celular com DDD (opcional)'), '(11) 98765-4321');
    await user.type(screen.getByLabelText('E-mail (opcional)'), 'carlos@example.com');
    await user.type(screen.getByLabelText('Anotações (opcional)'), 'Prefere de manhã');
    await user.click(screen.getByRole('button', { name: 'Salvar cliente' }));

    const card = (await screen.findByRole('heading', { name: 'Carlos Dias' })).closest('li') as HTMLElement;
    expect(within(card).getByText('(11) 98765-4321 · carlos@example.com')).toBeInTheDocument();
    expect(within(card).getByText('Cliente próprio')).toBeInTheDocument();
    // client_id and origin belong to the server: never sent
    expect(fake.tableCalls.find(call => call.table === 'provider_clients' && call.op === 'insert')?.payload).toEqual({
      name: 'Carlos Dias',
      phone: '+5511987654321',
      email: 'carlos@example.com',
      notes: 'Prefere de manhã',
      provider_id: 'prov-1',
    });
  });

  it('refuses a bad phone, e-mail or empty name before saving', async () => {
    const user = userEvent.setup();
    renderPro('/pro/clientes');
    await user.click(await screen.findByRole('button', { name: /Novo cliente/ }));
    await user.click(await screen.findByRole('button', { name: 'Salvar cliente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o nome do cliente.');

    await user.type(screen.getByLabelText('Nome'), 'Carlos');
    await user.type(screen.getByLabelText('Celular com DDD (opcional)'), '123');
    await user.click(screen.getByRole('button', { name: 'Salvar cliente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confira o número de telefone informado');

    await user.clear(screen.getByLabelText('Celular com DDD (opcional)'));
    await user.type(screen.getByLabelText('E-mail (opcional)'), 'carlos@');
    await user.click(screen.getByRole('button', { name: 'Salvar cliente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confira o e-mail informado');
    expect(clients).toEqual([]);
  });

  it('edits a client, filters the list and deletes after confirming', async () => {
    clients = [client(), client({ id: 'cli-2', name: 'Marta Lima', phone: '+5521999990000', email: null, notes: null, origin: 'platform' })];
    const user = userEvent.setup();
    renderPro('/pro/clientes');

    expect(await screen.findByText('Veio pelo WorkEasy')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Buscar cliente'), 'mart');
    expect(screen.queryByRole('heading', { name: 'Carlos Dias' })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Buscar cliente'));
    await user.type(screen.getByLabelText('Buscar cliente'), 'zzz');
    expect(screen.getByText('Nenhum cliente encontrado.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Buscar cliente'));

    await user.click(screen.getByRole('button', { name: 'Editar Carlos Dias' }));
    const phone = await screen.findByLabelText('Celular com DDD (opcional)');
    expect(phone).toHaveValue('(11) 98765-4321');
    await user.clear(phone);
    await user.type(phone, '(11) 91234-5678');
    await user.click(screen.getByRole('button', { name: 'Salvar cliente' }));
    await waitFor(() => expect(clients[0].phone).toBe('+5511912345678'));
    expect(await screen.findByText(/\(11\) 91234-5678/)).toBeInTheDocument();

    const card = screen.getByRole('heading', { name: 'Carlos Dias' }).closest('li') as HTMLElement;
    expect(within(card).getByRole('link', { name: 'Novo atendimento' })).toHaveAttribute('href', '/pro/agenda?cliente=cli-1');
    expect(within(card).getByRole('link', { name: 'Novo orçamento' })).toHaveAttribute('href', '/pro/orcamentos?cliente=cli-1');
    await user.click(within(card).getByRole('button', { name: 'Excluir' }));
    await user.click(within(card).getByRole('button', { name: 'Sim, excluir' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Carlos Dias' })).not.toBeInTheDocument());
    expect(clients.map(item => item.id)).toEqual(['cli-2']);
  });

  it('warns before deleting a client that has bookings, since they lose the name and the weekly grouping', async () => {
    clients = [client(), client({ id: 'cli-2', name: 'Marta Lima', origin: 'own' }), client({ id: 'cli-3', name: 'Paulo Reis', origin: 'own' })];
    fake.tables.bookings = () =>
      ok([
        { provider_client_id: 'cli-1' }, { provider_client_id: 'cli-1' }, { provider_client_id: 'cli-1' },
        { provider_client_id: 'cli-2' }, { provider_client_id: null },
      ]);
    const user = userEvent.setup();
    renderPro('/pro/clientes');

    const many = (await screen.findByRole('heading', { name: 'Carlos Dias' })).closest('li') as HTMLElement;
    await user.click(within(many).getByRole('button', { name: 'Excluir' }));
    expect(within(many).getByText(/Excluir Carlos Dias\? Os 3 atendimentos dele continuam na agenda, mas sem o nome do cliente/)).toBeInTheDocument();

    const one = screen.getByRole('heading', { name: 'Marta Lima' }).closest('li') as HTMLElement;
    await user.click(within(one).getByRole('button', { name: 'Excluir' }));
    expect(within(one).getByText(/Excluir Marta Lima\? O atendimento dele continua na agenda/)).toBeInTheDocument();

    const none = screen.getByRole('heading', { name: 'Paulo Reis' }).closest('li') as HTMLElement;
    await user.click(within(none).getByRole('button', { name: 'Excluir' }));
    expect(within(none).getByText('Excluir Paulo Reis?')).toBeInTheDocument();
    expect(fake.tableCalls.find(call => call.table === 'bookings')?.filters).toEqual([['eq', 'provider_id', 'prov-1']]);
  });
});
