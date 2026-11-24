// Claude API reference used (2026-10-23): Anthropic TypeScript SDK
// (https://github.com/anthropics/anthropic-sdk-typescript), structured outputs via
// output_config.format (json_schema), effort via output_config.effort. The request itself
// is built by messageParams (_shared/ai-model.ts): no tools, no tool choice, schema only.
//
// The assists that call this (quote-assist, care-summary) run on Claude Haiku 5.5, the
// cheapest current model ($0.10 / $0.50 per million tokens up to 100K tokens of prompt),
// the same choice as request-assist. Haiku 5.5 has no server-side refusal fallback: a
// refusal reaches the handler as { kind: 'refusal' } and becomes a "do it by hand" answer.
import Anthropic from 'npm:@anthropic-ai/sdk@0.132.1';
import { interpretResponse, messageParams, type ModelRequest, type ModelResult } from '../_shared/ai-model.ts';
import { HttpError } from '../_shared/http.ts';
import { logError } from './supabase.ts';

export interface ClassifierSettings {
  apiKey: string;
  model: string;
  maxTokens: number;
  /** What the person can do instead, appended to the error sentences ("Monte os itens manualmente."). */
  fallback: string;
}

/** The function that asks the model, with the SDK's failures turned into the error answers of the assists. */
export function createClassifier(settings: ClassifierSettings): (request: ModelRequest) => Promise<ModelResult> {
  const client = new Anthropic({ apiKey: settings.apiKey, timeout: 30_000, maxRetries: 1 });
  return async request => {
    try {
      return interpretResponse(await client.messages.create(messageParams(settings.model, settings.maxTokens, request)));
    } catch (error) {
      throw translate(error, settings.fallback);
    }
  };
}

function translate(error: unknown, fallback: string): unknown {
  if (error instanceof Anthropic.RateLimitError) {
    return new HttpError(503, 'assist_busy', `A IA está ocupada. Tente de novo em instantes. ${fallback}`);
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    logError(error);
    return new HttpError(503, 'assist_not_configured', 'A chave da IA configurada no servidor foi recusada.');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new HttpError(504, 'assist_timeout', `A IA não respondeu a tempo. ${fallback}`);
  }
  if (error instanceof Anthropic.APIError) {
    logError(error);
    return new HttpError(502, 'assist_unavailable', `A IA está indisponível. ${fallback}`);
  }
  return error;
}
