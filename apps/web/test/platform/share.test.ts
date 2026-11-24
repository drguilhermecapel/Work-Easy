import { afterEach, describe, expect, it, vi } from 'vitest';
import { canUseWebShare, sharePayload } from '../../platform/share';

type NavigatorLike = Partial<Pick<Navigator, 'share' | 'canShare' | 'clipboard'>>;

const setNavigator = (patch: NavigatorLike): void => {
  for (const [key, value] of Object.entries(patch)) {
    Object.defineProperty(navigator, key, { value, configurable: true });
  }
};

const clearNavigator = (): void => {
  for (const key of ['share', 'canShare', 'clipboard']) {
    Object.defineProperty(navigator, key, { value: undefined, configurable: true });
  }
};

const abortError = (): DOMException => new DOMException('Share canceled', 'AbortError');

describe('platform/share', () => {
  afterEach(() => {
    clearNavigator();
    vi.restoreAllMocks();
  });

  it('uses the system share sheet when the device offers it', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share });
    expect(canUseWebShare()).toBe(true);

    const outcome = await sharePayload({ title: 'WorkEasy', text: 'Olha esse profissional', url: 'https://workeasy.example/p/1' });

    expect(outcome).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'WorkEasy', text: 'Olha esse profissional', url: 'https://workeasy.example/p/1' });
  });

  it('leaves out title and url when they are not given', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share });
    await sharePayload({ text: 'Só texto' });
    expect(share).toHaveBeenCalledWith({ text: 'Só texto' });
  });

  it('reports cancelled when the person closes the sheet, without copying', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share: vi.fn().mockRejectedValue(abortError()), clipboard: { writeText } as unknown as Clipboard });

    expect(await sharePayload({ text: 'Oi' })).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the text, with the link, when the sheet is not available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ clipboard: { writeText } as unknown as Clipboard });

    expect(await sharePayload({ text: 'Orçamento de R$ 120', url: 'https://workeasy.example/o/abc' })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('Orçamento de R$ 120\nhttps://workeasy.example/o/abc');
  });

  it('copies the text when the share sheet fails for another reason', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share: vi.fn().mockRejectedValue(new TypeError('Invalid data')), clipboard: { writeText } as unknown as Clipboard });

    expect(await sharePayload({ text: 'Oi' })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('Oi');
  });

  it('skips the sheet when canShare refuses the data and copies instead', async () => {
    const share = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share, canShare: vi.fn().mockReturnValue(false), clipboard: { writeText } as unknown as Clipboard });

    expect(await sharePayload({ text: 'Oi' })).toBe('copied');
    expect(share).not.toHaveBeenCalled();
  });

  it('reports unavailable when neither the sheet nor the clipboard works', async () => {
    setNavigator({ clipboard: { writeText: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')) } as unknown as Clipboard });
    expect(await sharePayload({ text: 'Oi' })).toBe('unavailable');

    clearNavigator();
    expect(await sharePayload({ text: 'Oi' })).toBe('unavailable');
  });

  it('never throws', async () => {
    setNavigator({ share: () => {
      throw new Error('boom');
    } });
    await expect(sharePayload({ text: 'Oi' })).resolves.toBe('unavailable');
  });
});
