// A small Markdown parser for the legal texts (content/legal/*.md).
//
// Safe by construction: it builds a tree of text and structure and never HTML.
// Raw HTML in the source (tags, entities) stays literal text; links are limited
// to http, https, mailto and relative targets (anything else is shown as typed);
// images are reduced to their alt text; nesting, input size per link and total
// work are bounded, so a hostile or huge line cannot hang or crash the page.
//
// Supported: headings (# and underlined), paragraphs, *emphasis*, **strong**,
// ordered and unordered lists (nested), tables, block quotes, horizontal rules,
// `inline code`, fenced code, [links](url), <https://autolinks> and hard line
// breaks. HTML comments are dropped. Not supported: indented code, reference
// links, footnotes, task lists, strikethrough and raw HTML.

export type Align = 'left' | 'center' | 'right' | null;

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'br' }
  | { type: 'em'; children: Inline[] }
  | { type: 'strong'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type Block =
  | { type: 'heading'; level: HeadingLevel; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'blockquote'; children: Block[] }
  | { type: 'list'; ordered: boolean; start: number; tight: boolean; items: Block[][] }
  | { type: 'code'; value: string }
  | { type: 'hr' }
  | { type: 'table'; align: Align[]; header: Inline[][]; rows: Inline[][][] };

// ---- Limits ---------------------------------------------------------------

/** Block quotes and lists nest at most this deep; deeper markers are plain text. */
const MAX_BLOCK_DEPTH = 6;
/** Emphasis and links nest at most this deep; a paragraph that needs more becomes plain text. */
const MAX_INLINE_DEPTH = 10;
const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 500;
const MAX_TABLE_COLUMNS = 40;
/** A run of * or _ longer than this is literal text. */
const MAX_DELIMITER_RUN = 8;
/** Inline work allowed per source character, plus a base; beyond it the paragraph becomes plain text. */
const WORK_PER_CHAR = 40;
const WORK_BASE = 2000;

// ---- Links ----------------------------------------------------------------

const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):/;
// Control characters, invisible format characters, separators (browsers drop tabs and
// newlines inside a URL, so "java\tscript:" must not slip through) and backslashes
// (browsers read "\" as "/", so "/\host" would leave the site).
const UNSAFE_URL_CHARS = /[\p{Cc}\p{Cf}\p{Z}\\]/u;

/**
 * The target of a link when it is safe to put in an anchor: http, https, mailto
 * or a relative reference. Anything else (javascript:, data:, vbscript:, file:,
 * "//host", whitespace or control characters inside) gives null.
 */
export const safeHref = (raw: string): string | null => {
  const href = raw.trim();
  if (href === '' || href.length > MAX_URL_LENGTH || UNSAFE_URL_CHARS.test(href)) return null;
  const scheme = SCHEME.exec(href);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    if (name === 'mailto') return href.length > 'mailto:'.length ? href : null;
    if (name === 'http' || name === 'https') return /^https?:\/\/[^/?#]+/i.test(href) ? href : null;
    return null;
  }
  // "//host" is an absolute URL without a scheme
  return href.startsWith('//') ? null : href;
};

// ---- Inline ----------------------------------------------------------------

class LimitError extends Error {}

class Budget {
  constructor(private left: number) {}
  spend(steps: number): void {
    this.left -= steps;
    if (this.left < 0) throw new LimitError('inline work limit');
  }
}

type NodeKind = 'text' | 'code' | 'br' | 'wrap' | 'bracket';

interface INode {
  kind: NodeKind;
  /** Text, code, or the literal characters of a delimiter run or bracket. */
  value: string;
  wrap: 'em' | 'strong' | 'link';
  href: string;
  kids: INode[];
  depth: number;
  prev: INode | null;
  next: INode | null;
}

const makeNode = (kind: NodeKind, value = ''): INode => ({ kind, value, wrap: 'em', href: '', kids: [], depth: 0, prev: null, next: null });

interface Delim {
  node: INode;
  ch: string;
  count: number;
  orig: number;
  canOpen: boolean;
  canClose: boolean;
  prev: Delim | null;
  next: Delim | null;
}

interface Bracket {
  node: INode;
  image: boolean;
  active: boolean;
  /** Last delimiter before the bracket: emphasis inside the link text never pairs with anything before it. */
  delimBefore: Delim | null;
}

const SPECIALS = /[\\`*_[\]!<\n]/g;
const ASCII_PUNCT = /[!-/:-@[-`{-~]/;
const URL_AUTOLINK = /<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]{0,2000})>/y;
const EMAIL_AUTOLINK = /<([^\s<>@]{1,64}@[A-Za-z0-9.-]{1,255})>/y;
const WHITESPACE = /\s/;
const PUNCTUATION = /[\p{P}\p{S}]/u;

const isSpace = (ch: string | undefined): boolean => ch === undefined || WHITESPACE.test(ch);
const isPunct = (ch: string | undefined): boolean => ch !== undefined && PUNCTUATION.test(ch);

/** Whether a run of * or _ can open and/or close emphasis, from the characters around it. */
const flanking = (ch: string, before: string | undefined, after: string | undefined) => {
  const left = !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before));
  const right = !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after));
  if (ch === '_') return { canOpen: left && (!right || isPunct(before)), canClose: right && (!left || isPunct(after)) };
  return { canOpen: left, canClose: right };
};

/** The text of some inline nodes without any formatting (alt text of images). */
const plainText = (nodes: INode[]): string =>
  nodes
    .map(node => (node.kind === 'wrap' ? plainText(node.kids) : node.kind === 'br' ? ' ' : node.value))
    .join('');

class InlineParser {
  private head: INode | null = null;
  private tail: INode | null = null;
  private delimHead: Delim | null = null;
  private delimTail: Delim | null = null;
  private brackets: Bracket[] = [];
  private pending = '';
  private backtickRuns: Map<number, number[]> | null = null;
  private backtickCursor = new Map<number, number>();
  private readonly budget: Budget;

  constructor(private readonly src: string) {
    this.budget = new Budget(WORK_BASE + WORK_PER_CHAR * src.length);
  }

  run(): Inline[] {
    const s = this.src;
    const n = s.length;
    let i = 0;
    while (i < n) {
      this.budget.spend(1);
      SPECIALS.lastIndex = i;
      const found = SPECIALS.exec(s);
      const j = found ? found.index : n;
      if (j < n && s[j] === '\n') {
        // spaces before a line break are not text: two or more make it a hard break
        let k = j;
        while (k > i && s[k - 1] === ' ') k--;
        this.pending += s.slice(i, k);
        i = this.lineBreak(j - k >= 2, j);
        continue;
      }
      if (j > i) this.pending += s.slice(i, j);
      if (j >= n) break;
      i = this.special(s[j], j);
    }
    this.flush();
    this.processEmphasis(null);
    return this.convert(this.chain());
  }

  // ---- Tokens ----

  private special(c: string, i: number): number {
    const s = this.src;
    const n = s.length;
    switch (c) {
      case '\\': {
        const next = s[i + 1];
        if (next === '\n') return this.lineBreak(true, i + 1);
        if (next !== undefined && ASCII_PUNCT.test(next)) {
          this.pending += next;
          return i + 2;
        }
        this.pending += '\\';
        return i + 1;
      }
      case '`':
        return this.codeSpan(i);
      case '*':
      case '_': {
        let k = i;
        while (k < n && s[k] === c) k++;
        const run = s.slice(i, k);
        const { canOpen, canClose } = flanking(c, i > 0 ? s[i - 1] : undefined, s[k]);
        if (k - i > MAX_DELIMITER_RUN || (!canOpen && !canClose)) {
          this.pending += run;
          return k;
        }
        this.flush();
        const node = makeNode('text', run);
        this.append(node);
        const delim: Delim = { node, ch: c, count: k - i, orig: k - i, canOpen, canClose, prev: this.delimTail, next: null };
        if (this.delimTail) this.delimTail.next = delim;
        else this.delimHead = delim;
        this.delimTail = delim;
        return k;
      }
      case '[':
        this.openBracket(false);
        return i + 1;
      case '!':
        if (s[i + 1] === '[') {
          this.openBracket(true);
          return i + 2;
        }
        this.pending += '!';
        return i + 1;
      case ']':
        return this.closeBracket(i);
      case '<':
        return this.autolink(i);
      default:
        this.pending += c;
        return i + 1;
    }
  }

  /** Handles the line break at `newline`; returns where scanning goes on (leading spaces of the next line are dropped). */
  private lineBreak(hard: boolean, newline: number): number {
    const s = this.src;
    let i = newline + 1;
    while (i < s.length && s[i] === ' ') i++;
    if (hard) {
      this.flush();
      this.append(makeNode('br'));
    } else {
      this.pending += ' ';
    }
    return i;
  }

  private codeSpan(i: number): number {
    const s = this.src;
    let k = i;
    while (s[k] === '`') k++;
    const length = k - i;
    const close = this.backtickCloser(length, k);
    if (close < 0) {
      this.pending += s.slice(i, k);
      return k;
    }
    let value = s.slice(k, close).replace(/\n/g, ' ');
    if (value.length >= 2 && value[0] === ' ' && value[value.length - 1] === ' ' && value.trim() !== '') value = value.slice(1, -1);
    this.flush();
    this.append(makeNode('code', value));
    return close + length;
  }

  /** Start of the next run of exactly `length` backticks at or after `from`, or -1 (linear overall). */
  private backtickCloser(length: number, from: number): number {
    if (!this.backtickRuns) {
      const runs = new Map<number, number[]>();
      const s = this.src;
      let p = s.indexOf('`');
      while (p >= 0) {
        let q = p;
        while (s[q] === '`') q++;
        const list = runs.get(q - p);
        if (list) list.push(p);
        else runs.set(q - p, [p]);
        p = s.indexOf('`', q);
      }
      this.backtickRuns = runs;
    }
    const list = this.backtickRuns.get(length);
    if (!list) return -1;
    let cursor = this.backtickCursor.get(length) ?? 0;
    while (cursor < list.length && list[cursor] < from) cursor++;
    this.backtickCursor.set(length, cursor);
    return cursor < list.length ? list[cursor] : -1;
  }

  private autolink(i: number): number {
    const s = this.src;
    URL_AUTOLINK.lastIndex = i;
    const url = URL_AUTOLINK.exec(s);
    if (url) {
      const href = safeHref(url[1]);
      if (href) return this.pushLink(href, url[1], i + url[0].length);
    } else {
      EMAIL_AUTOLINK.lastIndex = i;
      const email = EMAIL_AUTOLINK.exec(s);
      if (email) {
        const href = safeHref(`mailto:${email[1]}`);
        if (href) return this.pushLink(href, email[1], i + email[0].length);
      }
    }
    this.pending += '<';
    return i + 1;
  }

  private pushLink(href: string, label: string, end: number): number {
    this.flush();
    const text = makeNode('text', label);
    const link = makeNode('wrap');
    link.wrap = 'link';
    link.href = href;
    link.kids = [text];
    link.depth = 1;
    this.append(link);
    return end;
  }

  // ---- Brackets and links ----

  private openBracket(image: boolean): void {
    this.flush();
    const node = makeNode('bracket', image ? '![' : '[');
    this.append(node);
    this.brackets.push({ node, image, active: true, delimBefore: this.delimTail });
  }

  private closeBracket(i: number): number {
    this.flush();
    const opener = this.brackets.pop();
    const dest = opener?.active ? this.destination(i + 1) : null;
    if (!opener || !dest) {
      // not a link: both brackets stay literal text
      this.pending += ']';
      return i + 1;
    }
    this.processEmphasis(opener.delimBefore);
    const kids = this.detachAfter(opener.node);
    this.remove(opener.node);
    if (opener.image) {
      const alt = plainText(kids);
      if (alt !== '') this.append(makeNode('text', alt));
    } else {
      let depth = 0;
      for (const kid of kids) depth = Math.max(depth, kid.depth);
      if (depth + 1 > MAX_INLINE_DEPTH) throw new LimitError('inline nesting');
      const link = makeNode('wrap');
      link.wrap = 'link';
      link.href = dest.href;
      link.kids = kids;
      link.depth = depth + 1;
      this.append(link);
      // a link cannot contain another link: earlier "[" no longer open one
      for (const bracket of this.brackets) if (!bracket.image) bracket.active = false;
    }
    return dest.end;
  }

  /** "(url)" or "(url "title")" starting at `start`; null when it is not one or the url is not safe. */
  private destination(start: number): { href: string; end: number } | null {
    const s = this.src;
    const n = s.length;
    if (s[start] !== '(') return null;
    let p = this.skipSpaces(start + 1);
    let raw: string;
    if (s[p] === '<') {
      const from = p + 1;
      let q = from;
      while (q < n && s[q] !== '>' && s[q] !== '<' && s[q] !== '\n') {
        this.budget.spend(1);
        if (q - from > MAX_URL_LENGTH) return null;
        q++;
      }
      if (s[q] !== '>') return null;
      raw = s.slice(from, q);
      p = q + 1;
    } else {
      const from = p;
      let depth = 0;
      while (p < n) {
        this.budget.spend(1);
        const ch = s[p];
        if (ch === '\\' && p + 1 < n && ASCII_PUNCT.test(s[p + 1])) {
          p += 2;
          continue;
        }
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch < ' ') break;
        if (ch === '(') depth++;
        else if (ch === ')') {
          if (depth === 0) break;
          depth--;
        }
        p++;
        if (p - from > MAX_URL_LENGTH) return null;
      }
      if (depth !== 0) return null;
      raw = s.slice(from, p);
    }
    const afterDest = p;
    p = this.skipSpaces(p);
    if (p > afterDest && (s[p] === '"' || s[p] === "'" || s[p] === '(')) {
      const closer = s[p] === '(' ? ')' : s[p];
      let q = p + 1;
      while (q < n && s[q] !== closer && q - p <= MAX_TITLE_LENGTH) {
        this.budget.spend(1);
        q++;
      }
      if (s[q] !== closer) return null;
      p = this.skipSpaces(q + 1);
    }
    if (s[p] !== ')') return null;
    const href = safeHref(raw.replace(/\\([!-/:-@[-`{-~])/g, '$1'));
    return href === null ? null : { href, end: p + 1 };
  }

  /** Skips spaces, tabs and at most one line break. */
  private skipSpaces(from: number): number {
    const s = this.src;
    let p = from;
    let newline = false;
    while (p < s.length && (s[p] === ' ' || s[p] === '\t' || (s[p] === '\n' && !newline))) {
      if (s[p] === '\n') newline = true;
      p++;
    }
    return p;
  }

  // ---- Emphasis (the delimiter-stack algorithm of the CommonMark spec) ----

  private processEmphasis(bottom: Delim | null): void {
    const openersBottom = new Map<string, Delim | null>();
    let closer: Delim | null = bottom ? bottom.next : this.delimHead;
    while (closer) {
      this.budget.spend(1);
      if (!closer.canClose) {
        closer = closer.next;
        continue;
      }
      const key = `${closer.ch}${closer.canOpen ? 1 : 0}${closer.orig % 3}`;
      const floor = openersBottom.has(key) ? (openersBottom.get(key) ?? null) : bottom;
      let opener: Delim | null = closer.prev;
      let found: Delim | null = null;
      while (opener && opener !== floor && opener !== bottom) {
        this.budget.spend(1);
        if (opener.ch === closer.ch && opener.canOpen) {
          // "rule of 3": runs whose lengths add up to a multiple of 3 pair only if both are
          const odd = (closer.canOpen || opener.canClose) && closer.orig % 3 !== 0 && (opener.orig + closer.orig) % 3 === 0;
          if (!odd) {
            found = opener;
            break;
          }
        }
        opener = opener.prev;
      }
      if (found) {
        const use = closer.count >= 2 && found.count >= 2 ? 2 : 1;
        this.wrapBetween(found.node, closer.node, use === 2 ? 'strong' : 'em');
        found.count -= use;
        closer.count -= use;
        found.node.value = found.node.value.slice(0, found.node.value.length - use);
        closer.node.value = closer.node.value.slice(use);
        // delimiters between the two can no longer pair with anything outside
        found.next = closer;
        closer.prev = found;
        if (found.count === 0) this.dropDelim(found, true);
        if (closer.count === 0) {
          const next: Delim | null = closer.next;
          this.dropDelim(closer, true);
          closer = next;
        }
      } else {
        openersBottom.set(key, closer.prev);
        const next: Delim | null = closer.next;
        if (!closer.canOpen) this.dropDelim(closer, false);
        closer = next;
      }
    }
    // delimiters left above `bottom` stay as literal text
    if (bottom) {
      bottom.next = null;
      this.delimTail = bottom;
    } else {
      this.delimHead = null;
      this.delimTail = null;
    }
  }

  private wrapBetween(open: INode, close: INode, wrap: 'em' | 'strong'): void {
    const kids: INode[] = [];
    let depth = 0;
    for (let node = open.next; node && node !== close; node = node.next) {
      this.budget.spend(1);
      kids.push(node);
      if (node.depth > depth) depth = node.depth;
    }
    if (depth + 1 > MAX_INLINE_DEPTH) throw new LimitError('inline nesting');
    const wrapper = makeNode('wrap');
    wrapper.wrap = wrap;
    wrapper.kids = kids;
    wrapper.depth = depth + 1;
    wrapper.prev = open;
    wrapper.next = close;
    open.next = wrapper;
    close.prev = wrapper;
  }

  private dropDelim(delim: Delim, removeNode: boolean): void {
    if (delim.prev) delim.prev.next = delim.next;
    else this.delimHead = delim.next;
    if (delim.next) delim.next.prev = delim.prev;
    else this.delimTail = delim.prev;
    if (removeNode) this.remove(delim.node);
  }

  // ---- Node chain ----

  private flush(): void {
    if (this.pending !== '') {
      this.append(makeNode('text', this.pending));
      this.pending = '';
    }
  }

  private append(node: INode): void {
    node.prev = this.tail;
    node.next = null;
    if (this.tail) this.tail.next = node;
    else this.head = node;
    this.tail = node;
  }

  private remove(node: INode): void {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
  }

  /** Takes the nodes after `ref` out of the chain. */
  private detachAfter(ref: INode): INode[] {
    const nodes: INode[] = [];
    for (let node = ref.next; node; node = node.next) {
      this.budget.spend(1);
      nodes.push(node);
    }
    ref.next = null;
    this.tail = ref;
    return nodes;
  }

  private chain(): INode[] {
    const nodes: INode[] = [];
    for (let node = this.head; node; node = node.next) nodes.push(node);
    return nodes;
  }

  // ---- Output ----

  private convert(nodes: INode[]): Inline[] {
    const out: Inline[] = [];
    const text = (value: string) => {
      if (value === '') return;
      const last = out[out.length - 1];
      if (last && last.type === 'text') last.value += value;
      else out.push({ type: 'text', value });
    };
    for (const node of nodes) {
      switch (node.kind) {
        case 'text':
        case 'bracket':
          text(node.value);
          break;
        case 'code':
          out.push({ type: 'code', value: node.value });
          break;
        case 'br':
          out.push({ type: 'br' });
          break;
        case 'wrap': {
          const children = this.convert(node.kids);
          if (node.wrap === 'link') out.push({ type: 'link', href: node.href, children });
          else out.push({ type: node.wrap, children });
          break;
        }
      }
    }
    return out;
  }
}

/** Collapses the source to plain text, for input that exceeds the limits. */
const asPlainText = (src: string): Inline[] => {
  const value = src.replace(/\s+/g, ' ').trim();
  return value === '' ? [] : [{ type: 'text', value }];
};

/** Inline formatting of one block of text. Never throws and never returns markup. */
export const parseInline = (src: string): Inline[] => {
  if (src === '') return [];
  try {
    return new InlineParser(src).run();
  } catch (error) {
    if (error instanceof LimitError) return asPlainText(src);
    throw error;
  }
};

// ---- Blocks ----------------------------------------------------------------

const BLANK = /^[ \t]*$/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const QUOTE = /^ {0,3}> ?/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const BULLET = /^( {0,3})([-*+])( *)(.*)$/;
const ORDERED = /^( {0,3})(\d{1,9})([.)])( *)(.*)$/;
const DELIMITER_CELL = /^:?-+:?$/;

const isBlank = (line: string): boolean => BLANK.test(line);

const leadingSpaces = (line: string): number => {
  let n = 0;
  while (line[n] === ' ') n++;
  return n;
};

const expandTabs = (line: string): string => {
  if (!line.includes('\t')) return line;
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  return line.slice(0, i).replace(/\t/g, '    ') + line.slice(i);
};

/** A fence line that opens a code block (a backtick fence cannot have backticks in its info string). */
const openingFence = (line: string): string | null => {
  const m = FENCE.exec(line);
  return m && !(m[1][0] === '`' && m[2].includes('`')) ? m[1] : null;
};

const closesFence = (line: string, opening: string): boolean => {
  const m = FENCE.exec(line);
  return m !== null && m[1][0] === opening[0] && m[1].length >= opening.length && m[2].trim() === '';
};

/**
 * Drops HTML comments, outside code fences. A comment that never closes is kept
 * as text: hiding the rest of a legal text by accident would be worse.
 */
const stripComments = (lines: string[]): string[] => {
  if (!lines.some(line => line.includes('<!--'))) return lines;
  let lastClose = -1;
  for (let k = lines.length - 1; k >= 0; k--) {
    if (lines[k].includes('-->')) {
      lastClose = k;
      break;
    }
  }
  const out: string[] = [];
  let fence: string | null = null;
  let inComment = false;
  lines.forEach((line, index) => {
    if (!inComment) {
      if (fence) {
        if (closesFence(line, fence)) fence = null;
        out.push(line);
        return;
      }
      const opening = openingFence(line);
      if (opening) {
        fence = opening;
        out.push(line);
        return;
      }
    }
    let result = '';
    let pos = 0;
    while (pos < line.length) {
      if (inComment) {
        const end = line.indexOf('-->', pos);
        if (end < 0) pos = line.length;
        else {
          pos = end + 3;
          inComment = false;
        }
        continue;
      }
      const start = line.indexOf('<!--', pos);
      if (start < 0) {
        result += line.slice(pos);
        break;
      }
      const closesOnThisLine = line.indexOf('-->', start + 4) >= 0;
      if (!closesOnThisLine && lastClose <= index) {
        result += line.slice(pos);
        break;
      }
      result += line.slice(pos, start);
      pos = start + 4;
      inComment = true;
    }
    out.push(result);
  });
  return out;
};

const BOM = String.fromCharCode(0xfeff);
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

const prepare = (source: string): string[] =>
  stripComments(
    (source.startsWith(BOM) ? source.slice(1) : source)
      .replace(/\r\n?/g, '\n')
      .replace(/\0/g, REPLACEMENT_CHARACTER)
      .split('\n')
      .map(expandTabs),
  );

const stripClosingHashes = (text: string): string => {
  let end = text.length;
  while (end > 0 && text[end - 1] === '#') end--;
  if (end === text.length) return text;
  if (end === 0) return '';
  return text[end - 1] === ' ' || text[end - 1] === '\t' ? text.slice(0, end).trimEnd() : text;
};

interface ItemStart {
  indent: number;
  ordered: boolean;
  /** Bullet character, or "." / ")" for ordered lists. */
  marker: string;
  start: number;
  /** Column where the item's content starts. */
  offset: number;
  empty: boolean;
}

const itemFrom = (indent: number, ordered: boolean, marker: string, start: number, width: number, spaces: string, rest: string): ItemStart | null => {
  if (spaces === '' && rest !== '') return null;
  const empty = rest === '';
  const gap = empty || spaces.length > 4 ? 1 : spaces.length;
  return { indent, ordered, marker, start, offset: indent + width + gap, empty };
};

const listItem = (line: string): ItemStart | null => {
  if (HR.test(line)) return null; // "* * *" is a thematic break, not a list
  const bullet = BULLET.exec(line);
  if (bullet) return itemFrom(bullet[1].length, false, bullet[2], 1, 1, bullet[3], bullet[4]);
  const ordered = ORDERED.exec(line);
  if (ordered) return itemFrom(ordered[1].length, true, ordered[3], Number(ordered[2]), ordered[2].length + 1, ordered[4], ordered[5]);
  return null;
};

/** Lines that begin a block of their own: they end a lazy continuation. */
const startsBlock = (line: string): boolean =>
  openingFence(line) !== null || ATX.test(line) || HR.test(line) || QUOTE.test(line) || listItem(line) !== null;

// ---- Tables ----

const splitRow = (line: string): string[] => {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let from = 0;
  for (let k = 0; k < s.length; k++) {
    if (s[k] === '\\') k++;
    else if (s[k] === '|') {
      cells.push(s.slice(from, k));
      from = k + 1;
    }
  }
  cells.push(s.slice(from));
  return cells;
};

const alignments = (line: string): Align[] | null => {
  if (!line.includes('|') || !line.includes('-')) return null;
  const cells = splitRow(line);
  if (cells.length > MAX_TABLE_COLUMNS) return null;
  const aligns: Align[] = [];
  for (const cell of cells) {
    const text = cell.trim();
    if (!DELIMITER_CELL.test(text)) return null;
    const left = text.startsWith(':');
    const right = text.endsWith(':');
    aligns.push(left && right ? 'center' : right ? 'right' : left ? 'left' : null);
  }
  return aligns;
};

const isTableStart = (lines: string[], i: number): boolean => {
  if (i + 1 >= lines.length || !lines[i].includes('|')) return false;
  const aligns = alignments(lines[i + 1]);
  return aligns !== null && splitRow(lines[i]).length === aligns.length;
};

const parseTable = (lines: string[], from: number): { block: Block; next: number } => {
  const align = alignments(lines[from + 1]) ?? [];
  const cellsOf = (line: string): Inline[][] => {
    const cells = splitRow(line);
    return align.map((_, col) => parseInline((cells[col] ?? '').trim()));
  };
  const header = cellsOf(lines[from]);
  const rows: Inline[][][] = [];
  let i = from + 2;
  while (i < lines.length && !isBlank(lines[i]) && openingFence(lines[i]) === null && !ATX.test(lines[i]) && !QUOTE.test(lines[i])) {
    rows.push(cellsOf(lines[i]));
    i++;
  }
  return { block: { type: 'table', align, header, rows }, next: i };
};

// ---- Lists ----

const parseList = (lines: string[], from: number, depth: number): { block: Block; next: number } => {
  const first = listItem(lines[from]) as ItemStart;
  const items: Block[][] = [];
  let tight = true;
  let i = from;
  while (i < lines.length) {
    const item = i === from ? first : listItem(lines[i]);
    if (!item || item.ordered !== first.ordered || item.marker !== first.marker) break;
    const content: string[] = [lines[i].slice(item.offset)];
    i++;
    let afterBlank = false;
    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) {
        content.push('');
        afterBlank = true;
        i++;
        continue;
      }
      const indent = leadingSpaces(line);
      // a nested block may be indented less than the content column (e.g. "  - x" under "1. y")
      if (indent >= Math.min(item.offset, item.indent + 2)) {
        content.push(line.slice(Math.min(indent, item.offset)));
        afterBlank = false;
        i++;
        continue;
      }
      if (afterBlank || startsBlock(line)) break;
      content.push(line.trimStart()); // lazy continuation of the item's paragraph
      i++;
    }
    let blanks = 0;
    while (content.length > 1 && content[content.length - 1] === '') {
      content.pop();
      blanks++;
    }
    const next = i < lines.length ? listItem(lines[i]) : null;
    if (blanks > 0 && next && next.ordered === first.ordered && next.marker === first.marker) tight = false;
    items.push(parseBlocks(content, depth + 1));
  }
  return { block: { type: 'list', ordered: first.ordered, start: first.start, tight, items }, next: i };
};

// ---- Paragraphs ----

const parseParagraph = (lines: string[], from: number, nested: boolean): { block: Block; next: number } => {
  const collected: string[] = [lines[from]];
  let i = from + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) break;
    const setext = SETEXT.exec(line);
    if (setext) {
      const level: HeadingLevel = setext[1][0] === '=' ? 1 : 2;
      const text = collected.map(l => l.trim()).join('\n');
      return { block: { type: 'heading', level, children: parseInline(text) }, next: i + 1 };
    }
    if (openingFence(line) !== null || ATX.test(line) || HR.test(line)) break;
    if (nested) {
      if (QUOTE.test(line)) break;
      const item = listItem(line);
      if (item && !item.empty && (!item.ordered || item.start === 1)) break;
    }
    if (isTableStart(lines, i)) break;
    collected.push(line);
    i++;
  }
  const text = collected.map((line, index) => (index === collected.length - 1 ? line.trim() : line.trimStart())).join('\n');
  return { block: { type: 'paragraph', children: parseInline(text) }, next: i };
};

// ---- Document ----

function parseBlocks(lines: string[], depth: number): Block[] {
  const blocks: Block[] = [];
  const nested = depth < MAX_BLOCK_DEPTH;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }

    const opening = openingFence(line);
    if (opening) {
      const indent = leadingSpaces(line);
      const body: string[] = [];
      i++;
      while (i < lines.length && !closesFence(lines[i], opening)) {
        body.push(lines[i].slice(Math.min(indent, leadingSpaces(lines[i]))));
        i++;
      }
      i++; // the closing fence (or the end of the text)
      blocks.push({ type: 'code', value: body.join('\n') });
      continue;
    }

    const atx = ATX.exec(line);
    if (atx) {
      const content = stripClosingHashes((atx[2] ?? '').trim());
      blocks.push({ type: 'heading', level: atx[1].length as HeadingLevel, children: parseInline(content) });
      i++;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    if (nested && QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length) {
        const current = lines[i];
        if (QUOTE.test(current)) {
          inner.push(current.replace(QUOTE, ''));
          i++;
        } else if (!isBlank(current) && inner.length > 0 && !isBlank(inner[inner.length - 1]) && !startsBlock(current)) {
          inner.push(current); // lazy continuation
          i++;
        } else break;
      }
      blocks.push({ type: 'blockquote', children: parseBlocks(inner, depth + 1) });
      continue;
    }

    if (nested && listItem(line)) {
      const list = parseList(lines, i, depth);
      blocks.push(list.block);
      i = list.next;
      continue;
    }

    if (isTableStart(lines, i)) {
      const table = parseTable(lines, i);
      blocks.push(table.block);
      i = table.next;
      continue;
    }

    const paragraph = parseParagraph(lines, i, nested);
    blocks.push(paragraph.block);
    i = paragraph.next;
  }
  return blocks;
}

/** Parses a Markdown text into a tree of plain text and structure. Never throws on any input. */
export const parseMarkdown = (source: string): Block[] => parseBlocks(prepare(source), 0);

/**
 * The text without the "key: value" front matter at its top, between two "---" lines. The build reads
 * it for the page description (scripts/prerender.mjs); a legal page shows only the body.
 */
export const stripFrontMatter = (source: string): string => {
  const text = (source.startsWith(BOM) ? source.slice(1) : source).replace(/\r\n?/g, '\n');
  return text.replace(/^---\n[\s\S]*?\n---\n?/, '');
};
