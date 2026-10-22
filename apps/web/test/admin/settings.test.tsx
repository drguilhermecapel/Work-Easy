import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../lib/supabase', async () => {
  const { createAdminFake, current } = await import('./fake');
  return { supabase: createAdminFake(() => current.world), backendEnabled: true };
});

const { callsOf, renderAdmin, resetWorld } = await import('./harness');
const { parseNumberSetting, parseReaisToCents, phraseMatches } = await import('../../services/admin');

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
});
