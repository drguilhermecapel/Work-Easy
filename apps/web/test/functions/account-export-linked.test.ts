// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { type ExportDeps, handler as accountExport } from '../../supabase/functions/account-export/handler.ts';
import { baseDeps, post, read, USER } from './helpers.ts';

// Rows the user can read under RLS. The client reads the booking events of their bookings, the
// proposals on their own requests and the checkins and daily reports of their household's shifts.
const STORE: Record<string, Record<string, unknown>[]> = {
  bookings: [{ id: 'bk-1', client_id: USER.id, provider_id: 'p-2' }],
  booking_events: [
    { id: 'ev-1', booking_id: 'bk-1', to_status: 'accepted' },
    { id: 'ev-2', booking_id: 'bk-9', to_status: 'accepted' },
  ],
  requests: [{ id: 'rq-1', client_id: USER.id }],
  proposals: [
    { id: 'pr-1', request_id: 'rq-1', provider_id: 'p-2' },
    { id: 'pr-2', request_id: 'rq-9', provider_id: 'p-3' },
  ],
  households: [{ id: 'hh-1', owner_id: USER.id }],
  shifts: [{ id: 'sh-1', household_id: 'hh-1', provider_id: 'p-2' }],
  checkins: [{ id: 'ck-1', shift_id: 'sh-1' }, { id: 'ck-2', shift_id: 'sh-9' }],
  daily_reports: [{ id: 'dr-1', shift_id: 'sh-1' }],
};

/** `or` filter of the owner columns, as built by ownerFilter: `client_id.eq.<id>,provider_id.eq.<id>`. */
function ownedBy(table: string, orFilter: string): Record<string, unknown>[] {
  const columns = orFilter.split(',').map(part => part.split('.eq.')[0]);
  return (STORE[table] ?? []).filter(row => columns.some(column => row[column] === USER.id));
}

function linkedSession(): ExportDeps['session'] {
  return async () => ({
    user: USER,
    async selectOwned(table, orFilter) {
      return ownedBy(table, orFilter);
    },
    async selectIn(table, column, values) {
      return (STORE[table] ?? []).filter(row => values.includes(String(row[column])));
    },
  });
}

describe('account-export: rows linked to the user through their parents', () => {
  it('includes the booking events, the proposals on the client requests and the household checkins', async () => {
    const deps: ExportDeps = { ...baseDeps, session: linkedSession(), admin: { recordRequest: async () => {} } };
    const res = await read(await accountExport(post('account-export', {}), deps));
    expect(res.status).toBe(200);
    expect(res.body.data.unavailable).toEqual([]);
    expect(res.body.data.data.booking_events.map((row: { id: string }) => row.id)).toEqual(['ev-1']);
    expect(res.body.data.data.proposals.map((row: { id: string }) => row.id)).toEqual(['pr-1']);
    expect(res.body.data.data.checkins.map((row: { id: string }) => row.id)).toEqual(['ck-1']);
    expect(res.body.data.data.daily_reports.map((row: { id: string }) => row.id)).toEqual(['dr-1']);
  });
});
