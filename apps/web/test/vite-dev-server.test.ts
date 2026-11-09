// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../vite.config';

type DevConfig = {
  server?: { host?: string | boolean; port?: number; strictPort?: boolean };
  plugins?: unknown[];
};

const LAUNCHER_ROUTE = '/__open-in-editor';

// The config is a function of the environment; this asks it for the dev server settings.
const devConfig = (): DevConfig =>
  (config as unknown as (env: { mode: string; command: 'serve'; isSsrBuild: boolean; isPreview: boolean }) => DevConfig)({
    mode: 'development',
    command: 'serve',
    isSsrBuild: false,
    isPreview: false,
  });

const flatten = (items: unknown[]): unknown[] => items.flatMap(item => (Array.isArray(item) ? flatten(item) : [item]));

describe('vite dev server', () => {
  let savedHost: string | undefined;

  beforeEach(() => {
    savedHost = process.env.VITE_DEV_HOST;
    delete process.env.VITE_DEV_HOST;
  });

  afterEach(() => {
    if (savedHost === undefined) delete process.env.VITE_DEV_HOST;
    else process.env.VITE_DEV_HOST = savedHost;
  });

  it('listens on localhost only by default, not on every network interface', () => {
    expect(devConfig().server?.host).toBe('localhost');
  });

  it('listens on another address only when VITE_DEV_HOST asks for it', () => {
    process.env.VITE_DEV_HOST = '0.0.0.0';
    expect(devConfig().server?.host).toBe('0.0.0.0');
  });

  it('treats an empty VITE_DEV_HOST as unset', () => {
    process.env.VITE_DEV_HOST = '  ';
    expect(devConfig().server?.host).toBe('localhost');
  });

  it('keeps port 3000 and fails instead of moving to another port', () => {
    expect(devConfig().server).toMatchObject({ port: 3000, strictPort: true });
  });

  it('answers the editor launcher route with 404 before Vite handles it', () => {
    const plugin = flatten(devConfig().plugins ?? []).find(
      (p): p is { name: string; configureServer: (server: unknown) => void } =>
        typeof p === 'object' && p !== null && (p as { name?: unknown }).name === 'block-open-in-editor',
    );
    expect(plugin).toBeDefined();

    const stack: Array<{ route: string; handle: (req: unknown, res: { statusCode: number; end: () => void }) => void }> = [];
    plugin!.configureServer({ middlewares: { stack } });

    const first = stack[0];
    expect(first?.route).toBe(LAUNCHER_ROUTE);
    const res = { statusCode: 200, end: vi.fn() };
    first.handle({}, res);
    expect(res.statusCode).toBe(404);
    expect(res.end).toHaveBeenCalled();
  });
});
