import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserImageCodec,
  detectPhotoType,
  stripImageMetadata,
  STILL_TOO_LARGE_MESSAGE,
  UNPREPARED_PHOTO_MESSAGE,
  type DecodedImage,
  type ImageCodec,
} from '../../lib/imageMetadata';

const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

const readText = async (blob: Blob): Promise<string> => new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));

// A JPEG whose APP1 segment holds EXIF with a GPS block and the phone model
const PHOTO_WITH_EXIF = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x30, ...bytes('Exif\0\0GPSLatitude Apple iPhone 15'), 0xff, 0xd9]);

// The first bytes of each supported type. The helper reads the type from these, not from the name.
const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...bytes('IHDR')]);
const WEBP_BYTES = Uint8Array.from([...bytes('RIFF'), 0x24, 0x00, 0x00, 0x00, ...bytes('WEBPVP8 ')]);
/** An ftyp box with the given major brand, as HEIC and HEIF files start. */
const ftypBox = (brand: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from([0, 0, 0, 0x18, ...bytes('ftyp'), ...bytes(brand), 0, 0, 0, 0, ...bytes('mif1heic')]);
const HEIC_BYTES = ftypBox('heic');
const PDF_BYTES = bytes('%PDF-1.4 Exif GPSLatitude');

const PIXELS_ONLY = 'pixels only';
const LIMIT = 100;

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

/** The fake codec with an encoder that answers `respond`. Every encode is recorded. */
const scriptedCodec = (respond: (type: string, quality: number) => Blob | null) => {
  const { codec, encoded } = fakeCodec();
  const scripted: ImageCodec = {
    ...codec,
    encode: async (image, type, quality) => {
      encoded.push({ image, type, quality });
      return respond(type, quality);
    },
  };
  return { codec: scripted, encoded };
};

const blobOf = (size: number, type: string): Blob => new Blob([new Uint8Array(size)], { type });

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
    ['image/png', 'selfie.png', PNG_BYTES, 'image/png'],
    ['image/webp', 'foto.webp', WEBP_BYTES, 'image/webp'],
    ['image/heic', 'foto.heic', HEIC_BYTES, 'image/jpeg'],
  ])('re-encodes %s and keeps the name (output %s)', async (inputType, name, content, outputType) => {
    const { codec, encoded } = fakeCodec();
    const photo = new File([content], name, { type: inputType });

    const stripped = await stripImageMetadata(photo, codec);

    expect(stripped.name).toBe(name);
    expect(stripped.type).toBe(outputType);
    expect(encoded[0].type).toBe(outputType);
  });

  it('returns a PDF unchanged and never decodes it', async () => {
    const { codec, decoded, encoded } = fakeCodec();
    const pdf = new File([PDF_BYTES], 'comprovante.pdf', { type: 'application/pdf' });

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
    ['the browser returns PNG for every type', async () => new Blob([bytes('png')], { type: 'image/png' })],
    [
      'the encoder throws',
      async () => {
        throw new Error('canvas too large');
      },
    ],
  ])('fails closed when %s', async (_case, encode) => {
    const { codec, closedCount } = fakeCodec();
    const failing: ImageCodec = { ...codec, encode };

    await expect(stripImageMetadata(new File([WEBP_BYTES], 'foto.webp', { type: 'image/webp' }), failing)).rejects.toMatchObject({
      code: 'invalid_input',
      message: UNPREPARED_PHOTO_MESSAGE,
    });
    expect(closedCount()).toBe(1);
  });
});

describe('WebP fallback', () => {
  it('writes a JPEG File, named as the original, when the browser cannot write WebP', async () => {
    // This browser cannot write WebP: it returns PNG for that request and writes JPEG normally
    const { codec, encoded } = scriptedCodec((type) => blobOf(20, type === 'image/webp' ? 'image/png' : type));
    const photo = new File([WEBP_BYTES], 'foto.webp', { type: 'image/webp' });

    const stripped = await stripImageMetadata(photo, codec);

    expect(stripped).toBeInstanceOf(File);
    expect(stripped.name).toBe('foto.webp');
    expect(stripped.type).toBe('image/jpeg');
    expect(encoded.map(call => call.type)).toEqual(['image/webp', 'image/jpeg']);
    expect(encoded[1].quality).toBe(0.92);
  });

  it('uses the WebP output as it is when the browser can write WebP', async () => {
    const { codec, encoded } = scriptedCodec((type) => blobOf(20, type));

    const stripped = await stripImageMetadata(new File([WEBP_BYTES], 'foto.webp', { type: 'image/webp' }), codec);

    expect(stripped.type).toBe('image/webp');
    expect(encoded.map(call => call.type)).toEqual(['image/webp']);
  });
});

describe('size limit', () => {
  it('accepts the first quality that fits: a JPEG that shrinks at 0.8', async () => {
    const { codec, encoded } = scriptedCodec((type, quality) => blobOf(quality >= 0.9 ? 200 : 90, type));
    const photo = new File([PHOTO_WITH_EXIF], 'rg.jpg', { type: 'image/jpeg' });

    const stripped = await stripImageMetadata(photo, codec, LIMIT);

    expect(stripped.size).toBe(90);
    expect(stripped.type).toBe('image/jpeg');
    expect(encoded.map(call => call.quality)).toEqual([0.92, 0.8]);
  });

  it('tries 0.65 last and accepts it when 0.92 and 0.8 are too large', async () => {
    const { codec, encoded } = scriptedCodec((type, quality) => blobOf(quality === 0.65 ? 60 : 150, type));

    const stripped = await stripImageMetadata(new File([PHOTO_WITH_EXIF], 'rg.jpg', { type: 'image/jpeg' }), codec, LIMIT);

    expect(stripped.size).toBe(60);
    expect(encoded.map(call => call.quality)).toEqual([0.92, 0.8, 0.65]);
  });

  it('refuses with the size message when no quality fits, and never returns the original', async () => {
    const { codec, encoded } = scriptedCodec((type) => blobOf(200, type));
    const photo = new File([PHOTO_WITH_EXIF], 'rg.jpg', { type: 'image/jpeg' });

    await expect(stripImageMetadata(photo, codec, LIMIT)).rejects.toMatchObject({
      name: 'AppError',
      code: 'invalid_input',
      message: STILL_TOO_LARGE_MESSAGE,
    });
    expect(encoded.map(call => call.quality)).toEqual([0.92, 0.8, 0.65]);
  });

  it('keeps PNG to one try, because it is lossless, and refuses it when it is too large', async () => {
    const { codec, encoded } = scriptedCodec((type) => blobOf(200, type));

    await expect(stripImageMetadata(new File([PNG_BYTES], 'selfie.png', { type: 'image/png' }), codec, LIMIT)).rejects.toMatchObject({
      code: 'invalid_input',
      message: STILL_TOO_LARGE_MESSAGE,
    });
    expect(encoded).toHaveLength(1);
  });

  it('applies the limit to the JPEG fallback of a WebP photo', async () => {
    const { codec, encoded } = scriptedCodec((type) => (type === 'image/jpeg' ? blobOf(200, type) : blobOf(20, 'image/png')));

    await expect(stripImageMetadata(new File([WEBP_BYTES], 'foto.webp', { type: 'image/webp' }), codec, LIMIT)).rejects.toMatchObject({
      message: STILL_TOO_LARGE_MESSAGE,
    });
    expect(encoded.map(call => call.type)).toEqual(['image/webp', 'image/jpeg', 'image/jpeg', 'image/jpeg']);
  });

  it('keeps the first encoding when no limit is given', async () => {
    const { codec, encoded } = scriptedCodec((type) => blobOf(500, type));

    const stripped = await stripImageMetadata(new File([PHOTO_WITH_EXIF], 'rg.jpg', { type: 'image/jpeg' }), codec);

    expect(stripped.size).toBe(500);
    expect(encoded.map(call => call.quality)).toEqual([0.92]);
  });
});

describe('reading the type from the bytes', () => {
  it('treats a JPEG declared as a PDF as a JPEG', async () => {
    const { codec, decoded } = fakeCodec();
    const disguised = new File([PHOTO_WITH_EXIF], 'comprovante.pdf', { type: 'application/pdf' });

    const stripped = await stripImageMetadata(disguised, codec);

    expect(decoded).toEqual([disguised]);
    expect(stripped.name).toBe('comprovante.pdf');
    expect(stripped.type).toBe('image/jpeg');
    expect(await readText(stripped)).toBe(PIXELS_ONLY);
  });

  it('takes the output type from the bytes, not from the declared type', async () => {
    const { codec } = fakeCodec();

    const stripped = await stripImageMetadata(new File([PNG_BYTES], 'foto.jpg', { type: 'image/jpeg' }), codec);

    expect(stripped.name).toBe('foto.jpg');
    expect(stripped.type).toBe('image/png');
  });

  it('fails closed when a file declared as a JPEG is not an image', async () => {
    const { codec, decoded, encoded } = fakeCodec();
    const notAPhoto = new File([bytes('<html>not a photo</html>')], 'cnh.jpg', { type: 'image/jpeg' });

    await expect(stripImageMetadata(notAPhoto, codec)).rejects.toMatchObject({
      code: 'invalid_input',
      message: UNPREPARED_PHOTO_MESSAGE,
    });
    expect(decoded).toEqual([]);
    expect(encoded).toEqual([]);
  });

  it('fails closed for a declared image type it cannot clean, such as GIF', async () => {
    const { codec, decoded } = fakeCodec();

    await expect(stripImageMetadata(new File([bytes('GIF89a')], 'foto.gif', { type: 'image/gif' }), codec)).rejects.toMatchObject({
      message: UNPREPARED_PHOTO_MESSAGE,
    });
    expect(decoded).toEqual([]);
  });

  it('reads a HEIC file declared as a PDF by its ftyp brand, and outputs JPEG', async () => {
    const { codec } = fakeCodec();

    const stripped = await stripImageMetadata(new File([HEIC_BYTES], 'exame.pdf', { type: 'application/pdf' }), codec);

    expect(stripped.name).toBe('exame.pdf');
    expect(stripped.type).toBe('image/jpeg');
  });

  it.each(['heic', 'heix', 'hevc', 'heim', 'mif1', 'msf1'])('detects the HEIF brand %s', brand => {
    expect(detectPhotoType(ftypBox(brand))).toBe('image/heic');
  });

  it.each(['isom', 'avif', 'mp42'])('does not take the ftyp brand %s for a photo', brand => {
    expect(detectPhotoType(ftypBox(brand))).toBeNull();
  });

  it('detects JPEG, PNG and WebP from their signatures', () => {
    expect(detectPhotoType(PHOTO_WITH_EXIF.subarray(0, 12))).toBe('image/jpeg');
    expect(detectPhotoType(PNG_BYTES.subarray(0, 12))).toBe('image/png');
    expect(detectPhotoType(WEBP_BYTES.subarray(0, 12))).toBe('image/webp');
    expect(detectPhotoType(PDF_BYTES.subarray(0, 12))).toBeNull();
    expect(detectPhotoType(new Uint8Array(0))).toBeNull();
  });
});

describe('browserImageCodec', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** A canvas whose 2D context and encoder are recorded. With webpSupported false it writes PNG for WebP, as some browsers do. */
  const stubCanvas = (options: { context: boolean; webpSupported?: boolean }) => {
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback | null, type?: string) => {
      const produced = type === 'image/webp' && options.webpSupported === false ? 'image/png' : type;
      callback?.(new Blob([bytes('encoded')], { type: produced }));
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
    const photo = new File([WEBP_BYTES], 'foto.webp', { type: 'image/webp' });

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

    const stripped = await stripImageMetadata(new File([WEBP_BYTES], 'foto.webp', { type: 'image/webp' }), browserImageCodec);

    expect(stripped.name).toBe('foto.webp');
    expect(stripped.type).toBe('image/webp');
  });

  it('falls back to JPEG when the browser cannot write WebP', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4, height: 3, close: vi.fn() })));
    const { toBlob } = stubCanvas({ context: true, webpSupported: false });

    const stripped = await stripImageMetadata(new File([WEBP_BYTES], 'foto.webp', { type: 'image/webp' }), browserImageCodec);

    expect(stripped.name).toBe('foto.webp');
    expect(stripped.type).toBe('image/jpeg');
    expect(toBlob.mock.calls.map(call => call[1])).toEqual(['image/webp', 'image/jpeg']);
  });

  it('fails closed when the browser has no 2D context', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4, height: 3, close: vi.fn() })));
    stubCanvas({ context: false });

    await expect(stripImageMetadata(new File([WEBP_BYTES], 'foto.webp', { type: 'image/webp' }), browserImageCodec)).rejects.toMatchObject({
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

    await expect(stripImageMetadata(new File([HEIC_BYTES], 'foto.heic', { type: 'image/heic' }), browserImageCodec)).rejects.toMatchObject({
      code: 'invalid_input',
      message: UNPREPARED_PHOTO_MESSAGE,
    });
  });
});
