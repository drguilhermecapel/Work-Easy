import { AppError, toAppError, toAppErrorAsync } from '../lib/errors';
import type { VerificationStep } from '../catalog/types';

// lib/errors.ts has the sentence of every code the Pro area meets. These are the
// ones that read differently for a provider than for the client who pays.
const PRO_MESSAGES: Record<string, string> = {
  cancel_pro_renewal_first: 'Cancele a renovação do Pro antes de aceitar a última ocupação. Os benefícios seguem até o fim do período contratado.',
  service_policy_unavailable: 'A versão desta política mudou ou está indisponível. Atualize a página para conferir as condições.',
  service_commission_only: 'Suas ocupações usam comissão. A assinatura Pro não está disponível para esses serviços.',
  provider_payment_account_missing: 'Ative o recebimento em Assinatura antes de cobrar clientes.',
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

/**
 * Codes whose sentence comes from the server when it sent one. The server has two reasons for the same
 * code (the payment account is not complete / it predates the CPF check), and each asks the provider to
 * do something different. lib/errors.ts keeps a sentence for both as the fallback. Every other code keeps
 * the app's own sentence: a server text is never shown for a code that is not listed here.
 */
export const SERVER_SENTENCE_CODES: ReadonlySet<string> = new Set(['trial_requires_payment_account', 'route_unavailable']);
const SERVER_SENTENCE_MAX = 300;

/**
 * The code behind an error (the one the Edge Function answered, or the rule the database raised as
 * message; null when there is none) and the sentence the function sent with it, when there is one.
 */
export const serverAnswerOf = async (error: AppError): Promise<{ code: string | null; message: string | null }> => {
  const cause = asRecord(error.cause);
  const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
  // A function answer { ok: false, error: { code, message } } read by invokeFunction
  const answered = asRecord(cause?.error);
  if (typeof answered?.code === 'string') return { code: answered.code, message: text(answered.message) };
  // An HTTP error from functions.invoke carries the response in `context`
  const context = cause?.context as { clone?: () => { json: () => Promise<unknown> } } | undefined;
  if (context && typeof context.clone === 'function') {
    try {
      const body = asRecord(await context.clone().json());
      const inner = asRecord(body?.error);
      if (typeof inner?.code === 'string') return { code: inner.code, message: text(inner.message) };
    } catch {
      // not JSON
    }
  }
  // A rule raised by the database: the code is the message
  return { code: error.detail?.trim().match(/^[a-z_]+/)?.[0] ?? null, message: null };
};

/** The raw code behind an error (see serverAnswerOf). */
export const serverCodeOf = async (error: AppError): Promise<string | null> => (await serverAnswerOf(error)).code;

/** The same error, with a specific sentence when the Pro area knows its code. */
export const proError = async (err: unknown): Promise<AppError> => {
  // The async variant also reads the code from the HTTP response of a failed function call
  const error = await toAppErrorAsync(err);
  const { code, message: sent } = await serverAnswerOf(error);
  const fromServer = code && SERVER_SENTENCE_CODES.has(code) && sent && sent.length <= SERVER_SENTENCE_MAX ? sent : undefined;
  const message = fromServer ?? (code ? PRO_MESSAGES[code] : undefined);
  return message ? new AppError(error.code, { cause: error.cause, detail: error.detail, message }) : error;
};

/** Runs a service call and rethrows any failure as an AppError with the Pro sentences. */
export const guard = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (err) {
    throw await proError(err);
  }
};

const STEPS: readonly string[] = [
  'documento_selfie',
  'cadastro_fiscal',
  'registro_profissional',
  'antecedentes',
  'certificado_curso',
  'cnh',
  'licenca_orgao',
  'seguro_rc',
];

/** Steps listed by `documents_missing` (the database puts them in the error detail). */
export const missingStepsOf = (err: unknown): VerificationStep[] => {
  const details = asRecord(toAppError(err).cause)?.details;
  if (typeof details !== 'string') return [];
  return details
    .split(',')
    .map(step => step.trim())
    .filter((step): step is VerificationStep => STEPS.includes(step));
};
