// Every failure the screens show goes through AppError, so the user always
// reads a sentence in pt-BR and never a raw database or network message.

/** Codes raised by database functions and triggers (docs/ARQUITETURA.md, "Erros do banco"). */
export const DATABASE_ERROR_CODES = [
  'labor_lock',
  'proposal_limit',
  'request_not_open',
  'not_allowed',
  'invalid_transition',
  'slot_unavailable',
  'registry_required',
  'documents_missing',
  'review_not_allowed',
  'quote_expired',
  'unit_not_allowed',
  'quote_items_invalid',
  'slug_taken',
  'checkin_window',
  'booking_limit',
  'offer_limit',
  'free_proposal_limit',
] as const;

export type DatabaseErrorCode = (typeof DATABASE_ERROR_CODES)[number];

/** Codes produced by the app itself, by Supabase Auth, PostgREST, Edge Functions or the network. */
export type ClientErrorCode =
  | 'backend_disabled'
  | 'not_authenticated'
  | 'session_expired'
  | 'permission_denied'
  | 'not_found'
  | 'duplicate'
  | 'invalid_reference'
  | 'invalid_input'
  | 'otp_invalid'
  | 'otp_disabled'
  | 'invalid_email'
  | 'invalid_phone'
  | 'sms_unavailable'
  | 'email_unavailable'
  | 'signup_disabled'
  | 'user_banned'
  | 'captcha_failed'
  | 'rate_limited'
  | 'function_unavailable'
  | 'not_configured'
  | 'pro_required'
  | 'profile_incomplete'
  | 'cpf_cnpj_required'
  // Edge Functions (conflicts of payments, charges, subscriptions and onboarding)
  | 'already_paid'
  | 'booking_not_canceled'
  | 'booking_not_chargeable'
  | 'booking_not_payable'
  | 'quote_not_accepted'
  | 'platform_booking'
  | 'own_booking'
  | 'price_missing'
  | 'payment_in_progress'
  | 'provider_payment_account_missing'
  | 'payment_key_missing'
  | 'already_onboarded'
  | 'onboarding_in_progress'
  | 'already_subscribed'
  | 'no_subscription'
  | 'auth_delete_failed'
  | 'timeout'
  | 'offline'
  | 'network'
  | 'server_error'
  | 'unknown';

export type ErrorCode = DatabaseErrorCode | ClientErrorCode;

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // Database rules
  // The weekly limit comes from platform_settings, so the sentence does not state a number
  labor_lock:
    'Este atendimento passaria do limite semanal de dias com o mesmo profissional na mesma casa. A plataforma aplica esse limite porque a lei pode tratar a relação como emprego doméstico (LC 150/2015). Escolha outra semana ou contrate diretamente.',
  proposal_limit: 'Este pedido já recebeu o número máximo de propostas.',
  request_not_open: 'Este pedido não está mais aberto.',
  not_allowed: 'Você não tem permissão para fazer isso.',
  invalid_transition: 'Esta mudança de situação não é permitida agora. Atualize a página e tente de novo.',
  slot_unavailable: 'Este horário não está mais livre. Escolha outro horário.',
  registry_required: 'Esta profissão exige o número de registro no conselho para continuar.',
  documents_missing: 'Faltam documentos obrigatórios para enviar o cadastro para análise.',
  review_not_allowed: 'A avaliação só pode ser feita depois de um atendimento concluído e pago pelo app.',
  quote_expired: 'Este orçamento passou da validade ou já foi respondido.',
  unit_not_allowed: 'Esta unidade de preço não é permitida para esta ocupação.',
  quote_items_invalid:
    'Confira os itens do orçamento: cada item precisa de descrição, quantidade maior que zero e preço unitário.',
  slug_taken: 'Este endereço de página já está em uso. Escolha outro.',
  checkin_window: 'Fora do horário de registro. O registro vale de 2 horas antes a 2 horas depois do horário previsto.',
  booking_limit:
    'Você já tem muitos pedidos de agendamento aguardando resposta. Espere o profissional responder ou cancele algum.',
  offer_limit: 'Limite de ofertas atingido para este plantão ou para hoje. Tente de novo mais tarde.',
  // The monthly allowance comes from platform_settings, so the sentence does not state a number
  free_proposal_limit:
    'Você usou as propostas grátis deste mês. No plano Pro (menu Assinatura) as propostas são ilimitadas; as grátis voltam no mês que vem.',
  // App, auth, data access and network
  backend_disabled: 'Esta função ainda não está disponível nesta versão do app.',
  not_authenticated: 'Entre na sua conta para continuar.',
  session_expired: 'Sua sessão expirou. Entre de novo para continuar.',
  permission_denied: 'Você não tem permissão para acessar ou alterar estes dados.',
  not_found: 'Não encontramos o que você procurou.',
  duplicate: 'Este registro já existe.',
  invalid_reference: 'Um dos itens escolhidos não existe mais. Atualize a página e tente de novo.',
  invalid_input: 'Confira os dados informados e tente de novo.',
  otp_invalid: 'Código incorreto ou vencido. Confira o código ou peça um novo.',
  otp_disabled: 'O login por código não está habilitado. Fale com o suporte.',
  invalid_email: 'Confira o e-mail informado.',
  invalid_phone: 'Confira o número de telefone informado, com DDD.',
  sms_unavailable: 'O envio de código por SMS não está disponível agora. Tente entrar pelo e-mail.',
  email_unavailable: 'O envio de código por e-mail não está disponível agora. Tente entrar pelo celular.',
  signup_disabled: 'Novos cadastros estão fechados no momento.',
  user_banned: 'Esta conta está bloqueada. Fale com o suporte.',
  captcha_failed: 'Não foi possível confirmar que você não é um robô. Tente de novo.',
  rate_limited: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  function_unavailable: 'Este serviço está indisponível no momento. Tente mais tarde.',
  not_configured: 'Este recurso depende de configuração no servidor e ainda não está disponível.',
  pro_required: 'Este recurso faz parte do plano Pro.',
  profile_incomplete: 'Complete seu nome em Minha conta antes de continuar.',
  cpf_cnpj_required: 'Informe o CPF ou CNPJ para continuar.',
  already_paid: 'Este item já foi pago. Não é possível cobrar de novo.',
  booking_not_canceled: 'A cobrança só é cancelada depois que o atendimento é cancelado.',
  booking_not_chargeable: 'Este atendimento não pode ser cobrado na situação atual.',
  booking_not_payable: 'Só atendimentos aceitos pelo profissional podem ser pagos.',
  quote_not_accepted: 'Só orçamentos aceitos pelo cliente podem ser cobrados.',
  platform_booking: 'Atendimentos vindos da plataforma são pagos pelo cliente no app.',
  own_booking: 'Este atendimento é cobrado pelo próprio profissional.',
  price_missing: 'O valor ainda não está definido. Confira o preço antes de continuar.',
  payment_in_progress: 'Já existe um pagamento em andamento para este item.',
  provider_payment_account_missing: 'O recebimento pelo Asaas ainda não foi ativado para este profissional.',
  payment_key_missing:
    'A conta de recebimento foi criada, mas a chave de cobrança não foi guardada. Fale com o suporte para concluir a ativação.',
  already_onboarded: 'O recebimento já está ativado para esta conta.',
  onboarding_in_progress: 'A ativação do recebimento já está em andamento. Aguarde alguns instantes e atualize a página.',
  already_subscribed: 'Já existe uma assinatura Pro para esta conta.',
  no_subscription: 'Não há assinatura Pro ativa para cancelar.',
  auth_delete_failed:
    'Seus dados pessoais foram anonimizados, mas o login não pôde ser removido. Tente excluir de novo ou fale com o suporte.',
  timeout: 'O servidor demorou para responder. Tente de novo.',
  offline: 'Você está sem conexão com a internet.',
  network: 'Não foi possível falar com o servidor. Confira sua conexão e tente de novo.',
  server_error: 'Erro no servidor. Tente de novo em alguns minutos.',
  unknown: 'Algo deu errado. Tente de novo.',
};

const KNOWN_CODES = new Set<string>(Object.keys(ERROR_MESSAGES));

export const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && KNOWN_CODES.has(value);

export class AppError extends Error {
  readonly code: ErrorCode;
  /** Original error text, for logs only; never shown to the user. */
  readonly detail?: string;

  constructor(code: ErrorCode, options: { cause?: unknown; detail?: string; message?: string } = {}) {
    super(options.message ?? ERROR_MESSAGES[code], { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.detail = options.detail;
  }
}

// Postgres SQLSTATE and PostgREST codes
const SQLSTATE_CODES: Record<string, ErrorCode> = {
  '23505': 'duplicate',
  '23503': 'invalid_reference',
  '23514': 'invalid_input',
  '23502': 'invalid_input',
  '22P02': 'invalid_input',
  '22001': 'invalid_input',
  '22007': 'invalid_input',
  '22008': 'invalid_input',
  '23P01': 'slot_unavailable', // exclusion constraint: overlapping booking or shift
  '42501': 'permission_denied', // also raised by RLS on insert/update
  '57014': 'timeout',
  PGRST116: 'not_found', // .single() returned no row
  PGRST301: 'session_expired',
  PGRST303: 'session_expired',
};

// Supabase Auth error codes (auth-js ErrorCode)
const AUTH_CODES: Record<string, ErrorCode> = {
  otp_expired: 'otp_invalid',
  otp_disabled: 'otp_disabled',
  invalid_credentials: 'otp_invalid',
  email_address_invalid: 'invalid_email',
  email_address_not_authorized: 'invalid_email',
  validation_failed: 'invalid_input',
  phone_provider_disabled: 'sms_unavailable',
  sms_send_failed: 'sms_unavailable',
  email_provider_disabled: 'email_unavailable',
  signup_disabled: 'signup_disabled',
  user_banned: 'user_banned',
  captcha_failed: 'captcha_failed',
  over_request_rate_limit: 'rate_limited',
  over_email_send_rate_limit: 'rate_limited',
  over_sms_send_rate_limit: 'rate_limited',
  session_expired: 'session_expired',
  session_not_found: 'session_expired',
  refresh_token_not_found: 'session_expired',
  refresh_token_already_used: 'session_expired',
  bad_jwt: 'session_expired',
  no_authorization: 'not_authenticated',
  user_not_found: 'not_found',
  request_timeout: 'timeout',
  hook_timeout: 'timeout',
  hook_timeout_after_retry: 'timeout',
};

// Codes our Edge Functions send in { ok: false, error: { code, message } }
// (supabase/functions/_shared/http.ts) that are not codes of this file.
const FUNCTION_CODES: Record<string, ErrorCode> = {
  unauthorized: 'not_authenticated',
  invalid_token: 'not_authenticated',
  confirmation_required: 'invalid_input',
  invalid_json: 'invalid_input',
  assist_declined: 'invalid_input',
  upstream_error: 'function_unavailable',
  assist_unavailable: 'function_unavailable',
  assist_busy: 'function_unavailable',
  upstream_timeout: 'timeout',
  assist_timeout: 'timeout',
  internal: 'server_error',
  invalid_response: 'server_error',
  method_not_allowed: 'server_error',
};

/** A code sent by an Edge Function → ours, or undefined when unknown (the HTTP status decides then). */
const functionCode = (code: string): ErrorCode | undefined => {
  if (isErrorCode(code)) return code;
  if (FUNCTION_CODES[code]) return FUNCTION_CODES[code];
  if (code.endsWith('_not_configured')) return 'not_configured';
  return databaseCode(code);
};

const statusCode = (status: number): ErrorCode => {
  if (status === 401) return 'not_authenticated';
  if (status === 403) return 'permission_denied';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 409) return 'duplicate';
  if (status === 422 || status === 400) return 'invalid_input';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'function_unavailable';
  if (status >= 500) return 'server_error';
  return 'unknown';
};

/**
 * Database rules raise their code as the message ("labor_lock"), sometimes
 * followed by detail ("labor_lock: 3 days"). Match only at the start, as a whole word.
 */
const databaseCode = (message: unknown): DatabaseErrorCode | undefined => {
  if (typeof message !== 'string') return undefined;
  const head = message.trim().match(/^[a-z_]+/)?.[0];
  return (DATABASE_ERROR_CODES as readonly string[]).includes(head ?? '') ? (head as DatabaseErrorCode) : undefined;
};

const NETWORK_MESSAGE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_network|err_internet_disconnected/i;

const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

const detailOf = (err: unknown): string | undefined => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return typeof err === 'string' ? err : undefined;
};

const codeOf = (err: unknown): ErrorCode => {
  if (typeof err === 'string') return databaseCode(err) ?? (isErrorCode(err) ? err : 'unknown');
  if (!err || typeof err !== 'object') return 'unknown';

  const e = err as { name?: unknown; code?: unknown; message?: unknown; status?: unknown; error?: unknown };
  const name = typeof e.name === 'string' ? e.name : '';

  // Our own Edge Functions answer { ok: false, error: { code, message, details? } }
  if (e.error && typeof e.error === 'object') {
    const bodyCode = (e.error as { code?: unknown }).code;
    const fromBody = typeof bodyCode === 'string' ? functionCode(bodyCode) : undefined;
    if (fromBody) return fromBody;
  }

  // Rules raised by the database: errcode P0001 (raise exception) with the code as message
  const rule = databaseCode(e.message);
  if (rule) return rule;

  if (typeof e.code === 'string') {
    if (SQLSTATE_CODES[e.code]) return SQLSTATE_CODES[e.code];
    if (AUTH_CODES[e.code]) return AUTH_CODES[e.code];
    if (isErrorCode(e.code)) return e.code;
  }

  if (name === 'FunctionsFetchError' || name === 'AuthRetryableFetchError') return isOffline() ? 'offline' : 'network';
  if (name === 'FunctionsRelayError') return 'function_unavailable';
  if (name === 'AbortError' || name === 'TimeoutError') return 'timeout';
  if (typeof e.message === 'string' && NETWORK_MESSAGE.test(e.message)) return isOffline() ? 'offline' : 'network';
  if (name === 'AuthSessionMissingError') return 'not_authenticated';

  if (typeof e.status === 'number' && e.status >= 400) return statusCode(e.status);
  return 'unknown';
};

/** Converts anything thrown or returned as `error` by Supabase into an AppError. */
export const toAppError = (err: unknown): AppError => {
  if (err instanceof AppError) return err;
  return new AppError(codeOf(err), { cause: err, detail: detailOf(err) });
};

/**
 * Edge Function failures carry the HTTP response in `context`; its JSON body
 * ({ ok: false, error }) holds our code. Reading it is async, so services call this.
 */
export const toAppErrorAsync = async (err: unknown): Promise<AppError> => {
  if (err instanceof AppError) {
    // Converted before its HTTP response was read (code unknown): look at what caused it
    if (err.code !== 'unknown' || !err.cause) return err;
    const inner = await toAppErrorAsync(err.cause);
    return inner.code === 'unknown' ? err : inner;
  }
  const context = (err as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).json === 'function') {
    const response = context as Response;
    try {
      const body: unknown = await response.clone().json();
      const code = codeOf(body);
      if (code !== 'unknown') return new AppError(code, { cause: err, detail: detailOf(err) });
    } catch {
      // Body is not JSON: fall back to the HTTP status
    }
    if (typeof response.status === 'number') return new AppError(statusCode(response.status), { cause: err, detail: detailOf(err) });
  }
  return toAppError(err);
};

/** The sentence to show for any error. */
export const errorMessage = (err: unknown): string => toAppError(err).message;
