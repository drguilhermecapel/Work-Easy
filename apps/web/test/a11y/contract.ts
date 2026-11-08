import { expect } from 'vitest';

// The accessibility contract every screen keeps, checked on the rendered DOM. It is not axe: jsdom has
// no layout, so contrast and target size are measured in a real browser (docs/arquitetura/acessibilidade-desempenho.md).
// What it does check is what a screen reader depends on: names, labels, references and ids.

const hidden = (el: Element) => el.closest('[aria-hidden="true"], [hidden]') !== null;

const textOf = (el: Element): string => {
  if (el.getAttribute('aria-hidden') === 'true') return '';
  if (el instanceof HTMLImageElement) return el.alt;
  return [...el.childNodes]
    .map(node => (node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : node instanceof Element ? textOf(node) : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const byId = (el: Element, id: string) => el.ownerDocument.getElementById(id);

/** Accessible name by the same order of precedence the browsers use (the part this app relies on). */
export const nameOf = (el: Element): string => {
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy.split(/\s+/).map(id => (byId(el, id) ? textOf(byId(el, id) as Element) : '')).join(' ').trim();
    if (text) return text;
  }
  const label = el.getAttribute('aria-label')?.trim();
  if (label) return label;
  if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type)) return el.value;
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const labels = [...el.labels ?? []].map(textOf).join(' ').trim();
    return labels || el.getAttribute('title')?.trim() || '';
  }
  return textOf(el) || el.getAttribute('title')?.trim() || '';
};

const describe = (el: Element) => `<${el.tagName.toLowerCase()}${el.id ? ` id="${el.id}"` : ''}> ${(el.outerHTML ?? '').slice(0, 90)}`;

/** Every problem found under `root`, as readable lines. Empty means the screen keeps the contract. */
export const accessibilityProblems = (root: ParentNode = document.body): string[] => {
  const problems: string[] = [];
  const all = (selector: string) => [...root.querySelectorAll(selector)].filter(el => !hidden(el));

  for (const el of all('input:not([type=hidden]), select, textarea')) {
    if (!nameOf(el)) problems.push(`field without a name: ${describe(el)}`);
  }
  for (const el of all('button, a[href], [role=button], [role=link], [role=tab], summary')) {
    if (!nameOf(el)) problems.push(`control without a name: ${describe(el)}`);
    if (el.matches('a, button, [role=button]') && el.parentElement?.closest('a, button')) problems.push(`interactive control inside another: ${describe(el)}`);
  }
  for (const el of all('img')) {
    if (!el.hasAttribute('alt')) problems.push(`image without alt: ${describe(el)}`);
  }
  for (const el of all('[role=img]')) {
    if (!nameOf(el)) problems.push(`role=img without a name: ${describe(el)}`);
  }

  const seen = new Set<string>();
  for (const el of root.querySelectorAll('[id]')) {
    if (seen.has(el.id)) problems.push(`duplicate id "${el.id}"`);
    seen.add(el.id);
  }
  for (const el of root.querySelectorAll('[aria-labelledby], [aria-describedby]')) {
    for (const attr of ['aria-labelledby', 'aria-describedby']) {
      for (const id of (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)) {
        if (!byId(el, id)) problems.push(`${attr}="${id}" points to nothing: ${describe(el)}`);
      }
    }
  }
  for (const label of root.querySelectorAll('label[for]')) {
    if (!byId(label, label.getAttribute('for') ?? '')) problems.push(`label for="${label.getAttribute('for')}" points to nothing`);
  }
  for (const el of root.querySelectorAll('[aria-invalid="true"]')) {
    const text = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).map(id => (byId(el, id) ? textOf(byId(el, id) as Element) : '')).join('').trim();
    if (!text) problems.push(`invalid field that says nothing about the problem: ${describe(el)}`);
  }
  for (const el of root.querySelectorAll('[tabindex]')) {
    if (Number(el.getAttribute('tabindex')) > 0) problems.push(`positive tabindex breaks the focus order: ${describe(el)}`);
  }

  const headings = all('h1, h2, h3, h4, h5, h6');
  headings.forEach((heading, index) => {
    if (!textOf(heading)) problems.push(`empty heading: ${describe(heading)}`);
    const previous = headings[index - 1];
    if (previous && Number(heading.tagName[1]) - Number(previous.tagName[1]) > 1) {
      problems.push(`heading level jumps from ${previous.tagName} to ${heading.tagName}: "${textOf(heading)}"`);
    }
  });
  return problems;
};

export const expectAccessibleScreen = (root: ParentNode = document.body): void => {
  expect(accessibilityProblems(root)).toEqual([]);
};
