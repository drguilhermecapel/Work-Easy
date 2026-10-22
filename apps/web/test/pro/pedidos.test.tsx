import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { baseTables, isEq, ok, providerRow, ruleError, signInProvider, type ProFake, type TableCall } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createProFake } = await import('./fake');
  return { supabase: createProFake(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { renderPro } = await import('./render');
const fake = supabase as unknown as ProFake;

const REQUEST = {
  id: 'req-1',
  occupation_slug: 'diarista',
  neighborhood_id: 'nb-lapa',
  neighborhood_name: 'Lapa',
  description: 'Faxina de apartamento de 2 quartos',
  preferred_dates: 'Sábado de manhã',
  urgent: true,
  expires_at: '2030-02-08T12:00:00Z',
  created_at: '2030-02-01T12:00:00Z',
  proposal_count: 1,
  my_proposal_id: null as string | null,
  my_proposal_status: null as string | null,
};

let proposals: Array<Record<string, unknown>>;

beforeEach(() => {
  fake.reset();
  signInProvider(fake);
  proposals = [];
  fake.rpcs.open_requests_for_me = () => ok([REQUEST]);
  fake.tables = {
    ...baseTables({ provider: providerRow({ status: 'approved' }) }),
    platform_settings: () => ok([{ key: 'proposal_limit', value: 3 }]),
    proposals: (call: TableCall) => {
      if (call.op === 'insert') {
        const row = { id: 'p-new', status: 'sent', created_at: '2030-02-02T12:00:00Z', ...(call.payload as object) };
        proposals = [row, ...proposals];
        return ok(row);
      }
      if (call.op === 'update') {
        proposals = proposals.map(item => (isEq(call, 'id', item.id) ? { ...item, ...(call.payload as object) } : item));
        return ok(null);
      }
      return ok(proposals);
    },
  };
});

describe('/pro/pedidos', () => {
  it('explains why a provider that is not approved sees no requests, without asking the database', async () => {
    fake.tables.providers = () => ok(providerRow({ status: 'pending_review' }));
    renderPro('/pro/pedidos');
    expect(await screen.findByRole('heading', { name: 'Você ainda não recebe pedidos' })).toBeInTheDocument();
    expect(screen.getByText(/Sua documentação está em análise pela equipe do WorkEasy/)).toBeInTheDocument();
    expect(fake.rpcCalls.filter(call => call.name === 'open_requests_for_me')).toEqual([]);
  });

  it('shows an empty state with what to check', async () => {
    fake.rpcs.open_requests_for_me = () => ok([]);
    renderPro('/pro/pedidos');
    expect(await screen.findByText(/Nenhum pedido aberto para você agora/)).toBeInTheDocument();
    expect(screen.getByText('Você ainda não enviou propostas.')).toBeInTheDocument();
  });

  it('lists the requests without the client contact', async () => {
    renderPro('/pro/pedidos');
    const card = (await screen.findByRole('heading', { name: 'Diarista' })).closest('li') as HTMLElement;
    expect(within(card).getByText('Urgente')).toBeInTheDocument();
    expect(within(card).getByText('Lapa')).toBeInTheDocument();
    expect(within(card).getByText('Faxina de apartamento de 2 quartos')).toBeInTheDocument();
    expect(within(card).getByText('Quando: Sábado de manhã')).toBeInTheDocument();
    expect(within(card).getByText(/1 de 3 propostas já enviadas · pedido aberto até 08\/02\/2030/)).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/telefone|e-mail|@|\(\d\d\)/i);
    expect(screen.getByText(/O telefone e o e-mail do cliente não aparecem aqui/)).toBeInTheDocument();
  });

  it('sends a proposal with price, message and validity', async () => {
    const user = userEvent.setup();
    renderPro('/pro/pedidos');
    await user.click(await screen.findByRole('button', { name: 'Enviar proposta' }));
    await user.type(screen.getByLabelText('Seu preço (R$)'), '180,00');
    await user.type(screen.getByLabelText(/Mensagem para o cliente/), 'Posso ir no sábado às 8h.');
    fireEvent.change(screen.getByLabelText(/Proposta válida até/), { target: { value: '2031-03-10' } });
    await user.click(screen.getByRole('button', { name: 'Enviar proposta' }));

    await waitFor(() => expect(proposals).toHaveLength(1));
    expect(fake.tableCalls.find(call => call.table === 'proposals' && call.op === 'insert')?.payload).toEqual({
      request_id: 'req-1',
      provider_id: 'prov-1',
      price_cents: 18000,
      message: 'Posso ir no sábado às 8h.',
      // The whole last day counts: until 23:59:59 in São Paulo
      valid_until: '2031-03-11T02:59:59.000Z',
    });
    // The list of sent proposals shows it
    expect(await screen.findByText('R$ 180,00', { selector: 'span.font-semibold' })).toBeInTheDocument();
    expect(screen.getByText('Posso ir no sábado às 8h.', { selector: 'p.whitespace-pre-line' })).toBeInTheDocument();
    expect(screen.getByText('Válida até 10/03/2031')).toBeInTheDocument();
  });

  it('translates proposal_limit and request_not_open', async () => {
    const base = fake.tables.proposals;
    fake.tables.proposals = (call: TableCall) => (call.op === 'insert' ? ruleError('proposal_limit') : base(call));
    const user = userEvent.setup();
    renderPro('/pro/pedidos');
    await user.click(await screen.findByRole('button', { name: 'Enviar proposta' }));
    await user.type(screen.getByLabelText('Seu preço (R$)'), '180');
    const submit = () => screen.getByRole('button', { name: 'Enviar proposta' });
    await user.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('Este pedido já recebeu o número máximo de propostas.');

    fake.tables.proposals = (call: TableCall) => (call.op === 'insert' ? ruleError('request_not_open') : base(call));
    await user.click(submit());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Este pedido não está mais aberto.'));
  });

  it('tells a free provider who used the monthly allowance that the Pro has no limit', async () => {
    const base = fake.tables.proposals;
    fake.tables.proposals = (call: TableCall) => (call.op === 'insert' ? ruleError('free_proposal_limit') : base(call));
    const user = userEvent.setup();
    renderPro('/pro/pedidos');
    await user.click(await screen.findByRole('button', { name: 'Enviar proposta' }));
    await user.type(screen.getByLabelText('Seu preço (R$)'), '180');
    await user.click(screen.getByRole('button', { name: 'Enviar proposta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Você usou as propostas grátis deste mês\. No plano Pro .* ilimitadas/);
  });

  it('asks for a valid price before sending', async () => {
    const user = userEvent.setup();
    renderPro('/pro/pedidos');
    await user.click(await screen.findByRole('button', { name: 'Enviar proposta' }));
    await user.click(screen.getByRole('button', { name: 'Enviar proposta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o preço em reais');
    expect(proposals).toEqual([]);
  });

  it('shows a request already answered instead of the form, and lets the provider withdraw while it is sent', async () => {
    proposals = [
      { id: 'p-1', request_id: 'req-1', provider_id: 'prov-1', price_cents: 17000, message: null, valid_until: null, status: 'sent', created_at: '2030-02-02T12:00:00Z' },
      { id: 'p-2', request_id: 'req-9', provider_id: 'prov-1', price_cents: 9000, message: null, valid_until: null, status: 'accepted', created_at: '2030-01-20T12:00:00Z' },
    ];
    fake.rpcs.open_requests_for_me = () => ok([{ ...REQUEST, my_proposal_id: 'p-1', my_proposal_status: 'sent' }]);
    const user = userEvent.setup();
    renderPro('/pro/pedidos');

    expect(await screen.findByText(/Você já enviou uma proposta de R\$\s170,00: enviada\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar proposta' })).not.toBeInTheDocument();
    expect(screen.getByText('Aceita pelo cliente')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver na agenda' })).toHaveAttribute('href', '/pro/agenda');

    await user.click(screen.getByRole('button', { name: 'Retirar proposta' }));
    await user.click(screen.getByRole('button', { name: 'Sim, retirar' }));
    await waitFor(() => expect(proposals[0].status).toBe('withdrawn'));
    expect(await screen.findByText('Retirada')).toBeInTheDocument();
  });
});
