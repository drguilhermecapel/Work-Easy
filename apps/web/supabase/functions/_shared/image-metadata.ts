// Removes what a camera writes into a document file before the server stores it: EXIF (GPS
// position, device model, capture time), XMP, IPTC and text chunks. The upload function runs it on
// every file, so the browser's own cleaning is not the only line of defence. Pure byte code: no
// Deno APIs and no npm imports, so Vitest runs it under Node (test/functions/image-metadata.test.ts).
//
// What is removed and what stays:
// - JPEG: APP1 (EXIF and XMP), APP13 (Photoshop/IPTC), COM, and APP2 unless it holds an ICC
//   profile. Every other segment and the entropy-coded image data stay byte for byte, so the
//   picture is not decoded or encoded again. Bytes after the end-of-image marker are dropped: they
//   are not part of the picture, and some phones append a video there.
// - PNG: eXIf, tEXt, zTXt, iTXt and tIME chunks. The other chunks stay whole, so their CRCs stay valid.
// - WebP: EXIF and XMP chunks. The RIFF size is rewritten, and the VP8X flags that announce those
//   chunks are cleared.
// - PDF: returned unchanged. PDFs are not cleaned.

/** The types the stripper cleans. A PDF is passed through. */
export type MetadataType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

/** Every type the detector names. HEIC is named so the caller can refuse it with its own message. */
export type DetectedType = MetadataType | 'image/heic';

/** The bytes do not have the structure of their type: truncated, or a segment or chunk that does not fit. */
export class ImageMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageMetadataError';
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Brands of HEIC/HEIF files in the ftyp box. */
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'heim', 'mif1', 'msf1'];

const hasAscii = (bytes: Uint8Array, offset: number, text: string): boolean =>
  bytes.length >= offset + text.length && [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));

const ascii = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

/** The type the first bytes announce, or null. The bytes decide, never the declared type. */
export function detectDocumentType(bytes: Uint8Array): DetectedType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return 'image/png';
  if (hasAscii(bytes, 0, 'RIFF') && hasAscii(bytes, 8, 'WEBP')) return 'image/webp';
  if (hasAscii(bytes, 0, '%PDF-')) return 'application/pdf';
  if (hasAscii(bytes, 4, 'ftyp') && HEIF_BRANDS.some(brand => hasAscii(bytes, 8, brand))) return 'image/heic';
  return null;
}

/** Returns the file without its metadata. A PDF comes back as it is. Throws ImageMetadataError on broken structure. */
export function stripPhotoMetadata(bytes: Uint8Array, type: MetadataType): Uint8Array {
  switch (type) {
    case 'image/jpeg':
      return stripJpeg(bytes);
    case 'image/png':
      return stripPng(bytes);
    case 'image/webp':
      return stripWebp(bytes);
    case 'application/pdf':
      return bytes;
  }
}

// ---- helpers ------------------------------------------------------------------

const need = (bytes: Uint8Array, offset: number, count: number, what: string): void => {
  if (offset < 0 || offset + count > bytes.length) throw new ImageMetadataError(`${what}: truncated`);
};

const u16be = (bytes: Uint8Array, offset: number): number => (bytes[offset] << 8) | bytes[offset + 1];

const u32be = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;

const u32le = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

/** Output built from input ranges and new bytes, joined once. */
class Parts {
  private readonly list: Uint8Array[] = [];
  private size = 0;

  add(part: Uint8Array): void {
    if (part.length === 0) return;
    this.list.push(part);
    this.size += part.length;
  }

  join(): Uint8Array {
    const out = new Uint8Array(this.size);
    let offset = 0;
    for (const part of this.list) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
}

/** Copies the input except the dropped ranges. `from` is the first input byte not copied yet. */
class Copier {
  private from = 0;

  constructor(
    private readonly bytes: Uint8Array,
    private readonly out: Parts,
  ) {}

  /** Copies the input up to `start`, then skips it up to `resume`. */
  drop(start: number, resume: number): void {
    this.out.add(this.bytes.subarray(this.from, start));
    this.from = resume;
  }

  /** Copies the input up to `end` and stops there. */
  finish(end: number): Uint8Array {
    this.out.add(this.bytes.subarray(this.from, end));
    this.from = end;
    return this.out.join();
  }
}

// ---- JPEG ---------------------------------------------------------------------

/** APP1 (EXIF, XMP), APP13 (IPTC) and COM. APP2 is dropped too, unless it holds an ICC profile. */
const JPEG_DROPPED_MARKERS = new Set([0xe1, 0xed, 0xfe]);
const APP2 = 0xe2;

const isIccProfile = (bytes: Uint8Array, dataStart: number, segmentEnd: number): boolean =>
  dataStart + 12 <= segmentEnd && hasAscii(bytes, dataStart, 'ICC_PROFILE\0');

/** Position of the next marker after entropy-coded data: stuffed 0xFF00, restart markers and fill bytes are skipped. */
function nextMarker(bytes: Uint8Array, from: number): number {
  let position = from;
  while (position + 1 < bytes.length) {
    if (bytes[position] === 0xff) {
      const next = bytes[position + 1];
      if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
        position += 2;
        continue;
      }
      if (next === 0xff) {
        position += 1;
        continue;
      }
      return position;
    }
    position += 1;
  }
  throw new ImageMetadataError('jpeg: truncated in image data');
}

function stripJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new ImageMetadataError('jpeg: no SOI marker');
  const out = new Parts();
  const copy = new Copier(bytes, out);
  let position = 2;
  for (;;) {
    need(bytes, position, 2, 'jpeg');
    if (bytes[position] !== 0xff) throw new ImageMetadataError('jpeg: marker expected');
    const marker = bytes[position + 1];
    if (marker === 0xff) {
      // Fill byte: it stays with the next segment
      position += 1;
      continue;
    }
    if (marker === 0x00) throw new ImageMetadataError('jpeg: 0xFF 0x00 outside image data');
    if (marker === 0xd9) return copy.finish(position + 2);
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      // Standalone markers: no length field
      position += 2;
      continue;
    }
    need(bytes, position + 2, 2, 'jpeg');
    const length = u16be(bytes, position + 2);
    if (length < 2) throw new ImageMetadataError('jpeg: segment length below 2');
    const segmentEnd = position + 2 + length;
    need(bytes, position, segmentEnd - position, 'jpeg');
    if (marker === 0xda) {
      // Start of scan: the entropy-coded data follows, up to the next marker
      position = nextMarker(bytes, segmentEnd);
      continue;
    }
    const dropped = JPEG_DROPPED_MARKERS.has(marker) || (marker === APP2 && !isIccProfile(bytes, position + 4, segmentEnd));
    if (dropped) copy.drop(position, segmentEnd);
    position = segmentEnd;
  }
}

// ---- PNG ----------------------------------------------------------------------

const PNG_DROPPED_CHUNKS = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(bytes: Uint8Array): Uint8Array {
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) throw new ImageMetadataError('png: no signature');
  const out = new Parts();
  const copy = new Copier(bytes, out);
  let position = PNG_SIGNATURE.length;
  for (;;) {
    need(bytes, position, 12, 'png');
    const length = u32be(bytes, position);
    const chunkEnd = position + 12 + length;
    need(bytes, position, chunkEnd - position, 'png');
    const type = ascii(bytes, position + 4, 4);
    if (PNG_DROPPED_CHUNKS.has(type)) copy.drop(position, chunkEnd);
    position = chunkEnd;
    if (type === 'IEND') return copy.finish(chunkEnd);
  }
}

// ---- WebP ---------------------------------------------------------------------

const WEBP_DROPPED_CHUNKS = new Set(['EXIF', 'XMP ']);
/** Flags of the VP8X chunk that announce EXIF and XMP chunks. */
const VP8X_EXIF_FLAG = 0x08;
const VP8X_XMP_FLAG = 0x04;

function stripWebp(bytes: Uint8Array): Uint8Array {
  need(bytes, 0, 12, 'webp');
  if (!hasAscii(bytes, 0, 'RIFF') || !hasAscii(bytes, 8, 'WEBP')) throw new ImageMetadataError('webp: no RIFF/WEBP header');
  const riffEnd = 8 + u32le(bytes, 4);
  if (riffEnd > bytes.length) throw new ImageMetadataError('webp: RIFF size is longer than the file');
  const chunks = new Parts();
  let position = 12;
  while (position < riffEnd) {
    need(bytes, position, 8, 'webp');
    if (position + 8 > riffEnd) throw new ImageMetadataError('webp: chunk header outside RIFF');
    const type = ascii(bytes, position, 4);
    const size = u32le(bytes, position + 4);
    const chunkEnd = position + 8 + size + (size & 1);
    if (chunkEnd > riffEnd) throw new ImageMetadataError('webp: chunk outside RIFF');
    if (!WEBP_DROPPED_CHUNKS.has(type)) {
      if (type === 'VP8X') {
        if (size < 1) throw new ImageMetadataError('webp: VP8X chunk too short');
        // Copy, then clear the flags: the file no longer holds the chunks they announce
        const header = bytes.slice(position, chunkEnd);
        header[8] &= ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG) & 0xff;
        chunks.add(header);
      } else {
        chunks.add(bytes.subarray(position, chunkEnd));
      }
    }
    position = chunkEnd;
  }
  const payload = chunks.join();
  const out = new Uint8Array(12 + payload.length);
  out.set(new TextEncoder().encode('RIFF'), 0);
  new DataView(out.buffer).setUint32(4, 4 + payload.length, true);
  out.set(new TextEncoder().encode('WEBP'), 8);
  out.set(payload, 12);
  return out;
}
