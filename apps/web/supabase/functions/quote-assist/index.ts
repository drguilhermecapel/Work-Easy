// Model: the draft is a short structured answer (an intro and up to a dozen items) from a
// description of at most 2000 characters, so it runs on Claude Haiku 5.5, as request-assist.
// The call itself is in _runtime/anthropic.ts: no tools, JSON schema only.
import { createClassifier } from '../_runtime/anthropic.ts';
import { audit, authenticate, config, logError, must, now, serve, serviceClient } from '../_runtime/supabase.ts';
import { quotaGranted } from '../_shared/assist.ts';
import type { OccupationContext } from '../_shared/quote-assist.ts';
import { handler, type QuoteAssistDeps } from './handler.ts';

const MODEL = 'claude-haiku-5-5';
// About 12 items of 40 tokens each and an intro: room for a long answer and nothing more
const MAX_TOKENS = 1200;

const deps: QuoteAssistDeps = {
  siteUrl: config.siteUrl,
  allowDevOrigins: config.allowDevOrigins,
  now,
  logError,
  model: MODEL,
  classify: config.anthropicApiKey
    ? createClassifier({ apiKey: config.anthropicApiKey, model: MODEL, maxTokens: MAX_TOKENS, fallback: 'Monte os itens manualmente.' })
    : null,
  hourlyLimit: config.assistHourlyLimit,
  usage: {
    // One atomic statement in the database: counter per user and clock hour, incremented only
    // while below the limit (take_assist_quota, shared with request-assist and care-summary).
    async take(userId, limit) {
      return quotaGranted(must(await serviceClient().rpc('take_assist_quota', { p_user: userId, p_limit: limit })));
    },
  },
  admin: { audit },
  async session(req) {
    const caller = await authenticate(req);
    if (!caller) return null;
    return {
      user: caller.user,
      async getOccupation(slug): Promise<OccupationContext | null> {
        // Both tables are public catalog data; the caller's own client reads them
        const occupation = must(await caller.db.from('occupations').select('slug, name').eq('slug', slug).maybeSingle()) as
          | { slug: string; name: string }
          | null;
        if (!occupation) return null;
        const policy = must(await caller.db.from('occupation_policies').select('price_units').eq('occupation_slug', slug).maybeSingle()) as
          | { price_units: string[] | null }
          | null;
        return { slug: occupation.slug, name: occupation.name, priceUnits: policy?.price_units ?? [] };
      },
    };
  },
};

serve(req => handler(req, deps));
