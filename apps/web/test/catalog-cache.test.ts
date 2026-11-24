import { afterEach, describe, expect, it, vi } from 'vitest';

// A rules chunk that fails to load (the network drops, a deploy replaces the files) must not stay failed
// for the whole session: the next ask tries again.

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('virtual:policies-by-area');
});

describe('catalog rules loading', () => {
  it('asks again after a failed load instead of remembering the failure', async () => {
    let attempts = 0;
    vi.doMock('virtual:policies-by-area', () => ({
      default: {
        limpeza: () => {
          attempts += 1;
          return attempts === 1 ? Promise.reject(new Error('Failed to fetch')) : Promise.resolve({ default: { diarista: { regulated: false } } });
        },
      },
    }));
    const { loadAreaPolicies } = await import('../catalog');
    await expect(loadAreaPolicies('limpeza')).rejects.toThrow('Failed to fetch');
    await expect(loadAreaPolicies('limpeza')).resolves.toEqual({ diarista: { regulated: false } });
    expect(attempts).toBe(2);
  });

  it('forgets a failure of the index module too', async () => {
    let attempts = 0;
    vi.doMock('virtual:policies-by-area', () => {
      attempts += 1;
      if (attempts === 1) throw new Error('index chunk failed');
      return { default: { limpeza: () => Promise.resolve({ default: { diarista: {} } }) } };
    });
    const { loadAreaPolicies } = await import('../catalog');
    await expect(loadAreaPolicies('limpeza')).rejects.toThrow();
    await expect(loadAreaPolicies('limpeza')).resolves.toEqual({ diarista: {} });
  });

  it('shares one load between callers while it is going on, and keeps a good result', async () => {
    let attempts = 0;
    vi.doMock('virtual:policies-by-area', () => ({
      default: { limpeza: () => (attempts += 1, Promise.resolve({ default: { diarista: {} } })) },
    }));
    const { loadAreaPolicies } = await import('../catalog');
    const [a, b] = await Promise.all([loadAreaPolicies('limpeza'), loadAreaPolicies('limpeza')]);
    expect(a).toBe(b);
    await loadAreaPolicies('limpeza');
    expect(attempts).toBe(1);
  });

  it('loadPolicies forgets a failure too, and merges every area when it works', async () => {
    let fail = true;
    vi.doMock('virtual:policies-by-area', () => ({
      default: {
        'area-a': () => (fail ? Promise.reject(new Error('offline')) : Promise.resolve({ default: { servico_a: { a: 1 } } })),
        'area-b': () => Promise.resolve({ default: { servico_b: { b: 2 } } }),
      },
    }));
    const { loadPolicies } = await import('../catalog');
    await expect(loadPolicies()).rejects.toThrow('offline');
    fail = false;
    await expect(loadPolicies()).resolves.toEqual({ servico_a: { a: 1 }, servico_b: { b: 2 } });
  });
});
