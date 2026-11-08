import pages from '../../data/static-pages.json';

// data/static-pages.json is the single source of the heading and the opening
// paragraphs of the acquisition pages. scripts/prerender.mjs writes the same
// text as static HTML, and the pages render it again, so what a crawler reads
// is still on the page after React mounts.

export interface StaticPageLink {
  to: string;
  label: string;
}

export interface StaticPage {
  path: string;
  title: string;
  description: string;
  h1: string;
  paragraphs: string[];
  links: StaticPageLink[];
}

export const STATIC_PAGES: StaticPage[] = pages;

export const staticPage = (path: string): StaticPage => {
  const page = STATIC_PAGES.find(item => item.path === path);
  if (!page) throw new Error(`data/static-pages.json has no entry for ${path}`);
  return page;
};

const SITE_NAME = 'WorkEasy';

/** Same rule as titleWithSite in scripts/prerender.mjs, so the tab title equals the prerendered <title>. */
export const documentTitle = (title: string): string => (title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`);
