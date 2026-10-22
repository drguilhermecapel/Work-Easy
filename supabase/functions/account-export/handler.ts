// account-export (usuário): returns a JSON document with the caller's own data
// (LGPD art. 18). Reads run with the caller's JWT (RLS) and an explicit owner
// filter; the request is logged in data_requests.

import { type AuthUser, type BaseDeps } from '../_shared/handler-kit.ts';
import { errors, route } from '../_shared/http.ts';
import {
  buildExport, EXPORT_PLAN, HOUSEHOLD_CHILDREN, mergeRows, ownerFilter, stripColumns,
} from '../_shared/lgpd-export.ts';

type Row = Record<string, unknown>;

export interface ExportDeps extends BaseDeps {
  session(req: Request): Promise<{
    user: AuthUser;
    /** select * from table where <PostgREST or-filter> */
    selectOwned(table: string, orFilter: string): Promise<Row[]>;
    selectIn(table: string, column: string, values: string[]): Promise<Row[]>;
  } | null>;
  admin: {
    recordRequest(row: { user_id: string; kind: 'export'; status: string; completed_at: string }): Promise<void>;
  };
}

export function handler(req: Request, deps: ExportDeps): Promise<Response> {
  return route(req, { methods: ['POST', 'GET'], siteUrl: deps.siteUrl, onError: deps.logError }, async () => {
    const session = await deps.session(req);
    if (!session) throw errors.unauthorized();
    const { user } = session;

    const tables: Record<string, Row[]> = {};
    const unavailable: string[] = [];
    for (const query of EXPORT_PLAN) {
      try {
        const rows = await session.selectOwned(query.table, ownerFilter(query, user.id));
        tables[query.table] = mergeRows(tables[query.table], stripColumns(rows, query.omit));
      } catch (error) {
        deps.logError(error);
        unavailable.push(query.table);
      }
    }

    const householdIds = (tables.households ?? []).map(h => String(h.id)).filter(Boolean);
    if (householdIds.length) {
      for (const child of HOUSEHOLD_CHILDREN) {
        try {
          const rows = await session.selectIn(child.table, child.column, householdIds);
          tables[child.table] = mergeRows(tables[child.table], rows);
        } catch (error) {
          deps.logError(error);
          if (!unavailable.includes(child.table)) unavailable.push(child.table);
        }
      }
    }

    const now = deps.now();
    const document = buildExport({ user, tables, unavailable, now });
    try {
      await deps.admin.recordRequest({ user_id: user.id, kind: 'export', status: 'completed', completed_at: now.toISOString() });
    } catch (error) {
      // The export itself succeeded; the log entry is best effort
      deps.logError(error);
    }
    return { data: document };
  });
}
