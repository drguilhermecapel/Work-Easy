import type { ConsentPurpose } from '../services/types';

// Version of the text each consent refers to. Bump a version when the text
// changes: the account page then asks again, and the history keeps both.
// TODO: alinhar com as versões publicadas dos Termos e da Política de Privacidade (/legal).
export const CONSENT_VERSIONS: Record<ConsentPurpose, string> = {
  terms: '2026-10-rascunho',
  privacy: '2026-10-rascunho',
  marketing: '2026-10',
  background_check: '2026-10',
  location: '2026-10',
};
