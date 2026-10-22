// JSON envelope `{ ok, data | error }` and CORS for the app's origins.

/** Origins of the native shells: Capacitor iOS, Capacitor Android (https scheme), Tauri. */
export const APP_ORIGINS = [
  'capacitor://localhost',
  'https://localhost',
  'http://tauri.localhost',
  'tauri://localhost',
] as const;

/** Vite dev server; allowed only with the Asaas sandbox or ALLOW_DEV_ORIGINS=true. */
export const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'] as const;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export function allowedOrigins(siteUrl?: string, allowDev = false): string[] {
  const list: string[] = allowDev ? [...APP_ORIGINS, ...DEV_ORIGINS] : [...APP_ORIGINS];
  if (siteUrl) {
    try {
      const origin = new URL(siteUrl).origin;
      if (origin !== 'null' && !list.includes(origin)) list.push(origin);
    } catch {
      // ignore a malformed SITE_URL
    }
  }
  return list;
}

export function corsHeaders(origin: string | null, siteUrl?: string, allowDev = false): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins(siteUrl, allowDev).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

export const okResponse = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  json(status, { ok: true, data }, headers);

export const errorResponse = (status: number, error: ErrorBody, headers: Record<string, string> = {}) =>
  json(status, { ok: false, error }, headers);

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json', 'O corpo da requisição não é um JSON válido.');
  }
}

export interface RouteOptions {
  methods: string[];
  siteUrl?: string;
  allowDevOrigins?: boolean;
  /** Called with unexpected errors (never shown to the caller). */
  onError?: (error: unknown) => void;
}

/**
 * Wraps a handler body: answers CORS preflight, rejects other methods,
 * turns HttpError into the error envelope and hides unexpected errors.
 */
export async function route(
  req: Request,
  options: RouteOptions,
  body: () => Promise<{ data: unknown; status?: number }>,
): Promise<Response> {
  const cors = corsHeaders(req.headers.get('Origin'), options.siteUrl, options.allowDevOrigins);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!options.methods.includes(req.method)) {
    return errorResponse(405, { code: 'method_not_allowed', message: 'Método não permitido.' }, {
      ...cors,
      Allow: options.methods.join(', '),
    });
  }
  try {
    const { data, status = 200 } = await body();
    return okResponse(data, status, cors);
  } catch (error) {
    if (error instanceof HttpError) {
      const err: ErrorBody = { code: error.code, message: error.message };
      if (error.details !== undefined) err.details = error.details;
      return errorResponse(error.status, err, cors);
    }
    options.onError?.(error);
    return errorResponse(500, { code: 'internal', message: 'Erro interno. Tente novamente mais tarde.' }, cors);
  }
}

// Shared error factories so every function words the same case the same way.
export const errors = {
  unauthorized: () => new HttpError(401, 'unauthorized', 'Entre na sua conta para continuar.'),
  invalidInput: (details: string[]) =>
    new HttpError(400, 'invalid_input', 'Dados inválidos.', details),
  notFound: (what: string) => new HttpError(404, 'not_found', `${what} não encontrado.`),
  notAllowed: (message = 'Você não tem permissão para esta ação.') => new HttpError(403, 'not_allowed', message),
  conflict: (code: string, message: string) => new HttpError(409, code, message),
  tooMany: (code: string, message: string) => new HttpError(429, code, message),
  paymentsNotConfigured: () =>
    new HttpError(
      503,
      'payments_not_configured',
      'Pagamentos indisponíveis: a integração com o Asaas depende de configuração no servidor (ASAAS_API_KEY).',
    ),
  upstream: (message: string, details?: unknown) => new HttpError(502, 'upstream_error', message, details),
};
