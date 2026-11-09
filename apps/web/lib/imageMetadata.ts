// Removes what a camera writes into a photo before the photo leaves the device:
// EXIF (GPS position, device model, capture time), XMP and text chunks. The photo
// is decoded and drawn again, and only its pixels are encoded, so none of those
// segments are copied. Files that are not images (PDFs) come back unchanged; this
// module does not claim to clean them.

import { AppError } from './errors';

/** Shown when a photo cannot be prepared. The original file is never sent in its place. */
export const UNPREPARED_PHOTO_MESSAGE = 'Não foi possível preparar a foto. Tente outra imagem ou envie em PDF.';

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
  /** Draws the image and encodes it as `type`. Null when the browser cannot produce that type. */
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

/** Input type → type of the stripped file. A canvas cannot write HEIC, so HEIC becomes JPEG. */
const OUTPUT_TYPES = new Map<string, string>([
  ['image/jpeg', 'image/jpeg'],
  ['image/png', 'image/png'],
  ['image/webp', 'image/webp'],
  ['image/heic', 'image/jpeg'],
]);

const LOSSY_QUALITY = 0.92;

/**
 * Returns the photo as a new File with the same name and without its metadata.
 * A file of any other type is returned as it is. A photo that cannot be decoded or
 * re-encoded throws an AppError, and the caller must not upload the original then.
 */
export const stripImageMetadata = async (file: File, codec: ImageCodec = browserImageCodec): Promise<File> => {
  const type = OUTPUT_TYPES.get(file.type);
  if (!type) return file;

  let image: DecodedImage | null = null;
  try {
    image = await codec.decode(file);
    const blob = await codec.encode(image, type, LOSSY_QUALITY);
    // A browser that cannot encode the requested type returns PNG instead, so check what came back
    if (!blob || blob.size === 0 || blob.type !== type) throw new Error(`the browser did not encode ${type}`);
    return new File([blob], file.name, { type });
  } catch (cause) {
    throw new AppError('invalid_input', {
      message: UNPREPARED_PHOTO_MESSAGE,
      cause,
      detail: cause instanceof Error ? cause.message : undefined,
    });
  } finally {
    image?.close();
  }
};
