// @vitest-environment node
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { VERIFICATION_LABELS } from '../../catalog/labels';
import { VERIFICATION_TEXT, capitalize } from '../../catalog/prose.mjs';
import { ROOT, loadPrerender, type PrerenderModule } from './helpers';

// What index.html, public/ and index.css give every page, before the prerender step adds the rest.

let mod: PrerenderModule;
beforeEach(async () => {
  mod = await loadPrerender();
});

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const meta = (attr: 'name' | 'property', key: string): string | undefined =>
  new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(html)?.[1];

describe('index.html', () => {
  it('declares the language, the viewport and the theme color the manifest uses', () => {
    expect(html).toMatch(/<html lang="pt-BR">/);
    expect(meta('name', 'viewport')).toContain('width=device-width');
    expect(meta('name', 'theme-color')).toBe(mod.THEME_COLOR);
    expect(mod.THEME_COLOR).toBe('#667eea');
    expect(/<title>([^<]+)<\/title>/.exec(html)?.[1].trim()).toBeTruthy();
  });

  it('has the Open Graph and Twitter tags of a link preview, with one shared description', () => {
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('property', 'og:site_name')).toBe('WorkEasy');
    expect(meta('property', 'og:locale')).toBe('pt_BR');
    expect(meta('property', 'og:title')).toBeTruthy();
    expect(meta('property', 'og:description')).toBe(meta('name', 'description'));
    expect(meta('property', 'og:image')).toBe(mod.OG_IMAGE_PATH);
    expect(meta('property', 'og:image:alt')).toBeTruthy();
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('name', 'twitter:title')).toBe(meta('property', 'og:title'));
    expect(meta('name', 'twitter:description')).toBe(meta('name', 'description'));
    expect(meta('name', 'twitter:image')).toBe(mod.OG_IMAGE_PATH);
  });

  it('has no canonical, og:url or JSON-LD: it is also the page of every route the app owns', () => {
    expect(html).not.toMatch(/<link[^>]*rel="canonical"/);
    expect(html).not.toMatch(/<meta[^>]*og:url/);
    expect(html).not.toContain('application/ld+json');
  });

  it('keeps styles and scripts in files, so that a Content-Security-Policy can forbid inline ones', () => {
    expect(html).not.toMatch(/<style[\s>]/);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(html).not.toMatch(/\son[a-z]+="/);
  });

  it('leads a visitor without JavaScript to the categories', () => {
    expect(/<noscript>[\s\S]*<a href="\/categorias">[\s\S]*<\/noscript>/.test(html)).toBe(true);
  });
});

describe('public/og-image.png', () => {
  const png = readFileSync(join(ROOT, 'public', 'og-image.png'));

  it('is a 1200x630 PNG, the size og:image:width and og:image:height announce', () => {
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.readUInt32BE(16)).toBe(Number(meta('property', 'og:image:width')));
    expect(png.readUInt32BE(20)).toBe(Number(meta('property', 'og:image:height')));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  it('is small enough for the apps that refuse a heavy preview (WhatsApp stops at about 300 kB)', () => {
    expect(statSync(join(ROOT, 'public', 'og-image.png')).size).toBeLessThan(300_000);
  });
});

describe('layout shift', () => {
  it('reserves a screen of height for the lazy page fallback, so that the footer does not jump', () => {
    const css = readFileSync(join(ROOT, 'index.css'), 'utf8');
    expect(css).toMatch(/main > \[role='status'\]:only-child\s*\{\s*min-height: 100vh;\s*\}/);
  });
});

describe('prose of the policies', () => {
  it('gives the lists of the occupation page the wording of the app (catalog/labels.ts)', () => {
    expect(Object.keys(VERIFICATION_TEXT).sort()).toEqual(Object.keys(VERIFICATION_LABELS).sort());
    for (const [step, label] of Object.entries(VERIFICATION_LABELS)) expect(capitalize(VERIFICATION_TEXT[step]), step).toBe(label);
  });
});
