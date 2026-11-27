import { HttpError } from '../_shared/http.ts';
import { serviceClient } from './supabase.ts';

export async function ridePspRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await serviceClient().rpc(name, args);
  if (error) {
    if (error.message === 'not_allowed') throw new HttpError(403, 'not_allowed', 'Acesso à cobrança indisponível.');
    if (error.code === 'P0001') throw new HttpError(409, 'ride_psp_review', 'Consulte a situação deste trecho com a operação.');
    throw new Error('Falha ao gravar a conciliação do trecho.');
  }
  return data as T;
}
