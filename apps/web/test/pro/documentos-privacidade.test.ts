import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageCodec } from '../../lib/imageMetadata';
import type { ProFake } from './fake';

// The upload must call the metadata helper before the bucket receives anything.
// The real helper runs, with a fake codec in place of the canvas jsdom does not have.
// `oversize` makes the fake output too large: 'first' only at the top quality (a lower one fits), 'all' at every quality.
const { calls, limits, state } = vi.hoisted(() => ({
  calls: [] as string[],
  limits: [] as Array<number | undefined>,
  state: { refuse: false, oversize: 'none' as 'none' | 'first' | 'all' },
}));

vi.mock('../../lib/supabase', async () => {
  const { createProFake } = await import('./fake');
  return { supabase: createProFake(), backendEnabled: true };
});

vi.mock('../../lib/imageMetadata', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/imageMetadata')>();
  const codec: ImageCodec = {
    decode: async () => ({ width: 1, height: 1, pixels: {} as CanvasImageSource, close: () => undefined }),
    encode: async (_image, type, quality) => {
      const tooBig = state.oversize === 'all' || (state.oversize === 'first' && quality === 0.92);
      return new Blob([tooBig ? new Uint8Array(10 * 1024 * 1024 + 1) : 'sem metadados'], { type });
    },
  };
  const refusing: ImageCodec = {
    decode: async () => {
      throw new Error('unreadable');
    },
    encode: async () => null,
  };
  return {
    ...actual,
    stripImageMetadata: (file: File, _codec?: ImageCodec, maxBytes?: number) => {
      calls.push('strip');
      limits.push(maxBytes);
      return actual.stripImageMetadata(file, state.refuse ? refusing : codec, maxBytes);
    },
  };
});

const { supabase } = await import('../../lib/supabase');
const { DOCUMENT_MAX_BYTES, uploadProviderDocument } = await import('../../services/providers');
const fake = supabase as unknown as ProFake;

// Records the moment the bucket receives a file
const storageFrom = fake.storage.from;
fake.storage.from = bucket => {
  const target = storageFrom(bucket);
  return {
    ...target,
    upload: async (path, file, options) => {
      calls.push('upload');
      return target.upload(path, file, options);
    },
  };
};

// Real JPEG and HEIC signatures: the helper reads the type from the first bytes
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, ...new TextEncoder().encode('Exif GPSLatitude')]);
const HEIC_BYTES = Uint8Array.from([0, 0, 0, 0x18, ...new TextEncoder().encode('ftypheicmif1heic')]);
const PHOTO = new File([JPEG_BYTES], 'cpf.jpg', { type: 'image/jpeg' });

const upload = (file: File) => uploadProviderDocument({ providerId: 'prov-1', step: 'cadastro_fiscal', file });

describe('uploadProviderDocument and photo metadata', () => {
  beforeEach(() => {
    calls.length = 0;
    limits.length = 0;
    state.refuse = false;
    state.oversize = 'none';
    fake.reset();
    fake.tables.provider_documents = call => ({ data: { id: 'doc-1', ...(call.payload as object) }, error: null });
  });

  it('strips the photo before the bucket receives it', async () => {
    await upload(PHOTO);

    expect(calls).toEqual(['strip', 'upload']);
    expect(fake.uploads).toHaveLength(1);
    const stored = fake.uploads[0];
    expect(stored.file).not.toBe(PHOTO);
    expect(await (stored.file as Blob).text()).toBe('sem metadados');
    expect(stored.options).toMatchObject({ contentType: 'image/jpeg', upsert: false });
    expect(fake.tableCalls.find(call => call.op === 'insert')?.payload).toMatchObject({ storage_path: stored.path });
  });

  it('asks the preparation step for the 10 MB limit', async () => {
    await upload(PHOTO);

    expect(limits).toEqual([DOCUMENT_MAX_BYTES]);
    expect(DOCUMENT_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it('stores a HEIC photo as JPEG, under a .jpg path', async () => {
    await upload(new File([HEIC_BYTES], 'foto.heic', { type: 'image/heic' }));

    expect(fake.uploads[0].path).toMatch(/^prov-1\/cadastro_fiscal-[a-z0-9]+-[a-z0-9]+\.jpg$/);
    expect(fake.uploads[0].options).toMatchObject({ contentType: 'image/jpeg' });
  });

  it('stores a JPEG declared as a PDF as a JPEG, under a .jpg path', async () => {
    await upload(new File([JPEG_BYTES], 'comprovante.pdf', { type: 'application/pdf' }));

    expect(fake.uploads[0].path).toMatch(/\.jpg$/);
    expect(fake.uploads[0].options).toMatchObject({ contentType: 'image/jpeg' });
  });

  it('sends a PDF as it is, under a .pdf path', async () => {
    const pdf = new File([new TextEncoder().encode('%PDF-1.4 comprovante')], 'comprovante.pdf', { type: 'application/pdf' });

    await upload(pdf);

    expect(fake.uploads[0].file).toBe(pdf);
    expect(fake.uploads[0].path).toMatch(/\.pdf$/);
    expect(fake.uploads[0].options).toMatchObject({ contentType: 'application/pdf' });
  });

  it('uploads the lower-quality copy when the top quality is over the limit', async () => {
    state.oversize = 'first';

    await upload(PHOTO);

    expect(calls).toEqual(['strip', 'upload']);
    expect(await (fake.uploads[0].file as Blob).text()).toBe('sem metadados');
  });

  it('uploads and records nothing when the photo cannot be prepared', async () => {
    state.refuse = true;

    await expect(upload(PHOTO)).rejects.toMatchObject({
      code: 'invalid_input',
      message: 'Não foi possível preparar a foto. Tente outra imagem ou envie em PDF.',
    });
    expect(calls).toEqual(['strip']);
    expect(fake.uploads).toEqual([]);
    expect(fake.tableCalls).toEqual([]);
  });

  it('refuses a photo that stays over the 10 MB limit after the lower-quality tries', async () => {
    state.oversize = 'all';

    await expect(upload(PHOTO)).rejects.toMatchObject({
      code: 'invalid_input',
      message: 'A foto continua grande demais depois de preparada. Envie uma foto de menor resolução ou em PDF.',
    });
    expect(calls).toEqual(['strip']);
    expect(fake.uploads).toEqual([]);
    expect(fake.tableCalls).toEqual([]);
  });

  it('refuses an original over the limit before it is prepared', async () => {
    const huge = new File([new Uint8Array(DOCUMENT_MAX_BYTES + 1)], 'grande.jpg', { type: 'image/jpeg' });

    await expect(upload(huge)).rejects.toMatchObject({ code: 'invalid_input', message: 'O arquivo precisa ter até 10 MB.' });
    expect(calls).toEqual([]);
    expect(fake.uploads).toEqual([]);
  });
});
