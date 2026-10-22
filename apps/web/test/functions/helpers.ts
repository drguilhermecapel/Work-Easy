import { AsaasClient } from '../../supabase/functions/_shared/asaas-client.ts';
import type { AuthUser } from '../../supabase/functions/_shared/handler-kit.ts';

export const VALID_CPF = '52998224725';
export const VALID_CNPJ = '11222333000181';

export const USER: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'cliente@example.com',
  phone: null,
  created_at: '2026-01-01T00:00:00Z',
};

export const PROVIDER: AuthUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'prestador@example.com',
  phone: null,
  created_at: '2026-01-01T00:00:00Z',
};

export const BOOKING_ID = '33333333-3333-4333-8333-333333333333';
export const QUOTE_ID = '44444444-4444-4444-8444-444444444444';

export interface RecordedCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type Route = (call: RecordedCall) => { status?: number; body: unknown };

/** fetch double: routes by "METHOD /path" (path relative to the base URL host). */
export function fakeFetch(routes: Record<string, Route | { status?: number; body: unknown }>) {
  const calls: RecordedCall[] = [];
  const fetch = async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    const call: RecordedCall = {
      method,
      url: input,
      headers,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const key = `${method} ${url.pathname}`;
    const route = routes[key];
    if (!route) return new Response(JSON.stringify({ errors: [{ code: 'not_found', description: key }] }), { status: 404 });
    const result = typeof route === 'function' ? route(call) : route;
    return new Response(JSON.stringify(result.body), { status: result.status ?? 200 });
  };
  return { fetch, calls };
}

export function asaasWith(routes: Parameters<typeof fakeFetch>[0]) {
  const { fetch, calls } = fakeFetch(routes);
  const client = new AsaasClient({ apiKey: 'root-key', baseUrl: 'https://api-sandbox.asaas.com/v3', fetch });
  return { client, calls };
}

export function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:54321/functions/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-jwt', ...headers },
    body: JSON.stringify(body),
  });
}

// Response bodies are asserted field by field in tests, so a loose type is enough
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function read(response: Response): Promise<{ status: number; body: { ok: boolean; data?: any; error?: any } }> {
  return { status: response.status, body: await response.json() };
}

export const FIXED_NOW = new Date('2026-10-19T15:00:00Z');

export const baseDeps = {
  siteUrl: 'https://workeasy.com.br',
  now: () => FIXED_NOW,
  logError: () => {},
};
