// Stand-in for the browser's file download (object URL + anchor click), so a test can read what would have been saved.
// Imports no app code.
import { vi } from 'vitest';

export interface Download {
  filename: string;
  blob: Blob;
}

/** Records every download until the test ends (restoreAllMocks in test/setup.ts puts the anchor click back). */
export const captureDownloads = (): Download[] => {
  const downloads: Download[] = [];
  const blobs = new Map<string, Blob>();
  let count = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: (blob: Blob) => {
      const url = `blob:test/${count++}`;
      blobs.set(url, blob);
      return url;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: () => undefined });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
    downloads.push({ filename: this.download, blob: blobs.get(this.href) as Blob });
  });
  return downloads;
};

const read = <T>(start: (reader: FileReader) => void): Promise<T> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T);
    reader.onerror = () => reject(reader.error);
    start(reader);
  });

/** The text of the file as a spreadsheet would decode it (the byte order mark is consumed by the decoding). */
export const blobText = (blob: Blob): Promise<string> => read<string>(reader => reader.readAsText(blob));

/** The first bytes of the file, to check the byte order mark. */
export const blobHead = async (blob: Blob, count = 3): Promise<number[]> =>
  Array.from(new Uint8Array(await read<ArrayBuffer>(reader => reader.readAsArrayBuffer(blob.slice(0, count)))));
