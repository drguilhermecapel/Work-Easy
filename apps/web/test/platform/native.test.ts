import { beforeEach, describe, expect, it, vi } from 'vitest';

const shell = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  addListener: vi.fn(),
  exitApp: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: shell.isNativePlatform } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: shell.addListener, exitApp: shell.exitApp } }));

import { initNativeShell } from '../../platform/native';

type BackButtonListener = (event: { canGoBack: boolean }) => void;

describe('platform/native: Android back button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shell.addListener.mockResolvedValue({ remove: vi.fn() });
  });

  it('does nothing on the website and in the desktop app', async () => {
    shell.isNativePlatform.mockReturnValue(false);

    await initNativeShell();

    expect(shell.addListener).not.toHaveBeenCalled();
  });

  it('goes back one screen when the app has history to go back to', async () => {
    shell.isNativePlatform.mockReturnValue(true);
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

    await initNativeShell();
    const listener = shell.addListener.mock.calls[0]?.[1] as BackButtonListener;
    expect(shell.addListener.mock.calls[0]?.[0]).toBe('backButton');

    listener({ canGoBack: true });

    expect(back).toHaveBeenCalledTimes(1);
    expect(shell.exitApp).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('exits the app from the first screen', async () => {
    shell.isNativePlatform.mockReturnValue(true);
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

    await initNativeShell();
    const listener = shell.addListener.mock.calls[0]?.[1] as BackButtonListener;

    listener({ canGoBack: false });

    expect(shell.exitApp).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });
});
