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

/** The page scripts/prerender.mjs writes: the only child of #root that is static content. */
const STATIC_PAGE = ':scope > main[data-prerendered]';

/** How long the static page may wait for React before the swap happens anyway (a chunk that never loads, a crash). */
export const HANDOFF_TIMEOUT_MS = 15_000;

interface Handoff {
  routeReady: boolean;
  /** Boundaries still showing a fallback inside the route (the rules of the area, for instance). */
  pending: number;
  reveal: () => void;
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

/** The element of the new tree that stands for the one the visitor had focused in the static page. */
const equivalentOf = (focused: HTMLElement, host: HTMLElement): HTMLElement | null => {
  if (focused instanceof HTMLAnchorElement) {
    const href = focused.getAttribute('href');
    const text = focused.textContent?.trim();
    const same = [...host.querySelectorAll('a')].filter(a => a.getAttribute('href') === href);
    return same.find(a => a.textContent?.trim() === text) ?? same[0] ?? null;
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

  current = { routeReady: false, pending: 0, reveal };
  timer.id = window.setTimeout(reveal, timeoutMs);

  const root = createRoot(host);
  root.render(tree);
  return root;
};
