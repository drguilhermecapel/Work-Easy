// Peças de domínio reutilizadas pelos testes: escolha de ocupação pela política,
// cadastro completo de prestador e conferência de erros do banco.
import { expect } from 'vitest';
import type { Database } from '../../../lib/database.types';
import { DOCUMENTS_BUCKET, type Db, type TestUser, type World } from './world';

type VerificationStep = Database['public']['Enums']['verification_step'];

export interface PolicyRow {
  occupation_slug: string;
  labor_lock: boolean;
  regulated: boolean;
  rating_ranking: boolean;
  verification: VerificationStep[];
  price_units: string[];
}

export interface Neighborhood {
  id: string;
  name: string;
  slug: string;
}

export const REGISTRY_STEP: VerificationStep = 'registro_profissional';

/** Falha da API em forma mínima, igual para erro do PostgREST, do Storage e do Auth. */
interface Failure {
  message: string;
  code?: string;
  details?: string | null;
  statusCode?: string;
}

/** Devolve `data` ou falha o teste com a mensagem do banco. */
export const must = <T>(response: { data: T; error: Failure | null }, what: string): NonNullable<T> => {
  if (response.error) throw new Error(`${what}: ${response.error.message} ${response.error.details ?? ''}`.trim());
  if (response.data === null || response.data === undefined) throw new Error(`${what}: sem resposta`);
  return response.data;
};

/** A regra de negócio recusou: `raise exception '<código>'` com errcode P0001. */
export const expectRule = async (
  pending: PromiseLike<{ error: Failure | null }>,
  code: string,
): Promise<Failure> => {
  const { error } = await pending;
  expect(error, `esperava a recusa "${code}", mas a operação passou`).not.toBeNull();
  expect(error?.message).toBe(code);
  expect(error?.code).toBe('P0001');
  return error as Failure;
};

/** O banco recusou por permissão (grant) ou por política de linha (RLS). */
export const expectDenied = async (pending: PromiseLike<{ error: Failure | null }>): Promise<Failure> => {
  const { error } = await pending;
  expect(error, 'esperava recusa por permissão, mas a operação passou').not.toBeNull();
  expect(['42501', 'PGRST301', 'PGRST202', 'PGRST205']).toContain(error?.code);
  return error as Failure;
};

/** Ids visíveis numa leitura: vazio quando a política filtra ou o grant nega a tabela. */
export const visibleIds = (response: { data: Array<{ id?: string }> | null; error: Failure | null }): string[] => {
  if (response.error) {
    expect(['42501', 'PGRST205']).toContain(response.error.code);
    return [];
  }
  return (response.data ?? []).map(row => row.id).filter((id): id is string => typeof id === 'string');
};

const PAGE = 1000;

export const loadPolicies = async (db: Db): Promise<PolicyRow[]> => {
  const rows: PolicyRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('occupation_policies')
      .select('occupation_slug, labor_lock, regulated, rating_ranking, verification, price_units')
      .order('occupation_slug')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`não leu as políticas: ${error.message}`);
    rows.push(...(data as PolicyRow[]));
    if (data.length < PAGE) return rows;
  }
};

/**
 * Ocupação doméstica: a política tem trava trabalhista e não exige registro
 * profissional. Prefere a que não é de plantão (cuidado tem fluxo próprio).
 */
export const pickDomestic = (policies: PolicyRow[]): PolicyRow => {
  const locked = policies.filter(p => p.labor_lock && !p.verification.includes(REGISTRY_STEP));
  const pick = locked.find(p => !p.price_units.includes('plantao')) ?? locked[0];
  if (!pick) throw new Error('o catálogo não tem ocupação com labor_lock e sem registro profissional');
  return pick;
};

/** Ocupação regulamentada: a política pede registro profissional. Prefere a sem trava. */
export const pickRegulated = (policies: PolicyRow[]): PolicyRow => {
  const regulated = policies.filter(p => p.verification.includes(REGISTRY_STEP));
  const pick = regulated.find(p => !p.labor_lock && !p.price_units.includes('plantao')) ?? regulated[0];
  if (!pick) throw new Error('o catálogo não tem ocupação cuja política peça registro_profissional');
  return pick;
};

export const pickNeighborhood = async (db: Db): Promise<Neighborhood> => {
  const { data, error } = await db.from('neighborhoods').select('id, name, slug').order('slug').limit(1);
  if (error || !data?.[0]) throw new Error(`o seed não tem bairros: ${error?.message ?? 'vazio'}`);
  return data[0];
};

/** Quantas propostas por pedido a plataforma aceita agora (platform_settings.proposal_limit). */
export const proposalLimit = async (db: Db): Promise<number> => {
  const { data, error } = await db.from('platform_settings').select('value').eq('key', 'proposal_limit').single();
  if (error) throw new Error(`não leu proposal_limit: ${error.message}`);
  return Number(data.value);
};

const DOCUMENT_BYTES = Buffer.from('%PDF-1.4\n% arquivo de teste de integração\n');

export interface UploadedDocument {
  id: string;
  step: VerificationStep;
  path: string;
}

/** Envia o arquivo ao bucket privado e registra o documento, como a tela de cadastro faz. */
export const submitDocument = async (
  world: World,
  user: TestUser,
  step: VerificationStep,
): Promise<UploadedDocument> => {
  const path = `${user.id}/${step}-${world.unique('doc')}.pdf`;
  const upload = await user.client.storage.from(DOCUMENTS_BUCKET).upload(path, DOCUMENT_BYTES, {
    contentType: 'application/pdf',
  });
  if (upload.error) throw new Error(`upload de ${step}: ${upload.error.message}`);
  const row = must(
    await user.client.from('provider_documents').insert({ provider_id: user.id, step, storage_path: path }).select('id').single(),
    `documento ${step}`,
  );
  return { id: row.id, step, path };
};

export interface ProviderSetup {
  user: TestUser;
  slug: string;
  documents: UploadedDocument[];
}

/** become_provider + área atendida (bairro). Ainda sem documentos nem aprovação. */
export const registerProvider = async (
  world: World,
  user: TestUser,
  options: { occupation: string; neighborhood: string; registry?: { number: string; uf: string } },
): Promise<string> => {
  const slug = world.unique('prest');
  must(
    await user.client.rpc('become_provider', {
      p_display_name: `Prestador ${user.label}`,
      p_slug: slug,
      p_occupation: options.occupation,
      p_registry_number: options.registry?.number,
      p_registry_uf: options.registry?.uf,
    }),
    'become_provider',
  );
  must(
    await user.client.from('provider_neighborhoods').insert({ provider_id: user.id, neighborhood_id: options.neighborhood }).select('provider_id'),
    'área atendida',
  );
  return slug;
};

/**
 * Prestador pronto para receber pedidos, pelo caminho completo: cadastro, os
 * documentos que a política exige, análise, aceite dos documentos, confirmação do
 * registro (se a política pede) e aprovação da ocupação e do prestador por um admin.
 */
export const makeApprovedProvider = async (
  world: World,
  admin: TestUser,
  options: { label: string; policy: PolicyRow; neighborhood: string },
): Promise<ProviderSetup> => {
  const user = await world.createUser(options.label);
  const needsRegistry = options.policy.verification.includes(REGISTRY_STEP);
  const slug = await registerProvider(world, user, {
    occupation: options.policy.occupation_slug,
    neighborhood: options.neighborhood,
    registry: needsRegistry ? { number: '123456', uf: 'SP' } : undefined,
  });

  const documents: UploadedDocument[] = [];
  for (const step of options.policy.verification) documents.push(await submitDocument(world, user, step));
  must(await user.client.rpc('submit_provider_for_review'), 'submit_provider_for_review');

  for (const document of documents) {
    must(await admin.client.rpc('admin_review_document', { p_document: document.id, p_accept: true }), 'aceite do documento');
  }
  if (needsRegistry) {
    must(
      await admin.client.rpc('admin_set_registry_status', {
        p_provider: user.id,
        p_occupation: options.policy.occupation_slug,
        p_status: 'confirmed',
      }),
      'registro',
    );
  }
  must(
    await admin.client.rpc('admin_set_occupation_approval', {
      p_provider: user.id,
      p_occupation: options.policy.occupation_slug,
      p_approved: true,
    }),
    'aprovação da ocupação',
  );
  must(await admin.client.rpc('admin_set_provider_status', { p_provider: user.id, p_status: 'approved' }), 'aprovação do prestador');
  return { user, slug, documents };
};
