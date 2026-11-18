// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_MAX_BYTES,
  handler,
  isActiveProvider,
  MESSAGES,
  type ProviderAccount,
  type UploadDeps,
  VERIFICATION_STEPS,
} from '../../supabase/functions/provider-document-upload/handler.ts';
import { PROVIDER } from './helpers.ts';

const ENDPOINT = 'https://functions.example.test/functions/v1/provider-document-upload';

const ascii = (value: string): number[] => [...new TextEncoder().encode(value)];
const segment = (marker: number, data: number[]): number[] => [0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 0xff, ...data];

/** A JPEG whose EXIF segment carries a GPS position. */
const PHOTO_WITH_GPS = Uint8Array.from([
  0xff,
  0xd8,
  ...segment(0xe1, [...ascii('Exif\0\0'), ...ascii('GPSLatitude 23 33 12 S')]),
  ...segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]),
  ...segment(0xda, [1, 1, 0, 0, 63, 0]),
  0x12,
  0x34,
  0xff,
  0x00,
  0x56,
  0xff,
  0xd9,
]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const HEIC = Uint8Array.from([0, 0, 0, 0x18, ...ascii('ftypheic'), 0, 0, 0, 0, ...ascii('mif1heic')]);

interface FakeOptions {
  signedIn?: boolean;
  provider?: boolean;
  /** The profile row carries deleted_at (the account was closed). */
  closed?: boolean;
  /** There is no profile row for the caller. */
  noProfile?: boolean;
  files?: number;
  putError?: boolean;
  insertError?: boolean;
}

/** The rows the database answers for the caller: a provider with an open account, unless the options say otherwise. */
function accountOf(options: FakeOptions): ProviderAccount {
  return {
    hasProviderRow: options.provider !== false,
    profile: options.noProfile ? null : { deletedAt: options.closed ? '2026-11-01T12:00:00Z' : null },
  };
}

function fakeDeps(options: FakeOptions = {}) {
  const stored: Array<{ path: string; bytes: Uint8Array; contentType: string }> = [];
  const removed: string[] = [];
  const inserted: Array<{ provider_id: string; step: string; storage_path: string }> = [];
  const deps: UploadDeps = {
    now: () => new Date('2026-11-18T12:00:00Z'),
    logError: () => undefined,
    randomId: () => 'abcdef12',
    async session() {
      if (options.signedIn === false) return null;
      return { user: PROVIDER, providerAccount: async () => accountOf(options) };
    },
    storage: {
      async countFiles(_folder, limit) {
        return Math.min(options.files ?? 0, limit);
      },
      async put(path, bytes, contentType) {
        if (options.putError) throw new Error('bucket unavailable');
        stored.push({ path, bytes, contentType });
      },
      async remove(path) {
        removed.push(path);
      },
    },
    records: {
      async insert(row) {
        if (options.insertError) throw new Error('database unavailable');
        inserted.push(row);
        return {
          id: 'doc-1',
          step: row.step,
          storage_path: row.storage_path,
          status: 'submitted',
          rejection_reason: null,
          expires_at: null,
          created_at: '2026-11-18T12:00:00Z',
        };
      },
    },
  };
  return { deps, stored, removed, inserted };
}

function upload(fields: Record<string, string | Blob>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request(ENDPOINT, { method: 'POST', body: form, headers: { Authorization: 'Bearer test-token' } });
}

const photo = (bytes: Uint8Array<ArrayBuffer>, type: string, name = 'cpf.jpg') => new File([bytes], name, { type });

/** The envelope of the function: `data` on success, `error` on refusal. */
interface Answer {
  ok: boolean;
  data: Record<string, unknown>;
  error: { code: string; message: string };
}

async function call(request: Request, options: FakeOptions = {}) {
  const fake = fakeDeps(options);
  const response = await handler(request, fake.deps);
  return { response, body: (await response.json()) as Answer, ...fake };
}

describe('provider-document-upload: who may send', () => {
  it('answers 401 without a signed-in caller', async () => {
    const { response, body, stored } = await call(upload({ step: 'cadastro_fiscal', file: photo(PHOTO_WITH_GPS, 'image/jpeg') }), { signedIn: false });

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('unauthorized');
    expect(stored).toEqual([]);
  });

  it('refuses a caller without a provider row, and writes nothing', async () => {
    const { response, body, stored, inserted } = await call(
      upload({ step: 'cadastro_fiscal', file: photo(PHOTO_WITH_GPS, 'image/jpeg') }),
      { provider: false },
    );

    expect(response.status).toBe(403);
    expect(body.error).toMatchObject({ code: 'not_allowed', message: MESSAGES.notProvider });
    expect(stored).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it('refuses a provider whose account is closed, with the same answer as a non-provider, and writes nothing', async () => {
    const { response, body, stored, inserted } = await call(
      upload({ step: 'cadastro_fiscal', file: photo(PHOTO_WITH_GPS, 'image/jpeg') }),
      { closed: true },
    );

    expect(response.status).toBe(403);
    expect(body.error).toMatchObject({ code: 'not_allowed', message: MESSAGES.notProvider });
    expect(stored).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it('refuses a caller whose profile row is missing, with the same answer as a non-provider', async () => {
    const { response, body, stored } = await call(upload({ step: 'cadastro_fiscal', file: photo(PHOTO_WITH_GPS, 'image/jpeg') }), {
      noProfile: true,
    });

    expect(response.status).toBe(403);
    expect(body.error).toMatchObject({ code: 'not_allowed', message: MESSAGES.notProvider });
    expect(stored).toEqual([]);
  });

  it('accepts a provider whose account is open', async () => {
    const { response, body } = await call(upload({ step: 'cadastro_fiscal', file: photo(PHOTO_WITH_GPS, 'image/jpeg') }), {
      closed: false,
    });

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

describe('provider-document-upload: who counts as a provider', () => {
  it('accepts a providers row with a profile that is not deleted', () => {
    expect(isActiveProvider({ hasProviderRow: true, profile: { deletedAt: null } })).toBe(true);
  });

  it('refuses a closed account, a missing profile and a missing providers row', () => {
    expect(isActiveProvider({ hasProviderRow: true, profile: { deletedAt: '2026-11-01T12:00:00Z' } })).toBe(false);
    expect(isActiveProvider({ hasProviderRow: true, profile: null })).toBe(false);
    expect(isActiveProvider({ hasProviderRow: false, profile: { deletedAt: null } })).toBe(false);
  });
});

describe('provider-document-upload: what it refuses', () => {
  it('refuses a step that is not a verification step', async () => {
    const { response, body, stored } = await call(upload({ step: 'selfie', file: photo(PHOTO_WITH_GPS, 'image/jpeg') }));

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: 'invalid_input', message: MESSAGES.step });
    expect(stored).toEqual([]);
  });

  it('refuses a request without a file', async () => {
    const { response, body } = await call(upload({ step: 'cadastro_fiscal' }));

    expect(response.status).toBe(400);
    expect(body.error.message).toBe(MESSAGES.noFile);
  });

  it('says the limit when the folder already holds 60 files', async () => {
    const { response, body, stored, inserted } = await call(
      upload({ step: 'cadastro_fiscal', file: photo(PHOTO_WITH_GPS, 'image/jpeg') }),
      { files: 60 },
    );

    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({ code: 'document_limit', message: MESSAGES.limit });
    expect(stored).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it('refuses a file over 10 MB with 413', async () => {
    const huge = new Uint8Array(DOCUMENT_MAX_BYTES + 1);
    huge.set(PHOTO_WITH_GPS.subarray(0, 2), 0);

    const { response, body, stored } = await call(upload({ step: 'cadastro_fiscal', file: photo(huge, 'image/jpeg') }));

    expect(response.status).toBe(413);
    expect(body.error).toMatchObject({ code: 'file_too_large', message: 'O arquivo precisa ter até 10 MB.' });
    expect(stored).toEqual([]);
  });

  it('refuses an empty file', async () => {
    const { response, body } = await call(upload({ step: 'cadastro_fiscal', file: photo(new Uint8Array(0), 'image/jpeg') }));

    expect(response.status).toBe(400);
    expect(body.error.message).toBe(MESSAGES.empty);
  });

  it('refuses HEIC bytes and asks for JPEG', async () => {
    const { response, body, stored } = await call(upload({ step: 'cadastro_fiscal', file: photo(HEIC, 'image/heic', 'foto.heic') }));

    expect(response.status).toBe(415);
    expect(body.error).toMatchObject({ code: 'heic_not_supported' });
    expect(body.error.message).toMatch(/JPEG/);
    expect(stored).toEqual([]);
  });

  it('refuses bytes that are not a photo or a PDF', async () => {
    const text = new File(['texto simples'], 'nota.txt', { type: 'text/plain' });

    const { response, body } = await call(upload({ step: 'cadastro_fiscal', file: text }));

    expect(response.status).toBe(415);
    expect(body.error).toMatchObject({ code: 'file_type_not_supported', message: MESSAGES.type });
  });

  it('refuses a declared type that the bytes do not match', async () => {
    const { response, body, stored } = await call(upload({ step: 'cadastro_fiscal', file: photo(PNG, 'image/jpeg') }));

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: 'file_type_mismatch', message: MESSAGES.mismatch });
    expect(stored).toEqual([]);
  });

  it('refuses a JPEG cut before its end, because its metadata cannot be removed safely', async () => {
    const cut = PHOTO_WITH_GPS.subarray(0, PHOTO_WITH_GPS.length - 2);

    const { response, body, stored } = await call(upload({ step: 'cadastro_fiscal', file: photo(cut, 'image/jpeg') }));

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: 'file_unreadable', message: MESSAGES.unreadable });
    expect(stored).toEqual([]);
  });

  it('refuses a body that is not a form', async () => {
    const request = new Request(ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({ step: 'cadastro_fiscal' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    });

    const { response, body } = await call(request);

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('invalid_input');
  });

  it('answers only POST and the CORS preflight', async () => {
    const get = await handler(new Request(ENDPOINT, { method: 'GET' }), fakeDeps().deps);
    const options = await handler(new Request(ENDPOINT, { method: 'OPTIONS' }), fakeDeps().deps);

    expect(get.status).toBe(405);
    expect(options.status).toBe(204);
  });
});

describe('provider-document-upload: what it stores', () => {
  it('stores the photo without its GPS data under the provider folder, and records it', async () => {
    const { response, body, stored, inserted } = await call(upload({ step: 'cadastro_fiscal', file: photo(PHOTO_WITH_GPS, 'image/jpeg') }));

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({ id: 'doc-1', step: 'cadastro_fiscal', status: 'submitted' });
    expect(stored).toHaveLength(1);
    expect(stored[0].path).toMatch(new RegExp(`^${PROVIDER.id}/cadastro_fiscal-[a-z0-9]+-abcdef12\\.jpg$`));
    expect(stored[0].contentType).toBe('image/jpeg');
    expect(new TextDecoder('latin1').decode(stored[0].bytes)).not.toContain('GPSLatitude');
    expect(stored[0].bytes.length).toBeLessThan(PHOTO_WITH_GPS.length);
    expect(inserted).toEqual([{ provider_id: PROVIDER.id, step: 'cadastro_fiscal', storage_path: stored[0].path }]);
  });

  it('keeps a PDF as it is, under a .pdf path', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4\n%%EOF');

    const { response, stored } = await call(upload({ step: 'seguro_rc', file: photo(pdf, 'application/pdf', 'apolice.pdf') }));

    expect(response.status).toBe(200);
    expect(stored[0].path).toMatch(/^[^/]+\/seguro_rc-[a-z0-9]+-abcdef12\.pdf$/);
    expect(stored[0].contentType).toBe('application/pdf');
    expect(Array.from(stored[0].bytes)).toEqual(Array.from(pdf));
  });

  it('removes the file again when its record cannot be saved', async () => {
    const { response, body, stored, removed } = await call(
      upload({ step: 'cadastro_fiscal', file: photo(PHOTO_WITH_GPS, 'image/jpeg') }),
      { insertError: true },
    );

    expect(response.status).toBe(502);
    expect(body.error).toMatchObject({ code: 'upstream_error', message: MESSAGES.record });
    expect(removed).toEqual([stored[0].path]);
  });

  it('answers 502 and records nothing when the bucket refuses the file', async () => {
    const { response, body, inserted, removed } = await call(
      upload({ step: 'cadastro_fiscal', file: photo(PHOTO_WITH_GPS, 'image/jpeg') }),
      { putError: true },
    );

    expect(response.status).toBe(502);
    expect(body.error).toMatchObject({ code: 'upstream_error', message: MESSAGES.storage });
    expect(inserted).toEqual([]);
    expect(removed).toEqual([]);
  });
});

describe('provider-document-upload: contract', () => {
  const quoted = (body: string): string[] => [...body.matchAll(/'([a-z_]+)'/g)].map(match => match[1]).sort();

  it('lists the verification steps of the database enum and of the catalog type', () => {
    const migration = readFileSync(new URL('../../supabase/migrations/20261019000001_identity.sql', import.meta.url), 'utf8');
    const catalog = readFileSync(new URL('../../catalog/types.ts', import.meta.url), 'utf8');
    const enumBody = /create type public\.verification_step as enum \(([\s\S]*?)\);/.exec(migration)?.[1] ?? '';
    const unionBody = /export type VerificationStep =([\s\S]*?);/.exec(catalog)?.[1] ?? '';

    expect(quoted(enumBody)).toEqual([...VERIFICATION_STEPS].sort());
    expect(quoted(unionBody)).toEqual([...VERIFICATION_STEPS].sort());
  });
});
