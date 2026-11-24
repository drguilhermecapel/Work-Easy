import { supabase, type AppSupabaseClient } from '../lib/supabase';
import { AppError, toAppError, toAppErrorAsync } from '../lib/errors';
import type { FunctionResult } from './types';

/** The Supabase client, or AppError('backend_disabled') in the demo mode. */
export const db = (): AppSupabaseClient => {
  if (!supabase) throw new AppError('backend_disabled');
  return supabase;
};

/**
 * Result of a PostgREST/RPC call → its data, or the error converted to AppError.
 *
 * The client is typed with the generated database types, which check table, column and function
 * names and the arguments of every call. The shape of what comes back is stated by the caller
 * (`T`): the services narrow columns the generator cannot (ranges and JSON arrive as `unknown`
 * and `Json`, text columns with a CHECK arrive as `string`).
 */
export const unwrap = <T>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw toAppError(error);
  if (data === null || data === undefined) throw new AppError('not_found');
  return data as T;
};

/**
 * A nullable argument of a database function. PostgREST takes `null` for it, and the screens
 * send `null` on purpose ("no reason", "any neighborhood"); the generated types only describe
 * an argument with a default as "may be left out". This states the intent and keeps the request
 * exactly as it is sent: the value still travels as `null`.
 */
export const nullable = <T>(value: T | null): T | undefined => value as T | undefined;

/** Like unwrap, but an absent row is a valid answer. */
export const unwrapMaybe = <T>({ data, error }: { data: unknown; error: unknown }): T | null => {
  if (error) throw toAppError(error);
  return (data ?? null) as T | null;
};

/** Calls an Edge Function that answers { ok, data | error } with the user's session. */
export const invokeFunction = async <T>(name: string, body?: Record<string, unknown>): Promise<T> => {
  let result: { data: unknown; error: unknown };
  try {
    result = await db().functions.invoke(name, { method: 'POST', body: body ?? {} });
  } catch (err) {
    throw await toAppErrorAsync(err);
  }
  if (result.error) throw await toAppErrorAsync(result.error);
  const answer = result.data as FunctionResult<T> | null;
  if (!answer || typeof answer !== 'object' || !('ok' in answer)) throw new AppError('server_error');
  if (!answer.ok) throw toAppError({ error: answer.error });
  return answer.data;
};
