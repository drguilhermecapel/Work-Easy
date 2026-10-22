import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { baseTables, isEq, occupationRow, ok, policyRow, providerRow, ruleError, signInProvider, type ProFake, type TableCall } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createProFake } = await import('./fake');
  return { supabase: createProFake(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { renderPro } = await import('./render');
const fake = supabase as unknown as ProFake;

const inValues = (call: TableCall): string[] => (call.filters.find(([op]) => op === 'in')?.[2] as string[] | undefined) ?? [];

let services: Array<Record<string, unknown>>;

const service = (overrides: Record<string, unknown> = {}) => ({
  id: 's-1',
  provider_id: 'prov-1',
  occupation_slug: 'diarista',
  title: 'Faxina completa',
  description: 'Casa de até 3 quartos',
  price_min_cents: 15000,
  price_max_cents: 20000,
  unit: 'dia',
  duration_minutes: 480,
  active: true,
  ...overrides,
});

beforeEach(() => {
  fake.reset();
  signInProvider(fake);
  services = [];
  fake.tables = {
    ...baseTables({ provider: providerRow() }),
    provider_occupations: () => ok([occupationRow('diarista')]),
    occupation_policies: (call: TableCall) =>
      ok([policyRow('diarista', { price_units: ['dia'] })].filter(row => inValues(call).includes(row.occupation_slug))),
    services: (call: TableCall) => {
      if (call.op === 'insert') {
        const row = service({ id: `s-${services.length + 1}`, ...(call.payload as object) });
        services = [...services, row];
        return ok(row);
      }
      if (call.op === 'update') {
        services = services.map(item => (isEq(call, 'id', item.id) ? { ...item, ...(call.payload as object) } : item));
        return ok(services.find(item => isEq(call, 'id', item.id)) ?? null);
      }
      if (call.op === 'delete') {
        services = services.filter(item => !isEq(call, 'id', item.id));
        return ok(null);
      }
      return ok(services);
    },
  };
});

describe('/pro/servicos', () => {
  it('explains the empty state', async () => {
    renderPro('/pro/servicos');
    expect(await screen.findByText(/Você ainda não cadastrou serviços/)).toBeInTheDocument();
  });

  it('lists the services with the price range and unit', async () => {
    services = [service(), service({ id: 's-2', title: 'Passar roupa', price_min_cents: 8000, price_max_cents: null, unit: 'dia', active: false, duration_minutes: null })];
    renderPro('/pro/servicos');
    expect(await screen.findByText('Faxina completa')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s150,00 a R\$\s200,00 por dia · 480 min/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s80,00 por dia/)).toBeInTheDocument();
    expect(screen.getByText('Desativado')).toBeInTheDocument();
  });

  it('offers only the price units of the occupation policy and saves the price in cents', async () => {
    const user = userEvent.setup();
    renderPro('/pro/servicos');
    await user.click(await screen.findByRole('button', { name: /Novo serviço/ }));

    const unit = await screen.findByLabelText('Cobrado');
    await waitFor(() => expect(within(unit).getAllByRole('option').map(option => option.textContent)).toEqual(['Escolha…', 'por dia']));
    expect(screen.getByText(/o preço pode ser cobrado: por dia/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nome do serviço'), 'Faxina completa');
    await user.type(screen.getByLabelText('Preço (R$)'), '150,00');
    await user.type(screen.getByLabelText('Preço máximo (R$, opcional)'), '1.200,50');
    await user.selectOptions(unit, 'dia');
    await user.type(screen.getByLabelText('Duração em minutos (opcional)'), '480');
    await user.click(screen.getByRole('button', { name: 'Salvar serviço' }));

    expect(await screen.findByText('Faxina completa', { selector: 'h2' })).toBeInTheDocument();
    const insert = fake.tableCalls.find(call => call.table === 'services' && call.op === 'insert');
    expect(insert?.payload).toEqual({
      occupation_slug: 'diarista',
      title: 'Faxina completa',
      description: null,
      price_min_cents: 15000,
      price_max_cents: 120050,
      unit: 'dia',
      duration_minutes: 480,
      active: true,
      provider_id: 'prov-1',
    });
  });

  it('checks the form before sending anything', async () => {
    const user = userEvent.setup();
    renderPro('/pro/servicos');
    await user.click(await screen.findByRole('button', { name: /Novo serviço/ }));
    await user.type(await screen.findByLabelText('Nome do serviço'), 'Faxina');

    await user.click(screen.getByRole('button', { name: 'Salvar serviço' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o preço em reais');

    await user.type(screen.getByLabelText('Preço (R$)'), '200');
    await user.type(screen.getByLabelText('Preço máximo (R$, opcional)'), '100');
    await user.click(screen.getByRole('button', { name: 'Salvar serviço' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha a unidade do preço');

    await user.selectOptions(screen.getByLabelText('Cobrado'), 'dia');
    await user.click(screen.getByRole('button', { name: 'Salvar serviço' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O preço máximo não pode ser menor que o mínimo');
    expect(fake.tableCalls.some(call => call.table === 'services' && call.op === 'insert')).toBe(false);
  });

  it('translates unit_not_allowed when the database refuses the unit', async () => {
    // The policy changed after the screen read it: the database has the last word
    const base = fake.tables.services;
    fake.tables.services = (call: TableCall) => (call.op === 'insert' ? ruleError('unit_not_allowed') : base(call));
    const user = userEvent.setup();
    renderPro('/pro/servicos');
    await user.click(await screen.findByRole('button', { name: /Novo serviço/ }));
    await user.type(await screen.findByLabelText('Nome do serviço'), 'Faxina');
    await user.type(screen.getByLabelText('Preço (R$)'), '100');
    await user.selectOptions(screen.getByLabelText('Cobrado'), 'dia');
    await user.click(screen.getByRole('button', { name: 'Salvar serviço' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta unidade de preço não é permitida para esta ocupação.');
  });

  it('edits, deactivates and deletes a service', async () => {
    services = [service()];
    const user = userEvent.setup();
    renderPro('/pro/servicos');

    await user.click(await screen.findByRole('button', { name: 'Editar Faxina completa' }));
    const title = await screen.findByLabelText('Nome do serviço');
    expect(title).toHaveValue('Faxina completa');
    expect(screen.getByLabelText('Preço (R$)')).toHaveValue('150,00');
    await user.clear(title);
    await user.type(title, 'Faxina pesada');
    await user.click(screen.getByRole('button', { name: 'Salvar serviço' }));
    expect(await screen.findByText('Faxina pesada', { selector: 'h2' })).toBeInTheDocument();
    const update = fake.tableCalls.find(call => call.table === 'services' && call.op === 'update' && 'title' in (call.payload as object));
    expect(update?.payload).toMatchObject({ title: 'Faxina pesada', price_min_cents: 15000 });
    expect(isEq(update as TableCall, 'id', 's-1')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Desativar Faxina pesada' }));
    expect(await screen.findByText('Desativado')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await user.click(screen.getByRole('button', { name: 'Sim, excluir' }));
    await waitFor(() => expect(screen.queryByText('Faxina pesada')).not.toBeInTheDocument());
    expect(services).toEqual([]);
  });
});
