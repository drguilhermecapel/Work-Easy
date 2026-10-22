import type { LucideIcon } from 'lucide-react';

// The catalog is data, not code: every occupation carries a policy that the
// app applies on its own (what onboarding will ask for, how it is billed,
// whether ranking by rating is allowed). The values describe the planned
// product; in this prototype nothing is collected or checked.

/** What provider onboarding will ask for. */
export type VerificationStep =
  | 'documento_selfie'
  | 'cadastro_fiscal'
  | 'registro_profissional'
  | 'antecedentes'
  | 'certificado_curso'
  | 'cnh'
  | 'licenca_orgao'
  | 'seguro_rc';

/**
 * comissao_primeiro_servico: commission only on the first job with a client
 * the platform brought. so_assinatura: the professional council restricts fee
 * sharing, so only the tool subscription is charged. sob_consulta_juridica:
 * waiting on legal advice.
 */
export type Billing = 'comissao_primeiro_servico' | 'so_assinatura' | 'sob_consulta_juridica';

export type ProviderKind = 'autonomo' | 'autonomo_ou_empresa' | 'somente_empresa_licenciada';

export type PriceUnit =
  | 'hora'
  | 'dia'
  | 'servico'
  | 'm2'
  | 'sessao'
  | 'plantao'
  | 'mes'
  | 'projeto'
  | 'km'
  | 'pacote'
  | 'pagina'
  | 'palavra'
  | 'aula'
  | 'evento'
  | 'visita';

export type ServiceLocation = 'domicilio' | 'online' | 'estabelecimento' | 'empresa_cliente' | 'externo';

/** "conferido" only when the legal basis was checked against a primary or credible source. */
export type Confidence = 'conferido' | 'a_confirmar';

export interface Occupation {
  slug: string;
  name: string;
  /** Lower-case search terms a client might type, other than the name. */
  synonyms: string[];
  areaSlug: string;
}

export interface Area {
  slug: string;
  name: string;
  description: string;
  icon: LucideIcon;
  occupations: Occupation[];
}

export interface OccupationPolicy {
  regulated: boolean;
  /** Council or agency, e.g. "CFM/CRM", "OAB", "CONFEA/CREA"; empty when not regulated. */
  regulatorBody: string;
  /** Name of the registry number, e.g. "CRM", "OAB", "Cadastur"; empty when not regulated. */
  registryName: string;
  legalBasis: string;
  verification: VerificationStep[];
  backgroundCheck: boolean;
  billing: Billing;
  ratingRanking: boolean;
  /** Domestic work: more than 2 days a week in the same home is employment (LC 150/2015). */
  laborLock: boolean;
  providerType: ProviderKind;
  audienceMinors: boolean;
  priceUnits: PriceUnit[];
  locations: ServiceLocation[];
  notes: string;
  confidence: Confidence;
  sources: string[];
}
