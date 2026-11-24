import { describe, expect, it } from 'vitest';
import { NO_FACTS, nothingRead, type PlatformFacts } from '../../components/captacao/usePlatformFacts';
import { PENDING, commissionText, days, proRows, proposalsText } from '../../components/captacao/copy';

const KNOWN: PlatformFacts = {
  proPriceCents: 4900,
  proTrialDays: 30,
  freeProposalsPerMonth: 5,
  proposalLimit: 3,
  laborLockDays: 2,
  commissionEnabled: false,
};

const rows = (facts: PlatformFacts, loading = false): Record<string, string> =>
  Object.fromEntries(proRows(facts, loading).map(row => [row.term, row.value]));

describe('sentences with a number from the platform', () => {
  it('pluralizes', () => {
    expect(days(1)).toBe('1 dia');
    expect(days(30)).toBe('30 dias');
    expect(proposalsText(1)).toBe('Cada pedido recebe até 1 proposta.');
    expect(proposalsText(3)).toBe('Cada pedido recebe até 3 propostas.');
  });

  it('says the limit exists without a number when it is not known', () => {
    expect(proposalsText(null)).toBe('Cada pedido recebe um número limitado de propostas.');
  });

  it('names the commission only for what was read', () => {
    expect(commissionText(false)).toMatch(/^Hoje está desligada/);
    expect(commissionText(true)).toMatch(/^Está ligada para algumas ocupações/);
    expect(commissionText(null)).not.toMatch(/desligada|ligada/);
  });
});

describe('proRows', () => {
  it('prints every number it was given', () => {
    const text = rows(KNOWN);
    expect(text['Preço do plano Pro']).toMatch(/^R\$\s49,00 por mês\.$/);
    expect(text['Teste grátis do Pro']).toMatch(/^30 dias para quem nunca assinou/);
    expect(text['Propostas no plano grátis']).toBe('Até 5 propostas novas por mês em pedidos da plataforma.');
    expect(text['Comissão sobre pedidos da plataforma']).toMatch(/^Hoje está desligada/);
  });

  it('prints no digit at all when nothing is known', () => {
    const all = proRows(NO_FACTS, false).map(row => `${row.term} ${row.value}`).join('\n');
    expect(all).not.toMatch(/\d/);
    expect(all).not.toMatch(/R\$/);
  });

  it('prints only the numbers it has, one by one', () => {
    const onlyPrice = rows({ ...NO_FACTS, proPriceCents: 6990 });
    expect(onlyPrice['Preço do plano Pro']).toMatch(/69,90/);
    expect(onlyPrice['Teste grátis do Pro']).not.toMatch(/\d/);
    expect(onlyPrice['Propostas no plano grátis']).not.toMatch(/\d/);
    const onlyTrial = rows({ ...NO_FACTS, proTrialDays: 14 });
    expect(onlyTrial['Teste grátis do Pro']).toMatch(/^14 dias/);
    expect(onlyTrial['Preço do plano Pro']).not.toMatch(/\d/);
  });

  it('says it is reading while it reads, and never a stale number', () => {
    const text = rows(KNOWN, true);
    expect(text['Preço do plano Pro']).toBe(PENDING);
    expect(text['Teste grátis do Pro']).toBe(PENDING);
    expect(text['Propostas no plano grátis']).toBe(PENDING);
    expect(text['Comissão sobre pedidos da plataforma']).toBe(PENDING);
  });

  it('keeps the rows that depend on no number', () => {
    const text = rows(NO_FACTS);
    expect(text['Cancelamento']).toBe('Você pode cancelar a assinatura quando quiser.');
    expect(text['Cobrança de clientes seus']).toMatch(/não cobra comissão sobre essas cobranças/);
  });
});

describe('nothingRead', () => {
  it('is true only when every value is null', () => {
    expect(nothingRead(NO_FACTS)).toBe(true);
    expect(nothingRead({ ...NO_FACTS, commissionEnabled: false })).toBe(false);
    expect(nothingRead({ ...NO_FACTS, proposalLimit: 3 })).toBe(false);
  });
});
