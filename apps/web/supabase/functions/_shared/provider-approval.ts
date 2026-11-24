// Who may move money: a provider charges clients, starts the Pro subscription (and its free trial)
// or opens a receiving account only when the admin approved the account and at least one
// occupation, whose registry was not rejected. Same rule the marketplace uses to show a provider.

import { HttpError } from './http.ts';

export interface OccupationApproval {
  occupation_slug: string;
  approved: boolean;
  registry_status: string;
}

export interface ProviderApproval {
  status: string;
  occupations: OccupationApproval[];
}

export function isApprovedOccupation(occupation: OccupationApproval): boolean {
  return occupation.approved && occupation.registry_status !== 'rejected';
}

/** Approved account with an approved occupation (the given one, when a slug is passed). */
export function isApprovedProvider(provider: ProviderApproval, occupationSlug?: string): boolean {
  if (provider.status !== 'approved') return false;
  return provider.occupations.some(
    occupation => isApprovedOccupation(occupation) && (occupationSlug === undefined || occupation.occupation_slug === occupationSlug),
  );
}

export function requireApprovedProvider(provider: ProviderApproval, occupationSlug?: string): void {
  if (!isApprovedProvider(provider, occupationSlug)) {
    throw new HttpError(
      403,
      'provider_not_approved',
      'Esta conta ainda não está aprovada para cobranças e assinaturas. Aguarde a análise do cadastro.',
    );
  }
}
