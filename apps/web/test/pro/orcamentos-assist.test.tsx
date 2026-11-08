import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { baseTables, functionData, functionError, ok, providerRow, signInProvider, type ProFake, type TableCall } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createProFake } = await import('./fake');
  return { supabase: createProFake(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { renderPro } = await import('./render');
const fake = supabase as unknown as ProFake;

type Row = Record<string, unknown>;

const DESCRIPTION = 'Pintar a sala e o corredor, uns 40 m² de parede, com duas demãos e material incluso';

const SUGGESTION = {
  intro: 'Olá! Segue a proposta para a pintura da sala e do corredor.',
  items: [
    { description: 'Pintura de parede, duas demãos', quantity: 40, unit: 'm2', unit_price_cents: 3500 },
    { description: 'Tinta e material', quantity: 1.5, unit: 'unidade', unit_price_cents: null },
  ],
  ai_generated: true,
  notice: 'Sugestão feita por inteligência artificial.',
};

const service = (overrides: Row = {}): Row => ({
  id: 'svc-1',
  provider_id: 'prov-1',
  occupation_slug: 'pintor',
  title: 'Pintura de parede',
  description: null,
  price_min_cents: 3500,
  price_max_cents: null,
  unit: 'm2',
  duration_minutes: null,
  active: true,
  ...overrides,
});

const quoteRow = (overrides: Row = {}): Row => ({
  id: 'q-1',
  provider_id: 'prov-1',
  provider_client_id: null,
  client_name: 'Carlos Dias',
  client_phone: null,
  title: 'Pintura da sala',
  items: [{ description: 'Mão de obra', quantity: 2, unit_price_cents: 15000 }],
  total_cents: 30000,
  valid_until: null,
  notes: null,
  status: 'draft',
  public_token: '3f1c2b64-7a8e-4d2b-9a43-0c6f1d5e8a10',
  created_at: '2030-02-01T12:00:00Z',
  updated_at: '2030-02-01T12:00:00Z',
  ...overrides,
});

let quotes: Row[];
let services: Row[];

beforeEach(() => {
  fake.reset();
  signInProvider(fake);
  quotes = [];
  services = [service(), service({ id: 'svc-2', title: 'Visita técnica', price_min_cents: 8000, price_max_cents: 12000, unit: 'visita' })];
  fake.tables = {
    ...baseTables({ provider: providerRow() }),
    provider_clients: () => ok([]),
    provider_occupations: () => ok([
      { occupation_slug: 'eletricista', is_primary: false, registry_number: null, registry_uf: null, registry_status: 'not_required', approved: true },
      { occupation_slug: 'pintor', is_primary: true, registry_number: null, registry_uf: null, registry_status: 'not_required', approved: true },
    ]),
    services: () => ok(services),
    quotes: (call: TableCall) => (call.op === 'select' ? ok(quotes) : ok(quotes[0] ?? quoteRow())),
  };
  fake.functionsHandlers['quote-assist'] = () => functionData(SUGGESTION);
});

const openEditor = async (user: ReturnType<typeof userEvent.setup>) => {
  renderPro('/pro/orcamentos');
  await user.click(await screen.findByRole('button', { name: /Novo orçamento/ }));
  return user.click(await screen.findByRole('button', { name: 'Sugerir itens com IA' }));
};

const ask = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByLabelText('Descreva o serviço'));
  await user.paste(DESCRIPTION);
  await user.click(screen.getByRole('button', { name: 'Gerar sugestão' }));
};

const savedWrites = () => fake.tableCalls.filter(call => call.table === 'quotes' && call.op !== 'select');

describe('/pro/orcamentos: Sugerir itens com IA', () => {
  it('says that the text goes to an AI service, before anything is sent', async () => {
    const user = userEvent.setup();
    await openEditor(user);
    const panel = screen.getByRole('group', { name: 'Sugestão de itens com IA' });
    const notice = within(panel).getByRole('note');
    expect(notice).toHaveTextContent('enviado a um serviço de inteligência artificial de terceiros');
    expect(notice).toHaveTextContent('Não escreva CPF, telefone, endereço nem dados de saúde');
    expect(notice).toHaveTextContent('A IA pode errar');
    expect(notice).toHaveTextContent('Nada é salvo nem enviado ao cliente automaticamente');
    expect(fake.functionCalls).toEqual([]);
  });

  it('keeps the button off until the description has 10 characters', async () => {
    const user = userEvent.setup();
    await openEditor(user);
    const button = screen.getByRole('button', { name: 'Gerar sugestão' });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Descreva o serviço'), 'pintar sala');
    expect(button).toBeEnabled();
    await user.clear(screen.getByLabelText('Descreva o serviço'));
    expect(button).toBeDisabled();
    expect(fake.functionCalls).toEqual([]);
  });

  it('fills items, prices and notes of the form, saves nothing and leaves empty the price nobody gave', async () => {
    const user = userEvent.setup();
    await openEditor(user);
    await user.click(screen.getByLabelText(/Pintura de parede · R\$ 35,00 por m²/));
    await ask(user);

    expect(await screen.findByText(/Sugestão aplicada ao orçamento: 2 itens/)).toBeInTheDocument();
    expect(screen.getByLabelText('Item 1: descrição')).toHaveValue('Pintura de parede, duas demãos (por m²)');
    expect(screen.getByLabelText('Item 1: quantidade')).toHaveValue('40');
    expect(screen.getByLabelText('Item 1: preço unitário (R$)')).toHaveValue('35,00');
    expect(screen.getByLabelText('Item 2: descrição')).toHaveValue('Tinta e material');
    expect(screen.getByLabelText('Item 2: quantidade')).toHaveValue('1,5');
    expect(screen.getByLabelText('Item 2: preço unitário (R$)')).toHaveValue('');
    expect(screen.getByLabelText('Observações (opcional)')).toHaveValue(SUGGESTION.intro);
    // only the priced item counts in the preview; the server computes the real total on save
    expect(screen.getByText(/Total estimado:/)).toHaveTextContent('R$ 1.400,00');
    expect(screen.getByLabelText('Título')).toHaveValue('');

    expect(fake.functionCalls).toEqual([
      {
        name: 'quote-assist',
        body: {
          description: DESCRIPTION,
          occupation_slug: 'pintor',
          reference_prices: [{ label: 'Pintura de parede', unit_price_cents: 3500, unit: 'm2' }],
        },
      },
    ]);
    expect(savedWrites()).toEqual([]);
  });

  it('cannot be saved until the provider types the missing price, and saves what the provider confirmed', async () => {
    const user = userEvent.setup();
    await openEditor(user);
    await ask(user);
    await screen.findByText(/Sugestão aplicada/);
    await user.type(screen.getByLabelText('Título'), 'Pintura da sala');
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Item 2: informe o preço unitário em reais');
    expect(savedWrites()).toEqual([]);

    await user.type(screen.getByLabelText('Item 2: preço unitário (R$)'), '90,00');
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    expect(await screen.findByText('Orçamento salvo.')).toBeInTheDocument();
    expect(savedWrites().map(call => call.payload)).toEqual([
      {
        provider_client_id: null,
        client_name: null,
        client_phone: null,
        title: 'Pintura da sala',
        items: [
          { description: 'Pintura de parede, duas demãos (por m²)', quantity: 40, unit_price_cents: 3500 },
          { description: 'Tinta e material', quantity: 1.5, unit_price_cents: 9000 },
        ],
        valid_until: null,
        notes: SUGGESTION.intro,
        provider_id: 'prov-1',
        status: 'draft',
      },
    ]);
  });

  it('sends no reference prices unless the provider marks some, and only the ones marked', async () => {
    const user = userEvent.setup();
    await openEditor(user);
    expect(screen.getByLabelText(/Pintura de parede · R\$ 35,00 por m²/)).not.toBeChecked();
    expect(screen.getByLabelText(/Visita técnica · R\$ 80,00 a R\$ 120,00 por visita/)).not.toBeChecked();
    await ask(user);
    await screen.findByText(/Sugestão aplicada/);
    expect(fake.functionCalls[0].body).toEqual({ description: DESCRIPTION, occupation_slug: 'pintor' });

    await user.click(screen.getByLabelText(/Visita técnica/));
    await user.click(screen.getByRole('button', { name: 'Gerar sugestão' }));
    await screen.findByText(/Sugestão aplicada/);
    // a range of prices sends the lower one
    expect(fake.functionCalls[1].body).toMatchObject({ reference_prices: [{ label: 'Visita técnica', unit_price_cents: 8000, unit: 'visita' }] });
  });

  it('offers only active services that have a price', async () => {
    services = [service(), service({ id: 'svc-3', title: 'Serviço pausado', active: false }), service({ id: 'svc-4', title: 'Sob consulta', price_min_cents: 0 })];
    const user = userEvent.setup();
    await openEditor(user);
    await screen.findByLabelText(/Pintura de parede/);
    expect(screen.queryByLabelText(/Serviço pausado/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Sob consulta/)).not.toBeInTheDocument();
  });

  it('works without services or occupations: no reference prices, no occupation', async () => {
    services = [];
    fake.tables.provider_occupations = () => ok([]);
    const user = userEvent.setup();
    await openEditor(user);
    expect(screen.queryByText('Preços de referência (opcional)')).not.toBeInTheDocument();
    await ask(user);
    await screen.findByText(/Sugestão aplicada/);
    expect(fake.functionCalls[0].body).toEqual({ description: DESCRIPTION });
  });

  it('keeps what the provider already typed: items stay, the intro goes in front of the notes', async () => {
    const user = userEvent.setup();
    renderPro('/pro/orcamentos');
    await user.click(await screen.findByRole('button', { name: /Novo orçamento/ }));
    await user.type(await screen.findByLabelText('Título'), 'Pintura da sala');
    await user.type(screen.getByLabelText('Item 1: descrição'), 'Mão de obra');
    await user.type(screen.getByLabelText('Item 1: preço unitário (R$)'), '100,00');
    await user.type(screen.getByLabelText('Observações (opcional)'), 'Pagamento em 2 vezes');
    await user.click(screen.getByRole('button', { name: 'Sugerir itens com IA' }));
    await ask(user);
    await screen.findByText(/Sugestão aplicada/);

    expect(screen.getByLabelText('Título')).toHaveValue('Pintura da sala');
    expect(screen.getByLabelText('Item 1: descrição')).toHaveValue('Mão de obra');
    expect(screen.getByLabelText('Item 1: preço unitário (R$)')).toHaveValue('100,00');
    expect(screen.getByLabelText('Item 2: descrição')).toHaveValue('Pintura de parede, duas demãos (por m²)');
    expect(screen.getByLabelText('Item 3: descrição')).toHaveValue('Tinta e material');
    expect(screen.getByLabelText('Observações (opcional)')).toHaveValue(`${SUGGESTION.intro}\n\nPagamento em 2 vezes`);

    // asking again adds the items again but not the same intro twice
    await user.click(screen.getByRole('button', { name: 'Gerar sugestão' }));
    await screen.findByLabelText('Item 4: descrição');
    expect(screen.getByLabelText('Observações (opcional)')).toHaveValue(`${SUGGESTION.intro}\n\nPagamento em 2 vezes`);
  });

  it.each([
    [503, 'assist_not_configured', 'A IA ainda não está ativada neste ambiente. Monte os itens manualmente.'],
    [429, 'assist_rate_limited', 'Você usou todos os pedidos de IA desta hora. Tente de novo mais tarde. Monte os itens manualmente.'],
    [422, 'assist_declined', 'A IA não conseguiu usar este texto. Monte os itens manualmente.'],
    [502, 'assist_unavailable', 'A IA não conseguiu responder agora. Monte os itens manualmente.'],
    [503, 'assist_busy', 'A IA está ocupada no momento. Tente de novo em instantes. Monte os itens manualmente.'],
    [504, 'assist_timeout', 'A IA demorou para responder. Monte os itens manualmente.'],
  ])('explains an answer %i %s and leaves the form as it was', async (status, code, message) => {
    fake.functionsHandlers['quote-assist'] = () => functionError(status, code);
    const user = userEvent.setup();
    await openEditor(user);
    await ask(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Item 1: descrição')).toHaveValue('');
    expect(screen.getByLabelText('Observações (opcional)')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Gerar sugestão' })).toBeEnabled();
    expect(screen.queryByText(/Sugestão aplicada/)).not.toBeInTheDocument();
    expect(savedWrites()).toEqual([]);
  });

  it('explains a failure to reach the server and an answer it cannot read', async () => {
    fake.functionsHandlers['quote-assist'] = () => ({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to fetch' } });
    const user = userEvent.setup();
    await openEditor(user);
    await ask(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível falar com o servidor');

    fake.functionsHandlers['quote-assist'] = () => functionData({ intro: 3, items: 'x' });
    await user.click(screen.getByRole('button', { name: 'Gerar sugestão' }));
    await screen.findByText('Erro no servidor. Tente de novo em alguns minutos.');
    expect(screen.getByLabelText('Item 1: descrição')).toHaveValue('');
  });

  it('closes the panel and offers the button again', async () => {
    const user = userEvent.setup();
    await openEditor(user);
    await user.click(screen.getByRole('button', { name: 'Fechar sugestão' }));
    expect(screen.queryByRole('group', { name: 'Sugestão de itens com IA' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sugerir itens com IA' })).toBeInTheDocument();
  });

  it('is not offered on a quote that can no longer be changed', async () => {
    quotes = [quoteRow({ status: 'accepted' })];
    const user = userEvent.setup();
    renderPro('/pro/orcamentos');
    await user.click(await screen.findByRole('button', { name: 'Abrir Pintura da sala' }));
    expect(await screen.findByText(/já foi respondido ou venceu/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sugerir itens com IA' })).not.toBeInTheDocument();
  });
});
