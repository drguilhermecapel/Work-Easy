// background-check-purge (scheduler, x-cron-secret): removes the background-check files
// (antecedentes) whose consent was withdrawn more than 30 days ago. For each row from
// background_check_purge_candidates the object is removed from the provider-documents bucket
// first; then mark_background_check_purged deletes the row, or keeps it with status 'purged'
// when it has review or audit history. A file that fails is counted and skipped: its row keeps
// the file and is a candidate again on the next run. Answers { purged, failed }.

import { type BaseDeps } from '../_shared/handler-kit.ts';
import { HttpError, route } from '../_shared/http.ts';
import { secretMatches } from '../_shared/secrets.ts';

export interface PurgeCandidate {
  id: string;
  storage_path: string;
}

export interface PurgeDeps extends BaseDeps {
  cronSecret?: string;
  store: {
    /** Rows withdrawn more than 30 days ago that still have a file. */
    candidates(): Promise<PurgeCandidate[]>;
    /** Removes the object from the bucket. A missing object is not an error. */
    removeObject(path: string): Promise<void>;
    /** Runs after removeObject succeeded; the database refuses to run while the object is still there. */
    markPurged(id: string): Promise<void>;
  };
}

export function handler(req: Request, deps: PurgeDeps): Promise<Response> {
  return route(req, { methods: ['POST'], onError: deps.logError }, async () => {
    if (!deps.cronSecret) throw new HttpError(503, 'cron_not_configured', 'CRON_SECRET não configurado no servidor.');
    if (!secretMatches(req.headers.get('x-cron-secret'), deps.cronSecret)) {
      throw new HttpError(401, 'unauthorized', 'Segredo do agendador inválido.');
    }

    const summary = { purged: 0, failed: 0 };
    for (const candidate of await deps.store.candidates()) {
      try {
        await deps.store.removeObject(candidate.storage_path);
        await deps.store.markPurged(candidate.id);
        summary.purged++;
      } catch (error) {
        // The error is logged as it is; the row keeps its file and is a candidate on the next run.
        deps.logError(error);
        summary.failed++;
      }
    }
    return { data: summary };
  });
}
