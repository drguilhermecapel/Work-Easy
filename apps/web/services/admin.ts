import { VERIFICATION_LABELS } from '../catalog/labels';
import type { VerificationStep } from '../catalog/types';
import { AppError, toAppError } from '../lib/errors';
import { saoPauloDateTime } from '../lib/timezone';
import { db, unwrap, unwrapMaybe } from './client';
import { occupationNames } from './occupationNames';
import type { BookingStatus } from './bookings';
import type { DataRequestKind, PlanCode, ProviderStatus } from './types';

// Administration: everything here is allowed only by the database (is_admin()
// in RLS and in the admin_* functions). The screens hide it from other users,
// but the real check is server side.

export const PAGE_SIZE = 25;

/** One page of a list; `hasMore` is true when a next page exists (one extra row is read to know). */
export interface Page<T> {
  rows: T[];
  hasMore: boolean;
  page: number;
}

const toPage = <T>(rows: T[], page: number): Page<T> => ({ rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page });
const from = (page: number) => page * PAGE_SIZE;
/** Inclusive end, one row past the page. */
const to = (page: number) => page * PAGE_SIZE + PAGE_SIZE;

const invalid = (message: string): AppError => new AppError('invalid_input', { message });

/** The reason an administrator gives for an action, trimmed; refuses an empty one. */
export const requireReason = (reason: string | null | undefined): string => {
  const text = reason?.trim() ?? '';
  if (!text) throw invalid('Informe o motivo. Ele fica no histórico da ação.');
  return text;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value.trim());

// ---------------------------------------------------------------------------
// Errors of the admin_* functions in the words of the administration
// ---------------------------------------------------------------------------

/** What the database says in `details` (after the code) when it refuses an admin action. */
const REFUSAL_DETAILS: Record<string, string> = {
  'file missing': 'O arquivo deste documento não está no armazenamento. Peça ao prestador para enviar de novo antes de aceitar.',
  'policy missing':
    'Esta ocupação não tem política no catálogo, então não há como saber quais documentos exigir. Cadastre a política antes de aprovar ou de incluir a ocupação.',
  'registry rejected': 'O registro profissional desta ocupação está rejeitado. Só depois de uma nova conferência a ocupação pode ser aprovada.',
  'reason required to reject': 'Informe o motivo da rejeição. O prestador vê o motivo.',
  'reason required': 'Informe o motivo. Ele fica no histórico da ação.',
};

const stepList = (steps: string): string =>
  steps
    .split(',')
    .map(step => step.trim())
    .filter(Boolean)
    .map(step => VERIFICATION_LABELS[step as VerificationStep] ?? step)
    .join('; ');

/**
 * The database refuses with generic codes (`not_allowed`, `documents_missing`) written for the
 * provider's screens; here the same refusal is explained for the person who administers.
 */
export const explainAdminError = (err: unknown): AppError => {
  const app = toAppError(err);
  const details = (app.cause as { details?: unknown } | null | undefined)?.details;
  const text = typeof details === 'string' ? details.trim() : '';
  if (app.code === 'documents_missing') {
    const steps = stepList(text);
    return new AppError('documents_missing', {
      cause: app.cause,
      detail: app.detail,
      message: steps
        ? `O banco recusou a aprovação: falta documento aceito para ${steps}.`
        : 'O banco recusou a aprovação: faltam documentos aceitos exigidos pela política da ocupação.',
    });
  }
  if (app.code === 'not_allowed' && REFUSAL_DETAILS[text]) {
    return new AppError('not_allowed', { cause: app.cause, detail: app.detail, message: REFUSAL_DETAILS[text] });
  }
  return app;
};

/** Runs an admin call; a refusal comes out explained by `explainAdminError`. */
const guarded = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (err) {
    throw explainAdminError(err);
  }
};

/** Names of profiles by id; a best-effort read (an anonymized account has none). */
const profileNames = async (ids: Array<string | null>): Promise<Map<string, string>> => {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const { data } = await db().from('profiles').select('id, full_name').in('id', unique);
  for (const row of (data ?? []) as Array<{ id: string; full_name: string | null }>) if (row.full_name) names.set(row.id, row.full_name);
  return names;
};

// ---------------------------------------------------------------------------
// Metrics (view admin_metrics)
// ---------------------------------------------------------------------------

export const METRIC_ENTITIES = ['requests', 'proposals', 'bookings', 'payments', 'providers'] as const;
export type MetricEntity = (typeof METRIC_ENTITIES)[number];

export interface MetricRow {
  entity: MetricEntity;
  status: string;
  this_week: number;
  this_month: number;
  total: number;
}

const isMetricEntity = (value: unknown): value is MetricEntity => (METRIC_ENTITIES as readonly unknown[]).includes(value);

export const getMetrics = async (): Promise<MetricRow[]> => {
  const rows = unwrap<Array<Record<string, unknown>>>(await db().from('admin_metrics').select('entity, status, this_week, this_month, total'));
  return rows
    .filter(row => isMetricEntity(row.entity))
    .map(row => ({
      entity: row.entity as MetricEntity,
      status: String(row.status),
      this_week: Number(row.this_week) || 0,
      this_month: Number(row.this_month) || 0,
      total: Number(row.total) || 0,
    }));
};

export const groupMetrics = (rows: MetricRow[]): Record<MetricEntity, MetricRow[]> => {
  const grouped: Record<MetricEntity, MetricRow[]> = { requests: [], proposals: [], bookings: [], payments: [], providers: [] };
  for (const row of rows) grouped[row.entity].push(row);
  return grouped;
};

// ---------------------------------------------------------------------------
// Provider queue and review
// ---------------------------------------------------------------------------

export type RegistryStatus = 'not_required' | 'informed' | 'confirmed' | 'rejected';
export type DocumentStatus = 'submitted' | 'accepted' | 'rejected';

/** admin_provider_queue */
export interface QueueRow {
  provider_id: string;
  display_name: string;
  slug: string;
  status: ProviderStatus;
  created_at: string;
  full_name: string | null;
  phone: string | null;
  occupations: string[];
  registries_to_review: number;
  occupations_to_approve: number;
  documents_submitted: number;
  documents_accepted: number;
  documents_rejected: number;
}

const QUEUE_COLUMNS =
  'provider_id, display_name, slug, status, created_at, full_name, phone, occupations, registries_to_review, occupations_to_approve, documents_submitted, documents_accepted, documents_rejected';

const COUNTS = ['registries_to_review', 'occupations_to_approve', 'documents_submitted', 'documents_accepted', 'documents_rejected'] as const;

export const listProviderQueue = async (): Promise<QueueRow[]> => {
  const rows = unwrap<QueueRow[]>(await db().from('admin_provider_queue').select(QUEUE_COLUMNS));
  // Counts are bigint in the view: make sure they are numbers
  return rows.map(row => {
    const next = { ...row, occupations: row.occupations ?? [] };
    for (const key of COUNTS) next[key] = Number(row[key]) || 0;
    return next;
  });
};

// ---------------------------------------------------------------------------
// List of providers (search by name, filter by status)
// ---------------------------------------------------------------------------

/** "queue": registrations in review and approved providers with an occupation still to approve (admin_provider_queue). */
export type ProviderListFilter = 'queue' | 'all' | ProviderStatus;
export const PROVIDER_LIST_FILTERS: ProviderListFilter[] = ['queue', 'all', 'pending_review', 'approved', 'suspended', 'draft'];

export interface ProviderListRow {
  id: string;
  display_name: string;
  full_name: string | null;
  slug: string;
  status: ProviderStatus;
  created_at: string;
  occupations: Array<{ slug: string; name: string }>;
  /** Occupations not approved yet. */
  occupations_to_approve: number;
  /** Review counters; only the queue view has them. */
  review: Pick<QueueRow, 'documents_submitted' | 'documents_accepted' | 'documents_rejected' | 'registries_to_review'> | null;
}

const fold = (text: string): string => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Escapes the wildcards of LIKE so that what is typed is searched literally. */
const likeLiteral = (text: string): string => text.replace(/[\\%_]/g, char => `\\${char}`);

/**
 * Providers for the administration list. The queue filter is the work to do (read from the queue view,
 * searched here, in order of arrival); the other filters read the whole table, a page at a time, by name.
 */
export const listProviders = async ({
  filter = 'queue',
  search = '',
  page = 0,
}: {
  filter?: ProviderListFilter;
  search?: string;
  page?: number;
} = {}): Promise<Page<ProviderListRow>> => {
  const term = search.trim();

  if (filter === 'queue') {
    const needle = fold(term);
    const queue = (await listProviderQueue()).filter(
      row => !needle || [row.display_name, row.full_name ?? '', row.slug].some(text => fold(text).includes(needle)),
    );
    const names = await occupationNames(queue.flatMap(row => row.occupations));
    return {
      rows: queue.map(row => ({
        id: row.provider_id,
        display_name: row.display_name,
        full_name: row.full_name,
        slug: row.slug,
        status: row.status,
        created_at: row.created_at,
        occupations: row.occupations.map(slug => ({ slug, name: names.get(slug) ?? slug })),
        occupations_to_approve: row.occupations_to_approve,
        review: {
          documents_submitted: row.documents_submitted,
          documents_accepted: row.documents_accepted,
          documents_rejected: row.documents_rejected,
          registries_to_review: row.registries_to_review,
        },
      })),
      hasMore: false,
      page: 0,
    };
  }

  let query = db().from('providers').select(PROVIDER_COLUMNS).order('display_name', { ascending: true }).order('id', { ascending: true });
  if (filter !== 'all') query = query.eq('status', filter);
  if (term) query = query.ilike('display_name', `%${likeLiteral(term)}%`);
  const result = toPage(unwrap<AdminProvider[]>(await query.range(from(page), to(page))), page);
  const ids = result.rows.map(row => row.id);
  if (ids.length === 0) return { ...result, rows: [] };

  const [occupationRows, names] = await Promise.all([
    db().from('provider_occupations').select('provider_id, occupation_slug, is_primary, approved').in('provider_id', ids),
    profileNames(ids),
  ]);
  const occupations = unwrap<Array<{ provider_id: string; occupation_slug: string; is_primary: boolean; approved: boolean }>>(occupationRows);
  const labels = await occupationNames(occupations.map(row => row.occupation_slug));
  return {
    ...result,
    rows: result.rows.map(row => {
      const own = occupations
        .filter(o => o.provider_id === row.id)
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.occupation_slug.localeCompare(b.occupation_slug));
      return {
        id: row.id,
        display_name: row.display_name,
        full_name: names.get(row.id) ?? null,
        slug: row.slug,
        status: row.status,
        created_at: row.created_at,
        occupations: own.map(o => ({ slug: o.occupation_slug, name: labels.get(o.occupation_slug) ?? o.occupation_slug })),
        occupations_to_approve: own.filter(o => !o.approved).length,
        review: null,
      };
    }),
  };
};

export interface AdminProvider {
  id: string;
  display_name: string;
  slug: string;
  bio: string | null;
  status: ProviderStatus;
  plan: PlanCode;
  created_at: string;
}

export interface AdminPolicy {
  occupation_slug: string;
  regulated: boolean;
  regulator_body: string | null;
  registry_name: string | null;
  legal_basis: string | null;
  verification: VerificationStep[];
  sources: string[] | null;
}

export interface AdminOccupation {
  provider_id: string;
  occupation_slug: string;
  /** Name in pt-BR (static catalog, else the database; the slug when neither knows it). */
  name: string;
  is_primary: boolean;
  registry_number: string | null;
  registry_uf: string | null;
  registry_status: RegistryStatus;
  approved: boolean;
  policy: AdminPolicy | null;
}

export interface AdminDocument {
  id: string;
  provider_id: string;
  step: VerificationStep;
  storage_path: string;
  status: DocumentStatus;
  reviewed_at: string | null;
  expires_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface ProviderDetail {
  provider: AdminProvider;
  profile: { full_name: string | null; phone: string | null } | null;
  occupations: AdminOccupation[];
  documents: AdminDocument[];
}

const PROVIDER_COLUMNS = 'id, display_name, slug, bio, status, plan, created_at';
const OCCUPATION_COLUMNS = 'provider_id, occupation_slug, is_primary, registry_number, registry_uf, registry_status, approved';
const DOCUMENT_COLUMNS = 'id, provider_id, step, storage_path, status, reviewed_at, expires_at, rejection_reason, created_at';
const POLICY_COLUMNS = 'occupation_slug, regulated, regulator_body, registry_name, legal_basis, verification, sources';

export const getProviderDetail = async (providerId: string): Promise<ProviderDetail> => {
  const [provider, profile, occupations, documents] = await Promise.all([
    db().from('providers').select(PROVIDER_COLUMNS).eq('id', providerId).maybeSingle(),
    db().from('profiles').select('full_name, phone').eq('id', providerId).maybeSingle(),
    db().from('provider_occupations').select(OCCUPATION_COLUMNS).eq('provider_id', providerId).order('is_primary', { ascending: false }),
    db().from('provider_documents').select(DOCUMENT_COLUMNS).eq('provider_id', providerId).order('created_at', { ascending: false }),
  ]);
  const providerRow = unwrapMaybe<AdminProvider>(provider);
  if (!providerRow) throw new AppError('not_found');
  const occupationRows = unwrap<Array<Omit<AdminOccupation, 'policy' | 'name'>>>(occupations);
  const documentRows = unwrap<AdminDocument[]>(documents);

  const slugs = occupationRows.map(row => row.occupation_slug);
  const names = await occupationNames(slugs);
  const policies = new Map<string, AdminPolicy>();
  if (slugs.length > 0) {
    const rows = unwrap<AdminPolicy[]>(await db().from('occupation_policies').select(POLICY_COLUMNS).in('occupation_slug', slugs));
    for (const policy of rows) policies.set(policy.occupation_slug, { ...policy, verification: policy.verification ?? [] });
  }

  return {
    provider: providerRow,
    profile: unwrapMaybe<{ full_name: string | null; phone: string | null }>(profile),
    occupations: occupationRows.map(row => ({ ...row, name: names.get(row.occupation_slug) ?? row.occupation_slug, policy: policies.get(row.occupation_slug) ?? null })),
    documents: documentRows,
  };
};

/** Verification steps of the occupation's policy that still lack an accepted document. */
export const missingSteps = (policy: AdminPolicy | null, documents: Pick<AdminDocument, 'step' | 'status'>[]): VerificationStep[] =>
  (policy?.verification ?? []).filter(step => !documents.some(d => d.step === step && d.status === 'accepted'));

/** Where one verification step of a policy stands: accepted, sent (to review), only rejected, or nothing sent. */
export type StepState = 'accepted' | 'submitted' | 'rejected' | 'missing';

export interface StepStatus {
  step: VerificationStep;
  state: StepState;
  /** Every document of the provider for this step, newest first as given. */
  documents: AdminDocument[];
}

/** The steps the policy asks for, each with its state (an accepted document wins over a sent one, a sent one over a rejected one). */
export const stepStatuses = (policy: AdminPolicy | null, documents: AdminDocument[]): StepStatus[] =>
  (policy?.verification ?? []).map(step => {
    const own = documents.filter(d => d.step === step);
    const state: StepState = own.some(d => d.status === 'accepted')
      ? 'accepted'
      : own.some(d => d.status === 'submitted')
        ? 'submitted'
        : own.some(d => d.status === 'rejected')
          ? 'rejected'
          : 'missing';
    return { step, state, documents: own };
  });

/**
 * Whether the screen offers "approve occupation": every step of the policy accepted and a registry
 * that was not rejected. It is the same rule as admin_set_occupation_approval, shown to save a
 * trip; the database is the one that decides.
 */
export const approvalCheck = (
  occupation: Pick<AdminOccupation, 'registry_status' | 'policy'>,
  documents: AdminDocument[],
): { ok: boolean; reason: string | null } => {
  if (occupation.registry_status === 'rejected') {
    return { ok: false, reason: 'O registro está rejeitado. Com ele rejeitado a ocupação não pode ser aprovada.' };
  }
  // Without a policy nothing says which documents are required, so the database refuses too
  if (!occupation.policy) {
    return { ok: false, reason: 'Esta ocupação não tem política no catálogo, então não há como saber quais documentos exigir.' };
  }
  const missing = missingSteps(occupation.policy, documents);
  if (missing.length > 0) {
    return { ok: false, reason: `Falta documento aceito para: ${missing.map(step => VERIFICATION_LABELS[step] ?? step).join('; ')}.` };
  }
  return { ok: true, reason: null };
};

/**
 * Link to the search for the public lookup of the professional council, only when the policy names
 * a registry. The registry number and the state are NOT sent to the search engine: it is the
 * administrator who types the number the screen shows into the council's own lookup. The app does
 * not know each council's address, and the result is not read back.
 */
export const registryLookupUrl = (policy: Pick<AdminPolicy, 'registry_name' | 'regulator_body'> | null): string | null => {
  const registry = policy?.registry_name?.trim();
  if (!registry) return null;
  const terms = ['consulta pública', registry, policy?.regulator_body?.trim()].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(terms)}`;
};

/** Signed address (5 minutes) of a file in the private bucket provider-documents. */
export const SIGNED_URL_SECONDS = 300;

export const createDocumentUrl = async (storagePath: string): Promise<string> => {
  const { data, error } = await db().storage.from('provider-documents').createSignedUrl(storagePath, SIGNED_URL_SECONDS);
  if (error) throw toAppError(error);
  if (!data?.signedUrl) throw new AppError('not_found');
  return data.signedUrl;
};

/** Accepts or rejects a document; rejecting needs a reason (the provider sees it). */
export const reviewDocument = async (documentId: string, accept: boolean, reason?: string): Promise<DocumentStatus> => {
  const text = accept ? reason?.trim() || null : requireReason(reason);
  const data = await guarded(async () =>
    unwrapMaybe<unknown>(await db().rpc('admin_review_document', { p_document: documentId, p_accept: accept, p_reason: text })),
  );
  return data === 'accepted' || data === 'rejected' ? data : accept ? 'accepted' : 'rejected';
};

export const setRegistryStatus = async (
  providerId: string,
  occupation: string,
  status: 'confirmed' | 'rejected',
  reason: string,
): Promise<RegistryStatus> => {
  const text = requireReason(reason);
  await guarded(async () =>
    unwrapMaybe<unknown>(
      await db().rpc('admin_set_registry_status', { p_provider: providerId, p_occupation: occupation, p_status: status, p_reason: text }),
    ),
  );
  return status;
};

export const setProviderStatus = async (providerId: string, status: 'approved' | 'suspended', reason: string): Promise<ProviderStatus> => {
  const text = requireReason(reason);
  await guarded(async () =>
    unwrapMaybe<unknown>(await db().rpc('admin_set_provider_status', { p_provider: providerId, p_status: status, p_reason: text })),
  );
  return status;
};

/** Approves or withdraws one occupation of a provider (approving needs the accepted documents the policy asks for). */
export const setOccupationApproval = async (providerId: string, occupation: string, approved: boolean, reason: string): Promise<boolean> => {
  const text = requireReason(reason);
  await guarded(async () =>
    unwrapMaybe<unknown>(
      await db().rpc('admin_set_occupation_approval', {
        p_provider: providerId,
        p_occupation: occupation,
        p_approved: approved,
        p_reason: text,
      }),
    ),
  );
  return approved;
};

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

/** admin_open_disputes */
export interface DisputeRow {
  booking_id: string;
  occupation_slug: string;
  /** tstzrange text */
  period: string;
  price_cents: number;
  platform_fee_cents: number;
  origin: 'platform' | 'own';
  client_id: string | null;
  client_name: string | null;
  provider_id: string | null;
  provider_name: string | null;
  disputed_at: string | null;
  payment_statuses: string[];
}

const DISPUTE_COLUMNS =
  'booking_id, occupation_slug, period, price_cents, platform_fee_cents, origin, client_id, client_name, provider_id, provider_name, disputed_at, payment_statuses';

export const listOpenDisputes = async (): Promise<DisputeRow[]> =>
  unwrap<DisputeRow[]>(await db().from('admin_open_disputes').select(DISPUTE_COLUMNS)).map(row => ({
    ...row,
    payment_statuses: row.payment_statuses ?? [],
  }));

/** How an administrator may close a dispute. */
export type DisputeOutcome = Extract<BookingStatus, 'released' | 'canceled'>;

export const resolveDispute = async (bookingId: string, outcome: DisputeOutcome, reason: string): Promise<DisputeOutcome> => {
  const text = requireReason(reason);
  await guarded(async () => unwrapMaybe<unknown>(await db().rpc('admin_resolve_dispute', { p_booking: bookingId, p_to: outcome, p_reason: text })));
  return outcome;
};

// ---------------------------------------------------------------------------
// Payments (list of the table; `raw` is never read: the grant is by column)
// ---------------------------------------------------------------------------

export type AdminPaymentStatus = 'pending' | 'confirmed' | 'received' | 'held' | 'released' | 'refunded' | 'failed' | 'canceled';
export const PAYMENT_STATUSES: AdminPaymentStatus[] = ['pending', 'confirmed', 'received', 'held', 'released', 'refunded', 'failed', 'canceled'];

export interface AdminPayment {
  id: string;
  booking_id: string | null;
  quote_id: string | null;
  provider_id: string | null;
  payer_id: string | null;
  method: 'pix' | 'credit_card' | 'boleto' | 'undefined';
  amount_cents: number;
  platform_fee_cents: number;
  status: AdminPaymentStatus;
  escrow: boolean;
  due_date: string | null;
  created_at: string;
  provider_name?: string | null;
}

const PAYMENT_COLUMNS =
  'id, booking_id, quote_id, provider_id, payer_id, method, amount_cents, platform_fee_cents, status, escrow, due_date, created_at';

export interface PaymentFilters {
  /** Only this payment (the link of the "Exigem atenção" list). */
  id?: string;
  status?: AdminPaymentStatus | '';
  /** "YYYY-MM-DD" in São Paulo, inclusive */
  from?: string;
  /** "YYYY-MM-DD" in São Paulo, inclusive */
  to?: string;
  page?: number;
}

const nextDay = (day: string): string => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
};

/** Start (inclusive) and end (exclusive) instants of a São Paulo date interval. */
export const periodBounds = (fromDay?: string, toDay?: string): { start: string | null; end: string | null } => {
  const start = fromDay ? saoPauloDateTime(fromDay, '00:00') : null;
  const end = toDay ? saoPauloDateTime(nextDay(toDay), '00:00') : null;
  if ((fromDay && !start) || (toDay && !end)) throw invalid('Confira as datas do período.');
  if (start && end && start.getTime() >= end.getTime()) throw invalid('A data inicial não pode ser depois da data final.');
  return { start: start?.toISOString() ?? null, end: end?.toISOString() ?? null };
};

export const listPayments = async ({ id, status, from: fromDay, to: toDay, page = 0 }: PaymentFilters = {}): Promise<Page<AdminPayment>> => {
  const { start, end } = periodBounds(fromDay, toDay);
  if (id && !isUuid(id)) throw invalid('O pagamento do link não foi reconhecido. Abra a lista e escolha de novo.');
  let query = db().from('payments').select(PAYMENT_COLUMNS).order('created_at', { ascending: false });
  if (id) query = query.eq('id', id.trim());
  if (status) query = query.eq('status', status);
  if (start) query = query.gte('created_at', start);
  if (end) query = query.lt('created_at', end);
  const rows = unwrap<AdminPayment[]>(await query.range(from(page), to(page)));
  const result = toPage(rows, page);

  const providerIds = [...new Set(result.rows.map(row => row.provider_id).filter((id): id is string => Boolean(id)))];
  if (providerIds.length > 0) {
    const { data } = await db().from('providers').select('id, display_name').in('id', providerIds);
    const names = new Map(((data ?? []) as Array<{ id: string; display_name: string }>).map(p => [p.id, p.display_name]));
    result.rows = result.rows.map(row => ({ ...row, provider_name: row.provider_id ? names.get(row.provider_id) ?? null : null }));
  }
  return result;
};

// ---------------------------------------------------------------------------
// Payments that need a person (view admin_payments_attention)
// ---------------------------------------------------------------------------

/** The audit entries the webhook writes when money needs a manual decision. */
export type PaymentAttentionAction = 'payment.refund_failed' | 'payment.received_after_cancel';

/** One row of admin_payments_attention: an open audit entry with the payment it is about. */
export interface PaymentAttentionEvent {
  audit_id: number;
  action: PaymentAttentionAction;
  at: string;
  data: Record<string, unknown>;
}

/** A payment with every open entry of the view, newest first. */
export interface PaymentAttention {
  payment_id: string;
  booking_id: string | null;
  provider_id: string | null;
  provider_name: string | null;
  method: AdminPayment['method'] | null;
  amount_cents: number;
  status: AdminPaymentStatus;
  events: PaymentAttentionEvent[];
}

interface AttentionRow {
  audit_id: number;
  action: PaymentAttentionAction;
  at: string;
  data: Record<string, unknown> | null;
  payment_id: string;
  booking_id: string | null;
  provider_id: string | null;
  method: AdminPayment['method'] | null;
  amount_cents: number;
  status: AdminPaymentStatus;
}

const ATTENTION_COLUMNS = 'audit_id, action, at, data, payment_id, booking_id, provider_id, method, amount_cents, status';
/** Most entries read at once; an operation with more open cases than this has a bigger problem. */
export const ATTENTION_LIMIT = 200;

export interface PaymentAttentionList {
  payments: PaymentAttention[];
  /** More open entries exist than the screen reads. */
  truncated: boolean;
}

/**
 * Payments with an open payment.refund_failed or payment.received_after_cancel entry, newest first.
 * "Open" is decided by the view: a later payment.refunded_after_cancel or payment.reviewed closes it.
 */
export const listPaymentsNeedingAttention = async (): Promise<PaymentAttentionList> => {
  const rows = unwrap<AttentionRow[]>(
    await db()
      .from('admin_payments_attention')
      .select(ATTENTION_COLUMNS)
      .order('at', { ascending: false })
      .order('audit_id', { ascending: false })
      .range(0, ATTENTION_LIMIT),
  );
  const truncated = rows.length > ATTENTION_LIMIT;
  const byPayment = new Map<string, PaymentAttention>();
  for (const row of rows.slice(0, ATTENTION_LIMIT)) {
    const event: PaymentAttentionEvent = { audit_id: row.audit_id, action: row.action, at: row.at, data: row.data ?? {} };
    const known = byPayment.get(row.payment_id);
    if (known) known.events.push(event);
    else
      byPayment.set(row.payment_id, {
        payment_id: row.payment_id,
        booking_id: row.booking_id,
        provider_id: row.provider_id,
        provider_name: null,
        method: row.method,
        amount_cents: row.amount_cents,
        status: row.status,
        events: [event],
      });
  }
  const payments = [...byPayment.values()];

  const providerIds = [...new Set(payments.map(p => p.provider_id).filter((id): id is string => Boolean(id)))];
  if (providerIds.length > 0) {
    const { data } = await db().from('providers').select('id, display_name').in('id', providerIds);
    const names = new Map(((data ?? []) as Array<{ id: string; display_name: string }>).map(p => [p.id, p.display_name]));
    for (const payment of payments) payment.provider_name = payment.provider_id ? names.get(payment.provider_id) ?? null : null;
  }
  return { payments, truncated };
};

/**
 * Records that a payment needing manual action was dealt with (audit `payment.reviewed`, with the
 * reason). The reason is required here and in the database.
 */
export const markPaymentReviewed = async (paymentId: string, reason: string): Promise<void> => {
  const text = requireReason(reason);
  await guarded(async () => unwrapMaybe<unknown>(await db().rpc('admin_review_payment', { p_payment: paymentId, p_reason: text })));
};

// ---------------------------------------------------------------------------
// Settings (platform_settings, written only by admin_set_setting)
// ---------------------------------------------------------------------------

export const BOOLEAN_SETTINGS = ['commission_enabled', 'escrow_enabled'] as const;
export const NUMBER_SETTINGS = ['commission_bps', 'pro_price_cents', 'proposal_limit', 'labor_lock_days_per_week'] as const;
export type BooleanSettingKey = (typeof BOOLEAN_SETTINGS)[number];
export type NumberSettingKey = (typeof NUMBER_SETTINGS)[number];

export interface SettingRow {
  key: string;
  value: unknown;
  internal: boolean;
  updated_at: string | null;
}

export const listSettings = async (): Promise<SettingRow[]> =>
  unwrap<SettingRow[]>(await db().from('platform_settings').select('key, value, internal, updated_at').order('key', { ascending: true }));

/** Limits accepted by the screen (the database does not check them); the integer is what is stored. */
export const NUMBER_LIMITS: Record<NumberSettingKey, { min: number; max: number; message: string }> = {
  commission_bps: { min: 0, max: 5000, message: 'A comissão vai de 0 a 5.000 pontos-base (0% a 50%).' },
  pro_price_cents: { min: 100, max: 100_000, message: 'O preço do plano Pro vai de R$ 1,00 a R$ 1.000,00.' },
  proposal_limit: { min: 1, max: 10, message: 'O limite de propostas por pedido vai de 1 a 10.' },
  labor_lock_days_per_week: { min: 1, max: 7, message: 'Os dias por semana vão de 1 a 7.' },
};

/** "49,90" or "1.234,50" or "49.90" → 4990 cents; null when it is not a money amount with at most 2 decimals. */
export const parseReaisToCents = (text: string): number | null => {
  const clean = text.replace(/^R\$\s*/i, '').trim();
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(clean)) normalized = clean.replace(/\./g, '').replace(',', '.');
  else if (/^\d+(,\d{1,2})?$/.test(clean)) normalized = clean.replace(',', '.');
  else if (/^\d+\.\d{1,2}$/.test(clean)) normalized = clean;
  else return null;
  const [whole, decimals = ''] = normalized.split('.');
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
};

/** Text typed for a number setting → the value to store, or the sentence explaining what is wrong. */
export const parseNumberSetting = (key: NumberSettingKey, text: string): { value: number } | { error: string } => {
  const typed = text.trim();
  if (typed === '') return { error: 'Informe um valor.' };
  const value = key === 'pro_price_cents' ? parseReaisToCents(typed) : /^\d+$/.test(typed) ? Number(typed) : null;
  if (value === null || !Number.isSafeInteger(value)) {
    return { error: key === 'pro_price_cents' ? 'Informe o valor em reais, por exemplo 49,90.' : 'Informe um número inteiro.' };
  }
  const limits = NUMBER_LIMITS[key];
  if (value < limits.min || value > limits.max) return { error: limits.message };
  return { value };
};

export const setSetting = async (key: BooleanSettingKey | NumberSettingKey, value: boolean | number): Promise<void> => {
  if (typeof value === 'number') {
    const limits = NUMBER_LIMITS[key as NumberSettingKey];
    if (!limits || !Number.isInteger(value) || value < limits.min || value > limits.max) throw invalid(limits?.message ?? 'Valor inválido.');
  }
  unwrapMaybe<unknown>(await db().rpc('admin_set_setting', { p_key: key, p_value: value }));
};

/** The exact words an administrator types to turn a money feature on. */
export const ENABLE_PHRASES: Record<BooleanSettingKey, string> = {
  commission_enabled: 'ligar comissão',
  escrow_enabled: 'ligar pagamento retido',
};

const normalizePhrase = (text: string): string =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Typed confirmation matches the phrase (case, accents and extra spaces do not matter). */
export const phraseMatches = (typed: string, phrase: string): boolean => normalizePhrase(typed) === normalizePhrase(phrase);

// ---------------------------------------------------------------------------
// Audit log (read only) and LGPD requests
// ---------------------------------------------------------------------------

export interface AuditRow {
  id: number;
  actor_id: string | null;
  actor_name?: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  data: Record<string, unknown>;
  at: string;
}

/** The provider an audit row is about (entity `provider`, or `provider_occupation` whose id is "provider:occupation"), when it has one. */
export const auditProviderId = (entity: string, entityId: string | null): string | null => {
  if (!entityId) return null;
  const id = entity === 'provider' ? entityId : entity === 'provider_occupation' ? entityId.split(':')[0] : '';
  return isUuid(id) ? id : null;
};

export interface AuditFilters {
  entity?: string;
  actor?: string;
  page?: number;
}

const AUDIT_COLUMNS = 'id, actor_id, action, entity, entity_id, data, at';

export const listAudit = async ({ entity, actor, page = 0 }: AuditFilters = {}): Promise<Page<AuditRow>> => {
  const actorId = actor?.trim();
  if (actorId && !isUuid(actorId)) throw invalid('O ator é o identificador (UUID) de um usuário, como aparece na lista.');
  let query = db().from('audit_log').select(AUDIT_COLUMNS).order('at', { ascending: false }).order('id', { ascending: false });
  if (entity?.trim()) query = query.eq('entity', entity.trim());
  if (actorId) query = query.eq('actor_id', actorId);
  const result = toPage(unwrap<AuditRow[]>(await query.range(from(page), to(page))), page);
  const names = await profileNames(result.rows.map(row => row.actor_id));
  result.rows = result.rows.map(row => ({ ...row, data: row.data ?? {}, actor_name: row.actor_id ? names.get(row.actor_id) ?? null : null }));
  return result;
};

export type DataRequestStatus = 'pending' | 'processing' | 'completed' | 'failed';
export const DATA_REQUEST_STATUSES: DataRequestStatus[] = ['pending', 'processing', 'completed', 'failed'];

export interface DataRequestRow {
  id: string;
  user_id: string | null;
  user_name?: string | null;
  kind: DataRequestKind;
  status: DataRequestStatus;
  completed_at: string | null;
  result_path: string | null;
  created_at: string;
}

export const listDataRequests = async ({ status, page = 0 }: { status?: DataRequestStatus | ''; page?: number } = {}): Promise<Page<DataRequestRow>> => {
  let query = db()
    .from('data_requests')
    .select('id, user_id, kind, status, completed_at, result_path, created_at')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const result = toPage(unwrap<DataRequestRow[]>(await query.range(from(page), to(page))), page);
  const names = await profileNames(result.rows.map(row => row.user_id));
  result.rows = result.rows.map(row => ({ ...row, user_name: row.user_id ? names.get(row.user_id) ?? null : null }));
  return result;
};
