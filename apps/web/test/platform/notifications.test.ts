import { afterEach, describe, expect, it, vi } from 'vitest';
import { PUSH_NOTIFICATIONS_IMPLEMENTED, detectNotificationSupport } from '../../platform/notifications';

describe('platform/notifications', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
  });

  it('documents that web push is not implemented', () => {
    expect(PUSH_NOTIFICATIONS_IMPLEMENTED).toBe(false);
  });

  it('detects the Notification, Push and service worker APIs when they exist', () => {
    vi.stubGlobal('Notification', function Notification() {});
    vi.stubGlobal('PushManager', function PushManager() {});
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });

    expect(detectNotificationSupport()).toEqual({ notificationApi: true, pushApi: true, serviceWorker: true });
  });

  it('reports Notification and Push as missing when the runtime has neither', () => {
    const support = detectNotificationSupport();
    expect(support.notificationApi).toBe(false);
    expect(support.pushApi).toBe(false);
  });
});
