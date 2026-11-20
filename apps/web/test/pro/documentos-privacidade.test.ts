import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageCodec } from '../../lib/imageMetadata';
import { functionData, functionError, type ProFake } from './fake';

// The upload must call the metadata helper before the upload function receives anything.
// The real helper runs, with a fake codec in place of the canvas jsdom does not have.
// `oversize` makes the fake output too large: 'first' only at the top quality (a lower one fits), 'all' at every quality.
const { calls, limits, state, received } = vi.hoisted(() => ({
  calls: [] as string[],
  limits: [] as Array<number | undefined>,
  state: { refuse: false, oversize: 'none' as 'none' | 'first' | 'all' },
  received: [] as FormData[],
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

const UPLOAD = 'provider-document-upload';

/** The function answers with the row it stored, as the list of documents reads it. */
const storedRow = {
  id: 'doc-1',
  step: 'cadastro_fiscal',
  storage_path: 'prov-1/cadastro_fiscal-x.jpg',
  status: 'submitted',
  rejection_reason: null,
  expires_at: null,
  created_at: '2026-11-18T12:00:00Z',
};

// Records the moment the upload function receives the file. The browser no longer writes the bucket.
const receive = (body: unknown) => {
  calls.push('invoke');
  received.push(body as FormData);
  return functionData(storedRow);
};

// Real JPEG and HEIC signatures: the helper reads the type from the first bytes
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, ...new TextEncoder().encode('Exif GPSLatitude')]);
const HEIC_BYTES = Uint8Array.from([0, 0, 0, 0x18, ...new TextEncoder().encode('ftypheicmif1heic')]);
const PHOTO = new File([JPEG_BYTES], 'cpf.jpg', { type: 'image/jpeg' });

const upload = (file: File) => uploadProviderDocument({ step: 'cadastro_fiscal', file });
const sentFile = (): File => received[0].get('file') as File;

describe('uploadProviderDocument and photo metadata', () => {
  beforeEach(() => {
    calls.length = 0;
    limits.length = 0;
    received.length = 0;
    state.refuse = false;
    state.oversize = 'none';
    fake.reset();
    fake.functionsHandlers[UPLOAD] = receive;
  });

  it('strips the photo before the upload function receives it', async () => {
    await upload(PHOTO);

    expect(calls).toEqual(['strip', 'invoke']);
    expect(received).toHaveLength(1);
    expect(received[0].get('step')).toBe('cadastro_fiscal');
    expect(sentFile().name).toBe('cpf.jpg');
    expect(sentFile().type).toBe('image/jpeg');
    expect(await sentFile().text()).toBe('sem metadados');
    expect(fake.uploads).toEqual([]);
    expect(fake.tableCalls).toEqual([]);
  });

  it('asks the preparation step for the 10 MB limit', async () => {
    await upload(PHOTO);

    expect(limits).toEqual([DOCUMENT_MAX_BYTES]);
    expect(DOCUMENT_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it('sends a HEIC photo as JPEG, the type the browser prepared', async () => {
    await upload(new File([HEIC_BYTES], 'foto.heic', { type: 'image/heic' }));

    expect(sentFile().type).toBe('image/jpeg');
  });

  it('sends a JPEG declared as a PDF as a JPEG', async () => {
    await upload(new File([JPEG_BYTES], 'comprovante.pdf', { type: 'application/pdf' }));

    expect(sentFile().type).toBe('image/jpeg');
  });

  it('sends a PDF as it is', async () => {
    const pdf = new File([new TextEncoder().encode('%PDF-1.4 comprovante')], 'comprovante.pdf', { type: 'application/pdf' });

    await upload(pdf);

    expect(sentFile().type).toBe('application/pdf');
    expect(await sentFile().text()).toBe('%PDF-1.4 comprovante');
  });

  it('sends the lower-quality copy when the top quality is over the limit', async () => {
    state.oversize = 'first';

    await upload(PHOTO);

    expect(calls).toEqual(['strip', 'invoke']);
    expect(await sentFile().text()).toBe('sem metadados');
  });

  it('sends and records nothing when the photo cannot be prepared', async () => {
    state.refuse = true;

    await expect(upload(PHOTO)).rejects.toMatchObject({
      code: 'invalid_input',
      message: 'Não foi possível preparar a foto. Tente outra imagem ou envie em PDF.',
    });
    expect(calls).toEqual(['strip']);
    expect(received).toEqual([]);
    expect(fake.tableCalls).toEqual([]);
  });

  it('refuses a photo that stays over the 10 MB limit after the lower-quality tries', async () => {
    state.oversize = 'all';

    await expect(upload(PHOTO)).rejects.toMatchObject({
      code: 'invalid_input',
      message: 'A foto continua grande demais depois de preparada. Envie uma foto de menor resolução ou em PDF.',
    });
    expect(calls).toEqual(['strip']);
    expect(received).toEqual([]);
    expect(fake.tableCalls).toEqual([]);
  });

  it('refuses an original over the limit before it is prepared', async () => {
    const huge = new File([new Uint8Array(DOCUMENT_MAX_BYTES + 1)], 'grande.jpg', { type: 'image/jpeg' });

    await expect(upload(huge)).rejects.toMatchObject({ code: 'invalid_input', message: 'O arquivo precisa ter até 10 MB.' });
    expect(calls).toEqual([]);
    expect(received).toEqual([]);
  });
});

describe('the refusals of the upload function reach the provider', () => {
  beforeEach(() => {
    calls.length = 0;
    received.length = 0;
    state.refuse = false;
    state.oversize = 'none';
    fake.reset();
  });

  // The function sends its own sentence in the error body; the screen shows it
  it('shows the sentence of a full folder, not a permission sentence', async () => {
    const sentence =
      'Você já enviou o máximo de 60 documentos. Enquanto o cadastro estiver em rascunho, remova os que ainda não foram analisados antes de enviar outro.';
    fake.functionsHandlers[UPLOAD] = () => functionError(409, 'document_limit', sentence);

    await expect(upload(PHOTO)).rejects.toMatchObject({ message: sentence });
    expect(fake.tableCalls).toEqual([]);
  });

  it('shows the sentence of a file the function cannot read', async () => {
    const sentence = 'Não foi possível ler o arquivo. Tente outra imagem ou envie em PDF.';
    fake.functionsHandlers[UPLOAD] = () => functionError(400, 'file_unreadable', sentence);

    await expect(upload(PHOTO)).rejects.toMatchObject({ message: sentence });
  });

  it('shows the sentence of a provider without a record', async () => {
    fake.functionsHandlers[UPLOAD] = () => functionError(403, 'not_allowed', 'Só prestadores podem enviar documentos.');

    await expect(upload(PHOTO)).rejects.toMatchObject({ message: 'Só prestadores podem enviar documentos.' });
  });

  it('says the service is unavailable when the function is not served (404), not that the document is missing', async () => {
    fake.functionsHandlers[UPLOAD] = () => ({
      data: null,
      error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: new Response('Function not found', { status: 404 }) },
    });

    await expect(upload(PHOTO)).rejects.toMatchObject({
      code: 'function_unavailable',
      message: 'Este serviço está indisponível no momento. Tente mais tarde.',
    });
  });

  it('falls back to the sentence of the app when the answer has no sentence of its own', async () => {
    fake.functionsHandlers[UPLOAD] = () => ({
      data: null,
      error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: new Response('indisponível', { status: 503 }) },
    });

    await expect(upload(PHOTO)).rejects.toMatchObject({
      code: 'function_unavailable',
      message: 'Este serviço está indisponível no momento. Tente mais tarde.',
    });
  });
});
