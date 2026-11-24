// Feature detection for notifications in the browser and in the native shells.
//
// Web push is NOT implemented in WorkEasy. There is no push subscription, no
// service-worker push handler and no server that sends push messages. What
// reaches a person today goes by WhatsApp or e-mail (docs/ARQUITETURA.md,
// "Notificações"). The detection below only tells the screen what this device
// could do later; it never asks for permission and never subscribes.

export const PUSH_NOTIFICATIONS_IMPLEMENTED = false as const;

export interface NotificationSupport {
  /** The Notification constructor exists (local notifications could be shown). */
  notificationApi: boolean;
  /** The Push API exists (a subscription could be created). */
  pushApi: boolean;
  /** A service worker can be registered (required for push on most platforms). */
  serviceWorker: boolean;
}

export const detectNotificationSupport = (): NotificationSupport => {
  const hasWindow = typeof window !== 'undefined';
  return {
    notificationApi: hasWindow && 'Notification' in window,
    pushApi: hasWindow && 'PushManager' in window,
    serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  };
};
