import { Children, isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import AppShell from '../../AppShell';
import { STATIC_PAGES, documentTitle } from '../../components/captacao/content';
import { captacaoRoutes } from '../../pages/captacao/routes';

// Demo mode even when a developer's .env.local configures Supabase
vi.mock('../../lib/supabase', () => ({ supabase: null, backendEnabled: false }));

// The price and rating patterns mirror INVENTED_DATA in scripts/prerender.mjs. The path rules keep the
// pages out of the app's own screens. The prerender that will read this file is written by another agent.
const PATH = /^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const RESERVED = ['/entrar', '/conta', '/pedido', '/pedidos', '/atendimentos', '/dashboard', '/pro', '/admin', '/cuidado', '/orcamento', '/agendar', '/p'];
const INVENTED_DATA: Array<[label: string, pattern: RegExp]> = [
  ['price in reais', /r\$\s*\d/],
  ['price in the text', /\b\d+(?:[.,]\d+)?\s*reais\b/],
  ['rating score', /\b\d(?:[.,]\d)?\s*(?:\/\s*5(?!\d)|estrelas?)\b|★/],
  ['review count', /\b\d+\s*(?:avaliac(?:ao|oes)|reviews?)\b/],
];

const normalize = (text: string): string => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const wordCount = (text: string): number => text.trim().split(/\s+/).length;

const routePaths = (): string[] =>
  Children.toArray(captacaoRoutes.props.children).flatMap(child =>
    isValidElement<{ path?: string }>(child) && child.props.path ? [child.props.path] : [],
  );

describe('data/static-pages.json', () => {
  it('has the three acquisition pages', () => {
    expect(STATIC_PAGES.map(page => page.path).sort()).toEqual(['/como-funciona', '/para-familias', '/para-profissionais']);
  });

  it.each(STATIC_PAGES.map(page => [page.path, page] as const))('%s has the documented shape', (_path, page) => {
    expect(Object.keys(page).sort()).toEqual(['description', 'h1', 'links', 'paragraphs', 'path', 'title']);
    for (const key of ['path', 'title', 'description', 'h1'] as const) {
      expect(typeof page[key]).toBe('string');
      expect(page[key].trim()).not.toBe('');
    }
    expect(Array.isArray(page.paragraphs)).toBe(true);
    expect(Array.isArray(page.links)).toBe(true);
  });

  it.each(STATIC_PAGES.map(page => [page.path, page] as const))('%s fits the search result snippet', (_path, page) => {
    expect(page.title.length).toBeLessThanOrEqual(60);
    expect(page.description.length).toBeLessThanOrEqual(155);
  });

  it('does not repeat a title, a description or a heading', () => {
    for (const key of ['title', 'description', 'h1'] as const) {
      const values = STATIC_PAGES.map(page => page[key]);
      expect(new Set(values).size, `repeated ${key}`).toBe(values.length);
    }
  });

  it.each(STATIC_PAGES.map(page => [page.path, page] as const))(
    '%s has four distinct paragraphs of real sentences (the pages open their sections with them)',
    (_path, page) => {
      expect(page.paragraphs).toHaveLength(4);
      expect(new Set(page.paragraphs).size).toBe(page.paragraphs.length);
      for (const paragraph of page.paragraphs) {
        expect(wordCount(paragraph)).toBeGreaterThanOrEqual(25);
        expect(paragraph.trim()).toMatch(/[.!?]$/);
      }
    },
  );

  it('uses paths the prerender accepts and no app screen', () => {
    for (const { path } of STATIC_PAGES) {
      expect(path).toMatch(PATH);
      expect(RESERVED.some(reserved => path === reserved || path.startsWith(`${reserved}/`))).toBe(false);
      expect(path.startsWith('/servicos/') || path.startsWith('/categorias/')).toBe(false);
    }
  });

  it('links to internal paths, each with a label, without repeating one', () => {
    for (const page of STATIC_PAGES) {
      expect(page.links.length).toBeGreaterThan(0);
      for (const link of page.links) {
        expect(link.label.trim()).not.toBe('');
        expect(link.to.startsWith('/') && !link.to.startsWith('//') && !/\s/.test(link.to)).toBe(true);
      }
      expect(new Set(page.links.map(link => link.to)).size).toBe(page.links.length);
    }
  });

  it('prints no price, rating or review count: the numbers come from the platform, never from this file', () => {
    for (const page of STATIC_PAGES) {
      const text = normalize([page.title, page.description, page.h1, ...page.paragraphs, ...page.links.map(link => link.label)].join('\n'));
      for (const [label, pattern] of INVENTED_DATA) expect(pattern.test(text), `${page.path}: ${label}`).toBe(false);
    }
  });
});

describe('routes of the acquisition pages', () => {
  it('has a route for every path of the file, and nothing else', () => {
    expect(routePaths().sort()).toEqual(STATIC_PAGES.map(page => page.path).sort());
  });
});

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

const renderAt = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppShell />
        <Where />
      </MemoryRouter>
    </AuthProvider>,
  );

describe('the app serves the pages', () => {
  it.each(STATIC_PAGES.map(page => [page.path, page] as const))('%s is registered in the app shell, inside <main>, with its own heading', async (path, page) => {
    renderAt(path);
    const heading = await screen.findByRole('heading', { level: 1, name: page.h1 }, { timeout: 5000 });
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1 })).toBe(heading);
    expect(screen.getByTestId('where')).toHaveTextContent(new RegExp(`^${path}$`));
    await waitFor(() => expect(document.title).toBe(documentTitle(page.title)));
  });

  // An unknown path in the app shell redirects to the home page, so the location tells a link that leads nowhere
  const targets = [...new Set(STATIC_PAGES.flatMap(page => page.links.map(link => link.to)))].sort();
  it.each(targets)('the link to %s leads to a screen that exists', async to => {
    renderAt(to);
    await screen.findByRole('heading', { level: 1 }, { timeout: 5000 });
    expect(screen.getByTestId('where')).toHaveTextContent(new RegExp(`^${to}$`));
  });
});

describe('document title', () => {
  it('adds the site name only when the title does not carry it, as the prerender does', () => {
    expect(documentTitle('Como funciona')).toBe('Como funciona | WorkEasy');
    expect(documentTitle('Sobre o WorkEasy')).toBe('Sobre o WorkEasy');
  });
});
