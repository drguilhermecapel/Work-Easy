import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', async () => {
  const { createAdminFake, current: world } = await import('./fake');
  return { supabase: createAdminFake(() => world.world), backendEnabled: true };
});

const { current } = await import('./fake');
const { fake, resetWorld } = await import('./harness');
const { createDocumentUrl } = await import('../../services/admin');

const PATH = 'provider-a-id/certidao.pdf';

describe('admin reads of a provider document (PRIV-01)', () => {
  beforeEach(() => {
    resetWorld();
    current.world.isAdmin = true;
  });

  it('records the view before it returns the link', async () => {
    const url = await createDocumentUrl(PATH);

    expect(fake.rpcCalls).toEqual([{ name: 'admin_log_document_view', args: { p_storage_path: PATH } }]);
    expect(fake.signedUrlCalls).toHaveLength(1);
    expect(url).toContain(PATH);
  });

  it('returns no link when the view cannot be recorded', async () => {
    current.world.isAdmin = false;

    await expect(createDocumentUrl(PATH)).rejects.toThrow();
    expect(fake.signedUrlCalls).toHaveLength(0);
  });
});
