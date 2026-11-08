import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureFile, pickFile } from '../../platform/files';

const fileInputs = (): HTMLInputElement[] => Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));

/**
 * jsdom does not open a file chooser. The click is intercepted to get the
 * input the adapter created, and the test then plays the person's choice.
 */
const interceptChooser = (): { onClick: (fn: (input: HTMLInputElement) => void) => void } => {
  let handler: ((input: HTMLInputElement) => void) | null = null;
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
    handler?.(this);
  });
  return {
    onClick: fn => {
      handler = fn;
    },
  };
};

const chooseFile = (input: HTMLInputElement, file: File | null): void => {
  Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
  input.dispatchEvent(new Event('change'));
};

describe('platform/files', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('opens a file input with the accept list and resolves with the chosen File', async () => {
    const chooser = interceptChooser();
    const pdf = new File(['%PDF-1.4'], 'cpf.pdf', { type: 'application/pdf' });
    chooser.onClick(input => chooseFile(input, pdf));

    const result = pickFile({ accept: 'image/jpeg,application/pdf' });

    await expect(result).resolves.toBe(pdf);
    expect(HTMLInputElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  it('sets the accept attribute and no capture attribute for a plain pick', async () => {
    const seen: Array<{ accept: string; capture: string | null; multiple: boolean }> = [];
    const chooser = interceptChooser();
    chooser.onClick(input => {
      seen.push({ accept: input.accept, capture: input.getAttribute('capture'), multiple: input.multiple });
      chooseFile(input, null);
    });

    await pickFile({ accept: 'image/png' });

    expect(seen).toEqual([{ accept: 'image/png', capture: null, multiple: false }]);
  });

  it('asks for the camera with capture when a facing is given', async () => {
    const seen: Array<string | null> = [];
    const chooser = interceptChooser();
    chooser.onClick(input => {
      seen.push(input.getAttribute('capture'));
      chooseFile(input, null);
    });

    await captureFile({ accept: 'image/jpeg' });
    await captureFile({ accept: 'image/jpeg', facing: 'user' });

    expect(seen).toEqual(['environment', 'user']);
  });

  it('resolves null when the person cancels and removes the input afterwards', async () => {
    const chooser = interceptChooser();
    chooser.onClick(input => input.dispatchEvent(new Event('cancel')));

    await expect(pickFile({ accept: 'image/*' })).resolves.toBeNull();
    expect(fileInputs()).toHaveLength(0);
  });

  it('resolves null when the chooser has no file in the list', async () => {
    const chooser = interceptChooser();
    chooser.onClick(input => chooseFile(input, null));

    await expect(pickFile({ accept: 'image/*' })).resolves.toBeNull();
  });

  it('resolves null, and does not throw, when the browser refuses to open the chooser', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {
      throw new DOMException('Not allowed without a user gesture', 'NotAllowedError');
    });

    await expect(pickFile({ accept: 'image/*' })).resolves.toBeNull();
    expect(fileInputs()).toHaveLength(0);
  });

  it('settles only once when the browser fires both change and cancel', async () => {
    const chooser = interceptChooser();
    const jpg = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    chooser.onClick(input => {
      chooseFile(input, jpg);
      input.dispatchEvent(new Event('cancel'));
    });

    await expect(pickFile({ accept: 'image/jpeg' })).resolves.toBe(jpg);
  });
});
