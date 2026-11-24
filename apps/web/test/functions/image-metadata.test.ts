// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { detectDocumentType, ImageMetadataError, stripPhotoMetadata } from '../../supabase/functions/_shared/image-metadata.ts';

// Synthetic files: the module reads structure, not picture data, so the picture parts are stand-ins.
const text = (value: string): number[] => [...new TextEncoder().encode(value)];
const be16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le32 = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const bytesOf = (...parts: number[][]): Uint8Array => Uint8Array.from(parts.flat());
const asText = (bytes: Uint8Array): string => new TextDecoder('latin1').decode(bytes);

const GPS = text('GPSLatitude 23 33 12 S GPSLongitude 46 38 12 W Model SM-G991B');

// ---- JPEG ---------------------------------------------------------------------

const jpegSegment = (marker: number, data: number[]): number[] => [0xff, marker, ...be16(data.length + 2), ...data];
const SCAN = [0x12, 0x34, 0xff, 0x00, 0x56, 0x78]; // entropy-coded data with a stuffed 0xFF 0x00
const SOS = jpegSegment(0xda, [1, 1, 0, 0, 63, 0]);
const jpeg = (...parts: number[][]): Uint8Array => bytesOf([0xff, 0xd8], ...parts, [0xff, 0xd9]);

const APP0 = jpegSegment(0xe0, text('JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00'));
const APP1_EXIF = jpegSegment(0xe1, [...text('Exif\0\0'), ...GPS]);
const APP1_XMP = jpegSegment(0xe1, [...text('http://ns.adobe.com/xap/1.0/\0'), ...GPS]);
const APP13_IPTC = jpegSegment(0xed, [...text('Photoshop 3.0\0'), ...GPS]);
const COM = jpegSegment(0xfe, [...GPS]);
const APP2_OTHER = jpegSegment(0xe2, [...text('FPXR\0'), ...GPS]);
const APP2_ICC = jpegSegment(0xe2, [...text('ICC_PROFILE\0'), 1, 1, 9, 8, 7, 6]);
const DQT = jpegSegment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]);
const SOF0 = jpegSegment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]);

/** Marker sequence of a JPEG: a segment marker per entry, with the scan and the end of image. */
function jpegMarkers(bytes: Uint8Array): string[] {
  const markers: string[] = [];
  let position = 2;
  while (position < bytes.length) {
    if (bytes[position] !== 0xff) throw new Error(`no marker at ${position}`);
    const marker = bytes[position + 1];
    markers.push(marker.toString(16).toUpperCase().padStart(2, '0'));
    if (marker === 0xd9) break;
    const length = (bytes[position + 2] << 8) | bytes[position + 3];
    position += 2 + length;
    if (marker === 0xda) {
      // Skip the entropy-coded data up to the next real marker
      while (position + 1 < bytes.length && !(bytes[position] === 0xff && bytes[position + 1] !== 0x00 && !(bytes[position + 1] >= 0xd0 && bytes[position + 1] <= 0xd7))) {
        position += 1;
      }
    }
  }
  return markers;
}

describe('stripPhotoMetadata: JPEG', () => {
  it('drops EXIF, XMP, IPTC, COM and non-ICC APP2, and keeps the rest byte for byte', () => {
    const input = jpeg(APP0, APP1_EXIF, APP1_XMP, APP13_IPTC, COM, APP2_OTHER, APP2_ICC, DQT, SOF0, SOS, SCAN);

    const out = stripPhotoMetadata(input, 'image/jpeg');

    expect(asText(out)).not.toContain('GPSLatitude');
    expect(out.length).toBeLessThan(input.length);
    expect(jpegMarkers(out)).toEqual(['E0', 'E2', 'DB', 'C0', 'DA', 'D9']);
    // The scan keeps its stuffed bytes and the end of image follows it
    expect(Array.from(out.subarray(out.length - SCAN.length - 2))).toEqual([...SCAN, 0xff, 0xd9]);
    expect(Array.from(out.subarray(0, APP0.length + 2))).toEqual([0xff, 0xd8, ...APP0]);
  });

  it('returns the same bytes when there is nothing to remove', () => {
    const input = jpeg(APP0, DQT, SOF0, SOS, SCAN);

    expect(Array.from(stripPhotoMetadata(input, 'image/jpeg'))).toEqual(Array.from(input));
  });

  it('drops the bytes after the end of image, such as an appended video', () => {
    const input = bytesOf(Array.from(jpeg(APP0, SOS, SCAN)), text('ftypmp42 GPSLatitude'));

    const out = stripPhotoMetadata(input, 'image/jpeg');

    expect(asText(out)).not.toContain('GPSLatitude');
    expect(out[out.length - 2]).toBe(0xff);
    expect(out[out.length - 1]).toBe(0xd9);
  });

  it('refuses a JPEG cut before its end of image', () => {
    const cut = jpeg(APP0, SOS, SCAN).subarray(0, -2);

    expect(() => stripPhotoMetadata(cut, 'image/jpeg')).toThrow(ImageMetadataError);
  });

  it('refuses bytes without a start of image', () => {
    expect(() => stripPhotoMetadata(Uint8Array.from([1, 2, 3, 4]), 'image/jpeg')).toThrow(ImageMetadataError);
  });
});

// ---- PNG ----------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// CRC bytes are zero: a kept chunk is copied whole, so its CRC is not checked here
const pngChunk = (type: string, data: number[]): number[] => [...be32(data.length), ...text(type), ...data, 0, 0, 0, 0];
const IHDR = pngChunk('IHDR', [...be32(1), ...be32(1), 8, 2, 0, 0, 0]);
const png = (...chunks: number[][]): Uint8Array => bytesOf(PNG_SIGNATURE, ...chunks);

function pngTypes(bytes: Uint8Array): string[] {
  const types: string[] = [];
  let position = 8;
  while (position < bytes.length) {
    const length = ((bytes[position] << 24) >>> 0) + (bytes[position + 1] << 16) + (bytes[position + 2] << 8) + bytes[position + 3];
    types.push(new TextDecoder().decode(bytes.subarray(position + 4, position + 8)));
    position += 12 + length;
  }
  return types;
}

describe('stripPhotoMetadata: PNG', () => {
  it('drops eXIf, tEXt, zTXt, iTXt and tIME, and keeps the other chunks whole', () => {
    const input = png(
      IHDR,
      pngChunk('tEXt', [...text('Comment\0'), ...GPS]),
      pngChunk('eXIf', GPS),
      pngChunk('pHYs', [0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1]),
      pngChunk('tIME', [7, 0xe6, 11, 18, 12, 0, 0]),
      pngChunk('IDAT', [0x78, 0x9c, 1, 2, 3]),
      pngChunk('IEND', []),
    );

    const out = stripPhotoMetadata(input, 'image/png');

    expect(asText(out)).not.toContain('GPSLatitude');
    expect(pngTypes(out)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
    expect(out.length).toBeLessThan(input.length);
    // The kept IHDR is the same bytes as in the input
    expect(Array.from(out.subarray(8, 8 + IHDR.length))).toEqual(IHDR);
  });

  it('refuses a PNG cut before its end chunk', () => {
    const cut = png(IHDR, pngChunk('IDAT', [1, 2, 3])).subarray(0, -6);

    expect(() => stripPhotoMetadata(cut, 'image/png')).toThrow(ImageMetadataError);
  });
});

// ---- WebP ---------------------------------------------------------------------

const webpChunk = (type: string, data: number[]): number[] => [...text(type), ...le32(data.length), ...data, ...(data.length % 2 ? [0] : [])];
const webp = (...chunks: number[][]): Uint8Array => {
  const payload = chunks.flat();
  return bytesOf(text('RIFF'), le32(4 + payload.length), text('WEBP'), payload);
};
// Flags 0x2c: ICC, EXIF and XMP are announced. Only the ICC flag may remain after stripping.
const VP8X = webpChunk('VP8X', [0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

function webpTypes(bytes: Uint8Array): string[] {
  const types: string[] = [];
  let position = 12;
  while (position < bytes.length) {
    const size = (bytes[position + 4] | (bytes[position + 5] << 8) | (bytes[position + 6] << 16) | (bytes[position + 7] << 24)) >>> 0;
    types.push(new TextDecoder().decode(bytes.subarray(position, position + 4)));
    position += 8 + size + (size & 1);
  }
  return types;
}

describe('stripPhotoMetadata: WebP', () => {
  it('drops EXIF and XMP chunks, rewrites the RIFF size and clears their VP8X flags', () => {
    const input = webp(
      VP8X,
      webpChunk('ICCP', [1, 2, 3]),
      webpChunk('VP8 ', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      webpChunk('EXIF', text('Exif\0\0GPSLatitude 23 33 12 S')),
      webpChunk('XMP ', text('<x:xmpmeta>GPSLatitude</x:xmpmeta>')),
    );

    const out = stripPhotoMetadata(input, 'image/webp');

    expect(asText(out)).not.toContain('GPSLatitude');
    expect(webpTypes(out)).toEqual(['VP8X', 'ICCP', 'VP8 ']);
    expect(new DataView(out.buffer).getUint32(4, true)).toBe(out.length - 8);
    expect(out[20]).toBe(0x20); // only the ICC flag stays
    expect(out.length).toBeLessThan(input.length);
  });

  it('refuses a RIFF size longer than the file', () => {
    const broken = webp(VP8X).subarray(0, -4);

    expect(() => stripPhotoMetadata(broken, 'image/webp')).toThrow(ImageMetadataError);
  });
});

// ---- PDF and detection --------------------------------------------------------

describe('stripPhotoMetadata: PDF', () => {
  it('returns a PDF unchanged, because PDFs are not cleaned', () => {
    const pdf = new TextEncoder().encode('%PDF-1.7\n/Author (GPSLatitude)\n%%EOF');

    expect(stripPhotoMetadata(pdf, 'application/pdf')).toBe(pdf);
  });
});

describe('detectDocumentType', () => {
  const heic = bytesOf([0, 0, 0, 0x18], text('ftypheic'), [0, 0, 0, 0], text('mif1heic'));

  it('reads the type from the first bytes', () => {
    expect(detectDocumentType(jpeg(APP0))).toBe('image/jpeg');
    expect(detectDocumentType(png(IHDR))).toBe('image/png');
    expect(detectDocumentType(webp(VP8X))).toBe('image/webp');
    expect(detectDocumentType(new TextEncoder().encode('%PDF-1.4'))).toBe('application/pdf');
    expect(detectDocumentType(heic)).toBe('image/heic');
  });

  it('answers null for anything else, and for bytes that do not match a declared type', () => {
    expect(detectDocumentType(new TextEncoder().encode('texto simples'))).toBeNull();
    expect(detectDocumentType(new Uint8Array())).toBeNull();
    // A PNG declared as a JPEG is detected as PNG, so the caller can refuse the mismatch
    expect(detectDocumentType(png(IHDR))).not.toBe('image/jpeg');
  });
});
