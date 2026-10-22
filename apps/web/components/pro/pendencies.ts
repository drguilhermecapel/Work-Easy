import { findOccupation } from '../../catalog';
import { VERIFICATION_LABELS } from '../../catalog/labels';
import type { VerificationStep } from '../../catalog/types';
import type { PolicyView, ProviderDocumentRow, ProviderOccupationRow } from '../../services/providers';
import type { ServiceRow } from '../../services/proServices';
import type { ProviderRow } from '../../services/types';

/** Verification steps the policies of the provider's occupations ask for, without repeats, in policy order. */
export const requiredSteps = (
  occupations: Pick<ProviderOccupationRow, 'occupation_slug'>[],
  policies: Record<string, PolicyView | undefined>,
): VerificationStep[] => {
  const steps: VerificationStep[] = [];
  for (const { occupation_slug } of occupations) {
    for (const step of policies[occupation_slug]?.verification ?? []) if (!steps.includes(step)) steps.push(step);
  }
  return steps;
};

export type StepState = 'missing' | 'submitted' | 'accepted' | 'rejected';

export interface StepSummary {
  step: VerificationStep;
  state: StepState;
  /** Newest document of the step, if any. */
  latest: ProviderDocumentRow | null;
  /** Why the newest rejected document was refused. */
  rejectionReason: string | null;
}

const RANK: Record<StepState, number> = { accepted: 3, submitted: 2, rejected: 1, missing: 0 };

/**
 * State of each required step: accepted beats submitted beats rejected, because the
 * database counts a step as done with a submitted or accepted document.
 */
export const summarizeSteps = (steps: VerificationStep[], documents: ProviderDocumentRow[]): StepSummary[] =>
  steps.map(step => {
    const own = documents.filter(doc => doc.step === step);
    let state: StepState = 'missing';
    for (const doc of own) if (RANK[doc.status] > RANK[state]) state = doc.status;
    const rejected = own.find(doc => doc.status === 'rejected') ?? null;
    return {
      step,
      state,
      latest: own[0] ?? null,
      rejectionReason: state === 'rejected' ? (rejected?.rejection_reason ?? null) : null,
    };
  });

export interface Pendency {
  id: string;
  text: string;
  to: string;
}

export interface PendencyInput {
  provider: ProviderRow;
  occupations: ProviderOccupationRow[];
  policies: Record<string, PolicyView | undefined>;
  documents: ProviderDocumentRow[];
  neighborhoodCount: number;
  services: Pick<ServiceRow, 'active'>[];
  availabilityCount: number;
}

const stepLabels = (summaries: StepSummary[]): string =>
  summaries.map(item => VERIFICATION_LABELS[item.step]).join('; ');

/** What is still missing in the registration, each item with the screen that fixes it. */
export const computePendencies = (input: PendencyInput): Pendency[] => {
  const { provider, occupations, policies, documents, neighborhoodCount, services, availabilityCount } = input;
  const list: Pendency[] = [];
  const summaries = summarizeSteps(requiredSteps(occupations, policies), documents);
  const missing = summaries.filter(item => item.state === 'missing');
  const rejected = summaries.filter(item => item.state === 'rejected');

  if (provider.status === 'suspended') {
    list.push({ id: 'suspended', text: 'Seu cadastro está suspenso. Fale com o suporte do WorkEasy.', to: '/pro/cadastro' });
  }
  for (const occupation of occupations.filter(o => o.registry_status === 'rejected')) {
    const name = findOccupation(occupation.occupation_slug)?.name ?? occupation.occupation_slug;
    list.push({ id: `registry-${occupation.occupation_slug}`, text: `O registro profissional de ${name} foi recusado. Confira o número e a UF.`, to: '/pro/cadastro' });
  }
  if (provider.status === 'draft' || provider.status === 'pending_review') {
    if (missing.length > 0) list.push({ id: 'documents-missing', text: `Envie os documentos: ${stepLabels(missing)}.`, to: '/pro/cadastro' });
    for (const item of rejected) {
      list.push({
        id: `document-${item.step}`,
        text: `Documento recusado (${VERIFICATION_LABELS[item.step]})${item.rejectionReason ? `: ${item.rejectionReason}` : ''}. Envie outro.`,
        to: '/pro/cadastro',
      });
    }
  }
  if (neighborhoodCount === 0) {
    list.push({ id: 'neighborhoods', text: 'Escolha os bairros em que você atende. Sem isso você não recebe pedidos.', to: '/pro/cadastro' });
  }
  if (provider.status === 'draft' && missing.length === 0 && rejected.length === 0) {
    list.push({ id: 'submit', text: 'Envie o cadastro para análise.', to: '/pro/cadastro' });
  }
  if (!services.some(service => service.active)) {
    list.push({ id: 'services', text: 'Cadastre ao menos um serviço com preço.', to: '/pro/servicos' });
  }
  if (availabilityCount === 0) {
    list.push({ id: 'availability', text: 'Defina os dias e horários em que você atende.', to: '/pro/agenda' });
  }
  return list;
};
