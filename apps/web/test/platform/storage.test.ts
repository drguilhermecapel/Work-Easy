import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKeyValueStore, localStore, sessionStore } from '../../platform/storage';

describe('platform/storage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores and reads strings in localStorage and sessionStorage', () => {
    expect(localStore.set('k', 'v1')).toBe(true);
    expect(localStore.get('k')).toBe('v1');
    expect(localStorage.getItem('k')).toBe('v1');

    expect(sessionStore.set('k', 'v2')).toBe(true);
    expect(sessionStore.get('k')).toBe('v2');
    expect(sessionStorage.getItem('k')).toBe('v2');
  });

  it('removes a key', () => {
    localStore.set('k', 'v');
    expect(localStore.remove('k')).toBe(true);
    expect(localStore.get('k')).toBeNull();
  });

  it('round-trips JSON values', () => {
    const draft = { description: 'Faxina', when: 'sábado', urgent: true };
    expect(sessionStore.setJson('pedido', draft)).toBe(true);
    expect(sessionStore.getJson<typeof draft>('pedido')).toEqual(draft);
  });

  it('returns null for a missing key or for JSON written by hand that does not parse', () => {
    expect(localStore.get('ausente')).toBeNull();
    expect(localStore.getJson('ausente')).toBeNull();
    localStorage.setItem('quebrado', '{não é json');
    expect(localStore.getJson('quebrado')).toBeNull();
  });

  it('never throws when the browser refuses to write (quota, private window)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    expect(() => localStore.set('k', 'v')).not.toThrow();
    expect(localStore.set('k', 'v')).toBe(false);
    expect(localStore.setJson('k', { a: 1 })).toBe(false);
  });

  it('never throws when the browser refuses to read or remove', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(localStore.get('k')).toBeNull();
    expect(localStore.getJson('k')).toBeNull();
    expect(localStore.remove('k')).toBe(false);
  });

  it('never throws when the storage object itself cannot be reached', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const store = createKeyValueStore('local');
    expect(store.get('k')).toBeNull();
    expect(store.set('k', 'v')).toBe(false);
    expect(store.remove('k')).toBe(false);
  });

  it('refuses to store values JSON cannot represent', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(localStore.setJson('k', circular)).toBe(false);
    expect(localStore.get('k')).toBeNull();
  });
});
