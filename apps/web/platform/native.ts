import { Capacitor } from '@capacitor/core';
import { routeFromAppUrl } from './deepLinks';

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

  // A link to the site that the system opened in the app (App Links, Universal Links) goes to
  // its route. The native build uses hash URLs, so the route is set after "#".
  await App.addListener('appUrlOpen', ({ url }) => {
    const route = routeFromAppUrl(url, (import.meta.env.VITE_SITE_URL ?? '').trim() || null);
    if (route) window.location.hash = route;
  });
};
