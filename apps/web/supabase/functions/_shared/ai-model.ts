// The call to the model, seen from the handlers: what is asked, what can come back and the
// cost guard. The SDK itself lives in _runtime/anthropic.ts; everything here is pure so the
// request that leaves the server can be asserted in tests (no tools, schema only).

import { errors, HttpError } from './http.ts';

export interface ModelRequest {
  /** The fixed instructions of the assist. */
  system: string;
  /** The data: delimited blocks of what people wrote, never mixed with instructions. */
  user: string;
  /** JSON schema of the only answer accepted (structured outputs). */
  schema: Record<string, unknown>;
}

export type ModelResult =
  | { kind: 'ok'; text: string }
  | { kind: 'refusal'; category?: string }
  | { kind: 'incomplete'; reason: string };

export interface AiUsage {
  /**
   * Consumes one call of the current hour for `userId` (take_assist_quota). Resolves false,
   * without consuming anything, when `limit` calls were already made this hour. A database
   * failure rejects: the model is never called without a granted quota.
   */
  take(userId: string, limit: number): Promise<boolean>;
}

/** The parts of a Messages API response the assists read. */
export interface ModelResponseLike {
  stop_reason: string | null;
  stop_details?: { category?: string | null } | null;
  content: Array<{ type: string; text?: string }>;
}

/**
 * The request sent to the Messages API: no tools and no tool choice (the model can only
 * answer), thinking off, low effort and a JSON schema as the only accepted format.
 */
export function messageParams(model: string, maxTokens: number, request: ModelRequest) {
  return {
    model,
    max_tokens: maxTokens,
    system: request.system,
    thinking: { type: 'disabled' as const },
    output_config: {
      effort: 'low' as const,
      format: { type: 'json_schema' as const, schema: request.schema },
    },
    messages: [{ role: 'user' as const, content: request.user }],
  };
}

/** Refusals and cut-off answers are not text to parse. */
export function interpretResponse(response: ModelResponseLike): ModelResult {
  if (response.stop_reason === 'refusal') {
    const category = response.stop_details?.category;
    return category ? { kind: 'refusal', category } : { kind: 'refusal' };
  }
  if (response.stop_reason === 'max_tokens') return { kind: 'incomplete', reason: 'max_tokens' };
  const text = response.content.flatMap(block => (block.type === 'text' && block.text ? [block.text] : [])).join('');
  return text ? { kind: 'ok', text } : { kind: 'incomplete', reason: `no text (${response.stop_reason})` };
}

/**
 * Takes one unit of the user's hourly quota before the model is asked (429 when the hour is
 * used up; limit 0 turns the assist off without asking the database).
 */
export async function takeQuota(
  deps: { hourlyLimit: number; usage: AiUsage },
  userId: string,
  rateLimitedMessage: string,
): Promise<void> {
  if (deps.hourlyLimit < 1 || !(await deps.usage.take(userId, deps.hourlyLimit))) {
    throw errors.tooMany('assist_rate_limited', rateLimitedMessage);
  }
}

/** Error answers shared by the assists, so every function words the same case the same way. */
export const aiErrors = {
  notConfigured: (message: string) => new HttpError(503, 'assist_not_configured', message),
  declined: (message: string) => new HttpError(422, 'assist_declined', message),
  unavailable: (message: string) => new HttpError(502, 'assist_unavailable', message),
};
