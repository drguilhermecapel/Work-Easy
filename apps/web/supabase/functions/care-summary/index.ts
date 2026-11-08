// Model: a summary of a week of reports (a few thousand tokens in, about 400 out) in simple
// words, with every rule enforced again by the server, so it runs on Claude Haiku 5.5, as
// request-assist and quote-assist. The call itself is in _runtime/anthropic.ts: no tools,
// JSON schema only. Not tested against the live API in this repository (no key here).
import { createClassifier } from '../_runtime/anthropic.ts';
import { audit, authenticate, config, logError, must, now, serve, serviceClient } from '../_runtime/supabase.ts';
import { quotaGranted } from '../_shared/assist.ts';
import { parseRange, SUMMARY_STATUSES, type WeekData, type WeekShift } from '../_shared/care-summary.ts';
import { type CareSummaryDeps, handler } from './handler.ts';

const MODEL = 'claude-haiku-5-5';
// A short JSON: an overview and up to 16 bullets of at most 300 characters
const MAX_TOKENS = 1500;
// Shifts read per request: a week has far fewer; the summary keeps the newest MAX_SHIFTS of them
const SHIFT_READ_LIMIT = 100;

interface Rows<T> extends PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }> {}

/** One query of the caller's own client, unwrapped to rows (PostgREST errors throw). */
async function read<T>(query: Rows<T>): Promise<T[]> {
  return must(await query) ?? [];
}

const deps: CareSummaryDeps = {
  siteUrl: config.siteUrl,
  allowDevOrigins: config.allowDevOrigins,
  now,
  logError,
  model: MODEL,
  classify: config.anthropicApiKey
    ? createClassifier({ apiKey: config.anthropicApiKey, model: MODEL, maxTokens: MAX_TOKENS, fallback: 'Leia os relatórios abaixo.' })
    : null,
  hourlyLimit: config.assistHourlyLimit,
  usage: {
    // One atomic statement in the database: counter per user and clock hour, incremented only
    // while below the limit (take_assist_quota, shared with request-assist and quote-assist).
    async take(userId, limit) {
      return quotaGranted(must(await serviceClient().rpc('take_assist_quota', { p_user: userId, p_limit: limit })));
    },
  },
  admin: { audit },
  async session(req) {
    const caller = await authenticate(req);
    if (!caller) return null;
    const { db, user } = caller;
    return {
      user,
      async getHousehold(id) {
        return must(await db.from('households').select('id, owner_id').eq('id', id).maybeSingle()) as { id: string; owner_id: string } | null;
      },
      // Every read below goes through the caller's JWT: the database decides what the family may see
      async loadWeek(householdId, window): Promise<WeekData> {
        const [shiftRows, recipients, owner] = await Promise.all([
          read<{ id: string; period: string; status: string; care_recipient_id: string | null; provider_id: string | null }>(
            db
              .from('shifts')
              .select('id, period, status, care_recipient_id, provider_id')
              .eq('household_id', householdId)
              .in('status', [...SUMMARY_STATUSES])
              .overlaps('period', `[${window.from.toISOString()},${window.to.toISOString()})`)
              .order('created_at', { ascending: false })
              .limit(SHIFT_READ_LIMIT),
          ),
          read<{ id: string; first_name: string }>(db.from('care_recipients').select('id, first_name').eq('household_id', householdId)),
          read<{ full_name: string | null }>(db.from('profiles').select('full_name').eq('id', user.id)),
        ]);
        const shifts = shiftRows.flatMap((row): WeekShift[] => {
          const range = parseRange(row.period);
          return range ? [{ id: row.id, ...range, status: row.status, care_recipient_id: row.care_recipient_id, provider_id: row.provider_id }] : [];
        });
        const shiftIds = shifts.map(shift => shift.id);
        const providerIds = [...new Set(shifts.flatMap(shift => (shift.provider_id ? [shift.provider_id] : [])))];

        const [reports, providers, profiles] = await Promise.all([
          shiftIds.length > 0
            ? read<{ shift_id: string; meals: string | null; activities: string | null; mood: string | null; notes: string | null }>(
                db.from('daily_reports').select('shift_id, meals, activities, mood, notes').in('shift_id', shiftIds),
              )
            : [],
          providerIds.length > 0
            ? read<{ id: string; display_name: string | null }>(db.from('providers').select('id, display_name').in('id', providerIds))
            : [],
          providerIds.length > 0
            ? read<{ id: string; full_name: string | null }>(db.from('profiles').select('id, full_name').in('id', providerIds))
            : [],
        ]);
        return {
          ownerName: owner[0]?.full_name ?? null,
          recipients,
          caregivers: providerIds.map(id => ({
            id,
            names: [providers.find(row => row.id === id)?.display_name, profiles.find(row => row.id === id)?.full_name],
          })),
          shifts,
          reports,
        };
      },
    };
  },
};

serve(req => handler(req, deps));
