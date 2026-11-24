import { useEffect } from 'react';
import { linkOf, prefetchRoute } from './routePrefetch';

/**
 * Loads the chunk of a page when the pointer or the keyboard reaches a link to it, so the click
 * finds it ready. Event delegation on the document: no link has to be changed, and it works for
 * both router flavours (clean URLs and hash URLs). Render once, inside AppShell.
 */
const RoutePrefetcher = () => {
  useEffect(() => {
    const onIntent = (event: Event) => prefetchRoute(linkOf(event.target));
    const events = ['pointerover', 'focusin', 'touchstart'] as const;
    events.forEach(name => document.addEventListener(name, onIntent, { passive: true }));
    return () => events.forEach(name => document.removeEventListener(name, onIntent));
  }, []);
  return null;
};

export default RoutePrefetcher;
