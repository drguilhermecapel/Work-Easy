import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The versioned Auth settings are the ones a hosted project starts from: a contact that is
// not confirmed by its one-time code must not count as proven (see private.notify).
const toml = readFileSync(join(process.cwd(), 'supabase', 'config.toml'), 'utf8');

/** The lines of one [section] of the file, up to the next table header. */
const section = (name: string): string => {
  const lines = toml.split('\n');
  const start = lines.indexOf(`[${name}]`);
  if (start < 0) throw new Error(`config.toml has no [${name}] section`);
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[/.test(line)) break;
    body.push(line);
  }
  return body.join('\n');
};

describe('Auth confirmations in supabase/config.toml (DB-03, SEC-FN-03)', () => {
  it.each(['auth.email', 'auth.sms'])('[%s] requires the contact to be confirmed before it is used', name => {
    expect(section(name)).toMatch(/^enable_confirmations\s*=\s*true\s*$/m);
  });
});
