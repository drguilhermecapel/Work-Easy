// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { verifyPagesProject, verifyPublicRevision } from '../../scripts/cloudflare-pages-release.mjs';

const env = {
  CLOUDFLARE_ACCOUNT_ID: 'account-id',
  CLOUDFLARE_PAGES_PROJECT: 'workeasy-app',
  CLOUDFLARE_API_TOKEN: 'test-token',
  VITE_SITE_URL: 'https://workeasy-app.pages.dev',
};
const project = {
  name: env.CLOUDFLARE_PAGES_PROJECT,
  production_branch: 'main',
  subdomain: 'workeasy-app.pages.dev',
  domains: ['workeasy-app.pages.dev', 'app.example.com'],
};
const success = (result: object) => Response.json({ success: true, result });

describe('Pages release verification', () => {
  it('reports only the names of missing Pages settings before making a request', async () => {
    const request = vi.fn<typeof fetch>();
    const incomplete = { ...env, CLOUDFLARE_ACCOUNT_ID: '', CLOUDFLARE_PAGES_PROJECT: '' };
    await expect(verifyPagesProject(incomplete, request))
      .rejects.toThrow(/^Configure no ambiente production: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_PAGES_PROJECT\.$/);
    expect(request).not.toHaveBeenCalled();
  });

  it('accepts a Pages subdomain only for the configured production project and branch', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(success(project))
      .mockResolvedValueOnce(success({ ...project, production_branch: 'preview' }));
    await expect(verifyPagesProject(env, request)).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account-id/pages/projects/workeasy-app',
      expect.objectContaining({ redirect: 'error' }),
    );
    await expect(verifyPagesProject(env, request)).rejects.toThrow(/branch de produção/);
  });

  it('requires the custom domain to be associated and active', async () => {
    const custom = { ...env, VITE_SITE_URL: 'https://app.example.com' };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(success(project))
      .mockResolvedValueOnce(success({ name: 'app.example.com', status: 'pending' }))
      .mockResolvedValueOnce(success(project))
      .mockResolvedValueOnce(success({ name: 'app.example.com', status: 'active' }))
      .mockResolvedValueOnce(success(project));
    await expect(verifyPagesProject(custom, request)).rejects.toThrow(/ainda não está ativo/);
    await expect(verifyPagesProject(custom, request)).resolves.toBeUndefined();
    await expect(verifyPagesProject({ ...env, VITE_SITE_URL: 'https://other.pages.dev' }, request))
      .rejects.toThrow(/não está associado/);
  });

  it('requires the public origin to serve the exact revision without redirects', async () => {
    const commit = 'a'.repeat(40);
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ commit: 'b'.repeat(40) }))
      .mockResolvedValueOnce(Response.json({ commit }));
    await expect(verifyPublicRevision(env.VITE_SITE_URL, commit, request)).rejects.toThrow(/a revisão desta publicação/);
    await expect(verifyPublicRevision(env.VITE_SITE_URL, commit, request)).resolves.toBeUndefined();
    const [url, options] = request.mock.calls[0];
    expect(String(url)).toBe(`${env.VITE_SITE_URL}/.well-known/workeasy-release.json?commit=${commit}`);
    expect(options?.redirect).toBe('error');
    expect(options?.headers).not.toHaveProperty('Authorization');
  });
});
