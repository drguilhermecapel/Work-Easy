import { describe, expect, it } from 'vitest';
import {
  AppError,
  DATABASE_ERROR_CODES,
  ERROR_MESSAGES,
  errorMessage,
  toAppError,
  toAppErrorAsync,
} from '../../lib/errors';

describe('lib/errors', () => {
  it('has a pt-BR sentence for every database code of the contract', () => {
    for (const code of DATABASE_ERROR_CODES) {
      expect(ERROR_MESSAGES[code]).toMatch(/\S{3,}/);
      expect(ERROR_MESSAGES[code]).not.toContain(code);
    }
  });

  it('translates rules raised by the database (P0001 with the code as message)', () => {
    const error = toAppError({ code: 'P0001', message: 'labor_lock', details: null, hint: null });
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('labor_lock');
    expect(error.message).toMatch(/LC 150\/2015/);
    expect(toAppError({ code: 'P0001', message: 'proposal_limit: 3' }).code).toBe('proposal_limit');
    expect(toAppError({ code: 'P0001', message: 'not_allowed_extra' }).code).toBe('unknown');
  });

  it('maps Postgres and PostgREST codes', () => {
    expect(toAppError({ code: '23P01', message: 'conflicting key value violates exclusion constraint' }).code).toBe('slot_unavailable');
    expect(toAppError({ code: '42501', message: 'new row violates row-level security policy' }).code).toBe('permission_denied');
    expect(toAppError({ code: '23505', message: 'duplicate key' }).code).toBe('duplicate');
    expect(toAppError({ code: '23514', message: 'check constraint' }).code).toBe('invalid_input');
    expect(toAppError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }).code).toBe('not_found');
    expect(toAppError({ code: 'PGRST301', message: 'JWT expired' }).code).toBe('session_expired');
  });

  it('maps Supabase Auth errors', () => {
    expect(toAppError({ name: 'AuthApiError', code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' }).code).toBe(
      'otp_invalid',
    );
    expect(toAppError({ name: 'AuthApiError', code: 'over_email_send_rate_limit', status: 429 }).code).toBe('rate_limited');
    expect(toAppError({ name: 'AuthApiError', code: 'phone_provider_disabled', status: 400 }).code).toBe('sms_unavailable');
    expect(toAppError({ name: 'AuthApiError', status: 429, message: 'x' }).code).toBe('rate_limited');
    expect(toAppError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }).code).toBe('network');
  });

  it('maps network failures and keeps AppError as is', () => {
    expect(toAppError(new TypeError('Failed to fetch')).code).toBe('network');
    expect(toAppError({ name: 'FunctionsFetchError', message: 'Failed to send a request' }).code).toBe('network');
    expect(toAppError({ name: 'FunctionsRelayError', message: 'Relay Error' }).code).toBe('function_unavailable');
    const original = new AppError('backend_disabled');
    expect(toAppError(original)).toBe(original);
    expect(toAppError(undefined).code).toBe('unknown');
    expect(errorMessage(new Error('internal stack trace'))).toBe(ERROR_MESSAGES.unknown);
  });

  // Same envelope as supabase/functions/_shared/http.ts (errorResponse)
  const functionFailure = (status: number, code: string, message = 'Mensagem da função.') => ({
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify({ ok: false, error: { code, message } }), { status }),
  });

  it('reads our code from the Edge Function error body { ok: false, error: { code, message } }', async () => {
    const cases: Array<[status: number, code: string, expected: string]> = [
      [403, 'not_allowed', 'not_allowed'],
      [400, 'confirmation_required', 'invalid_input'],
      [400, 'invalid_json', 'invalid_input'],
      [400, 'invalid_input', 'invalid_input'],
      [400, 'profile_incomplete', 'profile_incomplete'],
      [400, 'cpf_cnpj_required', 'cpf_cnpj_required'],
      [401, 'unauthorized', 'not_authenticated'],
      [401, 'invalid_token', 'not_authenticated'],
      [403, 'pro_required', 'pro_required'],
      [404, 'not_found', 'not_found'],
      [409, 'labor_lock', 'labor_lock'],
      [503, 'payments_not_configured', 'not_configured'],
      [503, 'assist_not_configured', 'not_configured'],
      [502, 'upstream_error', 'function_unavailable'],
      [504, 'upstream_timeout', 'timeout'],
      [500, 'internal', 'server_error'],
      [500, 'auth_delete_failed', 'auth_delete_failed'],
    ];
    for (const [status, code, expected] of cases) {
      expect((await toAppErrorAsync(functionFailure(status, code))).code, code).toBe(expected);
    }
    expect(ERROR_MESSAGES.not_configured).toMatch(/depende de configuração/);
  });

  it('falls back to the HTTP status for unknown codes or bodies that are not JSON', async () => {
    expect((await toAppErrorAsync(functionFailure(409, 'already_subscribed'))).code).toBe('duplicate');
    const plain = await toAppErrorAsync({ name: 'FunctionsHttpError', message: 'non-2xx', context: new Response('oops', { status: 503 }) });
    expect(plain.code).toBe('function_unavailable');
  });

  it('reads the error object of a 2xx { ok: false } answer', () => {
    expect(toAppError({ error: { code: 'quote_expired', message: 'x' } }).code).toBe('quote_expired');
    expect(toAppError({ error: { code: 'payments_not_configured', message: 'x' } }).code).toBe('not_configured');
  });

  it('never shows the raw error text', () => {
    const error = toAppError({ code: 'XX000', message: 'relation "requests" does not exist' });
    expect(error.message).toBe(ERROR_MESSAGES.unknown);
    expect(error.detail).toBe('relation "requests" does not exist');
  });
});
