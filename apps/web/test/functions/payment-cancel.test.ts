// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DbError } from '../../supabase/functions/_shared/handler-kit.ts';
import {
  CANCELABLE_PAYMENT_STATUS,
  cancelPendingPayment,
  type PaymentsWriter,
  type PaymentUpdateFilter,
} from '../../supabase/functions/_shared/payment-cancel.ts';

interface Row {
  id: string;
  status: string;
  updated_at?: string;
}

/** In-memory `payments` table that applies the update the way PostgREST does: only rows matching every filter. */
function paymentsTable(rows: Row[], failWith?: { message: string; code?: string }) {
  const filters: Array<[string, string]> = [];
  const writer: PaymentsWriter = {
    from: table => {
      expect(table).toBe('payments');
      return {
        update: values => {
          const builder: PaymentUpdateFilter = {
            eq: (column, value) => {
              filters.push([column, value]);
              return builder;
            },
            then: (resolve, reject) => {
              if (!failWith) {
                for (const row of rows) {
                  if (filters.every(([column, value]) => String((row as unknown as Record<string, unknown>)[column]) === value)) {
                    Object.assign(row, values);
                  }
                }
              }
              return Promise.resolve({ error: failWith ?? null }).then(resolve, reject);
            },
          };
          return builder;
        },
      };
    },
  };
  return { writer, filters };
}

const AT = new Date('2026-10-22T12:00:00Z');

describe('cancelPendingPayment', () => {
  it('cancels a pending payment and stamps updated_at', async () => {
    const rows: Row[] = [{ id: 'p1', status: 'pending' }];
    await cancelPendingPayment(paymentsTable(rows).writer, 'p1', AT);
    expect(rows[0]).toEqual({ id: 'p1', status: 'canceled', updated_at: AT.toISOString() });
  });

  it('filters on the id and on the pending status', async () => {
    const { writer, filters } = paymentsTable([{ id: 'p1', status: 'pending' }]);
    await cancelPendingPayment(writer, 'p1', AT);
    expect(filters).toEqual([
      ['id', 'p1'],
      ['status', CANCELABLE_PAYMENT_STATUS],
    ]);
    expect(CANCELABLE_PAYMENT_STATUS).toBe('pending');
  });

  it.each(['confirmed', 'received', 'held', 'released', 'refunded', 'failed', 'canceled'])(
    'leaves a %s payment alone (second barrier)',
    async status => {
      const rows: Row[] = [{ id: 'p1', status }];
      await expect(cancelPendingPayment(paymentsTable(rows).writer, 'p1', AT)).resolves.toBeUndefined();
      expect(rows[0]).toEqual({ id: 'p1', status });
    },
  );

  it('touches only the payment asked for', async () => {
    const rows: Row[] = [
      { id: 'p1', status: 'pending' },
      { id: 'p2', status: 'pending' },
    ];
    await cancelPendingPayment(paymentsTable(rows).writer, 'p2', AT);
    expect(rows.map(row => row.status)).toEqual(['pending', 'canceled']);
  });

  it('turns a database error into DbError with its code', async () => {
    const { writer } = paymentsTable([], { message: 'permission denied', code: '42501' });
    const error = await cancelPendingPayment(writer, 'p1', AT).catch(e => e);
    expect(error).toBeInstanceOf(DbError);
    expect(error).toMatchObject({ message: 'permission denied', code: '42501' });
  });

  it('is what markPaymentCanceled runs in the Edge Functions runtime', () => {
    const source = readFileSync('supabase/functions/_runtime/supabase.ts', 'utf8');
    const body = source.slice(source.indexOf('export async function markPaymentCanceled'));
    const end = body.indexOf('\n}\n');
    expect(body.slice(0, end)).toContain('cancelPendingPayment(serviceClient()');
    expect(body.slice(0, end)).not.toContain("'canceled'");
  });
});
