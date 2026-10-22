import { describe, expect, it } from 'vitest';
import { AppError, errorMessage, toAppError } from '../../lib/errors';
import { missingStepsOf, proError } from '../../services/proErrors';

const dbRule = (message: string, details: string | null = null) => toAppError({ code: 'P0001', message, details });

describe('errors of the Pro area', () => {
  it('translates a slug taken at sign-up', async () => {
    const error = await proError(dbRule('slug_taken'));
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe('Este endereço de página já está em uso. Escolha outro.');
  });

  it('keeps the translations of lib/errors for the rules it knows', async () => {
    for (const code of ['labor_lock', 'slot_unavailable', 'proposal_limit', 'unit_not_allowed', 'documents_missing']) {
      const error = await proError(dbRule(code));
      expect(error.message).toBe(errorMessage(dbRule(code)));
      expect(error.message).not.toMatch(/^[a-z_]+$/);
    }
  });

  it('translates the codes Edge Functions answer', async () => {
    const answered = (code: string) => toAppError({ error: { code, message: 'x' } });
    expect((await proError(answered('provider_payment_account_missing'))).message).toMatch(/Ative o recebimento/);
    expect((await proError(answered('quote_not_accepted'))).message).toMatch(/aceitos/);
    expect((await proError(answered('already_subscribed'))).message).toMatch(/Já existe uma assinatura/);
    // Known to lib/errors: unchanged
    expect((await proError(answered('payments_not_configured'))).message).toMatch(/depende de configuração/);
    expect((await proError(answered('pro_required'))).message).toBe('Este recurso faz parte do plano Pro.');
  });

  it('reads the code from the HTTP response of a failed function call', async () => {
    const response = new Response(JSON.stringify({ ok: false, error: { code: 'booking_not_chargeable', message: 'x' } }), { status: 409 });
    const error = await proError(toAppError({ name: 'FunctionsHttpError', message: 'non-2xx', context: response }));
    expect(error.message).toMatch(/não pode ser cobrado/);
  });

  it('lists the documents lacking from the error detail', () => {
    expect(missingStepsOf(dbRule('documents_missing', 'documento_selfie,antecedentes,outra_coisa'))).toEqual(['documento_selfie', 'antecedentes']);
    expect(missingStepsOf(dbRule('documents_missing'))).toEqual([]);
    expect(missingStepsOf(new AppError('unknown'))).toEqual([]);
  });
});
