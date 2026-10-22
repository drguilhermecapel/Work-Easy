// notify-dispatch (scheduler, CRON_SECRET): claims due notifications with
// claim_notifications and delivers them through the WhatsApp Cloud API
// (approved templates) or Resend. Without credentials a notification is
// marked `skipped`; temporary failures go back to the queue with backoff.

import type { FetchLike } from '../_shared/asaas-client.ts';
import type { FunctionConfig } from '../_shared/config.ts';
import { type BaseDeps, validated } from '../_shared/handler-kit.ts';
import { HttpError, readJson, route } from '../_shared/http.ts';
import {
  buildResendEmail, buildWhatsAppTemplate, isRetryableStatus, isTemplateName, nextNotificationState,
  type NotificationRow, type NotificationUpdate, RESEND_URL, type SendOutcome, TemplateError, whatsAppUrl,
} from '../_shared/notifications.ts';
import { bearerToken, secretMatches } from '../_shared/secrets.ts';
import { int, object, optional } from '../_shared/validate.ts';

export interface NotifyDeps extends BaseDeps {
  cronSecret?: string;
  whatsapp: FunctionConfig['whatsapp'];
  email: FunctionConfig['email'];
  fetch: FetchLike;
  store: {
    claim(limit: number): Promise<NotificationRow[]>;
    update(id: string, patch: NotificationUpdate): Promise<void>;
  };
}

const Body = object({ limit: optional(int({ min: 1, max: 100 })) });

async function providerError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } | string; message?: string };
    const message = typeof body.error === 'string' ? body.error : body.error?.message ?? body.message;
    return `http_${response.status}${message ? `: ${String(message).slice(0, 200)}` : ''}`;
  } catch {
    return `http_${response.status}`;
  }
}

async function post(deps: NotifyDeps, url: string, headers: Record<string, string>, body: unknown): Promise<SendOutcome> {
  try {
    const response = await deps.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return { kind: 'sent' };
    return { kind: 'error', reason: await providerError(response), retryable: isRetryableStatus(response.status) };
  } catch (error) {
    return { kind: 'error', reason: `network: ${error instanceof Error ? error.message : 'erro'}`, retryable: true };
  }
}

export async function deliver(row: NotificationRow, deps: NotifyDeps): Promise<SendOutcome> {
  if (!isTemplateName(row.template)) return { kind: 'error', reason: `unknown_template: ${row.template}`, retryable: false };
  try {
    if (row.channel === 'whatsapp') {
      const { token, phoneNumberId, graphVersion } = deps.whatsapp;
      if (!token || !phoneNumberId) return { kind: 'skipped', reason: 'whatsapp_not_configured' };
      if (!row.phone) return { kind: 'skipped', reason: 'missing_phone' };
      const message = buildWhatsAppTemplate({ to: row.phone, template: row.template, params: row.params });
      return await post(deps, whatsAppUrl(phoneNumberId, graphVersion), { Authorization: `Bearer ${token}` }, message);
    }
    if (row.channel === 'email') {
      const { resendApiKey, from } = deps.email;
      if (!resendApiKey || !from) return { kind: 'skipped', reason: 'email_not_configured' };
      if (!row.email) return { kind: 'skipped', reason: 'missing_email' };
      const email = buildResendEmail({ from, to: row.email, template: row.template, params: row.params, siteUrl: deps.siteUrl });
      return await post(
        deps,
        RESEND_URL,
        { Authorization: `Bearer ${resendApiKey}`, 'Idempotency-Key': `notification-${row.id}` },
        email,
      );
    }
    return { kind: 'error', reason: `unknown_channel: ${String(row.channel)}`, retryable: false };
  } catch (error) {
    if (error instanceof TemplateError) return { kind: 'error', reason: `invalid_params: ${error.message}`, retryable: false };
    throw error;
  }
}

export function handler(req: Request, deps: NotifyDeps): Promise<Response> {
  return route(req, { methods: ['POST'], onError: deps.logError }, async () => {
    if (!deps.cronSecret) throw new HttpError(503, 'cron_not_configured', 'CRON_SECRET não configurado no servidor.');
    const received = req.headers.get('x-cron-secret') ?? bearerToken(req.headers.get('Authorization'));
    if (!secretMatches(received, deps.cronSecret)) throw new HttpError(401, 'unauthorized', 'Segredo do agendador inválido.');

    const input = validated(Body, await readJson(req));
    const rows = await deps.store.claim(input.limit ?? 50);
    const summary = { claimed: rows.length, sent: 0, skipped: 0, retried: 0, failed: 0 };
    for (const row of rows) {
      let outcome: SendOutcome;
      try {
        outcome = await deliver(row, deps);
      } catch (error) {
        deps.logError(error);
        outcome = { kind: 'error', reason: 'internal', retryable: true };
      }
      const patch = nextNotificationState(outcome, row.attempts, deps.now());
      await deps.store.update(row.id, patch);
      if (patch.status === 'sent') summary.sent++;
      else if (patch.status === 'skipped') summary.skipped++;
      else if (patch.status === 'queued') summary.retried++;
      else summary.failed++;
    }
    return { data: summary };
  });
}
