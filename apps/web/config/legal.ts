import type { ConsentPurpose } from '../services/types';

// Legal texts, consent versions and the company identification of a build.
// The texts live in content/legal/*.md and are shown by pages/legal/.

export type LegalDocId = 'termos' | 'privacidade' | 'sac';

export interface LegalDoc {
  id: LegalDocId;
  /** Heading of the page. */
  title: string;
  /** Short link text (footer). */
  label: string;
  route: string;
  /**
   * Version of the text the person sees. Bump the edition below when the text
   * changes: consents are recorded with this version, so the account page asks
   * again. Until VITE_LEGAL_STATUS=vigente the version carries "-rascunho", so
   * publishing the final text also changes it, even if the edition did not.
   */
  readonly version: string;
  /** One line for the /legal index. */
  summary: string;
}

/**
 * True only when the owner declared the published texts in force
 * (VITE_LEGAL_STATUS=vigente, set after a lawyer approved them). Anything else
 * keeps the "draft under legal review" notice on every legal page.
 */
export const legalInForce = (): boolean => (import.meta.env.VITE_LEGAL_STATUS ?? '').trim() === 'vigente';

const legalDoc = (id: LegalDocId, title: string, label: string, route: string, edition: string, summary: string): LegalDoc => ({
  id,
  title,
  label,
  route,
  summary,
  get version() {
    return legalInForce() ? edition : `${edition}-rascunho`;
  },
});

const termos = legalDoc(
  'termos',
  'Termos de Uso',
  'Termos de Uso',
  '/termos',
  '2026-10',
  'O que a plataforma faz e não faz, as regras para clientes e profissionais, cancelamento e reembolso.',
);
const privacidade = legalDoc(
  'privacidade',
  'Política de Privacidade',
  'Privacidade',
  '/privacidade',
  '2026-10',
  'Quais dados são tratados, para quê, por quanto tempo e como exercer os seus direitos.',
);
const sac = legalDoc(
  'sac',
  'Atendimento ao Consumidor (SAC)',
  'SAC',
  '/sac',
  '2026-10',
  'Como falar com a empresa para tirar dúvidas, reclamar ou cancelar.',
);

export const LEGAL_DOCS: readonly LegalDoc[] = [termos, privacidade, sac];

export const legalDocById = (id: LegalDocId): LegalDoc => LEGAL_DOCS.find(doc => doc.id === id) ?? termos;

// Version of the text each consent refers to. Terms and privacy follow the
// published legal texts above; the other purposes have no document of their own yet.
export const CONSENT_VERSIONS: Record<ConsentPurpose, string> = {
  get terms() {
    return termos.version;
  },
  get privacy() {
    return privacidade.version;
  },
  marketing: '2026-10',
  background_check: '2026-10',
  location: '2026-10',
  // The declaration that the person is 18 or over: its own text, asked of every account that lacks it
  age_declaration: '2026-11',
};

export interface CompanyInfo {
  /** Corporate name. */
  name?: string;
  cnpj?: string;
  /** Physical address. */
  address?: string;
  sacEmail?: string;
  /** Digits only, with country code (e.g. 5511999999999). */
  sacWhatsapp?: string;
}

const clean = (value: string | undefined): string | undefined => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text === '' ? undefined : text;
};

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/**
 * Identification of the supplier, from the build variables VITE_COMPANY_NAME,
 * VITE_COMPANY_CNPJ, VITE_COMPANY_ADDRESS, VITE_SAC_EMAIL and VITE_SAC_WHATSAPP.
 * Empty (or malformed e-mail and phone) values are left out of the result.
 * Online offers must show the supplier's corporate name, CNPJ, physical and
 * electronic address (Decreto 7.962/2013, art. 2, I and II); the footer and the
 * legal pages print what is configured here.
 */
export const company = (): CompanyInfo => {
  const env = import.meta.env;
  const info: CompanyInfo = {};

  const name = clean(env.VITE_COMPANY_NAME);
  if (name) info.name = name;
  const cnpj = clean(env.VITE_COMPANY_CNPJ);
  if (cnpj) info.cnpj = cnpj;
  const address = clean(env.VITE_COMPANY_ADDRESS);
  if (address) info.address = address;
  const email = clean(env.VITE_SAC_EMAIL);
  if (email && EMAIL.test(email)) info.sacEmail = email;
  const digits = (env.VITE_SAC_WHATSAPP ?? '').replace(/\D/g, '');
  if (digits.length >= 12 && digits.length <= 15) info.sacWhatsapp = digits;

  return info;
};
