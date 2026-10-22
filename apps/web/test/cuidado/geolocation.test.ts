import { afterEach, describe, expect, it } from 'vitest';
import { LOCATION_MESSAGES, getCurrentPosition, locate } from '../../platform/geolocation';
import { mockGeolocation, removeGeolocation } from './fake';

afterEach(() => removeGeolocation());

describe('platform/geolocation', () => {
  it('returns the position rounded to 6 decimals and asks for a precise, bounded reading', async () => {
    const mock = mockGeolocation({ lat: -23.5613449999, lng: -46.6565712345 });
    expect(await locate()).toEqual({ coords: { lat: -23.561345, lng: -46.656571 }, error: null });
    expect(mock.calls[0]).toMatchObject({ enableHighAccuracy: true, timeout: 10_000 });
  });

  it('gives no coordinates and a sentence in pt-BR when the user denies', async () => {
    mockGeolocation({ code: 1 });
    const result = await locate();
    expect(result.coords).toBeNull();
    expect(result.error).toBe(LOCATION_MESSAGES.denied);
    expect(result.error).toMatch(/bloqueada/);
    expect(await getCurrentPosition()).toBeNull();
  });

  it('tells apart an unavailable position and a timeout', async () => {
    mockGeolocation({ code: 2 });
    expect((await locate()).error).toBe(LOCATION_MESSAGES.unavailable);
    mockGeolocation({ code: 3 });
    expect((await locate()).error).toBe(LOCATION_MESSAGES.timeout);
  });

  it('works without the API (old WebView, blocked context)', async () => {
    removeGeolocation();
    expect(await locate()).toEqual({ coords: null, error: LOCATION_MESSAGES.unsupported });
  });

  it('never throws when the browser throws', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: () => {
          throw new Error('SecurityError');
        },
      },
    });
    expect(await locate()).toEqual({ coords: null, error: LOCATION_MESSAGES.unavailable });
  });

  it('refuses a position that is not a number', async () => {
    mockGeolocation({ lat: Number.NaN, lng: 1 });
    expect((await locate()).coords).toBeNull();
  });
});
