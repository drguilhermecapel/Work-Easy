import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import Markdown, { type MarkdownProps } from '../lib/markdown';
import { parseInline, parseMarkdown, safeHref, type Block, type Inline } from '../lib/markdownParser';

const html = (source: string, props: Partial<MarkdownProps> = {}): string => {
  const { container } = render(<Markdown source={source} {...props} />);
  return container.innerHTML;
};

const rendered = (source: string, props: Partial<MarkdownProps> = {}) => render(<Markdown source={source} {...props} />).container;

const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];

/** Every anchor must lead somewhere safe: its resolved protocol is http(s) or mailto (relative links resolve to http). */
const expectSafeAnchors = (container: HTMLElement) => {
  for (const anchor of Array.from(container.querySelectorAll('a'))) {
    expect(ALLOWED_PROTOCOLS).toContain(new URL(anchor.href).protocol);
  }
};

/** Nothing that can run code or load something may come out of the renderer. */
const expectNoActiveContent = (container: HTMLElement) => {
  expect(container.querySelectorAll('script, img, iframe, object, embed, style, svg, form, input, link, meta, video, audio, base')).toHaveLength(0);
  for (const element of Array.from(container.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) expect(attribute.name.toLowerCase().startsWith('on')).toBe(false);
  }
  expectSafeAnchors(container);
};

const walkInline = (nodes: Inline[], visit: (node: Inline) => void) => {
  for (const node of nodes) {
    visit(node);
    if (node.type === 'em' || node.type === 'strong' || node.type === 'link') walkInline(node.children, visit);
  }
};

const walkBlocks = (blocks: Block[], visit: (node: Inline) => void) => {
  for (const block of blocks) {
    if (block.type === 'heading' || block.type === 'paragraph') walkInline(block.children, visit);
    else if (block.type === 'blockquote') walkBlocks(block.children, visit);
    else if (block.type === 'list') block.items.forEach(item => walkBlocks(item, visit));
    else if (block.type === 'table') [block.header, ...block.rows].forEach(row => row.forEach(cell => walkInline(cell, visit)));
  }
};

const depthOf = (blocks: Block[]): number =>
  1 + Math.max(0, ...blocks.map(b => (b.type === 'blockquote' ? depthOf(b.children) : b.type === 'list' ? Math.max(0, ...b.items.map(depthOf)) : 0)));

describe('safeHref', () => {
  it.each([
    'https://example.com/a?b=1#c',
    'http://example.org',
    'HTTPS://EXAMPLE.COM',
    'mailto:contato@example.com',
    '/termos',
    'termos',
    './sac',
    '../privacidade',
    '#secao',
    '?q=1',
    'a/b:c',
  ])('accepts %s', href => {
    expect(safeHref(href)).toBe(href);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'java\u0000script:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com/file',
    'tel:+5511999999999',
    'blob:https://example.com/uuid',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'https://',
    'http:///path',
    'mailto:',
    'https://example.com/a b',
    `https://example.com/${String.fromCharCode(0x200b)}x`,
    `https://example.com/${String.fromCharCode(0x2028)}x`,
    '',
    '   ',
    `https://example.com/${'x'.repeat(3000)}`,
  ])('rejects %j', href => {
    expect(safeHref(href)).toBeNull();
  });
});

describe('Markdown blocks', () => {
  it('renders headings, shifting levels by the offset and stopping at h6', () => {
    expect(html('# A\n\n## B')).toBe('<h1>A</h1><h2>B</h2>');
    expect(html('# A\n\n## B', { headingOffset: 1 })).toBe('<h2>A</h2><h3>B</h3>');
    expect(html('###### F', { headingOffset: 3 })).toBe('<h6>F</h6>');
    expect(html('#### D ####\n\n#hashtag')).toBe('<h4>D</h4><p>#hashtag</p>');
  });

  it('can leave out a leading title', () => {
    expect(html('# Título\n\n## Seção\n\ntexto', { skipFirstH1: true })).toBe('<h2>Seção</h2><p>texto</p>');
    expect(html('Texto\n\n# Depois', { skipFirstH1: true })).toBe('<p>Texto</p><h1>Depois</h1>');
  });

  it('renders underlined headings', () => {
    expect(html('Título\n======\n\nSub\n---')).toBe('<h1>Título</h1><h2>Sub</h2>');
  });

  it('renders paragraphs with soft and hard line breaks', () => {
    expect(html('um\ndois\n\ntrês')).toBe('<p>um dois</p><p>três</p>');
    expect(html('um  \ndois')).toBe('<p>um<br>dois</p>');
    expect(html('um\\\ndois')).toBe('<p>um<br>dois</p>');
    expect(html('um \ndois')).toBe('<p>um dois</p>');
  });

  it('renders emphasis, strong, nested emphasis and inline code', () => {
    expect(html('Texto com **negrito**, *itálico* e `código`.')).toBe(
      '<p>Texto com <strong>negrito</strong>, <em>itálico</em> e <code>código</code>.</p>',
    );
    expect(html('*a **b** c*')).toBe('<p><em>a <strong>b</strong> c</em></p>');
    expect(html('***x***')).toBe('<p><em><strong>x</strong></em></p>');
    expect(html('__forte__ e _leve_')).toBe('<p><strong>forte</strong> e <em>leve</em></p>');
    expect(html('``a ` b``')).toBe('<p><code>a ` b</code></p>');
  });

  it('leaves unmatched or intraword markers as text', () => {
    expect(html('2 * 3 * 4')).toBe('<p>2 * 3 * 4</p>');
    expect(html('**aberto')).toBe('<p>**aberto</p>');
    expect(html('snake_case_name e foo_bar_')).toBe('<p>snake_case_name e foo_bar_</p>');
    expect(html('\\*literal\\* e \\`x\\`')).toBe('<p>*literal* e `x`</p>');
  });

  it('renders unordered lists nested, tight and loose', () => {
    expect(html('- um\n- dois\n  - dois.um\n  - dois.dois\n- três')).toBe(
      '<ul><li>um</li><li>dois<ul><li>dois.um</li><li>dois.dois</li></ul></li><li>três</li></ul>',
    );
    expect(html('- a\n\n- b')).toBe('<ul><li><p>a</p></li><li><p>b</p></li></ul>');
    expect(html('- a\n* b')).toBe('<ul><li>a</li></ul><ul><li>b</li></ul>');
    expect(html('- a\ncontinua aqui\n- b')).toBe('<ul><li>a continua aqui</li><li>b</li></ul>');
  });

  it('renders ordered lists with their start number and nested items', () => {
    expect(html('3. a\n4. b')).toBe('<ol start="3"><li>a</li><li>b</li></ol>');
    expect(html('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
    expect(html('1. Primeiro\n   - sub\n2. Segundo')).toBe('<ol><li>Primeiro<ul><li>sub</li></ul></li><li>Segundo</li></ol>');
    // drafts often indent the nested list by two spaces under "1."
    expect(html('1. Primeiro\n  - sub\n2. Segundo')).toBe('<ol><li>Primeiro<ul><li>sub</li></ul></li><li>Segundo</li></ol>');
  });

  it('keeps an item with several paragraphs together', () => {
    expect(html('1. a\n\n   mais um parágrafo\n\n2. b')).toBe('<ol><li><p>a</p><p>mais um parágrafo</p></li><li><p>b</p></li></ol>');
  });

  it('lets a thematic break win over a list', () => {
    expect(html('a\n\n* * *\n\nb')).toBe('<p>a</p><hr><p>b</p>');
    expect(html('---')).toBe('<hr>');
  });

  it('renders tables with alignment, inline formatting and escaped pipes', () => {
    const container = rendered('| Item | Valor |\n|:---|---:|\n| **a** | 1 \\| 2 |\n| b | `c` |\n\ndepois');
    const headers = Array.from(container.querySelectorAll('th'));
    expect(headers.map(th => th.textContent)).toEqual(['Item', 'Valor']);
    expect(headers.map(th => th.style.textAlign)).toEqual(['left', 'right']);
    expect(headers[0]).toHaveAttribute('scope', 'col');
    const cells = Array.from(container.querySelectorAll('td'));
    expect(cells.map(td => td.textContent)).toEqual(['a', '1 | 2', 'b', 'c']);
    expect(cells[0].querySelector('strong')).not.toBeNull();
    expect(cells[1].style.textAlign).toBe('right');
    expect(container.querySelector('div + p')?.textContent).toBe('depois');
  });

  it('pads and trims table rows to the header', () => {
    const container = rendered('a | b\n-|-\n1\n1 | 2 | 3');
    expect(Array.from(container.querySelectorAll('tbody tr')).map(tr => tr.querySelectorAll('td').length)).toEqual([2, 2]);
  });

  it('does not take a lone line with a pipe for a table', () => {
    expect(html('a | b\n\ntexto')).toBe('<p>a | b</p><p>texto</p>');
  });

  it('renders block quotes with formatting and lazy continuation', () => {
    expect(html('> citação\n> **forte**')).toBe('<blockquote><p>citação <strong>forte</strong></p></blockquote>');
    expect(html('> uma\ncontinua')).toBe('<blockquote><p>uma continua</p></blockquote>');
    expect(html('> a\n>\n> b')).toBe('<blockquote><p>a</p><p>b</p></blockquote>');
    expect(html('> - item\n> - outro')).toBe('<blockquote><ul><li>item</li><li>outro</li></ul></blockquote>');
  });

  it('renders fenced code as text', () => {
    expect(html('```\n<b>x</b>\n  y\n```\n\ndepois')).toBe('<pre><code>&lt;b&gt;x&lt;/b&gt;\n  y</code></pre><p>depois</p>');
    expect(html('~~~js\nconst a = 1;\n~~~')).toBe('<pre><code>const a = 1;</code></pre>');
    expect(html('```\nsem fechar')).toBe('<pre><code>sem fechar</code></pre>');
  });

  it('applies the class names it is given', () => {
    const container = rendered('# T\n\ntexto [l](/x) **b**\n\n- i', { classNames: { h1: 'c-h1', p: 'c-p', a: 'c-a', strong: 'c-s', ul: 'c-ul', li: 'c-li' } });
    expect(container.querySelector('h1')).toHaveClass('c-h1');
    expect(container.querySelector('p')).toHaveClass('c-p');
    expect(container.querySelector('a')).toHaveClass('c-a');
    expect(container.querySelector('strong')).toHaveClass('c-s');
    expect(container.querySelector('ul')).toHaveClass('c-ul');
    expect(container.querySelector('li')).toHaveClass('c-li');
  });
});

describe('Markdown links', () => {
  it('opens external links outside the app and keeps relative and mail links plain', () => {
    expect(html('[site](https://example.com/a)')).toBe('<p><a href="https://example.com/a" target="_blank" rel="noopener noreferrer">site</a></p>');
    expect(html('[termos](/termos) e [mail](mailto:a@b.co)')).toBe('<p><a href="/termos">termos</a> e <a href="mailto:a@b.co">mail</a></p>');
    expect(html('[seção](#s) [rel](outra/pagina)')).toBe('<p><a href="#s">seção</a> <a href="outra/pagina">rel</a></p>');
  });

  it('supports formatting inside links, titles, parentheses and angle-bracket targets', () => {
    expect(html('[**forte** e `c`](https://example.com "título")')).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer"><strong>forte</strong> e <code>c</code></a></p>',
    );
    expect(html('[w](https://example.com/a_(b))')).toContain('href="https://example.com/a_(b)"');
    expect(html('[w](<https://example.com/a b>)')).toBe('<p>[w](&lt;https://example.com/a b&gt;)</p>');
    expect(html('[w](https://example.com/a\\)b)')).toContain('href="https://example.com/a)b"');
  });

  it('turns autolinks into links and keeps other angle brackets as text', () => {
    expect(html('<https://example.com> e <a@b.co>')).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a> e <a href="mailto:a@b.co">a@b.co</a></p>',
    );
    expect(html('1 < 2 > 0')).toBe('<p>1 &lt; 2 &gt; 0</p>');
  });

  it('does not nest links and leaves broken link syntax as text', () => {
    const container = rendered('[a [b](/x) c](/y)');
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(html('[sem destino] e [mal](formado')).toBe('<p>[sem destino] e [mal](formado</p>');
    expect(html('[vazio]()')).toBe('<p>[vazio]()</p>');
  });

  it('shows images as their alt text only', () => {
    const container = rendered('![logo da empresa](https://example.com/logo.png) e ![](/x.png)');
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('logo da empresa e ');
  });

  it('draws links with the renderer it is given', () => {
    const container = rendered('[a](/sac) [b](https://example.com) [c](#x)', {
      renderLink: ({ href, external, children }) => (
        <span data-href={href} data-external={String(external)}>
          {children}
        </span>
      ),
    });
    expect(Array.from(container.querySelectorAll('span')).map(s => [s.dataset.href, s.dataset.external])).toEqual([
      ['/sac', 'false'],
      ['https://example.com', 'true'],
      ['#x', 'false'],
    ]);
  });
});

describe('Markdown comments', () => {
  it('drops HTML comments, also across lines, but not inside code', () => {
    expect(html('antes <!-- nota interna --> depois')).toBe('<p>antes  depois</p>');
    expect(html('a\n\n<!--\nrevisar com o advogado\n-->\n\nb')).toBe('<p>a</p><p>b</p>');
    expect(html('```\n<!-- fica -->\n```')).toBe('<pre><code>&lt;!-- fica --&gt;</code></pre>');
  });

  it('keeps a comment that never closes as text instead of hiding the rest of the document', () => {
    const container = rendered('antes <!-- aberto\n\nresto do texto');
    expect(container.textContent).toContain('resto do texto');
    expect(container.textContent).toContain('<!-- aberto');
  });
});

describe('Markdown with hostile input', () => {
  const HOSTILE_LINKS = [
    '[clique](javascript:alert(1))',
    '[clique](JaVaScRiPt:alert(1))',
    '[clique](java\tscript:alert(1))',
    '[clique](&#106;avascript:alert(1))',
    '[clique](&#x6A;avascript:alert(1))',
    '[clique](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
    '[clique](vbscript:msgbox(1))',
    '[clique](file:///etc/passwd)',
    '[clique](//evil.example/x)',
    '[clique](/\\evil.example)',
    '[clique](<javascript:alert(1)>)',
    '[clique]( javascript:alert(1))',
    '[clique](https://example.com "t" onclick="alert(1)")',
    '<javascript:alert(1)>',
    '<data:text/html,x>',
    '![x](javascript:alert(1))',
    '[![x](https://example.com/a.png)](javascript:alert(1))',
  ];

  it.each(HOSTILE_LINKS)('does not turn %j into an active link', source => {
    const container = rendered(source);
    expectNoActiveContent(container);
    expect(container.textContent).not.toBe('');
  });

  it('shows a rejected link as typed, label and target', () => {
    const container = rendered('[clique](javascript:alert(1))');
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('[clique](javascript:alert(1))');
  });

  it('never decodes entities, so an encoded scheme stays a harmless relative link', () => {
    const container = rendered('[x](&#106;avascript:alert(1))');
    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('&#106;avascript:alert(1)');
    expectSafeAnchors(container);
  });

  it('cannot break out of an attribute', () => {
    const container = rendered('[x](https://example.com/"onmouseover="alert(1))');
    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('https://example.com/"onmouseover="alert(1)');
    expect(anchor?.getAttributeNames().sort()).toEqual(['href', 'rel', 'target']);
    expectNoActiveContent(container);
  });

  const RAW_HTML = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">x</a>',
    '<iframe src="https://evil.example"></iframe>',
    '<div onclick="alert(1)">x</div>',
    '<style>body{display:none}</style>',
    '<svg onload=alert(1)></svg>',
    '<form action="https://evil.example"><input name=card></form>',
    '<b>negrito</b>',
    '<!DOCTYPE html>',
    '<![CDATA[x]]>',
    '&lt;script&gt;alert(1)&lt;/script&gt;',
    '&#60;script&#62;alert(1)&#60;/script&#62;',
  ];

  it.each(RAW_HTML)('shows %j as text', source => {
    const container = rendered(source);
    expectNoActiveContent(container);
    expect(container.textContent).toBe(source);
  });

  it('shows raw HTML as text in every kind of block', () => {
    const source = [
      '# <script>alert(1)</script>',
      '',
      '> <img src=x onerror=alert(1)>',
      '',
      '- <iframe src=x></iframe>',
      '  - <svg onload=alert(1)>',
      '',
      '| <script> | b |',
      '|---|---|',
      '| <img src=x onerror=alert(1)> | [x](javascript:alert(1)) |',
      '',
      '**<script>alert(1)</script>** *<b>x</b>* `<script>`',
      '',
      '```html',
      '<script>alert(1)</script>',
      '```',
    ].join('\n');
    const container = rendered(source);
    expectNoActiveContent(container);
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.innerHTML).not.toMatch(/<(script|img|iframe|svg|form|input|style)/i);
  });

  it('never leaves an unsafe link in the tree, whatever the input', () => {
    const inputs = [
      ...HOSTILE_LINKS,
      '[a](b)[c](javascript:d)[e](f)',
      '[[x](javascript:a)](https://example.com)',
      '[x](https://example.com)(javascript:alert(1))',
      '<https://example.com><javascript:alert(1)>',
    ];
    for (const input of inputs) {
      const hrefs: string[] = [];
      walkBlocks(parseMarkdown(input), node => {
        if (node.type === 'link') hrefs.push(node.href);
      });
      for (const href of hrefs) expect(safeHref(href)).toBe(href);
    }
  });

  it('does not use any raw HTML injection API (source check)', () => {
    for (const file of ['lib/markdown.tsx', 'lib/markdownParser.ts']) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
    }
  });
});

describe('Markdown with huge or pathological input', () => {
  // Each case must come back quickly (a few ms to a few hundred ms) and never throw.
  const BUDGET_MS = 5000;

  const LINES = 100_000;
  const CASES: Array<[name: string, source: string]> = [
    ['one huge line of text', 'a'.repeat(1_000_000)],
    ['one huge line of words', 'palavra '.repeat(150_000)],
    ['a million asterisks', '*'.repeat(1_000_000)],
    ['a million underscores', '_'.repeat(1_000_000)],
    ['unmatched openers', '*a '.repeat(100_000)],
    ['many tiny emphasis spans', '*a* '.repeat(100_000)],
    ['many tiny strong spans', '**a** '.repeat(100_000)],
    ['openers with no closer', '**a '.repeat(50_000) + '* '.repeat(50_000)],
    ['openers then closers of another length', '***a '.repeat(30_000) + 'b** '.repeat(30_000)],
    ['deeply nested emphasis', '*a '.repeat(2000) + 'b*' + ' x*'.repeat(1999)],
    ['open brackets', '['.repeat(200_000)],
    ['close brackets', ']'.repeat(200_000)],
    ['link starts', '[a]('.repeat(60_000)],
    ['link ends', ']('.repeat(100_000)],
    ['links with long targets', '[a](' + 'x'.repeat(500_000) + ')'],
    ['unterminated link targets', '[a](b '.repeat(60_000)],
    ['image starts', '!['.repeat(100_000)],
    ['backticks', '`'.repeat(500_000)],
    ['alternating code span lengths', '` `` ``` '.repeat(60_000)],
    ['unclosed code spans', '`a '.repeat(100_000)],
    ['angle brackets', '<'.repeat(300_000)],
    ['autolink starts', '<a:'.repeat(100_000)],
    ['comment starts', '<!--'.repeat(100_000)],
    ['comments on separate lines', '<!-- a -->\n'.repeat(LINES)],
    ['backslashes', '\\'.repeat(500_000)],
    ['block quote markers', '> '.repeat(300_000)],
    ['block quote lines', '> a\n'.repeat(LINES)],
    ['list markers', '- '.repeat(300_000)],
    ['list lines', '- a\n'.repeat(LINES)],
    ['ordered list lines', '1. a\n'.repeat(LINES)],
    ['nested list lines', '- a\n  - b\n    - c\n      - d\n'.repeat(25_000)],
    ['thematic break noise', '- - - - '.repeat(100_000) + 'x'],
    ['one huge table row', '| a '.repeat(300_000)],
    ['a table with many rows', '| a | b |\n|---|---|\n' + '| 1 | 2 |\n'.repeat(LINES)],
    ['a table delimiter of many columns', '|' + ' a |'.repeat(1000) + '\n|' + '---|'.repeat(1000) + '\n| x |'],
    ['one huge heading', '# ' + 'x'.repeat(1_000_000)],
    ['a heading with a long run of spaces', '# a' + ' '.repeat(300_000) + 'b #'],
    ['heading markers', '# '.repeat(200_000)],
    ['a hundred thousand lines of one paragraph', 'texto\n'.repeat(LINES)],
    ['hard breaks', 'texto  \n'.repeat(LINES)],
    ['code fence lines', '```\n'.repeat(LINES)],
    ['a long fenced block', '```\n' + 'linha\n'.repeat(LINES) + '```'],
    ['setext underlines', 'a\n===\n'.repeat(LINES)],
    ['spaces only', ' '.repeat(1_000_000)],
    ['tabs and spaces', '\t \t '.repeat(200_000)],
    ['blank lines', '\n'.repeat(1_000_000)],
    ['NUL characters', '\0'.repeat(100_000)],
    ['emoji and combining marks', `${String.fromCodePoint(0x1f468, 0x200d, 0x1f469)}e${String.fromCharCode(0x301)}*`.repeat(100_000)],
  ];

  it.each(CASES)('parses %s quickly and safely', (_name, source) => {
    const start = performance.now();
    const blocks = parseMarkdown(source);
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
    walkBlocks(blocks, node => {
      if (node.type === 'link') expect(safeHref(node.href)).toBe(node.href);
    });
  });

  it('limits how deep block quotes and lists nest', () => {
    expect(() => parseMarkdown('>'.repeat(20_000) + ' x')).not.toThrow();
    expect(depthOf(parseMarkdown('> '.repeat(50) + 'x'))).toBeLessThanOrEqual(8);
    expect(depthOf(parseMarkdown('- '.repeat(50) + 'x'))).toBeLessThanOrEqual(8);
  });

  it('falls back to plain text for a paragraph that nests emphasis too deep', () => {
    const deep = parseInline('*a '.repeat(40) + 'b*' + ' x*'.repeat(39));
    expect(deep.every(node => node.type === 'text')).toBe(true);
    // a few levels are fine
    const shallow = parseInline('*a '.repeat(4) + 'b*' + ' x*'.repeat(3));
    expect(shallow.some(node => node.type === 'em')).toBe(true);
  });

  it('renders a large document to the page without trouble', () => {
    const source = Array.from({ length: 2000 }, (_, i) => `## Cláusula ${i}\n\nTexto da **cláusula** ${i}, com [link](/x/${i}) e \`código\`.\n\n- item a\n- item b`).join('\n\n');
    const start = performance.now();
    const container = rendered(source);
    expect(performance.now() - start).toBeLessThan(BUDGET_MS * 2);
    expect(container.querySelectorAll('h2')).toHaveLength(2000);
  });
});
