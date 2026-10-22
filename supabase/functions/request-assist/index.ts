// Claude API reference used (2026-10-19): Anthropic TypeScript SDK
// (https://github.com/anthropics/anthropic-sdk-typescript), structured outputs
// via output_config.format (json_schema), effort via output_config.effort,
// server-side refusal fallback (`fallbacks: "default"`, beta
// server-side-fallback-2026-07-01): https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback
import Anthropic from 'npm:@anthropic-ai/sdk@0.132.1';
import { authenticate, config, logError, must, now, serve } from '../_runtime/supabase.ts';
import type { OccupationCandidate } from '../_shared/assist.ts';
import { HttpError } from '../_shared/http.ts';
import { type AssistDeps, type ClassifyRequest, type ClassifyResult, handler } from './handler.ts';

const MODEL = 'claude-opus-5-5';

const anthropic = config.anthropicApiKey
  ? new Anthropic({ apiKey: config.anthropicApiKey, timeout: 45_000, maxRetries: 1 })
  : null;

async function classify(client: Anthropic, request: ClassifyRequest): Promise<ClassifyResult> {
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4096,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: request.system,
      // Classification: low effort is enough; thinking stays adaptive (default)
      output_config: { effort: 'low', format: { type: 'json_schema', schema: request.schema } },
      messages: [{ role: 'user', content: request.user }],
    });
    if (response.stop_reason === 'refusal') return { kind: 'refusal' };
    if (response.stop_reason === 'max_tokens') return { kind: 'incomplete', reason: 'max_tokens' };
    // After a fallback, only the blocks of the model that finished count
    const lastFallback = response.content.map(block => block.type as string).lastIndexOf('fallback');
    const text = response.content
      .slice(lastFallback + 1)
      .flatMap(block => (block.type === 'text' ? [block.text] : []))
      .join('');
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
  now,
  logError,
  classify: anthropic ? request => classify(anthropic, request) : null,
  async session(req) {
    const caller = await authenticate(req);
    if (!caller) return null;
    return {
      user: caller.user,
      async listOccupations() {
        return (must(await caller.db.from('occupations').select('slug, name, synonyms').limit(5000)) as
          | OccupationCandidate[]
          | null) ?? [];
      },
    };
  },
};

serve(req => handler(req, deps));
