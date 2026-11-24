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
  const open = (url: string) => {
    const route = routeFromAppUrl(url, (import.meta.env.VITE_SITE_URL ?? '').trim() || null);
    if (route) window.location.hash = route;
  };
  await App.addListener('appUrlOpen', ({ url }) => open(url));
  // appUrlOpen only fires while the app is running: a link tapped with the app closed (a cold start) arrives
  // as the launch URL
  try {
    const launch = await App.getLaunchUrl();
    if (launch?.url) open(launch.url);
  } catch {
    // No launch link, or the platform cannot say: the app simply opens on its first screen
  }
};
