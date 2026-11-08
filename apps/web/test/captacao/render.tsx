import { Suspense } from 'react';
import { configure, render, screen, waitFor, within, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect } from 'vitest';
import { documentTitle, type StaticPage } from '../../components/captacao/content';
import { captacaoRoutes } from '../../pages/captacao/routes';

// The page chunks are lazy and the settings are read after the first paint: give slow machines room
configure({ asyncUtilTimeout: 5000 });

/** Renders the real acquisition route table, without the app shell. The test file must mock lib/supabase. */
export const renderCaptacao = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense fallback={<p role="status">Carregando…</p>}>
        <Routes>
          {captacaoRoutes}
          <Route path="*" element={<p>Fora das páginas de captação</p>} />
        </Routes>
      </Suspense>
    </MemoryRouter>,
  );

/** Headings in document order, with their level. */
export const outline = (container: HTMLElement): Array<{ level: number; text: string }> =>
  Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(heading => ({
    level: Number(heading.tagName.slice(1)),
    text: (heading.textContent ?? '').trim(),
  }));

/** One h1 first, no empty heading and no level skipped on the way down (h2 straight to h4). */
export const expectOrderedHeadings = (container: HTMLElement): void => {
  const headings = outline(container);
  expect(headings[0]?.level).toBe(1);
  expect(headings.filter(heading => heading.level === 1)).toHaveLength(1);
  headings.forEach((heading, index) => {
    expect(heading.text, `heading ${index + 1} is empty`).not.toBe('');
    if (index > 0) {
      expect(heading.level, `"${heading.text}" skips from h${headings[index - 1].level} to h${heading.level}`).toBeLessThanOrEqual(
        headings[index - 1].level + 1,
      );
    }
  });
};

const VAGUE = /^(clique aqui|saiba mais|aqui|leia mais|ver mais|mais)$/i;

/** Every link has a name that says where it goes, a destination, and an external one opens safely. */
export const expectNamedLinks = (): void => {
  const links = screen.getAllByRole('link');
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    expect(link).toHaveAccessibleName(/\S/);
    expect(link).not.toHaveAccessibleName(VAGUE);
    expect(link.getAttribute('href'), 'link without destination').toBeTruthy();
    if (link.getAttribute('target') === '_blank') expect(link.getAttribute('rel')).toMatch(/noopener/);
  }
};

/** The text of the whole page, to look for numbers in. */
export const pageText = (container: HTMLElement): string => container.textContent ?? '';

/** The main call to action of each page and the message its WhatsApp button carries. */
export const CTAS: Record<string, { name: string; to: string; message: string }> = {
  '/para-profissionais': {
    name: 'Criar meu cadastro',
    to: '/pro/cadastro',
    message: 'Olá! Quero saber como me cadastrar como profissional no WorkEasy.',
  },
  '/para-familias': {
    name: 'Pedir pela linha de cuidado',
    to: '/cuidado',
    message: 'Olá! Quero conversar sobre a linha de cuidado do WorkEasy.',
  },
  '/como-funciona': { name: 'Fazer um pedido', to: '/pedido', message: 'Olá! Quero fazer um pedido pelo WorkEasy.' },
};

/**
 * What every page must show in every mode: its heading and its four paragraphs from data/static-pages.json
 * (so the prerendered text is still there after React mounts), the tab title, an ordered outline, named
 * links, the main call to action and the "Veja também" links.
 */
export const expectPageBasics = async (page: StaticPage, view: RenderResult): Promise<void> => {
  await screen.findByRole('heading', { level: 1, name: page.h1 });
  for (const paragraph of page.paragraphs) expect(screen.getByText(paragraph)).toBeInTheDocument();
  // The title is set by an effect, which can run just after the heading is on screen
  await waitFor(() => expect(document.title).toBe(documentTitle(page.title)));
  expectOrderedHeadings(view.container);
  expectNamedLinks();
  const cta = CTAS[page.path];
  for (const link of screen.getAllByRole('link', { name: cta.name })) expect(link).toHaveAttribute('href', cta.to);
  const seeAlso = within(screen.getByRole('navigation', { name: 'Veja também' }));
  for (const item of page.links) expect(seeAlso.getByRole('link', { name: item.label })).toHaveAttribute('href', item.to);
};
