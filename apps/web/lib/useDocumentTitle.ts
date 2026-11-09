import { useEffect } from 'react';
import { SITE_NAME } from '../catalog/prose.mjs';

/**
 * Sets the tab title while a page is shown and puts the site name back when it
 * goes away. On a first load the prerendered HTML already carries the same
 * title (the text comes from catalog/prose.mjs); this keeps it right when the
 * visitor moves between pages without a reload. `null` leaves the title alone.
 */
export const useDocumentTitle = (title: string | null): void => {
  useEffect(() => {
    if (!title) return;
    document.title = title;
    return () => {
      document.title = SITE_NAME;
    };
  }, [title]);
};
