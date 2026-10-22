import { supabase, type AppSupabaseClient } from '../lib/supabase';
import { AppError, toAppError, toAppErrorAsync } from '../lib/errors';
import type { FunctionResult } from './types';

/** The Supabase client, or AppError('backend_disabled') in the demo mode. */
export const db = (): AppSupabaseClient => {
  if (!supabase) throw new AppError('backend_disabled');
  return supabase;
};

/** Result of a PostgREST/RPC call → its data, or the error converted to AppError. */
export const unwrap = <T>({ data, error }: { data: T | null; error: unknown }): T => {
  if (error) throw toAppError(error);
  if (data === null || data === undefined) throw new AppError('not_found');
  return data;
};

/** Like unwrap, but an absent row is a valid answer. */
export const unwrapMaybe = <T>({ data, error }: { data: T | null; error: unknown }): T | null => {
  if (error) throw toAppError(error);
  return data ?? null;
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
