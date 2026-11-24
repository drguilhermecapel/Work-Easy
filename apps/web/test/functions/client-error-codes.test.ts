// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toAppError } from '../../lib/errors';
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
