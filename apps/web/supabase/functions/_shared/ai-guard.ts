// Defences shared by the server-side AI assists (quote-assist, care-summary).
//
// Rules that hold for every assist:
// - what a person wrote (a job description, a caregiver's report) is DATA. It reaches the
//   model inside a delimited block whose delimiter characters are neutralized, never as
//   part of the instructions;
// - the model gets no tools and answers a JSON schema only;
// - what comes back is checked here again: a link, markup, contact data or text that reads
//   like an instruction to the model or to the reader makes the whole answer invalid.
// Pure functions (no Deno, no npm), tested with Vitest in test/functions.

import type { Check, Result } from './validate.ts';

/** The model answered something the assist refuses to show. The message never carries the text. */
export class AiOutputError extends Error {}

// ---- Input: clean, delimit, scrub ---------------------------------------------------

// Characters that never belong in text people read and that are used to hide instructions:
// C0/C1 controls (but not \n and \t), soft hyphen, zero-width and bidirectional controls,
// invisible fillers and the Unicode tag characters ("ASCII smuggling").
// deno-lint-ignore no-control-regex
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ￹-￻\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;

/** NFC, no invisible characters, "\n" line breaks, at most one blank line in a row. */
export function cleanUserText(text: string): string {
  return text
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(/\r\n?/g, '\n')
    // line by line: a regex for "spaces before a line break" is quadratic on a long run of spaces
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Lower case without accents: the form in which texts are compared. */
export const foldText = (text: string): string => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** "<" and ">" become single guillemets, so a text can never close the block it sits in. */
export const neutralizeDelimiters = (text: string): string => text.replace(/</g, '‹').replace(/>/g, '›');

/** A block of untrusted text: `<tag>` ... `</tag>`, with the text unable to close it early. */
export const dataBlock = (tag: string, text: string): string => `<${tag}>\n${neutralizeDelimiters(text)}\n</${tag}>`;

// Contact data the assists never need: replaced by a marker before the text leaves the server.
// CNPJ and CPF come before the phone pattern, which would otherwise take part of them.
// Every repetition is bounded: these run on text written by strangers, and an open-ended
// quantifier before "@" is quadratic on a long run of letters.
const CONTACT_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi, '[link omitido]'],
  [/[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63})+/g, '[e-mail omitido]'],
  [/(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g, '[documento omitido]'],
  [/(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g, '[documento omitido]'],
  [/(?<!\d)(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}(?!\d)/g, '[telefone omitido]'],
  [/(?<!\d)9?\d{4}[\s.-]\d{4}(?!\d)/g, '[telefone omitido]'],
];

/** Links, e-mails, CPF/CNPJ and phone numbers become markers. Not a promise to catch every format. */
export function scrubContacts(text: string): string {
  return CONTACT_PATTERNS.reduce((current, [pattern, marker]) => current.replace(pattern, marker), text);
}

/** Text of a user, ready for a data block: cleaned, without contact data, delimiter characters neutralized. */
export const prepareUserText = (text: string): string => neutralizeDelimiters(scrubContacts(cleanUserText(text)));

// ---- Output: what the model must not say ---------------------------------------------

const LINK_PATTERNS: RegExp[] = [
  /\b(?:https?|ftp|file|javascript|vbscript|mailto|tel|sms|whatsapp)\s*:/i,
  /\bdata:[a-z]+\//i,
  /\bwww\./i,
  /\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+/i,
  // A bare address such as "exemplo.com.br", "wa.me/55" or "bit.ly/x" (lower case, as they are
  // written). One label character, a dot and a known ending: no nested repetition, so it is linear.
  /[A-Za-z0-9-]\.(?:com|net|org|edu|gov|info|biz|io|app|dev|me|ly|xyz|online|site|top|club|link|click|store|shop|tech|br)\b/,
];

const MARKUP_PATTERNS: RegExp[] = [
  /<\/?[a-z!][^>]{0,200}>/i,
  /```/,
  /!?\[[^\]]{0,200}\]\(/,
  /^\s{0,3}#{1,6}\s/m,
  /&(?:lt|gt|amp|quot|#\d+|#x[0-9a-f]+);/i,
  /<\|[a-z_]+\|>|\[\/?(?:inst|system)\]/i,
];

// Phrases of someone giving orders to the model, to the system or to the reader. Applied to
// text without accents and in lower case (foldText). They are narrow on purpose: ordinary
// advice ("combine o horário com o cuidador", "o relatório do dia anterior não foi enviado",
// "a partir de segunda") must pass, and a false alarm only costs a new attempt.
const INSTRUCTION_PATTERNS: RegExp[] = [
  /\b(?:ignor\w*|desconsider\w*|descart\w*|sobrescrev\w*|burl\w*)\b.{0,30}\b(?:instruc\w*|regras?|prompt|orientac\w*|comandos?|diretriz\w*)\b/,
  /\b(?:instruc\w*|regras?)\b.{0,25}\b(?:anteriores|acima|originais|do sistema)\b/,
  /\b(?:ignore|disregard|forget|override|bypass)\b.{0,30}\b(?:instructions?|rules?|prompt|previous|above|system|guidelines?)\b/,
  /\b(?:system prompt|prompt do sistema|prompt de sistema|mensagem do sistema|system message|developer message|mensagem do desenvolvedor|instrucoes do sistema)\b/,
  /\b(?:novas? instrucoes?|nova regra|novas regras|new instructions?|updated instructions?)\b/,
  /\ba partir de agora\b.{0,30}\b(?:voce|vc|responda|escreva|diga|aja|seja|use|ignore|obedeca)\b/,
  /\b(?:voce agora e|agora voce e|voce passa a ser|you are now|act as|aja como|finja ser|pretend to be|modo desenvolvedor|developer mode|jailbreak)\b/,
  /(?:^|\n)\s*(?:system|assistant|user|human|sistema|assistente|usuario)\s*:/,
  /\b(?:clique|acesse|visite|baixe|instale)\b.{0,30}\b(?:link|site|endereco)\b/,
  /\b(?:faca|envie|mande|realize|efetue)\b.{0,25}\b(?:pix|transferencia|deposito)\b/,
  /\b(?:responda|retorne|devolva|imprima|repita)\b.{0,40}\b(?:apenas|somente|exatamente|literalmente|palavra por palavra|sem alterar)\b/,
  /\b(?:informe|envie|compartilhe|forneca|digite)\b.{0,30}\b(?:senha|codigo de|token|cpf|cartao|chave)\b/,
];

// A run of 8 or more digits, with the usual separators: a phone, a document or an account number
const CONTACT_DIGITS = /\d(?:[\s.\-()]*\d){7,}/;
const EMAIL = /[\w.+-]{1,64}@[\w-]{1,63}\.[\w.-]{1,100}/;

export const containsLink = (text: string): boolean => LINK_PATTERNS.some(pattern => pattern.test(text));
export const containsMarkup = (text: string): boolean => MARKUP_PATTERNS.some(pattern => pattern.test(text));
export const containsContact = (text: string): boolean => EMAIL.test(text) || CONTACT_DIGITS.test(text);
export const containsMoney = (text: string): boolean => /r\s?\$|\breais\b/.test(foldText(text));

/** The first instruction-like phrase found in the text (a label, never the text), or null. */
export function findInstruction(text: string): string | null {
  const folded = foldText(text);
  const index = INSTRUCTION_PATTERNS.findIndex(pattern => pattern.test(folded));
  return index === -1 ? null : `instruction_${index + 1}`;
}

/**
 * Why a text of the model cannot be shown ("link", "markup", "contact", "instruction"), or
 * null when it is clean. Square brackets are refused too: after the name markers are
 * replaced they would only be markup.
 */
export function unsafeReason(text: string): string | null {
  if (containsLink(text)) return 'link';
  if (containsMarkup(text) || /[[\]]/.test(text)) return 'markup';
  if (containsContact(text)) return 'contact';
  if (findInstruction(text)) return 'instruction';
  return null;
}

/** One text of the model: a string, free of invisible characters, on one line, not empty. */
export function cleanModelText(value: unknown, field: string, { multiline = false } = {}): string {
  if (typeof value !== 'string') throw new AiOutputError(`${field} is not text`);
  const cleaned = cleanUserText(value);
  const text = multiline ? cleaned : cleaned.replace(/\s+/g, ' ');
  if (!text) throw new AiOutputError(`${field} is empty`);
  return text;
}

/** Cuts at `max` characters with an ellipsis (the output is shown, never executed). */
export const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

// ---- Names ---------------------------------------------------------------------------

export interface NameRule {
  names: Array<string | null | undefined>;
  /** What replaces these names in the text, e.g. "[CUIDADOR]". */
  label: string;
}

export interface NameMatcher {
  /** The text with every known name (any case, with or without accents) replaced by its label. */
  redact(text: string): string;
  /** True when a known name is still in the text. */
  contains(text: string): boolean;
}

const PARTICLE_LIST = ['da', 'de', 'do', 'das', 'dos', 'di', 'du', 'del', 'la', 'le', 'van', 'von'];
const PARTICLES = new Set(PARTICLE_LIST);
// Between two words of a full name, any number of particles may stand ("Ana Paula da Silva")
const WORD_GAP = `(?:[\\s-]+(?:${PARTICLE_LIST.join('|')}))*[\\s-]+`;
const ACCENT_CLASSES: Record<string, string> = {
  a: 'aàáâãäå', e: 'eèéêë', i: 'iìíîï', o: 'oòóôõö', u: 'uùúûü', c: 'cç', n: 'nñ', y: 'yýÿ',
};

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The pieces of a name that identify a person: words of 2+ letters except particles ("da", "de"...). */
export function nameTokens(name: string): string[] {
  return name
    .normalize('NFC')
    .split(/[\s\-_,;/]+/)
    .map(token => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(token => token.length >= 2 && !/^\d+$/.test(token) && !PARTICLES.has(foldText(token)));
}

/** The comparable form of a name or of what matched it: lower case, no accents, no particles, single spaces. */
const nameKey = (text: string): string =>
  foldText(text).split(/[\s-]+/).filter(word => word && !PARTICLES.has(word)).join(' ');

const accentInsensitive = (token: string): string =>
  [...foldText(token)].map(char => (ACCENT_CLASSES[char] ? `[${ACCENT_CLASSES[char]}]` : escapeRegExp(char))).join('');

/**
 * Finds the given names in free text: the whole name and each of its words, in any case and
 * with or without accents, only as whole words. A name that appears under two labels keeps
 * the first rule's label. Nicknames and misspellings are not caught.
 */
export function nameMatcher(rules: NameRule[]): NameMatcher {
  const labels = new Map<string, string>();
  const patterns = new Map<string, string>();
  const add = (words: string[], label: string) => {
    const key = nameKey(words.join(' '));
    if (labels.has(key)) return;
    labels.set(key, label);
    patterns.set(key, words.map(accentInsensitive).join(WORD_GAP));
  };
  for (const rule of rules) {
    for (const name of rule.names) {
      const tokens = name ? nameTokens(name) : [];
      if (tokens.length > 1) add(tokens, rule.label);
      for (const token of tokens) add([token], rule.label);
    }
  }
  if (patterns.size === 0) return { redact: text => text, contains: () => false };

  // Longest first, so "Ana Souza" is one match and not "Ana" followed by "Souza"
  const alternatives = [...patterns.values()].sort((a, b) => b.length - a.length);
  const source = `(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`;
  const global = new RegExp(source, 'giu');
  const single = new RegExp(source, 'iu');
  return {
    redact: text => text.replace(global, match => labels.get(nameKey(match)) ?? match),
    contains: text => single.test(text),
  };
}

// ---- Request validators (the generic ones live in validate.ts) -------------------------

const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;

/** An occupation or catalog slug such as "pintor" or "tecnico-de-enfermagem". */
export function slug(): Check<string> {
  return (value, field): Result<string> =>
    typeof value === 'string' && SLUG.test(value.trim())
      ? { ok: true, value: value.trim() }
      : { ok: false, errors: [`${field}: identificador inválido`] };
}

/** A list of at most `max` valid items; the errors name the index of the bad one. */
export function arrayOf<T>(item: Check<T>, { max }: { max: number }): Check<T[]> {
  return (value, field): Result<T[]> => {
    if (!Array.isArray(value)) return { ok: false, errors: [`${field}: lista obrigatória`] };
    if (value.length > max) return { ok: false, errors: [`${field}: no máximo ${max} itens`] };
    const out: T[] = [];
    const errors: string[] = [];
    value.forEach((entry, index) => {
      const result = item(entry, `${field}[${index}]`);
      if (result.ok) out.push(result.value);
      else errors.push(...result.errors);
    });
    return errors.length ? { ok: false, errors } : { ok: true, value: out };
  };
}
