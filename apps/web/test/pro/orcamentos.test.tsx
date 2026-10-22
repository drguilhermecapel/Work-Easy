import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { baseTables, isEq, ok, providerRow, ruleError, signInProvider, type ProFake, type TableCall } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createProFake } = await import('./fake');
  return { supabase: createProFake(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { renderPro } = await import('./render');
const fake = supabase as unknown as ProFake;

const TOKEN = '3f1c2b64-7a8e-4d2b-9a43-0c6f1d5e8a10';
type Row = Record<string, unknown>;
let quotes: Row[];

/** The database trigger: the total is always recomputed on the server. */
const serverTotal = (items: Array<{ quantity: number; unit_price_cents: number }>) =>
  items.reduce((sum, item) => sum + Math.round(item.quantity * item.unit_price_cents), 0);

/** The second step of "save and send" (status draft -> sent) fails this many times. */
let sendFailures: number;

const quote = (overrides: Record<string, unknown> = {}) => ({
  id: 'q-1',
  provider_id: 'prov-1',
  provider_client_id: 'cli-1',
  client_name: 'Carlos Dias',
  client_phone: '+5511987654321',
  title: 'Pintura da sala',
  items: [{ description: 'Mão de obra', quantity: 2, unit_price_cents: 15000 }],
  total_cents: 30000,
  valid_until: null,
  notes: null,
  status: 'draft',
  public_token: TOKEN,
  created_at: '2030-02-01T12:00:00Z',
  updated_at: '2030-02-01T12:00:00Z',
  ...overrides,
});

beforeEach(() => {
  fake.reset();
  signInProvider(fake);
  quotes = [];
  sendFailures = 0;
  fake.tables = {
    ...baseTables({ provider: providerRow() }),
    provider_clients: () => ok([{ id: 'cli-1', client_id: null, name: 'Carlos Dias', phone: '+5511987654321', email: null, notes: null, origin: 'own', created_at: '2026-10-01T00:00:00Z' }]),
    quotes: (call: TableCall) => {
      if (call.op === 'insert') {
        const payload = call.payload as { items: Array<{ quantity: number; unit_price_cents: number }> };
        const row = quote({ id: `q-${quotes.length + 1}`, ...payload, total_cents: serverTotal(payload.items) });
        quotes = [row, ...quotes];
        return ok(row);
      }
      if (call.op === 'update') {
        if ((call.payload as Row).status === 'sent' && sendFailures > 0) {
          sendFailures -= 1;
          return { data: null, error: { name: 'TypeError', message: 'Failed to fetch' } };
        }
        const payload = call.payload as Row & { items?: Array<{ quantity: number; unit_price_cents: number }> };
        quotes = quotes.map(item =>
          isEq(call, 'id', item.id) ? { ...item, ...payload, ...(payload.items ? { total_cents: serverTotal(payload.items) } : {}) } : item,
        );
        return ok(quotes.find(item => isEq(call, 'id', item.id)) ?? null);
      }
      if (call.op === 'delete') {
        quotes = quotes.filter(item => !isEq(call, 'id', item.id));
        return ok(null);
      }
      return ok(quotes);
    },
  };
});

const fillFirstItem = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(await screen.findByLabelText('Título'), 'Pintura da sala');
  await user.type(screen.getByLabelText('Item 1: descrição'), 'Mão de obra');
  await user.clear(screen.getByLabelText('Item 1: quantidade'));
  await user.type(screen.getByLabelText('Item 1: quantidade'), '2');
  await user.type(screen.getByLabelText('Item 1: preço unitário (R$)'), '150,00');
};

describe('/pro/orcamentos', () => {
  it('explains the empty state', async () => {
    renderPro('/pro/orcamentos');
    expect(await screen.findByText(/Você ainda não fez orçamentos/)).toBeInTheDocument();
  });

  it('builds a quote with items, previews the total and shows the one the server computed', async () => {
    const user = userEvent.setup();
    renderPro('/pro/orcamentos');
    await user.click(await screen.findByRole('button', { name: /Novo orçamento/ }));
    await user.selectOptions(await screen.findByLabelText('Cliente cadastrado'), 'cli-1');
    expect(screen.getByLabelText('Nome do cliente')).toHaveValue('Carlos Dias');
    expect(screen.getByLabelText('Celular do cliente (opcional)')).toHaveValue('(11) 98765-4321');

    await fillFirstItem(user);
    await user.click(screen.getByRole('button', { name: /Adicionar item/ }));
    await user.type(screen.getByLabelText('Item 2: descrição'), 'Tinta e material');
    await user.type(screen.getByLabelText('Item 2: preço unitário (R$)'), '120,50');
    expect(screen.getByText(/Total estimado:/)).toHaveTextContent('R$ 420,50');

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    expect(await screen.findByText('Orçamento salvo.')).toBeInTheDocument();
    expect(fake.tableCalls.find(call => call.table === 'quotes' && call.op === 'insert')?.payload).toEqual({
      provider_client_id: 'cli-1',
      client_name: 'Carlos Dias',
      client_phone: '+5511987654321',
      title: 'Pintura da sala',
      items: [
        { description: 'Mão de obra', quantity: 2, unit_price_cents: 15000 },
        { description: 'Tinta e material', quantity: 1, unit_price_cents: 12050 },
      ],
      valid_until: null,
      notes: null,
      provider_id: 'prov-1',
      status: 'draft',
    });

    // The printable version shows what the server saved
    const document = screen.getByRole('article', { name: 'Versão para impressão do orçamento' });
    expect(within(document).getByText('Total: R$ 420,50')).toBeInTheDocument();
    expect(within(document).getByText('Mão de obra')).toBeInTheDocument();
    expect(within(document).getByText('R$ 300,00')).toBeInTheDocument(); // 2 x R$ 150,00
    expect(within(document).getByText('Profissional: Ana Souza')).toBeInTheDocument();
    // A draft has no live link yet
    expect(screen.getByText(/O link para o cliente só passa a valer depois que você enviar o orçamento/)).toBeInTheDocument();
  });

  it('checks the items before sending them', async () => {
    const user = userEvent.setup();
    renderPro('/pro/orcamentos');
    await user.click(await screen.findByRole('button', { name: /Novo orçamento/ }));
    await user.type(await screen.findByLabelText('Título'), 'Pintura');
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Item 1: informe a descrição.');

    await user.type(screen.getByLabelText('Item 1: descrição'), 'Mão de obra');
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Item 1: informe o preço unitário em reais');

    await user.type(screen.getByLabelText('Item 1: preço unitário (R$)'), '80');
    await user.clear(screen.getByLabelText('Item 1: quantidade'));
    await user.type(screen.getByLabelText('Item 1: quantidade'), '0');
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Item 1: a quantidade precisa ser maior que zero');
    expect(quotes).toEqual([]);
  });

  it('does not insert a second draft when sending fails after the draft was saved', async () => {
    sendFailures = 1;
    const user = userEvent.setup();
    renderPro('/pro/orcamentos');
    await user.click(await screen.findByRole('button', { name: /Novo orçamento/ }));
    await fillFirstItem(user);
    await user.click(screen.getByRole('button', { name: 'Salvar e enviar ao cliente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível falar com o servidor');
    expect(quotes).toHaveLength(1);
    expect(quotes[0].status).toBe('draft');

    // The next click updates the same draft and sends it
    await user.click(screen.getByRole('button', { name: 'Salvar e enviar ao cliente' }));
    expect(await screen.findByText('Orçamento enviado. Compartilhe o link com o cliente.')).toBeInTheDocument();
    expect(quotes).toHaveLength(1);
    expect(quotes[0].status).toBe('sent');
    expect(fake.tableCalls.filter(call => call.table === 'quotes' && call.op === 'insert')).toHaveLength(1);
  });

  it('refuses quantities that are not plain decimals and totals the database cannot hold', async () => {
    const user = userEvent.setup();
    renderPro('/pro/orcamentos');
    await user.click(await screen.findByRole('button', { name: /Novo orçamento/ }));
    await user.type(await screen.findByLabelText('Título'), 'Pintura');
    await user.type(screen.getByLabelText('Item 1: descrição'), 'Mão de obra');
    await user.type(screen.getByLabelText('Item 1: preço unitário (R$)'), '80,00');
    for (const typed of ['0x10', '1e9', '-1', '1,2345']) {
      await user.clear(screen.getByLabelText('Item 1: quantidade'));
      await user.type(screen.getByLabelText('Item 1: quantidade'), typed);
      await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
      expect(await screen.findByRole('alert'), typed).toHaveTextContent('Item 1: a quantidade precisa ser maior que zero, só com números');
    }
    await user.clear(screen.getByLabelText('Item 1: quantidade'));
    await user.type(screen.getByLabelText('Item 1: quantidade'), '1000000');
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/O total do orçamento passa do limite de R\$\s21\.474\.836,47/);
    expect(quotes).toEqual([]);
  });

  it('shows a sent quote past its validity as expired, as the client sees it', async () => {
    quotes = [quote({ status: 'sent', valid_until: '2020-01-01' }), quote({ id: 'q-2', title: 'Reforma', status: 'sent', valid_until: '2099-01-01' })];
    renderPro('/pro/orcamentos');
    const old = (await screen.findByText('Pintura da sala', { selector: 'h2' })).closest('li') as HTMLElement;
    expect(within(old).getByText('Vencido')).toBeInTheDocument();
    const current = screen.getByText('Reforma', { selector: 'h2' }).closest('li') as HTMLElement;
    expect(within(current).getByText('Enviado')).toBeInTheDocument();
  });

  it('removes an item, but keeps at least one', async () => {
    const user = userEvent.setup();
    renderPro('/pro/orcamentos');
    await user.click(await screen.findByRole('button', { name: /Novo orçamento/ }));
    expect(await screen.findByRole('button', { name: 'Remover item 1' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Adicionar item/ }));
    await user.click(screen.getByRole('button', { name: 'Remover item 2' }));
    expect(screen.queryByLabelText('Item 2: descrição')).not.toBeInTheDocument();
  });

  it('translates a quote the server refuses', async () => {
    const base = fake.tables.quotes;
    fake.tables.quotes = (call: TableCall) => (call.op === 'insert' ? ruleError('quote_items_invalid') : base(call));
    const user = userEvent.setup();
    renderPro('/pro/orcamentos');
    await user.click(await screen.findByRole('button', { name: /Novo orçamento/ }));
    await fillFirstItem(user);
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confira os itens do orçamento');
  });

  it('sends the quote and offers the public link, WhatsApp and printing', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderPro('/pro/orcamentos');
    await user.click(await screen.findByRole('button', { name: /Novo orçamento/ }));
    await user.selectOptions(await screen.findByLabelText('Cliente cadastrado'), 'cli-1');
    await fillFirstItem(user);
    fireEvent.change(screen.getByLabelText('Válido até (opcional)'), { target: { value: '2031-03-10' } });
    await user.click(screen.getByRole('button', { name: 'Salvar e enviar ao cliente' }));

    expect(await screen.findByText('Orçamento enviado. Compartilhe o link com o cliente.')).toBeInTheDocument();
    expect(quotes[0].status).toBe('sent');
    expect(quotes[0].valid_until).toBe('2031-03-10');

    const link = screen.getByLabelText('Link do orçamento') as HTMLInputElement;
    expect(link.value).toMatch(new RegExp(`/orcamento/${TOKEN}$`));
    expect(link).toHaveAttribute('readonly');

    await user.click(screen.getByRole('button', { name: 'Copiar link' }));
    expect(await screen.findByText('Copiado.')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(link.value);

    const whatsapp = screen.getByRole('link', { name: 'Abrir no WhatsApp' });
    expect(whatsapp).toHaveAttribute('target', '_blank');
    expect(whatsapp).toHaveAttribute('rel', expect.stringContaining('noopener'));
    const href = whatsapp.getAttribute('href') as string;
    expect(href).toMatch(/^https:\/\/wa\.me\/5511987654321\?text=/);
    const text = decodeURIComponent(href.split('?text=')[1]);
    expect(text).toContain('Olá, Carlos Dias!');
    expect(text).toContain('Pintura da sala');
    expect(text).toContain('R$');
    expect(text).toContain(link.value);

    await user.click(screen.getByRole('button', { name: /Imprimir ou salvar em PDF/ }));
    expect(print).toHaveBeenCalledTimes(1);
    // Everything but the document is hidden while printing
    expect(document.querySelector('style')?.textContent).toContain('@media print');
    expect(document.querySelector('.quote-print')).toBeInTheDocument();
  });

  it('opens a quote from the list, takes it back to draft and deletes the draft', async () => {
    quotes = [quote({ status: 'sent' })];
    const user = userEvent.setup();
    renderPro('/pro/orcamentos');

    expect(await screen.findByText('Pintura da sala', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByText('Enviado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abrir Pintura da sala' }));
    expect(await screen.findByLabelText('Título')).toHaveValue('Pintura da sala');
    expect(screen.getByText(/ao salvar, o cliente passa a ver a versão nova pelo mesmo link/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voltar para rascunho' }));
    await user.click(screen.getByRole('button', { name: 'Sim, voltar' }));
    expect(await screen.findByText('O orçamento voltou para rascunho e o link deixou de valer.')).toBeInTheDocument();
    expect(quotes[0].status).toBe('draft');

    await user.click(screen.getByRole('button', { name: 'Excluir rascunho' }));
    await user.click(screen.getByRole('button', { name: 'Sim, excluir' }));
    expect(await screen.findByText(/Você ainda não fez orçamentos/)).toBeInTheDocument();
    expect(quotes).toEqual([]);
  });

  it('locks an answered quote and links the accepted one to the charge', async () => {
    quotes = [quote({ status: 'accepted' }), quote({ id: 'q-2', title: 'Reforma do banheiro', status: 'declined' })];
    const user = userEvent.setup();
    renderPro('/pro/orcamentos');
    await user.click(await screen.findByRole('button', { name: 'Abrir Pintura da sala' }));

    expect(await screen.findByText(/já foi respondido ou venceu e não pode mais ser alterado/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
    expect(screen.getByText('Aceito pelo cliente')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cobrar este orçamento' })).toHaveAttribute('href', '/pro/cobrancas?orcamento=q-1');
    expect(screen.queryByRole('button', { name: 'Excluir rascunho' })).not.toBeInTheDocument();
  });

  it('starts a quote for the client chosen in the CRM', async () => {
    renderPro('/pro/orcamentos?cliente=cli-1');
    expect(await screen.findByLabelText('Cliente cadastrado')).toHaveValue('cli-1');
    expect(screen.getByLabelText('Nome do cliente')).toHaveValue('Carlos Dias');
  });
});
