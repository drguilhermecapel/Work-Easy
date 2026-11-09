import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserImageCodec,
  stripImageMetadata,
  UNPREPARED_PHOTO_MESSAGE,
  type DecodedImage,
  type ImageCodec,
} from '../../lib/imageMetadata';

const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

const readText = async (blob: Blob): Promise<string> => new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));

// A JPEG whose APP1 segment holds EXIF with a GPS block and the phone model
const PHOTO_WITH_EXIF = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x30, ...bytes('Exif\0\0GPSLatitude Apple iPhone 15'), 0xff, 0xd9]);

const PIXELS_ONLY = 'pixels only';

/** A codec that decodes to a 4 x 3 picture and encodes the requested type. */
const fakeCodec = () => {
  const decoded: Blob[] = [];
  const encoded: Array<{ image: DecodedImage; type: string; quality: number }> = [];
  let closed = 0;
  const image: DecodedImage = {
    width: 4,
    height: 3,
    pixels: {} as CanvasImageSource,
    close: () => {
      closed += 1;
    },
  };
  const codec: ImageCodec = {
    async decode(file) {
      decoded.push(file);
      return image;
    },
    async encode(img, type, quality) {
      encoded.push({ image: img, type, quality });
      return new Blob([bytes(PIXELS_ONLY)], { type });
    },
  };
  return { codec, image, decoded, encoded, closedCount: () => closed };
};

describe('stripImageMetadata', () => {
  it('drops the EXIF block and keeps the name and the JPEG type', async () => {
    const { codec, image, decoded, encoded, closedCount } = fakeCodec();
    const photo = new File([PHOTO_WITH_EXIF], 'rg-frente.jpg', { type: 'image/jpeg' });
    expect(await readText(photo)).toContain('GPSLatitude');

    const stripped = await stripImageMetadata(photo, codec);

    expect(stripped).toBeInstanceOf(File);
    expect(stripped).not.toBe(photo);
    expect(stripped.name).toBe('rg-frente.jpg');
    expect(stripped.type).toBe('image/jpeg');
    expect(await readText(stripped)).toBe(PIXELS_ONLY);
    expect(decoded[0]).toBe(photo);
    expect(encoded).toHaveLength(1);
    expect(encoded[0].image).toBe(image);
    expect(encoded[0].type).toBe('image/jpeg');
    expect(encoded[0].quality).toBe(0.92);
    expect(closedCount()).toBe(1);
  });

  it.each([
    ['image/png', 'selfie.png', 'image/png'],
    ['image/webp', 'foto.webp', 'image/webp'],
    ['image/heic', 'foto.heic', 'image/jpeg'],
  ])('re-encodes %s and keeps the name (output %s)', async (inputType, name, outputType) => {
    const { codec, encoded } = fakeCodec();
    const photo = new File([PHOTO_WITH_EXIF], name, { type: inputType });

    const stripped = await stripImageMetadata(photo, codec);

    expect(stripped.name).toBe(name);
    expect(stripped.type).toBe(outputType);
    expect(encoded[0].type).toBe(outputType);
  });

  it('returns a PDF unchanged and never decodes it', async () => {
    const { codec, decoded, encoded } = fakeCodec();
    const pdf = new File([bytes('%PDF-1.4 Exif GPSLatitude')], 'comprovante.pdf', { type: 'application/pdf' });

    const result = await stripImageMetadata(pdf, codec);

    expect(result).toBe(pdf);
    expect(decoded).toEqual([]);
    expect(encoded).toEqual([]);
  });

  it('fails closed when the photo cannot be decoded', async () => {
    const { codec, encoded, closedCount } = fakeCodec();
    const unreadable: ImageCodec = {
      ...codec,
      decode: async () => {
        throw new Error('The source image could not be decoded.');
      },
    };

    expect(UNPREPARED_PHOTO_MESSAGE).toBe('Não foi possível preparar a foto. Tente outra imagem ou envie em PDF.');
    await expect(stripImageMetadata(new File([PHOTO_WITH_EXIF], 'cnh.jpg', { type: 'image/jpeg' }), unreadable)).rejects.toMatchObject({
      name: 'AppError',
      code: 'invalid_input',
      message: UNPREPARED_PHOTO_MESSAGE,
    });
    expect(encoded).toEqual([]);
    expect(closedCount()).toBe(0);
  });

  it.each([
    ['the encoder returns nothing', async () => null],
    ['the encoder returns an empty file', async (_image: DecodedImage, type: string) => new Blob([], { type })],
    ['the browser falls back to PNG for a WebP request', async () => new Blob([bytes('png')], { type: 'image/png' })],
    [
      'the encoder throws',
      async () => {
        throw new Error('canvas too large');
      },
    ],
  ])('fails closed when %s', async (_case, encode) => {
    const { codec, closedCount } = fakeCodec();
    const failing: ImageCodec = { ...codec, encode };

    await expect(stripImageMetadata(new File([PHOTO_WITH_EXIF], 'foto.webp', { type: 'image/webp' }), failing)).rejects.toMatchObject({
      code: 'invalid_input',
      message: UNPREPARED_PHOTO_MESSAGE,
    });
    expect(closedCount()).toBe(1);
  });
});

describe('browserImageCodec', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** A canvas whose 2D context and encoder are recorded, so the drawing can be checked. */
  const stubCanvas = (options: { context: boolean }) => {
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback | null, type?: string) => {
      callback?.(new Blob([bytes('encoded')], { type }));
    });
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => (options.context ? { drawImage } : null)), toBlob };
    const original = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string, init?: ElementCreationOptions) =>
      tag === 'canvas' ? canvas : original(tag, init)) as typeof document.createElement);
    return { canvas, drawImage, toBlob };
  };

  it('asks the browser for upright pixels and draws them at their size', async () => {
    const bitmap = { width: 4, height: 3, close: vi.fn() };
    const createBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal('createImageBitmap', createBitmap);
    const { canvas, drawImage, toBlob } = stubCanvas({ context: true });
    const photo = new File([PHOTO_WITH_EXIF], 'foto.webp', { type: 'image/webp' });

    const image = await browserImageCodec.decode(photo);
    expect(createBitmap).toHaveBeenCalledWith(photo, { imageOrientation: 'from-image' });
    expect([image.width, image.height]).toEqual([4, 3]);

    const blob = await browserImageCodec.encode(image, 'image/webp', 0.92);
    expect([canvas.width, canvas.height]).toEqual([4, 3]);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.92);
    expect(blob?.type).toBe('image/webp');

    image.close();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('gives a stripped WebP file from the browser output', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4, height: 3, close: vi.fn() })));
    stubCanvas({ context: true });

    const stripped = await stripImageMetadata(new File([PHOTO_WITH_EXIF], 'foto.webp', { type: 'image/webp' }), browserImageCodec);

    expect(stripped.name).toBe('foto.webp');
    expect(stripped.type).toBe('image/webp');
  });

  it('fails closed when the browser has no 2D context', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4, height: 3, close: vi.fn() })));
    stubCanvas({ context: false });

    await expect(stripImageMetadata(new File([PHOTO_WITH_EXIF], 'foto.webp', { type: 'image/webp' }), browserImageCodec)).rejects.toMatchObject({
      code: 'invalid_input',
      message: UNPREPARED_PHOTO_MESSAGE,
    });
  });

  it('fails closed when the browser cannot decode the file', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
      }),
    );

    await expect(stripImageMetadata(new File([PHOTO_WITH_EXIF], 'foto.heic', { type: 'image/heic' }), browserImageCodec)).rejects.toMatchObject({
      code: 'invalid_input',
      message: UNPREPARED_PHOTO_MESSAGE,
    });
  });
});
