// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { type ExportDeps, handler as accountExport } from '../../supabase/functions/account-export/handler.ts';
import { EXPORT_PLAN } from '../../supabase/functions/_shared/lgpd-export.ts';
import { baseDeps, post, read, USER } from './helpers.ts';

// Column grants of supabase/migrations/20261019000006_payments.sql. The API role has no table-level
// SELECT on these tables: `select *` is refused with 42501, and only the granted columns can be read.
const GRANTED: Record<string, string[]> = {
  payments: [
    'id', 'booking_id', 'quote_id', 'provider_id', 'payer_id', 'asaas_payment_id', 'method', 'amount_cents',
    'platform_fee_cents', 'status', 'escrow', 'invoice_url', 'pix_qr_code', 'pix_payload', 'due_date',
    'created_at', 'updated_at',
  ],
  provider_payment_accounts: ['provider_id', 'asaas_account_id', 'asaas_wallet_id', 'status', 'created_at'],
};

const ROWS: Record<string, Record<string, unknown>[]> = {
  payments: [{
    id: 'pay-1', payer_id: USER.id, provider_id: 'p-2', amount_cents: 15000, status: 'received', escrow: false,
    raw: { customer: { cpfCnpj: '52998224725', name: 'Ana' } }, pix_qr_code: null,
  }],
  provider_payment_accounts: [{
    provider_id: USER.id, asaas_account_id: 'acc_1', asaas_wallet_id: 'wal_1', status: 'active',
    created_at: '2026-10-01T00:00:00Z', api_key_secret_id: 'vault-secret-id',
  }],
};

/** selectOwned that answers like the API role: `select *` is denied, granted columns only. */
function grantedSession(failing: string[] = []) {
  const reads: Array<[string, string[] | undefined]> = [];
  const deps: ExportDeps = {
    ...baseDeps,
    session: async () => ({
      user: USER,
      async selectOwned(table, _orFilter, columns) {
        reads.push([table, columns]);
        if (failing.includes(table)) throw new Error(`relation "${table}" does not exist`);
        const granted = GRANTED[table];
        if (!granted) return [];
        if (!columns) throw new Error(`permission denied for table ${table}`);
        const denied = columns.filter(column => !granted.includes(column));
        if (denied.length) throw new Error(`permission denied for column ${denied[0]} of ${table}`);
        return (ROWS[table] ?? []).map(row => Object.fromEntries(columns.map(column => [column, row[column]])));
      },
      async selectIn() {
        return [];
      },
    }),
    admin: { recordRequest: async () => {} },
  };
  return { deps, reads };
}

describe('account-export: granted columns of payments', () => {
  it('includes the caller payments in the export', async () => {
    const { deps } = grantedSession();
    const res = await read(await accountExport(post('account-export', {}), deps));
    expect(res.status).toBe(200);
    expect(res.body.data.unavailable).not.toContain('payments');
    expect(res.body.data.data.payments).toHaveLength(1);
    expect(res.body.data.data.payments[0]).toMatchObject({ id: 'pay-1', amount_cents: 15000, status: 'received' });
  });

  it('never reads the raw gateway payload or the Vault reference', async () => {
    const { deps, reads } = grantedSession();
    await accountExport(post('account-export', {}), deps);
    const payments = reads.find(([table]) => table === 'payments')?.[1] ?? [];
    expect(payments).not.toContain('raw');
    const accounts = reads.find(([table]) => table === 'provider_payment_accounts')?.[1] ?? [];
    expect(accounts).not.toContain('api_key_secret_id');
    const res = await read(await accountExport(post('account-export', {}), deps));
    expect(JSON.stringify(res.body.data)).not.toContain('cpfCnpj');
    expect(JSON.stringify(res.body.data)).not.toContain('vault-secret-id');
  });

  it('reads only columns that are granted, for every table that has grants', async () => {
    const { deps, reads } = grantedSession();
    await accountExport(post('account-export', {}), deps);
    for (const [table, columns] of reads) {
      if (!GRANTED[table]) continue;
      expect(columns, `${table} must be read with an explicit column list`).toBeDefined();
      expect(columns!.every(column => GRANTED[table].includes(column))).toBe(true);
    }
  });

  it('keeps the plan entries for payments and provider accounts explicit', () => {
    const payments = EXPORT_PLAN.find(query => query.table === 'payments');
    const accounts = EXPORT_PLAN.find(query => query.table === 'provider_payment_accounts');
    expect(payments?.columns).toEqual(GRANTED.payments);
    expect(accounts?.columns).toEqual(GRANTED.provider_payment_accounts);
  });

  it('reports a table that fails to read in unavailable, without failing the whole export', async () => {
    const { deps } = grantedSession(['payments']);
    const res = await read(await accountExport(post('account-export', {}), deps));
    expect(res.status).toBe(200);
    expect(res.body.data.unavailable).toContain('payments');
  });
});
