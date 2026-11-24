import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', async importOriginal => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return { ...actual, createClient: vi.fn(actual.createClient) };
});

// A session in the URL hash, as the implicit flow delivers it. The tokens belong to
// some other account: the app must not install them just because they are in the link.
const FOREIGN_SESSION_HASH =
  '#access_token=foreign-access-token&refresh_token=foreign-refresh-token&expires_in=3600' +
  '&expires_at=4102444800&token_type=bearer&type=magiclink';

const foreignUserResponse = (): Response =>
  new Response(
    JSON.stringify({ id: 'foreign-user', aud: 'authenticated', email: 'outra@example.com', app_metadata: {}, user_metadata: {} }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

describe('supabase client sign-in callbacks', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_TESTKEY');
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
    localStorage.clear();
  });

  it('creates the client with the PKCE flow and keeps the URL detection the callback needs', async () => {
    await import('../lib/supabase');
    const { createClient } = await import('@supabase/supabase-js');
    expect(vi.mocked(createClient)).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'sb_publishable_TESTKEY',
      expect.objectContaining({ auth: expect.objectContaining({ flowType: 'pkce', detectSessionInUrl: true }) }),
    );
  });

  it('does not install a session from tokens in the URL hash', async () => {
    window.history.replaceState(null, '', `/conta${FOREIGN_SESSION_HASH}`);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (String(input).endsWith('/auth/v1/user') ? foreignUserResponse() : new Response('{}', { status: 404 }))));

    const { supabase } = await import('../lib/supabase');
    expect(supabase).not.toBeNull();
    const { data } = await supabase!.auth.getSession();
    expect(data.session).toBeNull();
  });
});
