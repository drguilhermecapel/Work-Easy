import { Capacitor } from '@capacitor/core';

/**
 * Native-shell wiring for Android and iOS (Capacitor). On the website and in
 * the desktop app (Tauri) this does nothing.
 */
export const initNativeShell = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;

  // Without this, the Android back button closes the app instead of going
  // back one screen.
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });
};
