import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/** id of the <main> element in AppShell: target of the skip link and of the focus after a navigation. */
export const MAIN_ID = 'conteudo-principal';

const focusMain = (options?: FocusOptions) => document.getElementById(MAIN_ID)?.focus(options);

/**
 * First stop of the keyboard: jumps over the navigation to the content. It moves the
 * focus by script because a hash href would be read as a route by the HashRouter that
 * the native shells use.
 */
const SkipLink: React.FC = () => (
  <a
    href={`#${MAIN_ID}`}
    onClick={event => {
      event.preventDefault();
      focusMain();
    }}
    className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:bg-white focus:text-primary focus:font-semibold focus:text-sm focus:px-4 focus:py-3 focus:rounded-xl focus:shadow-lg"
  >
    Pular para o conteúdo
  </a>
);

/**
 * A page load tells a screen reader which page opened and starts at the top; a route change
 * inside the app does neither. This announces the new page (its main heading) and moves the
 * focus to the content, like a page load would.
 */
const RouteAnnouncer: React.FC = () => {
  const { pathname } = useLocation();
  const first = useRef(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // The first render is the page load itself
    if (first.current) {
      first.current = false;
      return;
    }
    setMessage('');
    document.documentElement.scrollTop = 0;
    // The page may still be a lazy chunk: look for its heading until it shows up
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const heading = document.getElementById(MAIN_ID)?.querySelector('h1');
      if (!heading && attempts < 20) return;
      window.clearInterval(timer);
      setMessage(heading?.textContent?.trim() ?? '');
      focusMain({ preventScroll: true });
    }, 100);
    return () => window.clearInterval(timer);
  }, [pathname]);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
};

/** Skip link plus route announcer: render once, inside the router, before the navigation. */
const AccessibilityLayer: React.FC = () => (
  <>
    <SkipLink />
    <RouteAnnouncer />
  </>
);

export default AccessibilityLayer;
