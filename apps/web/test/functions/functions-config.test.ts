// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');

/** The `[functions.<name>]` table of supabase/config.toml, without the following tables. */
function functionBlock(name: string): string | undefined {
  return config.split(/\n(?=\[)/).find(block => block.startsWith(`[functions.${name}]`));
}

describe('supabase/config.toml: verify_jwt', () => {
  // These two functions receive calls without a user JWT (Asaas webhook, cron). They keep their
  // own authentication in code: asaas-access-token in asaas-webhook, x-cron-secret in notify-dispatch.
  for (const name of ['asaas-webhook', 'notify-dispatch']) {
    it(`${name} disables the gateway JWT check`, () => {
      const block = functionBlock(name);
      expect(block, `[functions.${name}] is missing`).toBeDefined();
      expect(block).toMatch(/^verify_jwt\s*=\s*false\s*$/m);
    });
  }

  it('user-facing functions keep the gateway JWT check', () => {
    for (const name of ['charges-create', 'subscriptions-manage', 'asaas-onboard', 'account-export', 'payments-create']) {
      expect(functionBlock(name) ?? '').not.toMatch(/verify_jwt\s*=\s*false/);
    }
  });
});
