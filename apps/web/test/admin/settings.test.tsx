import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../lib/supabase', async () => {
  const { createAdminFake, current } = await import('./fake');
  return { supabase: createAdminFake(() => current.world), backendEnabled: true };
});

const { callsOf, fake, renderAdmin, resetWorld } = await import('./harness');
const { explainAdminError, NUMBER_LIMITS, NUMBER_SETTINGS, parseNumberSetting, parseReaisToCents, phraseMatches } = await import('../../services/admin');

const NOTICE = 'Depende de parecer jurídico e de conta Asaas configurada.';

describe('configurações', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    resetWorld();
  });

  const open = async () => {
    renderAdmin('/admin/configuracoes');
    await screen.findByRole('heading', { name: 'Configurações da plataforma' });
  };

  it('shows the money features off, each with the fixed legal notice', async () => {
    await open();
    expect(screen.getAllByRole('note').filter(n => n.textContent === NOTICE)).toHaveLength(2);
    expect(screen.getAllByText('Desligada')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Ligar comissão da plataforma' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ligar pagamento retido' })).toBeInTheDocument();
    expect(screen.getByText('1200 pontos-base (12,00%)')).toBeInTheDocument();
    expect(screen.getByText('R$ 49,00')).toBeInTheDocument();
  });

  it('does not promise held payments or commission while the features are off', async () => {
    await open();
    expect(screen.getByText('Enquanto estiver desligada, nenhuma comissão é calculada nem cobrada.')).toBeInTheDocument();
    expect(screen.getByText('Enquanto estiver desligado, nenhum valor é retido: o pagamento segue direto para o profissional.')).toBeInTheDocument();
    expect(screen.getByText(/Comissão e pagamento retido dependem de parecer jurídico e de conta Asaas configurada/)).toBeInTheDocument();
  });

  it('keeps the notice when a feature is on', async () => {
    (await import('./fake')).current.world.tables.platform_settings[0].value = true;
    await open();
    expect(screen.getAllByRole('note').filter(n => n.textContent === NOTICE)).toHaveLength(2);
    expect(screen.getByText('Ligada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desligar comissão da plataforma' })).toBeInTheDocument();
    // The "while off" sentence is gone for the feature that is on, and stays for the other
    expect(screen.queryByText('Enquanto estiver desligada, nenhuma comissão é calculada nem cobrada.')).not.toBeInTheDocument();
    expect(screen.getByText(/Enquanto estiver desligado, nenhum valor é retido/)).toBeInTheDocument();
  });

  it('turns a money feature on only after the confirmation phrase', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Ligar comissão da plataforma' }));
    const form = screen.getByRole('form', { name: 'Ligar: Comissão da plataforma' });
    expect(within(form).getByText(NOTICE)).toBeInTheDocument();

    // Nothing typed
    await user.click(within(form).getByRole('button', { name: 'Ligar' }));
    expect(within(form).getByText(/Digite a frase exatamente como mostrada: ligar comissão/)).toBeInTheDocument();
    expect(callsOf('admin_set_setting')).toHaveLength(0);

    // Wrong phrase
    await user.type(within(form).getByLabelText('Para confirmar, digite: ligar comissão'), 'ligar escrow');
    await user.click(within(form).getByRole('button', { name: 'Ligar' }));
    expect(callsOf('admin_set_setting')).toHaveLength(0);

    // Right phrase (case and accents do not matter)
    const input = within(form).getByLabelText('Para confirmar, digite: ligar comissão');
    await user.clear(input);
    await user.type(input, 'LIGAR Comissao');
    await user.click(within(form).getByRole('button', { name: 'Ligar' }));

    await waitFor(() => expect(callsOf('admin_set_setting')).toHaveLength(1));
    expect(callsOf('admin_set_setting')[0].args).toEqual({ p_key: 'commission_enabled', p_value: true });
    expect(await screen.findByRole('button', { name: 'Desligar comissão da plataforma' })).toBeInTheDocument();
  });

  it('asks a different phrase for the held payment', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Ligar pagamento retido' }));
    expect(screen.getByLabelText('Para confirmar, digite: ligar pagamento retido')).toBeInTheDocument();
  });

  it('turns a feature off after a confirmation, without a phrase', async () => {
    (await import('./fake')).current.world.tables.platform_settings[2].value = true;
    await open();
    await user.click(screen.getByRole('button', { name: 'Desligar pagamento retido' }));
    const form = screen.getByRole('form', { name: 'Desligar: Pagamento retido' });
    expect(within(form).queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Desligar' }));
    await waitFor(() => expect(callsOf('admin_set_setting')).toHaveLength(1));
    expect(callsOf('admin_set_setting')[0].args).toEqual({ p_key: 'escrow_enabled', p_value: false });
  });

  it('changes a number only after reviewing and confirming it', async () => {
    await open();
    const input = screen.getByLabelText('Pontos-base (100 = 1%)');
    await user.clear(input);
    await user.type(input, '1500');
    await user.click(screen.getAllByRole('button', { name: 'Revisar alteração' })[0]);

    const form = await screen.findByRole('form', { name: 'Alterar: Percentual da comissão' });
    expect(form).toHaveTextContent('De 1200 pontos-base (12,00%) para 1500 pontos-base (15,00%)');
    expect(callsOf('admin_set_setting')).toHaveLength(0);

    await user.click(within(form).getByRole('button', { name: 'Confirmar alteração' }));
    await waitFor(() => expect(callsOf('admin_set_setting')).toHaveLength(1));
    expect(callsOf('admin_set_setting')[0].args).toEqual({ p_key: 'commission_bps', p_value: 1500 });
    expect(await screen.findByText('1500 pontos-base (15,00%)')).toBeInTheDocument();
  });

  it('does not send an invalid number', async () => {
    await open();
    const input = screen.getByLabelText('Pontos-base (100 = 1%)');
    await user.clear(input);
    await user.type(input, '9999');
    await user.click(screen.getAllByRole('button', { name: 'Revisar alteração' })[0]);
    expect(await screen.findByText('A comissão vai de 0 a 5.000 pontos-base (0% a 50%).')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: /Alterar/ })).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, '12,5');
    await user.click(screen.getAllByRole('button', { name: 'Revisar alteração' })[0]);
    expect(await screen.findByText('Informe um número inteiro.')).toBeInTheDocument();
    expect(callsOf('admin_set_setting')).toHaveLength(0);
  });

  it('refuses the value that is already set', async () => {
    await open();
    await user.click(screen.getAllByRole('button', { name: 'Revisar alteração' })[0]);
    expect(await screen.findByText('Este já é o valor atual.')).toBeInTheDocument();
    expect(callsOf('admin_set_setting')).toHaveLength(0);
  });

  it('stores the Pro price in cents, typed in reais', async () => {
    await open();
    const input = screen.getByLabelText('Valor em reais');
    await user.clear(input);
    await user.type(input, '59,90');
    await user.click(screen.getAllByRole('button', { name: 'Revisar alteração' })[1]);
    const form = await screen.findByRole('form', { name: 'Alterar: Preço mensal do plano Pro' });
    expect(form).toHaveTextContent('De R$ 49,00 para R$ 59,90');
    await user.click(within(form).getByRole('button', { name: 'Confirmar alteração' }));
    await waitFor(() => expect(callsOf('admin_set_setting')).toHaveLength(1));
    expect(callsOf('admin_set_setting')[0].args).toEqual({ p_key: 'pro_price_cents', p_value: 5990 });
  });

  it('shows the server refusal when the change is not allowed', async () => {
    resetWorld({ isAdmin: true });
    await open();
    (await import('./fake')).current.world.isAdmin = false; // the session lost the role after the page loaded
    const input = screen.getByLabelText('Quantidade máxima');
    await user.clear(input);
    await user.type(input, '4');
    await user.click(screen.getAllByRole('button', { name: 'Revisar alteração' })[2]);
    const form = await screen.findByRole('form', { name: 'Alterar: Propostas por pedido' });
    await user.click(within(form).getByRole('button', { name: 'Confirmar alteração' }));
    expect(await within(form).findByText('Você não tem permissão para fazer isso.')).toBeInTheDocument();
  });
});

describe('configurações de receita', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    resetWorld();
  });

  const open = async () => {
    renderAdmin('/admin/configuracoes');
    await screen.findByRole('heading', { name: 'Configurações da plataforma' });
  };

  /** The card of one number setting, found by its title. */
  const card = (title: string): HTMLElement => screen.getByRole('heading', { name: title }).parentElement as HTMLElement;

  const TRIAL = 'Dias de teste grátis do plano Pro';
  const FREE = 'Propostas novas por mês no plano gratuito';
  const CAP = 'Teto da comissão por serviço';

  it('lists the trial, the free proposals and the ceiling apart, each with its value and what zero means', async () => {
    await open();
    const section = screen.getByRole('heading', { name: 'Plano Pro, plano gratuito e teto da comissão' }).closest('section') as HTMLElement;
    expect(within(section).getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      'Plano Pro, plano gratuito e teto da comissão',
      TRIAL,
      FREE,
      CAP,
    ]);
    expect(within(card(TRIAL)).getByText('30 dias')).toBeInTheDocument();
    expect(within(card(FREE)).getByText('5 por mês')).toBeInTheDocument();
    expect(within(card(CAP)).getByText('R$ 150,00')).toBeInTheDocument();
    expect(card(TRIAL)).toHaveTextContent('0 = sem teste');
    expect(card(FREE)).toHaveTextContent('0 = sem limite');
    expect(card(CAP)).toHaveTextContent('0 = sem teto');
    expect(card(CAP)).toHaveTextContent('Não tem efeito enquanto a comissão estiver desligada.');
    // The ranges are told before typing
    expect(within(card(TRIAL)).getByLabelText('Dias de teste')).toHaveAccessibleDescription(/Aceita de 0 a 90\./);
    expect(within(card(FREE)).getByLabelText('Propostas por mês')).toHaveAccessibleDescription(/Aceita de 0 a 100\./);
    expect(within(card(CAP)).getByLabelText('Teto em reais')).toHaveAccessibleDescription(/Aceita de 0,00 a 10000,00\./);
  });

  it('no longer lists the three keys as read-only "outras chaves"', async () => {
    await open();
    expect(screen.getByLabelText('Dias de teste')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Outras chaves (somente leitura)' })).not.toBeInTheDocument();
  });

  it('still lists a key the screen does not know, and only that one', async () => {
    const world = resetWorld();
    world.tables.platform_settings.push({ key: 't_future_key', value: 7, internal: false, updated_at: null });
    await open();
    const others = screen.getByRole('heading', { name: 'Outras chaves (somente leitura)' }).closest('section') as HTMLElement;
    expect(within(others).getByText('t_future_key')).toBeInTheDocument();
    expect(within(others).queryByText('pro_trial_days')).not.toBeInTheDocument();
    expect(within(others).queryByText('commission_cap_cents')).not.toBeInTheDocument();
  });

  it('stores the ceiling in cents, typed in reais', async () => {
    await open();
    const input = within(card(CAP)).getByLabelText('Teto em reais');
    await user.clear(input);
    await user.type(input, '200,00');
    await user.click(within(card(CAP)).getByRole('button', { name: 'Revisar alteração' }));
    const form = await screen.findByRole('form', { name: `Alterar: ${CAP}` });
    expect(form).toHaveTextContent('De R$ 150,00 para R$ 200,00');
    expect(callsOf('admin_set_setting')).toHaveLength(0);
    await user.click(within(form).getByRole('button', { name: 'Confirmar alteração' }));
    await waitFor(() => expect(callsOf('admin_set_setting')).toHaveLength(1));
    expect(callsOf('admin_set_setting')[0].args).toEqual({ p_key: 'commission_cap_cents', p_value: 20000 });
    expect(await within(card(CAP)).findByText('R$ 200,00')).toBeInTheDocument();
  });

  it('turns the ceiling off with 0 and says so before confirming', async () => {
    await open();
    const input = within(card(CAP)).getByLabelText('Teto em reais');
    await user.clear(input);
    await user.type(input, '0');
    await user.click(within(card(CAP)).getByRole('button', { name: 'Revisar alteração' }));
    const form = await screen.findByRole('form', { name: `Alterar: ${CAP}` });
    expect(form).toHaveTextContent('De R$ 150,00 para Sem teto (0)');
    await user.click(within(form).getByRole('button', { name: 'Confirmar alteração' }));
    await waitFor(() => expect(callsOf('admin_set_setting')).toHaveLength(1));
    expect(callsOf('admin_set_setting')[0].args).toEqual({ p_key: 'commission_cap_cents', p_value: 0 });
    expect(await within(card(CAP)).findByText('Sem teto (0)')).toBeInTheDocument();
  });

  it('removes the limit of the free plan with 0 and the trial with 0', async () => {
    await open();
    const limit = within(card(FREE)).getByLabelText('Propostas por mês');
    await user.clear(limit);
    await user.type(limit, '0');
    await user.click(within(card(FREE)).getByRole('button', { name: 'Revisar alteração' }));
    const freeForm = await screen.findByRole('form', { name: `Alterar: ${FREE}` });
    expect(freeForm).toHaveTextContent('De 5 por mês para Sem limite (0)');
    await user.click(within(freeForm).getByRole('button', { name: 'Confirmar alteração' }));
    await waitFor(() => expect(callsOf('admin_set_setting')).toHaveLength(1));
    expect(callsOf('admin_set_setting')[0].args).toEqual({ p_key: 'free_proposals_per_month', p_value: 0 });
    expect(await within(card(FREE)).findByText('Sem limite (0)')).toBeInTheDocument();

    const days = within(card(TRIAL)).getByLabelText('Dias de teste');
    await user.clear(days);
    await user.type(days, '0');
    await user.click(within(card(TRIAL)).getByRole('button', { name: 'Revisar alteração' }));
    const trialForm = await screen.findByRole('form', { name: `Alterar: ${TRIAL}` });
    expect(trialForm).toHaveTextContent('De 30 dias para Sem teste grátis (0)');
    await user.click(within(trialForm).getByRole('button', { name: 'Confirmar alteração' }));
    await waitFor(() => expect(callsOf('admin_set_setting')).toHaveLength(2));
    expect(callsOf('admin_set_setting')[1].args).toEqual({ p_key: 'pro_trial_days', p_value: 0 });
  });

  it('refuses a value out of range before sending it, with the sentence of that setting', async () => {
    await open();
    const attempt = async (title: string, label: string, typed: string) => {
      const input = within(card(title)).getByLabelText(label);
      await user.clear(input);
      await user.type(input, typed);
      await user.click(within(card(title)).getByRole('button', { name: 'Revisar alteração' }));
    };
    await attempt(TRIAL, 'Dias de teste', '91');
    expect(await within(card(TRIAL)).findByText('Os dias de teste grátis vão de 0 (sem teste) a 90.')).toBeInTheDocument();
    await attempt(FREE, 'Propostas por mês', '101');
    expect(await within(card(FREE)).findByText('As propostas por mês do plano gratuito vão de 0 (sem limite) a 100.')).toBeInTheDocument();
    await attempt(CAP, 'Teto em reais', '10000,01');
    expect(await within(card(CAP)).findByText('O teto da comissão vai de R$ 0,00 (sem teto) a R$ 10.000,00.')).toBeInTheDocument();
    await attempt(CAP, 'Teto em reais', 'dez');
    expect(await within(card(CAP)).findByText('Informe o valor em reais, por exemplo 150,00. Use 0 para ficar sem teto.')).toBeInTheDocument();
    await attempt(FREE, 'Propostas por mês', '2,5');
    expect(await within(card(FREE)).findByText('Informe um número inteiro.')).toBeInTheDocument();
    expect(callsOf('admin_set_setting')).toHaveLength(0);
  });

  it('accepts the top of each range: 90 days, 100 proposals and R$ 10.000,00', async () => {
    await open();
    const send = async (title: string, label: string, typed: string) => {
      const input = within(card(title)).getByLabelText(label);
      await user.clear(input);
      await user.type(input, typed);
      await user.click(within(card(title)).getByRole('button', { name: 'Revisar alteração' }));
      await user.click(within(await screen.findByRole('form', { name: `Alterar: ${title}` })).getByRole('button', { name: 'Confirmar alteração' }));
    };
    await send(TRIAL, 'Dias de teste', '90');
    await send(FREE, 'Propostas por mês', '100');
    await send(CAP, 'Teto em reais', '10.000,00');
    await waitFor(() => expect(callsOf('admin_set_setting')).toHaveLength(3));
    expect(callsOf('admin_set_setting').map(call => call.args)).toEqual([
      { p_key: 'pro_trial_days', p_value: 90 },
      { p_key: 'free_proposals_per_month', p_value: 100 },
      { p_key: 'commission_cap_cents', p_value: 1_000_000 },
    ]);
  });

  it('shows the refusal of the database about a value in the sentence of the screen, not the English detail', async () => {
    fake.rpcs.admin_set_setting = () => ({
      data: null,
      error: { code: '23514', message: 'invalid_setting', details: 'pro_trial_days is a whole number from 0 to 90' },
    });
    await open();
    const input = within(card(TRIAL)).getByLabelText('Dias de teste');
    await user.clear(input);
    await user.type(input, '45');
    await user.click(within(card(TRIAL)).getByRole('button', { name: 'Revisar alteração' }));
    const form = await screen.findByRole('form', { name: `Alterar: ${TRIAL}` });
    await user.click(within(form).getByRole('button', { name: 'Confirmar alteração' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('O banco recusou o valor. Os dias de teste grátis vão de 0 (sem teste) a 90.');
    expect(form).not.toHaveTextContent('whole number');
  });
});

describe('regras de validação das configurações', () => {
  it('reads money typed in reais', () => {
    expect(parseReaisToCents('49,90')).toBe(4990);
    expect(parseReaisToCents('49')).toBe(4900);
    expect(parseReaisToCents('49.9')).toBe(4990);
    expect(parseReaisToCents('1.234,50')).toBe(123450);
    expect(parseReaisToCents('R$ 5,5')).toBe(550);
    expect(parseReaisToCents('49,999')).toBeNull();
    expect(parseReaisToCents('abc')).toBeNull();
    expect(parseReaisToCents('-1')).toBeNull();
    expect(parseReaisToCents('')).toBeNull();
  });

  it('checks the ranges of each number', () => {
    expect(parseNumberSetting('proposal_limit', '0')).toHaveProperty('error');
    expect(parseNumberSetting('proposal_limit', '10')).toEqual({ value: 10 });
    expect(parseNumberSetting('proposal_limit', '11')).toHaveProperty('error');
    expect(parseNumberSetting('labor_lock_days_per_week', '8')).toHaveProperty('error');
    expect(parseNumberSetting('commission_bps', '0')).toEqual({ value: 0 });
    expect(parseNumberSetting('commission_bps', '5001')).toHaveProperty('error');
    expect(parseNumberSetting('pro_price_cents', '0,50')).toHaveProperty('error');
    expect(parseNumberSetting('pro_price_cents', '49,90')).toEqual({ value: 4990 });
    expect(parseNumberSetting('commission_bps', ' ')).toEqual({ error: 'Informe um valor.' });
  });

  it('compares the typed phrase without case, accents or extra spaces', () => {
    expect(phraseMatches('  LIGAR   comissao ', 'ligar comissão')).toBe(true);
    expect(phraseMatches('ligar', 'ligar comissão')).toBe(false);
  });

  it('checks the ranges of the three revenue settings, where 0 is a value of its own', () => {
    expect(parseNumberSetting('commission_cap_cents', '150,00')).toEqual({ value: 15000 });
    expect(parseNumberSetting('commission_cap_cents', '0')).toEqual({ value: 0 });
    expect(parseNumberSetting('commission_cap_cents', '10000')).toEqual({ value: 1_000_000 });
    expect(parseNumberSetting('commission_cap_cents', '10000,01')).toHaveProperty('error');
    expect(parseNumberSetting('commission_cap_cents', 'abc')).toEqual({ error: 'Informe o valor em reais, por exemplo 150,00. Use 0 para ficar sem teto.' });
    expect(parseNumberSetting('free_proposals_per_month', '0')).toEqual({ value: 0 });
    expect(parseNumberSetting('free_proposals_per_month', '100')).toEqual({ value: 100 });
    expect(parseNumberSetting('free_proposals_per_month', '101')).toHaveProperty('error');
    expect(parseNumberSetting('free_proposals_per_month', '-1')).toEqual({ error: 'Informe um número inteiro.' });
    expect(parseNumberSetting('pro_trial_days', '0')).toEqual({ value: 0 });
    expect(parseNumberSetting('pro_trial_days', '90')).toEqual({ value: 90 });
    expect(parseNumberSetting('pro_trial_days', '91')).toHaveProperty('error');
    // The old settings keep their floor: 0 is not "no limit" for them
    expect(parseNumberSetting('proposal_limit', '0')).toHaveProperty('error');
  });

  it('keeps the ranges of the screen equal to the ones admin_set_setting checks in the database', () => {
    // The last migration that defines the function is the one that counts
    const dir = join(process.cwd(), 'supabase', 'migrations');
    const defining = readdirSync(dir)
      .filter(name => name.endsWith('.sql'))
      .sort()
      .filter(name => /create (or replace )?function public\.admin_set_setting/.test(readFileSync(join(dir, name), 'utf8')))
      .at(-1);
    expect(defining).toBeDefined();
    const sql = readFileSync(join(dir, defining as string), 'utf8');
    const table = /from \(values([\s\S]*?)\) as r\(k, lo, hi\)/.exec(sql)?.[1] ?? '';
    const inDatabase = Object.fromEntries([...table.matchAll(/\('([a-z_]+)',\s*(\d+),\s*(\d+)\)/g)].map(([, key, lo, hi]) => [key, { min: Number(lo), max: Number(hi) }]));
    const onScreen = Object.fromEntries(NUMBER_SETTINGS.map(key => [key, { min: NUMBER_LIMITS[key].min, max: NUMBER_LIMITS[key].max }]));
    expect(onScreen).toEqual(inDatabase);
  });

  it('puts a refusal of the database about a value in the sentence of the screen', () => {
    const refusal = (details: string | null) => ({ code: '23514', message: 'invalid_setting', details });
    expect(explainAdminError(refusal('commission_cap_cents is a whole number from 0 to 1000000')).message).toBe(
      'O banco recusou o valor. O teto da comissão vai de R$ 0,00 (sem teto) a R$ 10.000,00.',
    );
    expect(explainAdminError(refusal('escrow_enabled is true or false')).message).toBe('O banco recusou o valor: esta configuração só aceita ligada ou desligada.');
    expect(explainAdminError(refusal('x_unknown is a whole number')).message).toBe('O banco recusou o valor: confira a faixa aceita para esta configuração.');
    expect(explainAdminError(refusal(null)).message).toBe('O banco recusou o valor: confira a faixa aceita para esta configuração.');
    // Another 23514 (a check constraint) is not a refused setting
    expect(explainAdminError({ code: '23514', message: 'new row violates check constraint "x"' }).message).toBe(
      'Confira os dados informados e tente de novo.',
    );
  });
});
