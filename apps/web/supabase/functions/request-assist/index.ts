// Claude API reference used (2026-10-22): Anthropic TypeScript SDK
// (https://github.com/anthropics/anthropic-sdk-typescript), structured outputs
// via output_config.format (json_schema), effort via output_config.effort.
//
// Model: this is a short classification (pick one of at most 20 slugs, one
// boolean, a 3-sentence summary), so it runs on Claude Haiku 5.5, the cheapest
// current model ($0.10 / $0.50 per million tokens), with thinking off and effort
// low. Haiku 5.5 has no server-side refusal fallback: a refusal is answered
// with the "fill it in manually" message.
import Anthropic from 'npm:@anthropic-ai/sdk@0.132.1';
import { authenticate, config, logError, must, now, serve, serviceClient } from '../_runtime/supabase.ts';
import { fetchAllRows, type OccupationCandidate, quotaGranted } from '../_shared/assist.ts';
import { HttpError } from '../_shared/http.ts';
import { type AssistDeps, type ClassifyRequest, type ClassifyResult, handler } from './handler.ts';

const MODEL = 'claude-haiku-5-5';
// The JSON answer is about 150 tokens; room for a long summary and nothing more
const MAX_TOKENS = 700;

const anthropic = config.anthropicApiKey
  ? new Anthropic({ apiKey: config.anthropicApiKey, timeout: 30_000, maxRetries: 1 })
  : null;

async function classify(client: Anthropic, request: ClassifyRequest): Promise<ClassifyResult> {
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: request.system,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: request.schema } },
      messages: [{ role: 'user', content: request.user }],
    });
    if (response.stop_reason === 'refusal') return { kind: 'refusal' };
    if (response.stop_reason === 'max_tokens') return { kind: 'incomplete', reason: 'max_tokens' };
    const text = response.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('');
    return text ? { kind: 'ok', text } : { kind: 'incomplete', reason: `no text (${response.stop_reason})` };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new HttpError(503, 'assist_busy', 'O assistente está ocupado. Tente de novo em instantes ou preencha o pedido manualmente.');
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      logError(error);
      throw new HttpError(503, 'assist_not_configured', 'A chave do assistente configurada no servidor foi recusada.');
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new HttpError(504, 'assist_timeout', 'O assistente não respondeu a tempo. Preencha o pedido manualmente.');
    }
    if (error instanceof Anthropic.APIError) {
      logError(error);
      throw new HttpError(502, 'assist_unavailable', 'O assistente está indisponível. Preencha o pedido manualmente.');
    }
    throw error;
  }
}

const deps: AssistDeps = {
  siteUrl: config.siteUrl,
  allowDevOrigins: config.allowDevOrigins,
  now,
  logError,
  classify: anthropic ? request => classify(anthropic, request) : null,
  hourlyLimit: config.assistHourlyLimit,
  usage: {
    // One atomic statement in the database: counter per user and clock hour, incremented only
    // while below the limit (see take_assist_quota in the marketplace migration).
    async take(userId, limit) {
      return quotaGranted(
        must(await serviceClient().rpc('take_assist_quota', { p_user: userId, p_limit: limit })),
      );
    },
  },
  async session(req) {
    const caller = await authenticate(req);
    if (!caller) return null;
    return {
      user: caller.user,
      listOccupations() {
        // PostgREST cuts a response at max_rows (1000), so read the catalog page by page
        return fetchAllRows<OccupationCandidate>(async (from, to) =>
          (must(await caller.db.from('occupations').select('slug, name, synonyms').order('slug').range(from, to)) as
            | OccupationCandidate[]
            | null) ?? []);
      },
    };
  },
};

serve(req => handler(req, deps));
