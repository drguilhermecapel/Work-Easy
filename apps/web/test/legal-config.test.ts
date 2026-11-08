import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_VERSIONS, LEGAL_DOCS, company, legalDocById, legalInForce } from '../config/legal';
import { parseMarkdown, safeHref } from '../lib/markdownParser';
import type { ConsentPurpose } from '../services/types';

const COMPANY_VARIABLES = ['VITE_COMPANY_NAME', 'VITE_COMPANY_CNPJ', 'VITE_COMPANY_ADDRESS', 'VITE_SAC_EMAIL', 'VITE_SAC_WHATSAPP'];

const clearCompany = () => COMPANY_VARIABLES.forEach(name => vi.stubEnv(name, ''));

describe('company()', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is empty when nothing is configured', () => {
    clearCompany();
    expect(company()).toEqual({});
    expect(Object.keys(company())).toEqual([]);
  });

  it('returns what is configured and leaves out empty values', () => {
    clearCompany();
    vi.stubEnv('VITE_COMPANY_NAME', 'Acme Serviços Ltda');
    vi.stubEnv('VITE_COMPANY_CNPJ', '12.345.678/0001-95');
    expect(company()).toEqual({ name: 'Acme Serviços Ltda', cnpj: '12.345.678/0001-95' });
    vi.stubEnv('VITE_COMPANY_ADDRESS', 'Rua Exemplo, 100, São Paulo, SP');
    vi.stubEnv('VITE_SAC_EMAIL', 'sac@example.com');
    vi.stubEnv('VITE_SAC_WHATSAPP', '+55 (11) 99999-9999');
    expect(company()).toEqual({
      name: 'Acme Serviços Ltda',
      cnpj: '12.345.678/0001-95',
      address: 'Rua Exemplo, 100, São Paulo, SP',
      sacEmail: 'sac@example.com',
      sacWhatsapp: '5511999999999',
    });
  });

  it('treats blank values as empty and tidies the whitespace', () => {
    clearCompany();
    vi.stubEnv('VITE_COMPANY_NAME', '   ');
    vi.stubEnv('VITE_COMPANY_ADDRESS', '  Rua   Exemplo,\n 100  ');
    expect(company()).toEqual({ address: 'Rua Exemplo, 100' });
  });

  it('leaves out an e-mail or WhatsApp number that cannot work', () => {
    clearCompany();
    vi.stubEnv('VITE_SAC_EMAIL', 'não é um e-mail');
    vi.stubEnv('VITE_SAC_WHATSAPP', '99999-9999');
    expect(company()).toEqual({});
    vi.stubEnv('VITE_SAC_EMAIL', 'a@b');
    vi.stubEnv('VITE_SAC_WHATSAPP', '1'.repeat(16));
    expect(company()).toEqual({});
  });
});

describe('legal registry', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('lists the three documents with their routes', () => {
    expect(LEGAL_DOCS.map(doc => [doc.id, doc.route])).toEqual([
      ['termos', '/termos'],
      ['privacidade', '/privacidade'],
      ['sac', '/sac'],
    ]);
    for (const doc of LEGAL_DOCS) {
      expect(doc.title).not.toBe('');
      expect(doc.label).not.toBe('');
      expect(doc.summary).not.toBe('');
      expect(legalDocById(doc.id)).toBe(doc);
    }
  });

  it('marks every version as a draft until the texts are declared in force', () => {
    vi.stubEnv('VITE_LEGAL_STATUS', '');
    expect(legalInForce()).toBe(false);
    for (const doc of LEGAL_DOCS) expect(doc.version).toMatch(/^\d{4}-\d{2}-rascunho$/);

    vi.stubEnv('VITE_LEGAL_STATUS', 'em revisão');
    expect(legalInForce()).toBe(false);
    vi.stubEnv('VITE_LEGAL_STATUS', 'VIGENTE');
    expect(legalInForce()).toBe(false);

    vi.stubEnv('VITE_LEGAL_STATUS', 'vigente');
    expect(legalInForce()).toBe(true);
    for (const doc of LEGAL_DOCS) expect(doc.version).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('CONSENT_VERSIONS', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('follows the published texts for terms and privacy', () => {
    vi.stubEnv('VITE_LEGAL_STATUS', '');
    expect(CONSENT_VERSIONS.terms).toBe(legalDocById('termos').version);
    expect(CONSENT_VERSIONS.privacy).toBe(legalDocById('privacidade').version);
    // what was recorded before the registry existed stays valid
    expect(CONSENT_VERSIONS.terms).toBe('2026-10-rascunho');
    expect(CONSENT_VERSIONS.privacy).toBe('2026-10-rascunho');
  });

  it('asks for the consent again when the draft becomes the text in force', () => {
    vi.stubEnv('VITE_LEGAL_STATUS', '');
    const draft = { terms: CONSENT_VERSIONS.terms, privacy: CONSENT_VERSIONS.privacy };
    vi.stubEnv('VITE_LEGAL_STATUS', 'vigente');
    expect(CONSENT_VERSIONS.terms).not.toBe(draft.terms);
    expect(CONSENT_VERSIONS.privacy).not.toBe(draft.privacy);
    expect(CONSENT_VERSIONS.terms).toBe(legalDocById('termos').version);
  });

  it('has a version for every purpose', () => {
    const purposes: ConsentPurpose[] = ['terms', 'privacy', 'marketing', 'background_check', 'location'];
    for (const purpose of purposes) expect(CONSENT_VERSIONS[purpose]).toMatch(/^\d{4}-\d{2}/);
  });
});

describe('content/legal', () => {
  const read = (id: string): string => readFileSync(join(process.cwd(), 'content', 'legal', `${id}.md`), 'utf8');

  it.each(LEGAL_DOCS.map(doc => doc.id))('%s has a text that opens with its title', id => {
    expect(existsSync(join(process.cwd(), 'content', 'legal', `${id}.md`))).toBe(true);
    const source = read(id);
    expect(source.trim()).not.toBe('');
    expect(source.length).toBeLessThan(500_000);
    const blocks = parseMarkdown(source);
    expect(blocks.length).toBeGreaterThan(0);
    // pages/legal/LegalDocPage.tsx prints the title itself and leaves a leading "#" out
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1 });
  });

  it.each(LEGAL_DOCS.map(doc => doc.id))('%s has no link the renderer would refuse', id => {
    // [text](target) with a target the renderer shows as plain text would be a typo in the text
    const targets = Array.from(read(id).matchAll(/\]\(\s*<?([^)\s>]+)/g), match => match[1]);
    for (const target of targets) expect(safeHref(target), target).not.toBeNull();
  });
});
