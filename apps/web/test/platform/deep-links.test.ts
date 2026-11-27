import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeFromAppUrl } from '../../platform/deepLinks';

const SITE = 'https://workeasy.example';

describe('routeFromAppUrl', () => {
  it('preserves a trusted-trip fragment only on its own route', () => {
    const token='a'.repeat(64);
    expect(routeFromAppUrl(SITE+'/corridas/convite#convite='+token,SITE)).toBe('/corridas/convite#convite='+token);
    expect(routeFromAppUrl(SITE+'/pedidos#convite='+token,SITE)).toBe('/pedidos');
  });
  it('turns a link to the site into the route of the app, with its query', () => {
    expect(routeFromAppUrl('https://workeasy.example/pedidos/8f3c', SITE)).toBe('/pedidos/8f3c');
    expect(routeFromAppUrl('https://workeasy.example/entrar?next=%2Fconta', SITE)).toBe('/entrar?next=%2Fconta');
    expect(routeFromAppUrl('https://workeasy.example', SITE)).toBe('/');
  });

  it('reads the route after "#" of a link copied from the app', () => {
    expect(routeFromAppUrl('https://workeasy.example/#/orcamento/abc', SITE)).toBe('/orcamento/abc');
  });

  it('refuses links that are not https links to the site', () => {
    expect(routeFromAppUrl('http://workeasy.example/pedidos', SITE)).toBeNull();
    expect(routeFromAppUrl('https://evil.example/pedidos', SITE)).toBeNull();
    expect(routeFromAppUrl('https://workeasy.example.evil.example/pedidos', SITE)).toBeNull();
    expect(routeFromAppUrl('workeasy://pedidos', SITE)).toBeNull();
    expect(routeFromAppUrl('not a url', SITE)).toBeNull();
  });

  it('never returns something the router could read as another origin', () => {
    expect(routeFromAppUrl('https://workeasy.example//evil.example/x', SITE)).toBeNull();
    expect(routeFromAppUrl('https://workeasy.example/#//evil.example', SITE)).toBeNull();
  });

  it('does nothing while the site address of the build is unknown', () => {
    expect(routeFromAppUrl('https://workeasy.example/pedidos', null)).toBeNull();
    expect(routeFromAppUrl('https://workeasy.example/pedidos', 'workeasy.example')).toBeNull();
  });
});

const shell = vi.hoisted(() => ({ isNativePlatform: vi.fn(), addListener: vi.fn(), exitApp: vi.fn(), getLaunchUrl: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: shell.isNativePlatform } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: shell.addListener, exitApp: shell.exitApp, getLaunchUrl: shell.getLaunchUrl } }));

describe('platform/native: links opened in the app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shell.addListener.mockResolvedValue({ remove: vi.fn() });
    shell.isNativePlatform.mockReturnValue(true);
    shell.getLaunchUrl.mockResolvedValue(undefined);
    vi.stubEnv('VITE_SITE_URL', SITE);
    window.location.hash = '';
  });
  afterEach(() => vi.unstubAllEnvs());

  const listener = async () => {
    const { initNativeShell } = await import('../../platform/native');
    await initNativeShell();
    const call = shell.addListener.mock.calls.find(([name]) => name === 'appUrlOpen');
    return call?.[1] as (event: { url: string }) => void;
  };

  it('opens the route of a link to the site', async () => {
    (await listener())({ url: 'https://workeasy.example/atendimentos/42' });
    expect(window.location.hash).toBe('#/atendimentos/42');
  });

  it('opens the route of the link that launched the app (a cold start has no appUrlOpen event)', async () => {
    shell.getLaunchUrl.mockResolvedValue({ url: 'https://workeasy.example/pedidos/9' });
    await listener();
    expect(window.location.hash).toBe('#/pedidos/9');
  });

  it('ignores a launch link to another host, and a failure to read it', async () => {
    shell.getLaunchUrl.mockResolvedValue({ url: 'https://evil.example/pedidos/9' });
    await listener();
    expect(window.location.hash).toBe('');
    shell.getLaunchUrl.mockRejectedValue(new Error('unavailable'));
    await listener();
    expect(window.location.hash).toBe('');
  });

  it('ignores a link to another host', async () => {
    (await listener())({ url: 'https://evil.example/atendimentos/42' });
    expect(window.location.hash).toBe('');
  });
});
