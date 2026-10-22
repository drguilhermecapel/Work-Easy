// Pieces shared by the handlers: authenticated user, validation and Asaas
// error translation. Handlers receive everything external through `deps`, so
// tests can run them under Node with fakes.

import { AsaasError, describeAsaasError } from './asaas-client.ts';
import { errors, HttpError } from './http.ts';
import { MoneyError } from './money.ts';
import { parse, type Check } from './validate.ts';

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string | null;
}

export interface BaseDeps {
  siteUrl?: string;
  /** Also allow the localhost dev server origins (sandbox or ALLOW_DEV_ORIGINS). */
  allowDevOrigins?: boolean;
  now(): Date;
  logError(error: unknown): void;
}

/** CORS part of the route options, taken from the function's deps. */
export const corsOf = (deps: BaseDeps) => ({ siteUrl: deps.siteUrl, allowDevOrigins: deps.allowDevOrigins });

export interface AuditEntry {
  /** Who asked for the action; stored in data.requested_by (log_event records the service as actor). */
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  data?: Record<string, unknown>;
}

/** Error from PostgREST/Postgres, with the SQLSTATE (or PGRST) code. */
export class DbError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'DbError';
  }
}

export const UNIQUE_VIOLATION = '23505';

export const isUniqueViolation = (error: unknown) => error instanceof DbError && error.code === UNIQUE_VIOLATION;

/**
 * Errors that fail the same way on every retry: data exceptions (22), integrity
 * (23), access/syntax (42), PL/pgSQL raise (P0) and PostgREST request errors
 * (PGRST1xx/2xx). Connection, timeout and resource errors are not included.
 */
export function isDeterministicDbError(error: unknown): error is DbError {
  if (!(error instanceof DbError) || !error.code) return false;
  return /^(22|23|42|P0)/.test(error.code) || /^PGRST[12]/.test(error.code);
}

export function validated<T>(check: Check<T>, body: unknown): T {
  const result = parse(check, body);
  if (!result.ok) throw errors.invalidInput(result.errors);
  return result.value;
}

/** Asaas, money and timeout errors as the HttpError the app sees; anything else is returned as is. */
export function toHttpError(error: unknown): unknown {
  if (error instanceof AsaasError) {
    if (error.status === 401) {
      return new HttpError(503, 'payments_not_configured', 'A chave do Asaas configurada no servidor foi recusada.');
    }
    return errors.upstream(describeAsaasError(error), error.errors);
  }
  if (error instanceof MoneyError) return errors.invalidInput([error.message]);
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new HttpError(504, 'upstream_timeout', 'O Asaas não respondeu a tempo. Tente novamente.');
  }
  return error;
}

/** Runs an Asaas call, turning its errors into a 502 with the Asaas message. */
export async function callAsaas<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toHttpError(error);
  }
}

/**
 * Audit after money already moved in Asaas: a failure here is logged, not
 * returned, so the caller does not retry an operation that succeeded.
 */
export async function auditSafely(
  deps: { logError(error: unknown): void; admin: { audit(entry: AuditEntry): Promise<void> } },
  entry: AuditEntry,
): Promise<void> {
  try {
    await deps.admin.audit(entry);
  } catch (error) {
    deps.logError(error);
  }
}

/** Postgres raise codes from the contract ("Erros do banco") pass through as 409/403. */
export const DB_RULE_CODES = [
  'labor_lock', 'proposal_limit', 'request_not_open', 'not_allowed', 'invalid_transition',
  'slot_unavailable', 'registry_required', 'documents_missing', 'review_not_allowed',
  'quote_expired', 'unit_not_allowed',
] as const;

export function dbRuleError(message: string | undefined): HttpError | null {
  const code = DB_RULE_CODES.find(c => c === message?.trim());
  if (!code) return null;
  return new HttpError(code === 'not_allowed' ? 403 : 409, code, code);
}
