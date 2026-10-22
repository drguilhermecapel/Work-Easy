// Deno-only wiring shared by the function entry points: environment, Supabase
// clients, the authenticated caller and the database operations several
// functions reuse. Business rules live in ../_shared (tested with Vitest).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { AsaasClient } from '../_shared/asaas-client.ts';
import { type FunctionConfig, readConfig } from '../_shared/config.ts';
import { type AuditEntry, type AuthUser, DbError } from '../_shared/handler-kit.ts';
import { cancelPendingPayment } from '../_shared/payment-cancel.ts';
import { bearerToken } from '../_shared/secrets.ts';
import { PAID_PAYMENT_STATUSES, type PlanCode } from '../_shared/types.ts';
import type { NewPayment, PaymentRecord } from '../payments-create/handler.ts';

export const config: FunctionConfig = readConfig(name => Deno.env.get(name));

export const now = () => new Date();

export function logError(error: unknown): void {
  // Never log request bodies or secrets; the error is enough to debug
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

let service: SupabaseClient | null = null;

/** Service-role client: only for writes the contract reserves to the server. */
export function serviceClient(): SupabaseClient {
  if (!config.supabaseUrl || !config.serviceKey) throw new Error('SUPABASE_URL / service key missing');
  service ??= createClient(config.supabaseUrl, config.serviceKey, clientOptions);
  return service;
}

export interface Caller {
  user: AuthUser;
  /** Client carrying the caller's JWT, so every query goes through RLS. */
  db: SupabaseClient;
}

/** Validates the caller's JWT with Supabase Auth; null when absent or invalid. */
export async function authenticate(req: Request): Promise<Caller | null> {
  const token = bearerToken(req.headers.get('Authorization'));
  if (!token || !config.supabaseUrl || !config.publishableKey) return null;
  const db = createClient(config.supabaseUrl, config.publishableKey, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const u = data.user;
  return {
    user: { id: u.id, email: u.email ?? null, phone: u.phone ?? null, created_at: u.created_at ?? null },
    db,
  };
}

export function asaasClient(): AsaasClient | null {
  if (!config.asaas.apiKey) return null;
  return new AsaasClient({ apiKey: config.asaas.apiKey, baseUrl: config.asaas.baseUrl, fetch: (input, init) => fetch(input, init) });
}

interface PgResult<T> {
  data: T | null;
  error: { message: string; code?: string; details?: string } | null;
}

export { DbError };

/** Unwraps a PostgREST result, throwing the database message (e.g. `invalid_transition`). */
export function must<T>(result: PgResult<T>): T {
  if (result.error) throw new DbError(result.error.message, result.error.code);
  return result.data as T;
}

/**
 * audit_log through log_event (contract: "Só insert, via log_event(...)").
 * Called with the service role, log_event records no actor_id and marks
 * via=service; the user who asked for the action goes in data.requested_by.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  must(
    await serviceClient().rpc('log_event', {
      p_action: entry.action,
      p_entity: entry.entity,
      p_entity_id: entry.entity_id,
      p_data: { ...(entry.data ?? {}), ...(entry.actor_id ? { requested_by: entry.actor_id } : {}) },
    }),
  );
}

export async function getCustomerId(userId: string): Promise<string | null> {
  const row = must(
    await serviceClient().from('customer_payment_profiles').select('asaas_customer_id').eq('user_id', userId).maybeSingle(),
  ) as { asaas_customer_id: string | null } | null;
  return row?.asaas_customer_id ?? null;
}

export async function saveCustomerId(userId: string, asaasCustomerId: string): Promise<void> {
  must(
    await serviceClient()
      .from('customer_payment_profiles')
      .upsert({ user_id: userId, asaas_customer_id: asaasCustomerId }, { onConflict: 'user_id' }),
  );
}

export async function getProfile(userId: string): Promise<{ full_name: string | null; phone: string | null } | null> {
  return must(
    await serviceClient().from('profiles').select('full_name, phone').eq('id', userId).maybeSingle(),
  ) as { full_name: string | null; phone: string | null } | null;
}

/** Rejects with DbError code 23505 when the database refuses a second pending charge. */
export async function insertPayment(row: NewPayment): Promise<{ id: string }> {
  return must(await serviceClient().from('payments').insert(row).select('id').single()) as { id: string };
}

/** Cancels a charge only while it is still `pending` (see _shared/payment-cancel.ts). */
export async function markPaymentCanceled(id: string): Promise<void> {
  await cancelPendingPayment(serviceClient(), id, now());
}

export const PAYMENT_COLUMNS = 'id, asaas_payment_id, method, status, amount_cents, invoice_url, pix_qr_code, pix_payload, due_date';

/** A pending charge already created for the same booking or quote (makes retries idempotent). */
export async function findOpenPayment(column: 'booking_id' | 'quote_id', id: string): Promise<PaymentRecord | null> {
  const rows = must(
    await serviceClient()
      .from('payments')
      .select(PAYMENT_COLUMNS)
      .eq(column, id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1),
  ) as PaymentRecord[] | null;
  return rows?.[0] ?? null;
}

/** Whether the booking or quote already has a paid payment (blocks a second charge). */
export async function hasPaidPayment(column: 'booking_id' | 'quote_id', id: string): Promise<boolean> {
  const rows = must(
    await serviceClient().from('payments').select('id').eq(column, id).in('status', [...PAID_PAYMENT_STATUSES]).limit(1),
  ) as Array<{ id: string }> | null;
  return (rows?.length ?? 0) > 0;
}

export async function setProviderPlan(providerId: string, plan: PlanCode): Promise<void> {
  must(await serviceClient().from('providers').update({ plan }).eq('id', providerId));
}

// Supabase Vault is not exposed through the Data API; the database offers two
// service-role-only functions for the subaccount key (06_payments.sql).
export async function storeSecret(providerId: string, secret: string): Promise<string> {
  const id = must(
    await serviceClient().rpc('store_provider_payment_secret', { p_provider: providerId, p_secret: secret }),
  ) as string | null;
  if (!id) throw new DbError('store_provider_payment_secret returned no id');
  return id;
}

export async function readSecret(providerId: string): Promise<string | null> {
  return must(await serviceClient().rpc('get_provider_payment_secret', { p_provider: providerId })) as string | null;
}

/** Asaas client with the provider's subaccount key, or null when none is stored. */
export async function subaccountAsaas(providerId: string): Promise<AsaasClient | null> {
  const root = asaasClient();
  if (!root) return null;
  const key = await readSecret(providerId);
  return key ? root.withApiKey(key) : null;
}

export function serve(handler: (req: Request) => Promise<Response>): void {
  Deno.serve(handler);
}
