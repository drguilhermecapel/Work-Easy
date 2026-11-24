import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import React, { Suspense, use } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import type { Root } from 'react-dom/client';
import { AuthProvider } from '../../contexts/AuthContext';
import AppShell from '../../AppShell';
import { HandoffPending, HandoffReady } from '../../components/HandoffMarks';
import { mountWithStaticHandoff } from '../../lib/staticHandoff';
import type { Inputs, Page, PrerenderModule } from './helpers';

// Demo mode even when a developer's .env.local configures Supabase (Vitest loads it like Vite)
vi.mock('../../lib/supabase', () => ({ supabase: null, backendEnabled: false }));

// The static page written by scripts/prerender.mjs stays on screen until React has the same route ready
// (lib/staticHandoff.tsx). React is not hydrated over it: it is mounted in a hidden container that takes the page's place.

const STATIC = '[data-prerendered]';
const roots: Root[] = [];

const rootWith = (html: string): HTMLElement => {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  return document.getElementById('root')!;
};

// Async act: a tree that suspends on its first render is resumed by React only when the mount is awaited
const mount = async (root: HTMLElement, tree: React.ReactNode, options?: Parameters<typeof mountWithStaticHandoff>[2]): Promise<void> => {
  await act(async () => {
    roots.push(mountWithStaticHandoff(root, tree, options));
  });
};

/** A promise the test resolves by hand, and a component that suspends on it. */
const gate = (): { open: () => Promise<void>; Suspender: React.FC<{ children?: React.ReactNode }> } => {
  let release!: () => void;
  const promise = new Promise<void>(resolve => {
    release = resolve;
  });
  const Suspender: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    use(promise);
    return <>{children}</>;
  };
  return { open: () => act(async () => release()), Suspender };
};

const STATIC_HTML = '<main data-prerendered="area"><h1>Texto estático</h1><a href="/servicos/diarista">Diarista</a><a href="/servicos/pedreiro">Pedreiro</a></main>';

afterEach(() => {
  act(() => roots.splice(0).forEach(root => root.unmount()));
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('mountWithStaticHandoff', () => {
  it('mounts straight on #root when there is no static page (every other route)', async () => {
    const root = rootWith('');
    await mount(root, <p>app</p>);
    expect(root.textContent).toBe('app');
    expect(root.querySelector('div[hidden]')).toBeNull();
  });

  it('mounts straight on #root when the handoff is off, even with a static page in it (native shells)', async () => {
    const root = rootWith(STATIC_HTML);
    await mount(root, <p>app</p>, { enabled: false });
    expect(root.textContent).toBe('app');
    expect(root.querySelector(STATIC)).toBeNull();
  });

  it('keeps the static page, untouched, while the lazy page of the route is not in', async () => {
    const root = rootWith(STATIC_HTML);
    const staticMain = root.querySelector(STATIC);
    const { open, Suspender } = gate();
    await mount(
      root,
      <Suspense fallback={<p role="status">Carregando…</p>}>
        <Suspender>
          <h1>Página do React</h1>
        </Suspender>
        <HandoffReady />
      </Suspense>,
    );

    // The fallback is in the hidden container; the visitor still sees the static page, the very same node
    expect(root.querySelector(STATIC)).toBe(staticMain);
    expect(root.querySelector('div[hidden]')?.textContent).toContain('Carregando…');

    await open();
    await waitFor(() => expect(root.querySelector(STATIC)).toBeNull());
    expect(root.querySelector('div[hidden]')).toBeNull();
    expect(root.querySelector('h1')?.textContent).toBe('Página do React');
    expect(root.textContent).not.toContain('Carregando');
  });

  it('keeps the static page while a boundary inside the page (the rules of the area) is still pending', async () => {
    const root = rootWith(STATIC_HTML);
    const { open, Suspender } = gate();
    await mount(
      root,
      <Suspense fallback={<p role="status">Carregando…</p>}>
        <h1>Página do React</h1>
        <Suspense fallback={<HandoffPending />}>
          <Suspender>
            <p>Regras</p>
          </Suspender>
        </Suspense>
        <HandoffReady />
      </Suspense>,
    );

    // The page of the route is in (its h1 exists) but the rules are not: the static page, which has them, stays
    await act(async () => {
      await Promise.resolve();
    });
    expect(root.querySelector('div[hidden] h1')?.textContent).toBe('Página do React');
    expect(root.querySelector(STATIC)).not.toBeNull();

    await open();
    await waitFor(() => expect(root.querySelector(STATIC)).toBeNull());
    expect(root.querySelector('h1')?.textContent).toBe('Página do React');
    expect(root.textContent).toContain('Regras');
  });

  it('swaps at once when the route has nothing pending (a page that is not lazy)', async () => {
    const root = rootWith(STATIC_HTML);
    await mount(
      root,
      <>
        <h1>Página do React</h1>
        <HandoffReady />
      </>,
    );
    await waitFor(() => expect(root.querySelector(STATIC)).toBeNull());
    expect(root.querySelector('div[hidden]')).toBeNull();
  });

  it('moves the focus of a link of the static page to the same link of the new page', async () => {
    const root = rootWith(STATIC_HTML);
    const { open, Suspender } = gate();
    await mount(
      root,
      <Suspense fallback={null}>
        <Suspender>
          <main>
            <a href="/servicos/diarista">Diarista</a>
            <a href="/servicos/pedreiro">Pedreiro</a>
          </main>
        </Suspender>
        <HandoffReady />
      </Suspense>,
    );
    const staticLink = root.querySelector<HTMLAnchorElement>(`${STATIC} a[href="/servicos/pedreiro"]`)!;
    staticLink.focus();
    expect(document.activeElement).toBe(staticLink);

    await open();
    await waitFor(() => expect(root.querySelector(STATIC)).toBeNull());
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.getAttribute('href')).toBe('/servicos/pedreiro');
    expect(root.contains(document.activeElement)).toBe(true);
  });

  it('looks for the twin of the focused link inside <main> first, not in the bar of the app that comes before it', async () => {
    const root = rootWith('<main data-prerendered="area"><a href="/categorias">Categorias</a><a href="/servicos/diarista">Diarista</a></main>');
    const { open, Suspender } = gate();
    await mount(
      root,
      <Suspense fallback={null}>
        <Suspender>
          <header>
            <nav>
              <a href="/categorias">Categorias</a>
            </nav>
          </header>
          <main tabIndex={-1}>
            <a href="/categorias">Categorias</a>
            <a href="/servicos/diarista">Diarista</a>
          </main>
        </Suspender>
        <HandoffReady />
      </Suspense>,
    );
    root.querySelector<HTMLAnchorElement>(`${STATIC} a[href="/categorias"]`)!.focus();
    await open();
    await waitFor(() => expect(root.querySelector(STATIC)).toBeNull());
    expect(document.activeElement?.getAttribute('href')).toBe('/categorias');
    expect(document.activeElement?.closest('main')).not.toBeNull();
    expect(document.activeElement?.closest('header')).toBeNull();
  });

  it('falls back to a twin outside <main> when <main> has none', async () => {
    const root = rootWith('<main data-prerendered="area"><a href="/categorias">Categorias</a></main>');
    const { open, Suspender } = gate();
    await mount(
      root,
      <Suspense fallback={null}>
        <Suspender>
          <header>
            <a href="/categorias">Categorias</a>
          </header>
          <main tabIndex={-1}>
            <h1>Página do React</h1>
          </main>
        </Suspender>
        <HandoffReady />
      </Suspense>,
    );
    root.querySelector<HTMLAnchorElement>(`${STATIC} a`)!.focus();
    await open();
    await waitFor(() => expect(root.querySelector(STATIC)).toBeNull());
    expect(document.activeElement?.tagName).toBe('A');
    expect(document.activeElement?.closest('header')).not.toBeNull();
  });

  it('puts the focus on <main> when the link it was on has no twin in the new page', async () => {
    const root = rootWith(STATIC_HTML);
    const { open, Suspender } = gate();
    await mount(
      root,
      <Suspense fallback={null}>
        <Suspender>
          <main tabIndex={-1}>
            <h1>Página do React</h1>
          </main>
        </Suspender>
        <HandoffReady />
      </Suspense>,
    );
    root.querySelector<HTMLAnchorElement>(`${STATIC} a`)!.focus();
    await open();
    await waitFor(() => expect(root.querySelector(STATIC)).toBeNull());
    expect(document.activeElement?.tagName).toBe('MAIN');
  });

  it('does not move the focus that was somewhere else', async () => {
    const root = rootWith(STATIC_HTML);
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const { open, Suspender } = gate();
    await mount(
      root,
      <Suspense fallback={null}>
        <Suspender>
          <main>
            <h1>Página do React</h1>
          </main>
        </Suspender>
        <HandoffReady />
      </Suspense>,
    );
    await open();
    await waitFor(() => expect(root.querySelector(STATIC)).toBeNull());
    expect(document.activeElement).toBe(outside);
  });

  it('keeps the scroll position of the visitor', async () => {
    const root = rootWith(STATIC_HTML);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 420 });
    const { open, Suspender } = gate();
    await mount(
      root,
      <Suspense fallback={null}>
        <Suspender>
          <h1>Página do React</h1>
        </Suspender>
        <HandoffReady />
      </Suspense>,
    );
    await open();
    await waitFor(() => expect(root.querySelector(STATIC)).toBeNull());
    expect(scrollTo).toHaveBeenCalledWith(0, 420);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  it('swaps anyway after the timeout, so a chunk that never loads does not leave the static page frozen forever', async () => {
    vi.useFakeTimers();
    const root = rootWith(STATIC_HTML);
    const { Suspender } = gate();
    await mount(
      root,
      <Suspense fallback={<p role="status">Carregando…</p>}>
        <Suspender />
        <HandoffReady />
      </Suspense>,
      { timeoutMs: 5000 },
    );
    vi.advanceTimersByTime(4999);
    expect(root.querySelector(STATIC)).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    expect(root.querySelector(STATIC)).toBeNull();
    expect(root.querySelector('div[hidden]')).toBeNull();
  });

  it('swaps only once, and the components that report readiness do nothing when there was no static page', async () => {
    const root = rootWith('');
    await mount(
      root,
      <Suspense fallback={<HandoffPending />}>
        <h1>Sem página estática</h1>
        <HandoffReady />
      </Suspense>,
    );
    expect(root.querySelector('h1')?.textContent).toBe('Sem página estática');
    expect(root.querySelector('div[hidden]')).toBeNull();
  });
});

// The real app on the real static pages: at the moment the static page leaves, the same route is on screen
// in React, complete (no "Carregando…", the rules of the area are in), and nothing was blank before.
const ROOT = process.cwd();
let mod: PrerenderModule;
let inputs: Inputs;

beforeAll(async () => {
  mod = (await import(pathToFileURL(join(ROOT, 'scripts', 'prerender.mjs')).href)) as PrerenderModule;
  inputs = mod.loadInputs(ROOT, () => {});
}, 30_000);

describe('the app behind the static pages of the build', () => {
  const swapAt = async (path: string, ready: (host: HTMLElement) => boolean): Promise<{ before: string }> => {
    const page: Page | undefined = mod.buildPages({ ...inputs, siteUrl: '', canRequest: false, warn: () => {} }).find(p => p.path === path);
    expect(page, `static page for ${path}`).toBeDefined();
    window.history.pushState({}, '', path);
    const root = rootWith(page!.body);
    const staticMain = root.querySelector(STATIC)!;
    const staticText = staticMain.textContent;

    // Every change of #root is looked at as it happens: when the static page is gone, React must be complete
    let snapshot: { complete: boolean; fallback: boolean } | null = null;
    const observer = new MutationObserver(() => {
      if (snapshot || root.contains(staticMain)) return;
      const host = root.querySelector('div');
      snapshot = { complete: !!host && !host.hidden && ready(host), fallback: !!host?.querySelector('[role="status"]:not(.sr-only)') };
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true });

    act(() => {
      roots.push(
        mountWithStaticHandoff(
          root,
          <AuthProvider>
            <BrowserRouter>
              <AppShell />
            </BrowserRouter>
          </AuthProvider>,
        ),
      );
    });
    await waitFor(() => expect(root.contains(staticMain)).toBe(false), { timeout: 15_000 });
    await act(async () => {
      await Promise.resolve();
    });
    observer.disconnect();
    expect(snapshot, 'the swap was observed').not.toBeNull();
    expect(snapshot!.fallback, 'a loading fallback was on screen at the swap').toBe(false);
    expect(snapshot!.complete, 'the React page was complete when the static one left').toBe(true);
    return { before: staticText ?? '' };
  };

  it('/categorias/limpeza: the static page leaves only when the list and the rules sentence are in React', async () => {
    await swapAt('/categorias/limpeza', host => !!host.querySelector('h1') && /tem \d+ serviços? no WorkEasy/.test(host.textContent ?? ''));
  }, 30_000);

  it('/servicos/diarista: it leaves only when the rules sections are in React', async () => {
    await swapAt('/servicos/diarista', host => !!host.querySelector('h1') && !!host.querySelector('h2') && /Profissão regulamentada\?/.test(host.textContent ?? ''));
  }, 30_000);

  it('/servicos/diarista/moema: it leaves only when the rules sections are in React', async () => {
    await swapAt('/servicos/diarista/moema', host => !!host.querySelector('h1') && /Profissão regulamentada\?/.test(host.textContent ?? ''));
  }, 30_000);
});
