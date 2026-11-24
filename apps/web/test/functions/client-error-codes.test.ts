// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toAppError } from '../../lib/errors';
import { proError, SERVER_SENTENCE_CODES } from '../../services/proErrors';
import { DB_RULE_CODES } from '../../supabase/functions/_shared/handler-kit.ts';

// The app turns the `error.code` of a function into its own code and sentence (lib/errors.ts). A code it does
// not know falls back to the HTTP status, and a 409 then reads "este registro já existe" for a refused trial.
// This reads every code the functions that the app calls can answer, straight from their sources, and checks
// that the app knows each one. A new `errors.conflict('x', ...)` fails here until lib/errors.ts has `x`.

const FUNCTIONS = join(__dirname, '../../supabase/functions');

/** Functions no screen calls: Asaas (webhook), cron (notify-dispatch, background-check-purge), the admin by hand (webhooks-sync) and request-assist (no screen yet). */
const NOT_CALLED_BY_THE_APP = ['asaas-webhook', 'asaas-webhooks-sync', 'background-check-purge', 'notify-dispatch', 'request-assist'];

const sourcesOfCalledFunctions = (): Array<{ file: string; text: string }> => {
  const out: Array<{ file: string; text: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!NOT_CALLED_BY_THE_APP.includes(entry.name)) walk(path);
      } else if (entry.name.endsWith('.ts')) {
        out.push({ file: path.slice(FUNCTIONS.length + 1), text: readFileSync(path, 'utf8') });
      }
    }
  };
  walk(FUNCTIONS);
  return out;
};

/** Every error code the called functions can answer, with the first file that names it. */
const answeredCodes = (): Map<string, string> => {
  const sources = sourcesOfCalledFunctions();
  const constants = new Map<string, string>();
  for (const { text } of sources) {
    for (const match of text.matchAll(/const ([A-Z_]+) = '([a-z_]+)'/g)) constants.set(match[1], match[2]);
  }
  const codes = new Map<string, string>();
  const add = (code: string | undefined, file: string) => {
    if (code && !codes.has(code)) codes.set(code, file);
  };
  // A literal code, or the name of a constant that holds it
  const resolve = (raw: string) => (raw.startsWith("'") ? raw.slice(1, -1) : constants.get(raw));
  for (const { file, text } of sources) {
    for (const match of text.matchAll(/new HttpError\(\s*\d{3},\s*('[a-z_]+'|[A-Z_]+)/g)) add(resolve(match[1]), file);
    for (const match of text.matchAll(/errors\.(?:conflict|tooMany)\(\s*('[a-z_]+'|[A-Z_]+)/g)) add(resolve(match[1]), file);
    // The envelope written by hand in http.ts (internal, method_not_allowed)
    if (file === 'http.ts' || file.endsWith('/http.ts')) for (const match of text.matchAll(/code: '([a-z_]+)'/g)) add(match[1], file);
  }
  for (const code of DB_RULE_CODES) add(code, '_shared/handler-kit.ts');
  return codes;
};

/**
 * provider-document-upload refuses with a sentence written for the provider (what to do about this file), and the
 * app shows that sentence whatever the code (uploadRefusal in services/providers.ts, checked against the real
 * handler in client-contracts.test.ts). Their codes need no entry in lib/errors.ts.
 */
const SHOWN_WITH_THE_SENTENCE_OF_THE_FUNCTION = [
  'document_limit', 'file_too_large', 'file_type_not_supported', 'heic_not_supported', 'file_type_mismatch', 'file_unreadable',
];

describe('error codes of the functions the app calls', () => {
  const codes = answeredCodes();

  it('finds the codes it is meant to find (the scan has not stopped matching)', () => {
    for (const code of [
      'invalid_input', 'unauthorized', 'not_allowed', 'upstream_error', 'internal', 'payments_not_configured', 'already_paid', 'provider_not_approved',
      'trial_already_used', 'assist_busy', 'assist_consent_required', 'file_too_large', 'confirmation_required', 'payment_in_progress', 'labor_lock',
    ]) {
      expect([...codes.keys()], code).toContain(code);
    }
    // Codes only the webhook, the cron jobs and the admin answer are left out on purpose
    for (const code of ['webhook_not_configured', 'cron_not_configured', 'too_many_webhooks', 'feature_disabled']) {
      expect([...codes.keys()], code).not.toContain(code);
    }
  });

  it('are all known to the app, so the person reads its sentence instead of the one of the HTTP status', () => {
    const unknown = [...codes]
      .filter(([code]) => !SHOWN_WITH_THE_SENTENCE_OF_THE_FUNCTION.includes(code))
      .filter(([code]) => toAppError({ error: { code } }).code === 'unknown')
      .map(([code, file]) => `${code} (${file})`);
    expect(unknown).toEqual([]);
  });
});

/** What each function answers with a code: the sentences it sends, by function and code, for every `errors.conflict(code, sentence)`. */
const sentencesByFunctionAndCode = (): Map<string, Set<string>> => {
  const sources = sourcesOfCalledFunctions();
  const constants = new Map<string, string>();
  for (const { text } of sources) {
    for (const match of text.matchAll(/export const ([A-Z_]+) =\s*'((?:[^'\\]|\\.)*)'/g)) constants.set(match[1], match[2]);
  }
  const out = new Map<string, Set<string>>();
  for (const { file, text } of sources) {
    for (const match of text.matchAll(/errors\.conflict\(\s*'([a-z_]+)',\s*('(?:[^'\\]|\\.)*'|[A-Z_]+)/g)) {
      const sentence = match[2].startsWith("'") ? match[2].slice(1, -1) : constants.get(match[2]);
      if (!sentence) continue;
      const key = `${file.split('/')[0]}:${match[1]}`;
      out.set(key, (out.get(key) ?? new Set()).add(sentence));
    }
  }
  return out;
};

describe('a code that one function answers with more than one sentence', () => {
  // Two functions may word a code for their own audience (payments-create for the payer, charges-create for the provider)
  // and the screen picks its own sentence for them. Inside ONE function, two sentences for a code mean two situations
  // that the single sentence of the app cannot tell apart: the app has to show the one the function sent.
  it('is shown by the app with the sentence the function sent', () => {
    const many = [...sentencesByFunctionAndCode()].filter(([, sentences]) => sentences.size > 1).map(([key]) => key);
    // The scan finds the case that motivated this rule
    expect(many).toContain('subscriptions-manage:trial_requires_payment_account');
    expect(many.map(key => key.split(':')[1]).filter(code => !SERVER_SENTENCE_CODES.has(code))).toEqual([]);
  });
});

describe('proError: the sentence of the server is shown only for the codes listed for it', () => {
  const failed = (status: number, code: string, message: string) => ({
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify({ ok: false, error: { code, message } }), { status }),
  });

  it('shows the sentence of the server for trial_requires_payment_account, whichever of the two it sent', async () => {
    const one = await proError(failed(409, 'trial_requires_payment_account', 'Conclua o cadastro de recebimento pelo Asaas para começar o teste grátis.'));
    expect(one.message).toBe('Conclua o cadastro de recebimento pelo Asaas para começar o teste grátis.');
    expect(one.code).toBe('trial_requires_payment_account');
    const other = await proError(failed(409, 'trial_requires_payment_account', 'Este recebimento foi criado antes da verificação de CPF. Fale com o suporte.'));
    expect(other.message).toBe('Este recebimento foi criado antes da verificação de CPF. Fale com o suporte.');
  });

  it('falls back to the sentence of the app when the server sent none, an empty one or a very long one', async () => {
    const fallback = toAppError({ error: { code: 'trial_requires_payment_account' } }).message;
    for (const message of ['', '   ', 'x'.repeat(301)]) {
      expect((await proError(failed(409, 'trial_requires_payment_account', message))).message, `"${message.slice(0, 5)}"`).toBe(fallback);
    }
  });

  it('keeps the sentence of the app for every other code, whatever text the server sends', async () => {
    for (const code of ['trial_already_used', 'no_subscription', 'already_paid', 'invalid_input']) {
      const own = toAppError({ error: { code } }).message;
      expect((await proError(failed(409, code, 'Texto do servidor'))).message, code).toBe(own);
    }
  });
});
