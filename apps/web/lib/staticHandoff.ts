import { useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// The content pages (areas, services, neighborhoods, /categorias) reach the browser as static HTML that
// scripts/prerender.mjs wrote into <div id="root">. The React app is not hydrated over it (the markup of the
// two is not identical), so mounting React straight into #root made it throw the static page away and show the
// "Carregando…" fallback until the route chunk and the rules of the area arrived: the biggest block of text
// was recreated, and a lab that follows the paint of the final DOM (Lighthouse) counts the LCP from there.
//
// Here React is mounted in a hidden sibling of the static page. The static page stays on screen, untouched,
// until the route has its first useful render (the lazy page is in and the rules it waits for are in), and
// only then is it swapped for the React tree in one step. See docs/arquitetura/seo-pwa.md, section 10.1.
//
// When the React tree fails before the swap (a route chunk that does not load, a crash caught by the
// ErrorBoundary), the swap is called off: the readable static page stays and a discreet notice offers a reload.

/** The page scripts/prerender.mjs writes: the only child of #root that is static content. */
const STATIC_PAGE = ':scope > main[data-prerendered]';

/** How long the static page may wait for React before the swap happens anyway (a chunk that never loads, a crash). */
export const HANDOFF_TIMEOUT_MS = 15_000;

interface Handoff {
  routeReady: boolean;
  /** Boundaries still showing a fallback inside the route (the rules of the area, for instance). */
  pending: number;
  reveal: () => void;
  /** Calls the swap off for good: the static page stays, with the reload notice. */
  fail: () => void;
}

let current: Handoff | null = null;

const settle = (handoff: Handoff): void => {
  // After the whole commit: the effects of one commit run in sequence, and the answer is only known after the last one.
  queueMicrotask(() => {
    if (handoff.routeReady && handoff.pending === 0) handoff.reveal();
  });
};

/**
 * Effect of `HandoffReady` (components/HandoffMarks.tsx), rendered once in the same Suspense boundary as the
 * routes: it runs when the route's page is there (a boundary that is still showing its fallback has not mounted
 * its other children). Does nothing when the app was not mounted behind a static page.
 */
export const useHandoffReady = (): void => {
  useEffect(() => {
    const handoff = current;
    if (!handoff) return undefined;
    handoff.routeReady = true;
    settle(handoff);
    return () => {
      handoff.routeReady = false;
    };
  }, []);
};

/**
 * Effect of `HandoffPending` (components/HandoffMarks.tsx), put in the fallback of a Suspense boundary inside a
 * page whose content is part of the static page (the rules of an area): while it is mounted, the static page stays.
 */
export const useHandoffPending = (): void => {
  useEffect(() => {
    const handoff = current;
    if (!handoff) return undefined;
    handoff.pending += 1;
    return () => {
      handoff.pending -= 1;
      settle(handoff);
    };
  }, []);
};

/**
 * Called by the ErrorBoundary when it catches an error. While the static page is still on screen, the swap is
 * called off: the visitor keeps reading it (focus and scroll untouched) and a notice (role="status") offers a
 * reload. Returns whether that happened; false when there is no static page or the swap is already done, and
 * then the ErrorBoundary's own screen is what the visitor sees.
 */
export const keepStaticPageOnError = (): boolean => {
  const handoff = current;
  if (!handoff) return false;
  handoff.fail();
  return true;
};

/** The reload notice shown over the static page when React failed behind it. Plain DOM: the React tree is broken. */
const failureNotice = (): HTMLElement => {
  const notice = document.createElement('div');
  notice.setAttribute('role', 'status');
  notice.dataset.handoffNotice = '';
  notice.className = 'fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none';
  const box = document.createElement('div');
  box.className = 'pointer-events-auto mx-auto max-w-md rounded-2xl bg-gray-900 text-white shadow-xl px-4 py-3 flex flex-wrap items-center gap-3';
  const text = document.createElement('p');
  text.className = 'flex-1 min-w-48 text-sm';
  text.textContent = 'Parte do site não carregou. Você pode continuar lendo ou recarregar a página.';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'text-sm font-semibold bg-white text-gray-900 px-4 py-2 rounded-xl hover:bg-gray-100';
  button.textContent = 'Recarregar';
  button.addEventListener('click', () => window.location.reload());
  box.append(text, button);
  notice.append(box);
  return notice;
};

/** The element of the new tree that stands for the one the visitor had focused in the static page. */
const equivalentOf = (focused: HTMLElement, host: HTMLElement): HTMLElement | null => {
  if (focused instanceof HTMLAnchorElement) {
    const href = focused.getAttribute('href');
    const text = focused.textContent?.trim();
    // The static page is only the <main>: the twin is looked for there first. The bar of the app comes before
    // <main> in the document and often has a link to the same place ("Categorias"), which is not where the visitor was.
    for (const scope of [host.querySelector('main'), host]) {
      const same = [...(scope?.querySelectorAll('a') ?? [])].filter(a => a.getAttribute('href') === href);
      const twin = same.find(a => a.textContent?.trim() === text) ?? same[0];
      if (twin) return twin;
    }
    return null;
  }
  return null;
};

/**
 * Mounts `tree` on `rootElement`. With a static page in it, the tree is rendered in a hidden container next to
 * the page and swaps it when the route is ready; without one (every other route, the native shells), it is
 * mounted directly, as before.
 */
export const mountWithStaticHandoff = (
  rootElement: HTMLElement,
  tree: ReactNode,
  { enabled = true, timeoutMs = HANDOFF_TIMEOUT_MS }: { enabled?: boolean; timeoutMs?: number } = {},
): Root => {
  const staticPage = enabled ? rootElement.querySelector<HTMLElement>(STATIC_PAGE) : null;
  if (!staticPage) {
    current = null;
    const root = createRoot(rootElement);
    root.render(tree);
    return root;
  }

  const host = document.createElement('div');
  host.hidden = true;
  rootElement.append(host);

  let done = false;
  const timer: { id?: number } = {};
  const reveal = (): void => {
    if (done) return;
    done = true;
    current = null;
    window.clearTimeout(timer.id);

    // What the visitor was doing in the static page must survive the swap: the focus and the scroll.
    const focused = document.activeElement;
    const hadFocus = focused instanceof HTMLElement && staticPage.contains(focused);
    const target = hadFocus ? (equivalentOf(focused, host) ?? host.querySelector<HTMLElement>('main')) : null;
    const scrollY = window.scrollY;

    staticPage.remove();
    host.hidden = false;

    target?.focus({ preventScroll: true });
    if (scrollY > 0) window.scrollTo(0, scrollY);
  };

  const fail = (): void => {
    if (done) return;
    done = true;
    current = null;
    window.clearTimeout(timer.id);
    // The host stays hidden with whatever the ErrorBoundary rendered; nothing on screen moves
    rootElement.append(failureNotice());
  };

  current = { routeReady: false, pending: 0, reveal, fail };
  timer.id = window.setTimeout(reveal, timeoutMs);

  const root = createRoot(host);
  root.render(tree);
  return root;
};
