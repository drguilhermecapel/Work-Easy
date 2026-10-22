import { AppError, toAppError, toAppErrorAsync } from '../lib/errors';
import type { VerificationStep } from '../catalog/types';

// lib/errors.ts has the sentence of every code the Pro area meets. These are the
// ones that read differently for a provider than for the client who pays.
const PRO_MESSAGES: Record<string, string> = {
  provider_payment_account_missing: 'Ative o recebimento em Assinatura antes de cobrar clientes.',
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

/**
 * The raw code behind an error: the one the Edge Function answered, or the rule
 * the database raised as message. Null when there is none.
 */
export const serverCodeOf = async (error: AppError): Promise<string | null> => {
  const cause = asRecord(error.cause);
  // A function answer { ok: false, error: { code } } read by invokeFunction
  const answered = asRecord(cause?.error)?.code;
  if (typeof answered === 'string') return answered;
  // An HTTP error from functions.invoke carries the response in `context`
  const context = cause?.context as { clone?: () => { json: () => Promise<unknown> } } | undefined;
  if (context && typeof context.clone === 'function') {
    try {
      const body = asRecord(await context.clone().json());
      const code = asRecord(body?.error)?.code;
      if (typeof code === 'string') return code;
    } catch {
      // not JSON
    }
  }
  // A rule raised by the database: the code is the message
  return error.detail?.trim().match(/^[a-z_]+/)?.[0] ?? null;
};

/** The same error, with a specific sentence when the Pro area knows its code. */
export const proError = async (err: unknown): Promise<AppError> => {
  // The async variant also reads the code from the HTTP response of a failed function call
  const error = await toAppErrorAsync(err);
  const code = await serverCodeOf(error);
  const message = code ? PRO_MESSAGES[code] : undefined;
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
