// Removes what a camera writes into a photo before the app uploads it: EXIF (GPS
// position, device model, capture time), XMP and text chunks. The photo is decoded
// and drawn again, and the browser encodes only the pixels into a new file. That
// depends on the browser's canvas encoder, which the unit tests cannot prove: they
// use a fake codec, because jsdom has no canvas.
//
// Scope:
// - This runs on the app's own upload path only. A direct upload through the
//   Storage API does not pass through it, and the server does not inspect files.
// - The type comes from the first bytes, not the file name, because a browser takes
//   the type from the name. JPEG, PNG, WebP and HEIC/HEIF are cleaned, whatever the
//   declared type. HEIC becomes JPEG, because a canvas cannot write HEIC.
// - A file declared as an image whose bytes are not a supported photo fails closed.
// - A PDF is returned unchanged: PDFs are not cleaned. Other non-image files too.

import { AppError } from './errors';

/** Shown when a photo cannot be prepared. The original file is never sent in its place. */
export const UNPREPARED_PHOTO_MESSAGE = 'Não foi possível preparar a foto. Tente outra imagem ou envie em PDF.';

/** Shown when the photo is still over the size limit after the lower-quality tries. */
export const STILL_TOO_LARGE_MESSAGE =
  'A foto continua grande demais depois de preparada. Envie uma foto de menor resolução ou em PDF.';

/** A decoded picture. Its width and height are the upright size, with the EXIF rotation applied. */
export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  /** The browser source to draw. This module never reads its pixels. */
  readonly pixels: CanvasImageSource;
  close(): void;
}

/**
 * The browser pieces the helper uses. The app passes browserImageCodec; unit tests
 * pass fakes, because jsdom has no canvas and no image decoder.
 */
export interface ImageCodec {
  decode(file: Blob): Promise<DecodedImage>;
  /** Draws the image and encodes it as `type`. Null, or a blob of another type, when the browser cannot produce `type`. */
  encode(image: DecodedImage, type: string, quality: number): Promise<Blob | null>;
}

/** The browser's own decoder and canvas. */
export const browserImageCodec: ImageCodec = {
  async decode(file) {
    // from-image makes the browser turn the photo upright before it is drawn. The
    // orientation tag is dropped with the other metadata, so without this a
    // rotated phone photo would be stored sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { width: bitmap.width, height: bitmap.height, pixels: bitmap, close: () => bitmap.close() };
  },
  async encode(image, type, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image.pixels, 0, 0);
    return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
  },
};

/** The photo types the helper reads from their first bytes. */
export type PhotoType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';

/** Type of the stripped file for each photo type. A canvas cannot write HEIC, so HEIC becomes JPEG. */
const OUTPUT_TYPES: Record<PhotoType, string> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/heic': 'image/jpeg',
};

const SNIFF_LENGTH = 12;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Brands of HEIC/HEIF photos in the ftyp box. AVIF and video brands are not listed. */
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'heim', 'mif1', 'msf1'];

const hasText = (bytes: Uint8Array, offset: number, text: string): boolean =>
  [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));

/** The photo type the first bytes announce, or null. The bytes decide, not the declared type. */
export const detectPhotoType = (head: Uint8Array): PhotoType | null => {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (PNG_SIGNATURE.every((byte, index) => head[index] === byte)) return 'image/png';
  if (hasText(head, 0, 'RIFF') && hasText(head, 8, 'WEBP')) return 'image/webp';
  if (hasText(head, 4, 'ftyp') && HEIF_BRANDS.some(brand => hasText(head, 8, brand))) return 'image/heic';
  return null;
};

const readHead = async (file: Blob): Promise<Uint8Array> => new Uint8Array(await file.slice(0, SNIFF_LENGTH).arrayBuffer());

/** Quality steps for lossy output, best first. The first encoding that fits the limit is kept. */
const QUALITY_STEPS = [0.92, 0.8, 0.65];
const LOSSY_TYPES = new Set(['image/jpeg', 'image/webp']);

type Encoded =
  | { readonly kind: 'ok'; readonly blob: Blob }
  /** The encoder returned nothing, an empty file or another type. */
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'too-large' };

/** Encodes as `type`, lowering the quality until the blob fits `maxBytes` (PNG has one try). */
const encodeWithin = async (codec: ImageCodec, image: DecodedImage, type: string, maxBytes: number | undefined): Promise<Encoded> => {
  const qualities = LOSSY_TYPES.has(type) ? QUALITY_STEPS : QUALITY_STEPS.slice(0, 1);
  for (const quality of qualities) {
    const blob = await codec.encode(image, type, quality);
    if (!blob || blob.size === 0 || blob.type !== type) return { kind: 'unsupported' };
    if (maxBytes === undefined || blob.size <= maxBytes) return { kind: 'ok', blob };
  }
  return { kind: 'too-large' };
};

const unprepared = (cause: unknown): AppError =>
  new AppError('invalid_input', {
    message: UNPREPARED_PHOTO_MESSAGE,
    cause,
    detail: cause instanceof Error ? cause.message : undefined,
  });

/** Decodes the photo and encodes it again. WebP falls back to JPEG when the browser cannot write WebP. */
const encodePhoto = async (file: Blob, codec: ImageCodec, photoType: PhotoType, maxBytes: number | undefined): Promise<Blob> => {
  const requested = OUTPUT_TYPES[photoType];
  let image: DecodedImage | null = null;
  let encoded: Encoded;
  try {
    image = await codec.decode(file);
    encoded = await encodeWithin(codec, image, requested, maxBytes);
    if (encoded.kind === 'unsupported' && requested === 'image/webp') {
      // Some browsers cannot write WebP and return PNG instead. The same picture goes out as JPEG.
      encoded = await encodeWithin(codec, image, 'image/jpeg', maxBytes);
    }
  } catch (cause) {
    throw unprepared(cause);
  } finally {
    image?.close();
  }
  if (encoded.kind === 'unsupported') throw unprepared(new Error('the browser did not encode the photo'));
  if (encoded.kind === 'too-large') throw new AppError('invalid_input', { message: STILL_TOO_LARGE_MESSAGE });
  return encoded.blob;
};

/**
 * Returns the file as a new File with the same name and without its metadata. Rules:
 * - Bytes that are a JPEG, PNG, WebP or HEIC photo are cleaned, whatever the declared type.
 * - A file declared as an image whose bytes are not a supported photo throws.
 * - Any other file, such as a PDF, is returned as it is.
 * `maxBytes` is the largest size the result may have. Lossy output is re-encoded at lower
 * quality until it fits, and PNG, which is lossless, throws if it does not fit.
 * A photo that cannot be decoded, encoded or made to fit throws an AppError, and the caller
 * must not upload the original in its place.
 */
export const stripImageMetadata = async (file: File, codec: ImageCodec = browserImageCodec, maxBytes?: number): Promise<File> => {
  let photoType: PhotoType | null;
  try {
    photoType = detectPhotoType(await readHead(file));
  } catch (cause) {
    throw unprepared(cause);
  }
  if (!photoType) {
    if (file.type.startsWith('image/')) throw unprepared(new Error(`declared ${file.type}, but the bytes are not a supported photo`));
    return file;
  }
  const blob = await encodePhoto(file, codec, photoType, maxBytes);
  return new File([blob], file.name, { type: blob.type });
};
