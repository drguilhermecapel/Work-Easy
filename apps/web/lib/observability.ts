// Error reporting. Sentry runs only when VITE_SENTRY_DSN is set, and its SDK is loaded
// with a dynamic import() only then, so the bundle does not grow without a DSN. Nothing
// else leaves the browser for monitoring: no pixels, no analytics scripts, no replay.
import type { Breadcrumb, ErrorEvent } from '@sentry/react';

type SentryModule = typeof import('@sentry/react');
type DataCollection = NonNullable<NonNullable<Parameters<SentryModule['init']>[0]>['dataCollection']>;

export interface ObservabilityConfig {
  /** Sentry DSN. Empty means error reporting is off. */
  dsn: string;
  /** Release name from VITE_APP_VERSION; empty when unset. */
  release: string;
}

export const readObservabilityConfig = (
  env: Record<string, string | boolean | undefined> = import.meta.env,
): ObservabilityConfig => ({
  dsn: String(env.VITE_SENTRY_DSN ?? '').trim(),
  release: String(env.VITE_APP_VERSION ?? '').trim(),
});

// ---------------------------------------------------------------------------
// Scrubbing. Applied to every event before it leaves the browser.
// ---------------------------------------------------------------------------

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Formatted or bare: 14 digits (CNPJ) and 11 digits (CPF) that are not part of a longer number.
const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
// Brazilian phone numbers: optional +55, DDD with or without parentheses, 8 or 9 digit line.
const PHONE = /(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*\d{4,5}[\s.-]?\d{4}\b/g;
// Absolute URLs and paths at the start of a token: keep the address, drop query and fragment.
const ABSOLUTE_URL_TAIL = /(https?:\/\/[^\s"'<>?#]+)[?#][^\s"'<>]*/gi;
const PATH_TAIL = /(^|[\s"'(=])(\/[^\s"'<>?#]*)[?#][^\s"'<>]*/g;

/** Masks personal data inside a free-text string. */
export const scrubText = (text: string): string =>
  text
    .replace(ABSOLUTE_URL_TAIL, '$1')
    .replace(PATH_TAIL, '$1$2')
    .replace(EMAIL, '[email]')
    .replace(CNPJ, '[cnpj]')
    .replace(CPF, '[cpf]')
    .replace(PHONE, '[telefone]');

const scrubDeep = (value: unknown): unknown => {
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubDeep(item)]));
  }
  return value;
};

// Breadcrumb data keys that carry what a person typed or a body that was sent or received.
const FORM_DATA_KEYS = ['value', 'values', 'formData', 'form', 'input', 'body', 'request_body', 'response_body', 'response'];

const isFormBreadcrumb = (breadcrumb: Breadcrumb): boolean =>
  breadcrumb.category === 'form' ||
  Boolean(breadcrumb.category?.startsWith('ui.input')) ||
  Object.keys(breadcrumb.data ?? {}).some(key => FORM_DATA_KEYS.includes(key));

/**
 * beforeSend hook: masks personal data in every string, removes the request and response
 * bodies, cookies, headers and the user, and drops breadcrumbs that hold form values.
 */
export const scrubEvent = (event: ErrorEvent): ErrorEvent => {
  const scrubbed = scrubDeep(event) as ErrorEvent;
  const { request, contexts, breadcrumbs } = scrubbed;

  delete scrubbed.user;
  if (request) {
    delete request.data;
    delete request.cookies;
    delete request.headers;
    delete request.query_string;
    delete request.env;
  }
  if (contexts && 'response' in contexts) {
    delete contexts.response;
  }
  if (breadcrumbs) {
    scrubbed.breadcrumbs = breadcrumbs.filter(breadcrumb => !isFormBreadcrumb(breadcrumb));
  }
  return scrubbed;
};

// ---------------------------------------------------------------------------
// Initialization and reporting
// ---------------------------------------------------------------------------

// Sentry 11 replaces `sendDefaultPii` with `dataCollection`. Nothing that identifies the
// person, or the content of a request, is collected: no user, cookies, headers, query
// strings, bodies, local variables, GraphQL, AI or MCP payloads.
const PRIVACY_DATA_COLLECTION: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  stackFrameVariables: false,
  queues: false,
  databaseQueryData: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
};

let sentry: SentryModule | null = null;
let starting: Promise<boolean> | null = null;

/** True once the Sentry SDK has been loaded and initialized. */
export const isErrorReportingEnabled = (): boolean => sentry !== null;

/**
 * Starts error reporting when a DSN is configured. Without a DSN it resolves to false and
 * does not import the SDK. Errors while starting are swallowed: the app must work without
 * monitoring, and a message here could expose the DSN.
 */
export const initObservability = (config: ObservabilityConfig = readObservabilityConfig()): Promise<boolean> => {
  if (!config.dsn) return Promise.resolve(false);
  starting ??= import('@sentry/react')
    .then(module => {
      module.init({
        dsn: config.dsn,
        release: config.release,
        dataCollection: PRIVACY_DATA_COLLECTION,
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        beforeSend: event => scrubEvent(event),
      });
      sentry = module;
      return true;
    })
    .catch(() => false);
  return starting;
};

/** Sends an exception to Sentry when it is enabled; does nothing otherwise. */
export const captureError = (error: unknown, context: Record<string, string> = {}): void => {
  if (!sentry) return;
  sentry.captureException(error, { extra: context });
};
