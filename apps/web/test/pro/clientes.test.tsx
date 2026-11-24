import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { blobHead, blobText, captureDownloads } from './download';
import { baseTables, isEq, ok, providerRow, ruleError, signInProvider, type ProFake, type TableCall } from './fake';

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
  cpf_cnpj: null,
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

  it('does not offer to delete a client with a job or a quote, since the history keeps its client', async () => {
    clients = [
      client(), client({ id: 'cli-2', name: 'Marta Lima', origin: 'own' }),
      client({ id: 'cli-3', name: 'Paulo Reis', origin: 'own' }), client({ id: 'cli-4', name: 'Ana Souza', origin: 'own' }),
    ];
    fake.tables.bookings = () =>
      ok([
        { provider_client_id: 'cli-1' }, { provider_client_id: 'cli-1' }, { provider_client_id: 'cli-1' },
        { provider_client_id: 'cli-2' }, { provider_client_id: null },
      ]);
    fake.tables.quotes = () =>
      ok([{ id: 'q-1', provider_client_id: 'cli-3', title: 'Pintura', status: 'draft', total_cents: 10000, items: [], created_at: '2026-10-02T00:00:00Z' }]);
    const user = userEvent.setup();
    renderPro('/pro/clientes');

    const withJobs = (await screen.findByRole('heading', { name: 'Carlos Dias' })).closest('li') as HTMLElement;
    expect(within(withJobs).queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
    expect(within(withJobs).getByText('Não pode ser excluído: tem atendimentos ou orçamentos no histórico.')).toBeInTheDocument();

    const withJob = screen.getByRole('heading', { name: 'Marta Lima' }).closest('li') as HTMLElement;
    expect(within(withJob).queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();

    const withQuote = screen.getByRole('heading', { name: 'Paulo Reis' }).closest('li') as HTMLElement;
    expect(within(withQuote).queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();

    const free = screen.getByRole('heading', { name: 'Ana Souza' }).closest('li') as HTMLElement;
    await user.click(within(free).getByRole('button', { name: 'Excluir' }));
    expect(within(free).getByText('Excluir Ana Souza?')).toBeInTheDocument();
    expect(fake.tableCalls.find(call => call.table === 'bookings')?.filters).toEqual([['eq', 'provider_id', 'prov-1']]);
  });

  it('shows the database refusal in words when a client with history is deleted anyway', async () => {
    clients = [client()];
    fake.tables.provider_clients = (call: TableCall) => (call.op === 'delete' ? ruleError('client_has_history') : ok(clients));
    const user = userEvent.setup();
    renderPro('/pro/clientes');

    const card = (await screen.findByRole('heading', { name: 'Carlos Dias' })).closest('li') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Excluir' }));
    await user.click(within(card).getByRole('button', { name: 'Sim, excluir' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este cliente tem atendimentos ou orçamentos e não pode ser apagado da lista. O histórico precisa ficar.',
    );
    expect(clients).toHaveLength(1);
  });
});

describe('/pro/clientes: CSV export', () => {
  it('exports the contacts for Excel, without the private notes', async () => {
    const downloads = captureDownloads();
    const user = userEvent.setup();
    clients = [
      client({ created_at: '2026-10-01T12:00:00Z' }),
      client({ id: 'cli-2', name: 'Zuleica =1+1', phone: null, email: null, origin: 'platform', created_at: '2026-10-02T12:00:00Z', notes: 'segredo' }),
    ];
    renderPro('/pro/clientes');
    await user.click(await screen.findByRole('button', { name: 'Exportar CSV' }));

    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toMatch(/^clientes-workeasy-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(await blobHead(downloads[0].blob)).toEqual([0xef, 0xbb, 0xbf]);
    const text = await blobText(downloads[0].blob);
    expect(text).toBe(
      'Nome;Celular;E-mail;Origem;Cadastrado em\r\n' +
        'Carlos Dias;(11) 98765-4321;carlos@example.com;Cliente próprio;01/10/2026\r\n' +
        'Zuleica =1+1;;;Veio pelo WorkEasy;02/10/2026\r\n',
    );
    expect(text).not.toMatch(/Prefere|segredo/);
  });

  it('has nothing to export without clients', async () => {
    renderPro('/pro/clientes');
    expect(await screen.findByText(/Você ainda não tem clientes cadastrados/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
  });
});

describe('/pro/clientes: history', () => {
  const booking = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    client_id: null,
    provider_client_id: 'cli-1',
    occupation_slug: 'diarista',
    period: '[2030-01-15T12:00:00Z,2030-01-15T16:00:00Z)',
    price_cents: 15000,
    status: 'completed',
    origin: 'own',
    platform_fee_cents: 0,
    notes: null,
    canceled_reason: null,
    created_at: '2030-01-01T12:00:00Z',
    ...overrides,
  });
  const quote = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    provider_id: 'prov-1',
    provider_client_id: 'cli-1',
    client_name: 'Carlos Dias',
    client_phone: null,
    title: 'Pintura da sala',
    items: [],
    total_cents: 45000,
    valid_until: null,
    notes: null,
    status: 'accepted',
    public_token: 'tok',
    created_at: '2030-02-01T12:00:00Z',
    updated_at: '2030-02-01T12:00:00Z',
    ...overrides,
  });

  it('lists the bookings and quotes of a client, newest first, and nothing of the others', async () => {
    const user = userEvent.setup();
    clients = [client(), client({ id: 'cli-2', name: 'Marta Lima' })];
    fake.tables.bookings = () =>
      ok([
        booking('b-1'),
        booking('b-2', { period: '[2030-03-10T12:00:00Z,2030-03-10T14:00:00Z)', status: 'canceled', price_cents: 9000 }),
        booking('b-other', { provider_client_id: 'cli-2' }),
      ]);
    fake.tables.quotes = () => ok([quote('q-1'), quote('q-other', { provider_client_id: 'cli-2', title: 'Outro orçamento' })]);
    renderPro('/pro/clientes');

    const card = (await screen.findByRole('heading', { name: 'Carlos Dias' })).closest('li') as HTMLElement;
    await user.click(within(card).getByText('Histórico (3)'));
    const lines = within(card).getAllByRole('listitem').map(item => item.textContent ?? '');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^10\/03\/2030 · Atendimento de Diarista · Cancelado · R\$\s90,00$/);
    expect(lines[1]).toMatch(/^01\/02\/2030 · Orçamento "Pintura da sala" · Aceito pelo cliente · R\$\s450,00$/);
    expect(lines[2]).toMatch(/^15\/01\/2030 · Atendimento de Diarista · Concluído · R\$\s150,00$/);

    const other = (screen.getByRole('heading', { name: 'Marta Lima' })).closest('li') as HTMLElement;
    expect(within(other).getByText('Histórico (2)')).toBeInTheDocument();
    expect(within(other).getByText(/Outro orçamento/)).not.toBeVisible(); // collapsed until opened
  });

  it('shows no history for a client without bookings or quotes, and keeps the list when the history cannot be read', async () => {
    clients = [client()];
    // The count behind the delete warning still works; only the full bookings read behind the history fails
    fake.tables.bookings = (call: TableCall) =>
      call.columns === 'provider_client_id' ? ok([]) : { data: null, error: { code: '42501', message: 'rls' } };
    fake.tables.quotes = () => ok([]);
    renderPro('/pro/clientes');
    expect(await screen.findByRole('heading', { name: 'Carlos Dias' })).toBeInTheDocument();
    expect(screen.queryByText(/Histórico/)).not.toBeInTheDocument();
  });
});

describe('/pro/clientes: CPF or CNPJ for charges', () => {
  const CPF = '52998224725';
  const CNPJ = '11222333000181';
  const updates = () => fake.tableCalls.filter(call => call.table === 'provider_clients' && call.op === 'update').map(call => call.payload);
  const inserts = () => fake.tableCalls.filter(call => call.table === 'provider_clients' && call.op === 'insert').map(call => call.payload);

  it('formats a CPF and a CNPJ for display and leaves anything else as it is', async () => {
    const { formatCpfCnpj } = await import('../../services/proClients');
    expect(formatCpfCnpj(CPF)).toBe('529.982.247-25');
    expect(formatCpfCnpj(CNPJ)).toBe('11.222.333/0001-81');
    expect(formatCpfCnpj(null)).toBe('');
    expect(formatCpfCnpj(undefined)).toBe('');
    expect(formatCpfCnpj('123')).toBe('123');
  });

  it('creates a client with a CPF typed with punctuation, saves digits only and shows only that the document exists', async () => {
    const user = userEvent.setup();
    renderPro('/pro/clientes');
    await user.click(await screen.findByRole('button', { name: /Novo cliente/ }));
    await user.type(await screen.findByLabelText('Nome'), 'Carlos Dias');
    await user.type(screen.getByLabelText('CPF ou CNPJ (para cobranças)'), '529.982.247-25');
    await user.click(screen.getByRole('button', { name: 'Salvar cliente' }));

    const card = (await screen.findByRole('heading', { name: 'Carlos Dias' })).closest('li') as HTMLElement;
    expect(inserts()).toEqual([{ name: 'Carlos Dias', phone: null, email: null, notes: null, cpf_cnpj: CPF, provider_id: 'prov-1' }]);
    expect(within(card).getByText('Documento cadastrado: sim')).toBeInTheDocument();
    // The list never prints the number, masked or not
    expect(card.textContent).not.toMatch(/529|98224725|\d{3}\.\d{3}/);
  });

  it('shows "não" for a client without document and sends no document column when the field stays empty', async () => {
    clients = [client()];
    const user = userEvent.setup();
    renderPro('/pro/clientes');
    const card = (await screen.findByRole('heading', { name: 'Carlos Dias' })).closest('li') as HTMLElement;
    expect(within(card).getByText('Documento cadastrado: não')).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Editar Carlos Dias' }));
    expect(await screen.findByLabelText('CPF ou CNPJ (para cobranças)')).toHaveValue('');
    await user.clear(screen.getByLabelText('Anotações (opcional)'));
    await user.type(screen.getByLabelText('Anotações (opcional)'), 'Nova nota');
    await user.click(screen.getByRole('button', { name: 'Salvar cliente' }));
    await waitFor(() => expect(updates()).toHaveLength(1));
    // A document nobody touched is left alone
    expect(updates()[0]).toEqual({ name: 'Carlos Dias', phone: '+5511987654321', email: 'carlos@example.com', notes: 'Nova nota' });
  });

  it('refuses a document with wrong check digits next to its field, keeps the focus there and saves nothing', async () => {
    const user = userEvent.setup();
    renderPro('/pro/clientes');
    await user.click(await screen.findByRole('button', { name: /Novo cliente/ }));
    await user.type(await screen.findByLabelText('Nome'), 'Carlos Dias');
    const field = screen.getByLabelText('CPF ou CNPJ (para cobranças)');
    await user.type(field, '529.982.247-26');
    await user.click(screen.getByRole('button', { name: 'Salvar cliente' }));

    const error = await screen.findByText('Informe um CPF ou CNPJ válido (11 ou 14 números).');
    expect(error).toHaveAttribute('role', 'alert');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field.getAttribute('aria-describedby')).toContain(error.id);
    expect(field).toHaveFocus();
    expect(inserts()).toEqual([]);

    // Typing again clears the error; a valid CNPJ is then accepted
    await user.clear(field);
    expect(screen.queryByText('Informe um CPF ou CNPJ válido (11 ou 14 números).')).not.toBeInTheDocument();
    await user.type(field, '11.222.333/0001-81');
    await user.click(screen.getByRole('button', { name: 'Salvar cliente' }));
    await waitFor(() => expect(inserts()).toHaveLength(1));
    expect(inserts()[0]).toMatchObject({ cpf_cnpj: CNPJ });
  });

  it('masks a valid document when the field loses the focus', async () => {
    const user = userEvent.setup();
    renderPro('/pro/clientes');
    await user.click(await screen.findByRole('button', { name: /Novo cliente/ }));
    const field = await screen.findByLabelText('CPF ou CNPJ (para cobranças)');
    await user.type(field, CPF);
    await user.tab();
    expect(field).toHaveValue('529.982.247-25');
    await user.clear(field);
    await user.type(field, CNPJ);
    await user.tab();
    expect(field).toHaveValue('11.222.333/0001-81');
  });

  it('edits the document of a client: shows it masked, replaces it, then clears it', async () => {
    clients = [client({ cpf_cnpj: CPF })];
    const user = userEvent.setup();
    renderPro('/pro/clientes');
    let card = (await screen.findByRole('heading', { name: 'Carlos Dias' })).closest('li') as HTMLElement;
    expect(within(card).getByText('Documento cadastrado: sim')).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Editar Carlos Dias' }));
    const field = await screen.findByLabelText('CPF ou CNPJ (para cobranças)');
    expect(field).toHaveValue('529.982.247-25');
    await user.clear(field);
    await user.type(field, CNPJ);
    await user.click(screen.getByRole('button', { name: 'Salvar cliente' }));
    await waitFor(() => expect(clients[0].cpf_cnpj).toBe(CNPJ));

    card = (await screen.findByRole('heading', { name: 'Carlos Dias' })).closest('li') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Editar Carlos Dias' }));
    const again = await screen.findByLabelText('CPF ou CNPJ (para cobranças)');
    expect(again).toHaveValue('11.222.333/0001-81');
    await user.clear(again);
    await user.click(screen.getByRole('button', { name: 'Salvar cliente' }));
    await waitFor(() => expect(clients[0].cpf_cnpj).toBeNull());
    expect(updates().at(-1)).toMatchObject({ cpf_cnpj: null });
    card = (await screen.findByRole('heading', { name: 'Carlos Dias' })).closest('li') as HTMLElement;
    expect(await within(card).findByText('Documento cadastrado: não')).toBeInTheDocument();
  });

  it('does not offer to change the document of a client who has an account on WorkEasy (the database refuses it)', async () => {
    clients = [client({ client_id: 'user-9', origin: 'platform', cpf_cnpj: CPF })];
    const user = userEvent.setup();
    renderPro('/pro/clientes');
    const card = (await screen.findByRole('heading', { name: 'Carlos Dias' })).closest('li') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Editar Carlos Dias' }));

    expect(await screen.findByText(/CPF ou CNPJ para cobranças: cadastrado\. Este cliente tem conta no WorkEasy/)).toBeInTheDocument();
    expect(screen.queryByLabelText('CPF ou CNPJ (para cobranças)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar cliente' }));
    await waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0]).not.toHaveProperty('cpf_cnpj');
  });

  it('shows the refusal of the database in words when it rejects the document', async () => {
    clients = [client()];
    fake.tables.provider_clients = (call: TableCall) => (call.op === 'update' ? ruleError('cpf_cnpj_invalid') : ok(clients));
    const user = userEvent.setup();
    renderPro('/pro/clientes');
    await user.click(await screen.findByRole('button', { name: 'Editar Carlos Dias' }));
    await user.type(await screen.findByLabelText('CPF ou CNPJ (para cobranças)'), CPF);
    await user.click(screen.getByRole('button', { name: 'Salvar cliente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CPF ou CNPJ inválido. Confira os números.');
  });

  it('keeps the document out of the CSV export and never writes it to the console', async () => {
    const downloads = captureDownloads();
    const logged: unknown[][] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(method =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void logged.push(args)),
    );
    clients = [client({ cpf_cnpj: CPF }), client({ id: 'cli-2', name: 'Empresa Alfa', cpf_cnpj: CNPJ })];
    const user = userEvent.setup();
    renderPro('/pro/clientes');
    await user.click(await screen.findByRole('button', { name: 'Exportar CSV' }));
    const text = await blobText(downloads[0].blob);

    expect(text.split('\r\n')[0]).toBe('Nome;Celular;E-mail;Origem;Cadastrado em');
    expect(text).not.toMatch(/52998224725|529\.982|11222333000181|11\.222\.333/);
    spies.forEach(spy => spy.mockRestore());
    expect(JSON.stringify(logged)).not.toMatch(/52998224725|529\.982|11222333000181|11\.222\.333/);
  });
});
