import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageCodec } from '../../lib/imageMetadata';
import type { ProFake } from './fake';

// The upload must call the metadata helper before the bucket receives anything.
// The real helper runs, with a fake codec in place of the canvas jsdom does not have.
const { calls, state } = vi.hoisted(() => ({
  calls: [] as string[],
  state: { refuse: false, oversize: false },
}));

vi.mock('../../lib/supabase', async () => {
  const { createProFake } = await import('./fake');
  return { supabase: createProFake(), backendEnabled: true };
});

vi.mock('../../lib/imageMetadata', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/imageMetadata')>();
  const codec: ImageCodec = {
    decode: async () => ({ width: 1, height: 1, pixels: {} as CanvasImageSource, close: () => undefined }),
    encode: async (_image, type) => new Blob([state.oversize ? new Uint8Array(10 * 1024 * 1024 + 1) : 'sem metadados'], { type }),
  };
  const refusing: ImageCodec = {
    decode: async () => {
      throw new Error('unreadable');
    },
    encode: async () => null,
  };
  return {
    ...actual,
    stripImageMetadata: (file: File) => {
      calls.push('strip');
      return actual.stripImageMetadata(file, state.refuse ? refusing : codec);
    },
  };
});

const { supabase } = await import('../../lib/supabase');
const { uploadProviderDocument } = await import('../../services/providers');
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

const PHOTO = new File(['foto original com GPSLatitude'], 'cpf.jpg', { type: 'image/jpeg' });

const upload = (file: File) => uploadProviderDocument({ providerId: 'prov-1', step: 'cadastro_fiscal', file });

describe('uploadProviderDocument and photo metadata', () => {
  beforeEach(() => {
    calls.length = 0;
    state.refuse = false;
    state.oversize = false;
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

  it('stores a HEIC photo as JPEG, under a .jpg path', async () => {
    await upload(new File(['heic original'], 'foto.heic', { type: 'image/heic' }));

    expect(fake.uploads[0].path).toMatch(/^prov-1\/cadastro_fiscal-[a-z0-9]+-[a-z0-9]+\.jpg$/);
    expect(fake.uploads[0].options).toMatchObject({ contentType: 'image/jpeg' });
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

  it('refuses a stripped file that is over the 10 MB limit', async () => {
    state.oversize = true;

    await expect(upload(PHOTO)).rejects.toMatchObject({ code: 'invalid_input', message: 'O arquivo precisa ter até 10 MB.' });
    expect(calls).toEqual(['strip']);
    expect(fake.uploads).toEqual([]);
  });
});
