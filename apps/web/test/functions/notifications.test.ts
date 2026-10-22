// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildResendEmail, buildWhatsAppTemplate, formatParam, nextNotificationState, releaseNotification, renderTemplateText, TEMPLATES,
  TemplateError, templateValues, whatsAppUrl,
} from '../../supabase/functions/_shared/notifications.ts';

describe('WhatsApp template payload', () => {
  it('builds the Cloud API template message with ordered body parameters', () => {
    const message = buildWhatsAppTemplate({
      to: '(11) 98765-4321',
      template: 'proposta_recebida',
      params: { provider_name: 'Ana', occupation_name: 'Eletricista', price_cents: 15000 },
    });
    expect(message).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5511987654321',
      type: 'template',
      template: {
        name: 'proposta_recebida',
        language: { code: 'pt_BR' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: 'Ana' },
            { type: 'text', text: 'Eletricista' },
            { type: 'text', text: 'R$ 150,00' },
          ],
        }],
      },
    });
  });

  it('formats dates in São Paulo time and accepts positional params', () => {
    const message = buildWhatsAppTemplate({
      to: '5511987654321',
      template: 'lembrete_atendimento',
      params: ['Diarista', '2026-10-20T13:00:00Z', 'Carlos'],
    });
    expect(message.template.components[0].parameters.map(p => p.text)).toEqual(['Diarista', '20/10/2026 às 10:00', 'Carlos']);
  });

  it('rejects missing params, wrong arity and bad phones', () => {
    expect(() => buildWhatsAppTemplate({ to: '11987654321', template: 'pagamento_recebido', params: { amount_cents: 100 } }))
      .toThrow(TemplateError);
    expect(() => templateValues('pagamento_recebido', [100])).toThrow(TemplateError);
    expect(() => templateValues('pagamento_recebido', 'x')).toThrow(TemplateError);
    expect(() => buildWhatsAppTemplate({ to: '123', template: 'pagamento_recebido', params: [100, 'Ana'] })).toThrow(TemplateError);
    expect(() => formatParam('price_cents', 10.5)).toThrow(TemplateError);
  });

  it('strips characters WhatsApp rejects in parameters', () => {
    expect(formatParam('client_name', 'Ana\n\tMaria     Souza')).toBe('Ana Maria   Souza');
    expect(formatParam('response', true)).toBe('aceito');
    expect(formatParam('response', 'declined')).toBe('recusado');
  });

  it('builds the versioned Graph URL and validates its parts', () => {
    expect(whatsAppUrl('123456789')).toBe('https://graph.facebook.com/v26.0/123456789/messages');
    expect(whatsAppUrl('1', 'v25.0')).toBe('https://graph.facebook.com/v25.0/1/messages');
    expect(() => whatsAppUrl('abc')).toThrow(TemplateError);
    expect(() => whatsAppUrl('1', '26')).toThrow(TemplateError);
  });

  it('has text for every contract template', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual([
      'atendimento_confirmado', 'lembrete_atendimento', 'orcamento_respondido', 'pagamento_recebido',
      'plantao_oferecido', 'proposta_recebida',
    ]);
    for (const [name, spec] of Object.entries(TEMPLATES)) {
      for (const key of spec.params) expect(spec.body, `${name}.${key}`).toContain(`{${key}}`);
    }
  });
});

describe('Resend email', () => {
  it('builds subject, text and escaped HTML', () => {
    const email = buildResendEmail({
      from: 'WorkEasy <avisos@workeasy.com.br>',
      to: ' prestador@example.com ',
      template: 'orcamento_respondido',
      params: { quote_title: 'Pintura <sala>', response: 'accepted' },
      siteUrl: 'https://workeasy.com.br',
    });
    expect(email.to).toEqual(['prestador@example.com']);
    expect(email.subject).toBe('Orçamento respondido');
    expect(email.text).toContain('O orçamento "Pintura <sala>" foi aceito pelo cliente.');
    expect(email.text).toContain('https://workeasy.com.br');
    expect(email.html).toContain('Pintura &lt;sala&gt;');
    expect(email.html).not.toContain('<sala>');
    expect(email.tags).toEqual([{ name: 'template', value: 'orcamento_respondido' }]);
  });

  it('rejects invalid recipients', () => {
    expect(() => buildResendEmail({ from: 'a@b.co', to: 'nope', template: 'pagamento_recebido', params: [1, 'x'] }))
      .toThrow(TemplateError);
  });

  it('renders the same text used by both channels', () => {
    expect(renderTemplateText('pagamento_recebido', { amount_cents: 123456, client_name: 'Ana' }))
      .toBe('O pagamento de R$ 1.234,56 de Ana foi recebido pelo Asaas. Os detalhes estão no WorkEasy.');
  });
});

describe('nextNotificationState', () => {
  const now = new Date('2026-10-19T12:00:00Z');

  it('marks sent and skipped', () => {
    expect(nextNotificationState({ kind: 'sent' }, 1, now)).toEqual({
      status: 'sent', attempts: 1, error: null, sent_at: '2026-10-19T12:00:00.000Z',
    });
    expect(nextNotificationState({ kind: 'skipped', reason: 'whatsapp_not_configured' }, null, now)).toEqual({
      status: 'skipped', attempts: 1, error: 'whatsapp_not_configured',
    });
  });

  it('does not count the attempt twice: claim_notifications already incremented it', () => {
    // First delivery attempt: the claim returns attempts = 1
    expect(nextNotificationState({ kind: 'error', reason: 'http_500', retryable: true }, 1, now)).toEqual({
      status: 'queued', attempts: 1, error: 'http_500', scheduled_for: '2026-10-19T12:01:00.000Z',
    });
    // Third attempt: backs off 9 minutes and still has two attempts left
    expect(nextNotificationState({ kind: 'error', reason: 'http_500', retryable: true }, 3, now)).toMatchObject({
      status: 'queued', attempts: 3, scheduled_for: '2026-10-19T12:09:00.000Z',
    });
  });

  it('gives up after five attempts and never retries permanent errors', () => {
    expect(nextNotificationState({ kind: 'error', reason: 'http_500', retryable: true }, 4, now).status).toBe('queued');
    expect(nextNotificationState({ kind: 'error', reason: 'http_500', retryable: true }, 5, now).status).toBe('failed');
    expect(nextNotificationState({ kind: 'error', reason: 'http_400', retryable: false }, 1, now).status).toBe('failed');
  });
});

describe('releaseNotification', () => {
  it('puts an unsent row back in the queue without spending an attempt', () => {
    expect(releaseNotification(1)).toEqual({ status: 'queued', attempts: 0, error: null });
    expect(releaseNotification(3)).toEqual({ status: 'queued', attempts: 2, error: null });
    expect(releaseNotification(null)).toEqual({ status: 'queued', attempts: 0, error: null });
  });
});

describe('invalid dates in params', () => {
  it('raises a TemplateError, so the row fails once instead of being retried', () => {
    expect(() => formatParam('starts_at', 'ontem de manhã')).toThrow(TemplateError);
    expect(() => formatParam('starts_at', 'ontem de manhã')).toThrow(/starts_at/);
    expect(() => templateValues('lembrete_atendimento', ['Diarista', 'nope', 'Carlos'])).toThrow(TemplateError);
  });
});
