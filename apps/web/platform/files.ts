// Chooses a file, or takes a photo with the camera, through a hidden
// <input type="file">. That input is the only route that works the same on the
// website, in the Android/iOS WebViews and in the desktop app. The promise
// resolves with the File, or with null when the person cancels or the browser
// refuses to open the chooser. It never throws.

export type CaptureFacing = 'environment' | 'user';

export interface PickFileOptions {
  /** As in the accept attribute, e.g. "image/jpeg,application/pdf". */
  accept: string;
  /** Opens the camera on phones instead of the file list. Ignored on desktops. */
  capture?: CaptureFacing;
}

const buildFileInput = ({ accept, capture }: PickFileOptions): HTMLInputElement => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = false;
  input.hidden = true;
  if (capture) input.setAttribute('capture', capture);
  return input;
};

/** Opens the chooser and resolves with the single file the person picked, or null. */
export const pickFile = (options: PickFileOptions): Promise<File | null> =>
  new Promise(resolve => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = buildFileInput(options);
    let settled = false;
    const finish = (file: File | null): void => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    // Browsers that fire `cancel` when the chooser closes without a choice
    input.addEventListener('cancel', () => finish(null));
    document.body.append(input);
    try {
      input.click();
    } catch {
      // Some browsers refuse to open the chooser outside a user gesture
      finish(null);
    }
  });

/** Opens the camera on phones (back camera by default) and resolves with the photo, or null. */
export const captureFile = (options: Omit<PickFileOptions, 'capture'> & { facing?: CaptureFacing }): Promise<File | null> =>
  pickFile({ accept: options.accept, capture: options.facing ?? 'environment' });
