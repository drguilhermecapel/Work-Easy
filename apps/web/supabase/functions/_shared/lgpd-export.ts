// LGPD (art. 18, II and V) data export: which rows belong to the user and how
// the final document is assembled. Every query is filtered by the user's id
// explicitly, on top of RLS, so an admin exporting their own data does not get
// everybody else's rows.

export interface ExportQuery {
  table: string;
  /** Rows match if ANY of these columns equals the user's id. */
  ownerColumns: string[];
  /**
   * Columns to read. Required for tables whose API role has column grants only (no table-level
   * SELECT): `select *` is refused there. Undefined reads every column.
   */
  columns?: string[];
  /** Columns never included in the export (secrets, internal pointers). */
  omit?: string[];
}

/** Granted to the API role (migrations/20261019000006_payments.sql). `raw` (gateway payload) is never granted. */
const PAYMENT_COLUMNS = [
  'id', 'booking_id', 'quote_id', 'provider_id', 'payer_id', 'asaas_payment_id', 'method', 'amount_cents',
  'platform_fee_cents', 'status', 'escrow', 'invoice_url', 'pix_qr_code', 'pix_payload', 'due_date',
  'created_at', 'updated_at',
];

/** Granted to the API role: no `api_key_secret_id` (the Vault reference). */
const PROVIDER_PAYMENT_ACCOUNT_COLUMNS = ['provider_id', 'asaas_account_id', 'asaas_wallet_id', 'status', 'created_at'];

export const EXPORT_PLAN: ExportQuery[] = [
  { table: 'profiles', ownerColumns: ['id'] },
  { table: 'providers', ownerColumns: ['id'] },
  { table: 'provider_occupations', ownerColumns: ['provider_id'] },
  { table: 'provider_neighborhoods', ownerColumns: ['provider_id'] },
  { table: 'provider_documents', ownerColumns: ['provider_id'] },
  { table: 'services', ownerColumns: ['provider_id'] },
  { table: 'availability', ownerColumns: ['provider_id'] },
  { table: 'time_off', ownerColumns: ['provider_id'] },
  { table: 'provider_clients', ownerColumns: ['provider_id', 'client_id'] },
  { table: 'requests', ownerColumns: ['client_id'] },
  { table: 'proposals', ownerColumns: ['provider_id'] },
  { table: 'bookings', ownerColumns: ['client_id', 'provider_id'] },
  { table: 'provider_payment_accounts', ownerColumns: ['provider_id'], columns: PROVIDER_PAYMENT_ACCOUNT_COLUMNS, omit: ['api_key_secret_id'] },
  { table: 'customer_payment_profiles', ownerColumns: ['user_id'] },
  { table: 'payments', ownerColumns: ['payer_id', 'provider_id'], columns: PAYMENT_COLUMNS, omit: ['raw'] },
  { table: 'subscriptions', ownerColumns: ['provider_id'] },
  { table: 'quotes', ownerColumns: ['provider_id'] },
  { table: 'reviews', ownerColumns: ['client_id', 'provider_id'] },
  { table: 'notifications', ownerColumns: ['user_id'] },
  { table: 'households', ownerColumns: ['owner_id'] },
  { table: 'shifts', ownerColumns: ['provider_id'] },
  { table: 'shift_offers', ownerColumns: ['provider_id'] },
  { table: 'checkins', ownerColumns: ['provider_id'] },
  { table: 'daily_reports', ownerColumns: ['provider_id'] },
  { table: 'consents', ownerColumns: ['user_id'] },
  { table: 'data_requests', ownerColumns: ['user_id'] },
];

/**
 * Rows that hang off rows already read, matched by the ids of those rows. They are readable under RLS
 * for the user even when the parent belongs to someone else (the other party of a booking, request or
 * household). Listed in order: a parent may come from an earlier entry (the shifts of a household).
 */
export const LINKED_CHILDREN: Array<{ parent: string; table: string; column: string }> = [
  { parent: 'households', table: 'care_recipients', column: 'household_id' },
  { parent: 'households', table: 'shifts', column: 'household_id' },
  { parent: 'bookings', table: 'booking_events', column: 'booking_id' },
  { parent: 'requests', table: 'proposals', column: 'request_id' },
  { parent: 'shifts', table: 'checkins', column: 'shift_id' },
  { parent: 'shifts', table: 'daily_reports', column: 'shift_id' },
];

/** PostgREST `or` filter: `client_id.eq.<id>,provider_id.eq.<id>`. */
export function ownerFilter(query: ExportQuery, userId: string): string {
  return query.ownerColumns.map(column => `${column}.eq.${userId}`).join(',');
}

export function stripColumns(rows: Record<string, unknown>[], omit: string[] = []): Record<string, unknown>[] {
  if (!omit.length) return rows;
  return rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !omit.includes(key))));
}

/** Merge rows from several queries of the same table without duplicating by id. */
export function mergeRows(existing: Record<string, unknown>[] = [], extra: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set(existing.map(row => JSON.stringify(row.id ?? row)));
  const merged = [...existing];
  for (const row of extra) {
    const key = JSON.stringify(row.id ?? row);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(row);
    }
  }
  return merged;
}

export interface ExportDocument {
  format: 'workeasy-lgpd-export';
  version: 1;
  generated_at: string;
  user: { id: string; email: string | null; phone: string | null; created_at: string | null };
  notes: string[];
  data: Record<string, Record<string, unknown>[]>;
  unavailable: string[];
}

export function buildExport(input: {
  user: { id: string; email?: string | null; phone?: string | null; created_at?: string | null };
  tables: Record<string, Record<string, unknown>[]>;
  unavailable?: string[];
  now: Date;
}): ExportDocument {
  const data: Record<string, Record<string, unknown>[]> = {};
  for (const name of Object.keys(input.tables).sort()) data[name] = input.tables[name];
  return {
    format: 'workeasy-lgpd-export',
    version: 1,
    generated_at: input.now.toISOString(),
    user: {
      id: input.user.id,
      email: input.user.email ?? null,
      phone: input.user.phone ?? null,
      created_at: input.user.created_at ?? null,
    },
    notes: [
      'Dados pessoais associados à sua conta no WorkEasy, em JSON.',
      'Arquivos enviados (documentos) aparecem como caminho de armazenamento; o conteúdo pode ser baixado pelo app.',
      'Dados de cartão não são armazenados pelo WorkEasy: o pagamento por cartão acontece na página do Asaas.',
    ],
    data,
    unavailable: [...(input.unavailable ?? [])].sort(),
  };
}
