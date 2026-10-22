// Notification templates and provider payloads.
//
// Sources consulted (2026-10-19):
//   WhatsApp Cloud API template messages:
//     https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview.md
//     POST https://graph.facebook.com/{version}/{phone-number-id}/messages, Authorization: Bearer
//   Graph API versions (v26.0, 2026-07-29): https://developers.facebook.com/docs/graph-api/changelog
//   Resend: https://resend.com/docs/api-reference/emails/send-email
//     POST https://api.resend.com/emails, Authorization: Bearer, Idempotency-Key header

import { formatDateTimeBR } from './dates.ts';
import { formatBRL } from './money.ts';
import { normalizePhoneBR } from './validate.ts';
import type { NotificationChannel, NotificationStatus } from './types.ts';

export const DEFAULT_GRAPH_VERSION = 'v26.0';
export const WHATSAPP_LANGUAGE = 'pt_BR';
export const RESEND_URL = 'https://api.resend.com/emails';

export type TemplateName =
  | 'proposta_recebida'
  | 'atendimento_confirmado'
  | 'lembrete_atendimento'
  | 'pagamento_recebido'
  | 'orcamento_respondido'
  | 'plantao_oferecido';

interface TemplateSpec {
  /** Ordered keys of `notifications.params`; they fill {{1}}, {{2}}, ... */
  params: string[];
  subject: string;
  /** Plain-text body; `{key}` is replaced by the formatted param. */
  body: string;
}

// The WhatsApp templates must be approved in WhatsApp Manager with the same
// name, language pt_BR and the same number of body variables, in this order.
export const TEMPLATES: Record<TemplateName, TemplateSpec> = {
  proposta_recebida: {
    params: ['provider_name', 'occupation_name', 'price_cents'],
    subject: 'Você recebeu uma proposta',
    body: '{provider_name} enviou uma proposta de {price_cents} para o seu pedido de {occupation_name}. Abra o WorkEasy para ver e responder.',
  },
  atendimento_confirmado: {
    params: ['occupation_name', 'starts_at', 'other_party_name'],
    subject: 'Atendimento confirmado',
    body: 'O atendimento de {occupation_name} em {starts_at} com {other_party_name} foi confirmado. Os detalhes estão no WorkEasy.',
  },
  lembrete_atendimento: {
    params: ['occupation_name', 'starts_at', 'other_party_name'],
    subject: 'Lembrete de atendimento',
    body: 'Lembrete: atendimento de {occupation_name} em {starts_at} com {other_party_name}.',
  },
  pagamento_recebido: {
    params: ['amount_cents', 'client_name'],
    subject: 'Pagamento recebido',
    body: 'O pagamento de {amount_cents} de {client_name} foi recebido pelo Asaas. Os detalhes estão no WorkEasy.',
  },
  orcamento_respondido: {
    params: ['quote_title', 'response'],
    subject: 'Orçamento respondido',
    body: 'O orçamento "{quote_title}" foi {response} pelo cliente.',
  },
  plantao_oferecido: {
    params: ['starts_at', 'neighborhood_name'],
    subject: 'Plantão oferecido',
    body: 'Há um plantão oferecido para você em {starts_at}, em {neighborhood_name}. Abra o WorkEasy para aceitar ou recusar.',
  },
};

export class TemplateError extends Error {}

export function isTemplateName(name: string): name is TemplateName {
  return Object.hasOwn(TEMPLATES, name);
}

/** `*_cents` -> BRL, `*_at` -> São Paulo date and time, booleans for quote answers. */
export function formatParam(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') throw new TemplateError(`missing param ${key}`);
  if (key.endsWith('_cents')) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TemplateError(`${key} must be integer cents`);
    return formatBRL(value);
  }
  if (key.endsWith('_at')) return formatDateTimeBR(String(value));
  if (key === 'response' && typeof value === 'boolean') return value ? 'aceito' : 'recusado';
  if (key === 'response' && (value === 'accepted' || value === 'declined')) {
    return value === 'accepted' ? 'aceito' : 'recusado';
  }
  // WhatsApp rejects newlines, tabs and 4+ spaces in body parameters
  return String(value).replace(/[\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 300);
}

/** Ordered, formatted values for a template. `params` may be an object (by spec keys) or an array. */
export function templateValues(template: TemplateName, params: unknown): string[] {
  const spec = TEMPLATES[template];
  if (Array.isArray(params)) {
    if (params.length !== spec.params.length) throw new TemplateError(`${template} expects ${spec.params.length} params`);
    return params.map((value, i) => formatParam(spec.params[i], value));
  }
  if (!params || typeof params !== 'object') throw new TemplateError('params must be an object or an array');
  const record = params as Record<string, unknown>;
  return spec.params.map(key => formatParam(key, record[key]));
}

export interface WhatsAppTemplateMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components: Array<{ type: 'body'; parameters: Array<{ type: 'text'; text: string }> }>;
  };
}

export function buildWhatsAppTemplate(input: { to: string; template: TemplateName; params: unknown }): WhatsAppTemplateMessage {
  const to = normalizePhoneBR(input.to);
  if (!to) throw new TemplateError('invalid phone');
  const values = templateValues(input.template, input.params);
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: input.template,
      language: { code: WHATSAPP_LANGUAGE },
      components: values.length
        ? [{ type: 'body', parameters: values.map(text => ({ type: 'text', text })) }]
        : [],
    },
  };
}

export function whatsAppUrl(phoneNumberId: string, graphVersion = DEFAULT_GRAPH_VERSION): string {
  if (!/^\d+$/.test(phoneNumberId)) throw new TemplateError('WHATSAPP_PHONE_NUMBER_ID must be numeric');
  if (!/^v\d+\.\d+$/.test(graphVersion)) throw new TemplateError('graph version must look like v26.0');
  return `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function renderTemplateText(template: TemplateName, params: unknown): string {
  const spec = TEMPLATES[template];
  const values = templateValues(template, params);
  return spec.params.reduce((text, key, i) => text.split(`{${key}}`).join(values[i]), spec.body);
}

export interface ResendEmail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  tags: Array<{ name: string; value: string }>;
}

export function buildResendEmail(input: {
  from: string;
  to: string;
  template: TemplateName;
  params: unknown;
  siteUrl?: string;
}): ResendEmail {
  const to = input.to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new TemplateError('invalid email');
  const spec = TEMPLATES[input.template];
  const message = renderTemplateText(input.template, input.params);
  const footer = 'Você recebe esta mensagem porque tem uma conta no WorkEasy.';
  const link = input.siteUrl ? `\n\n${input.siteUrl}` : '';
  const linkHtml = input.siteUrl
    ? `<p><a href="${escapeHtml(input.siteUrl)}">Abrir o WorkEasy</a></p>`
    : '';
  return {
    from: input.from,
    to: [to],
    subject: spec.subject,
    text: `${message}${link}\n\n${footer}`,
    html: `<p>${escapeHtml(message)}</p>${linkHtml}<p style="color:#6b7280;font-size:12px">${escapeHtml(footer)}</p>`,
    tags: [{ name: 'template', value: input.template }],
  };
}

export interface NotificationRow {
  id: string;
  user_id: string | null;
  phone: string | null;
  email: string | null;
  channel: NotificationChannel;
  template: string;
  params: unknown;
  attempts: number | null;
}

export type SendOutcome =
  | { kind: 'sent' }
  | { kind: 'skipped'; reason: string }
  | { kind: 'error'; reason: string; retryable: boolean };

export const MAX_ATTEMPTS = 5;

export interface NotificationUpdate {
  status: NotificationStatus;
  attempts: number;
  error: string | null;
  sent_at?: string;
  scheduled_for?: string;
}

/** Row update after one delivery attempt; retryable errors back off 1, 4, 9, 16 minutes. */
export function nextNotificationState(outcome: SendOutcome, previousAttempts: number | null, now: Date): NotificationUpdate {
  const attempts = (previousAttempts ?? 0) + 1;
  if (outcome.kind === 'sent') return { status: 'sent', attempts, error: null, sent_at: now.toISOString() };
  if (outcome.kind === 'skipped') return { status: 'skipped', attempts, error: outcome.reason };
  if (outcome.retryable && attempts < MAX_ATTEMPTS) {
    return {
      status: 'queued',
      attempts,
      error: outcome.reason,
      scheduled_for: new Date(now.getTime() + attempts * attempts * 60_000).toISOString(),
    };
  }
  return { status: 'failed', attempts, error: outcome.reason };
}

/** 429 and 5xx are worth retrying; other 4xx are not. */
export const isRetryableStatus = (status: number) => status === 429 || status >= 500;
