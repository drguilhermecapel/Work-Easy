// request-assist (cliente, fase 3): turns free text into a structured request
// draft { occupation_slug, urgent, summary } with Claude on the server. The
// occupation is chosen only among catalog candidates and validated again
// here. Without ANTHROPIC_API_KEY the function answers 503. Every call costs
// money on the platform's account, so each user gets `hourlyLimit` calls per
// hour (429 above it). The quota is taken atomically in the database
// (take_assist_quota: one counter per user and clock hour) before the model is
// called, so a burst of simultaneous requests cannot pass the limit.

import {
  ASSIST_SYSTEM_PROMPT, AssistOutputError, assistSchema, buildAssistUserMessage, type OccupationCandidate,
  parseAssistOutput, rankOccupations, TEXT_MAX, TEXT_MIN,
} from '../_shared/assist.ts';
import { type AuthUser, type BaseDeps, corsOf, validated } from '../_shared/handler-kit.ts';
import { errors, HttpError, readJson, route } from '../_shared/http.ts';
import { object, string } from '../_shared/validate.ts';

export interface ClassifyRequest {
  system: string;
  user: string;
  schema: Record<string, unknown>;
}

export type ClassifyResult =
  | { kind: 'ok'; text: string }
  | { kind: 'refusal' }
  | { kind: 'incomplete'; reason: string };

export interface AssistUsage {
  /**
   * Consumes one call of the current hour for `userId` (take_assist_quota). Resolves false,
   * without consuming anything, when `limit` calls were already made this hour. A database
   * failure rejects: the model is never called without a granted quota.
   */
  take(userId: string, limit: number): Promise<boolean>;
}

export interface AssistDeps extends BaseDeps {
  /** Null when ANTHROPIC_API_KEY is not set. */
  classify: ((request: ClassifyRequest) => Promise<ClassifyResult>) | null;
  /** Calls per user per hour (ASSIST_HOURLY_LIMIT). */
  hourlyLimit: number;
  usage: AssistUsage;
  session(req: Request): Promise<{ user: AuthUser; listOccupations(): Promise<OccupationCandidate[]> } | null>;
}

const Body = object({ text: string({ min: TEXT_MIN, max: TEXT_MAX }) });

export function handler(req: Request, deps: AssistDeps): Promise<Response> {
  return route(req, { methods: ['POST'], ...corsOf(deps), onError: deps.logError }, async () => {
    const session = await deps.session(req);
    if (!session) throw errors.unauthorized();
    const classify = deps.classify;
    if (!classify) {
      throw new HttpError(503, 'assist_not_configured', 'O assistente de pedidos depende de configuração no servidor (ANTHROPIC_API_KEY).');
    }
    const { text } = validated(Body, await readJson(req));

    if (deps.hourlyLimit < 1 || !(await deps.usage.take(session.user.id, deps.hourlyLimit))) {
      throw errors.tooMany(
        'assist_rate_limited',
        'Você atingiu o limite de pedidos organizados pelo assistente nesta hora. Tente de novo mais tarde ou preencha o pedido manualmente.',
      );
    }

    const catalog = await session.listOccupations();
    const candidates = rankOccupations(text, catalog);
    const result = await classify({
      system: ASSIST_SYSTEM_PROMPT,
      user: buildAssistUserMessage(text, candidates),
      schema: assistSchema(candidates),
    });
    if (result.kind === 'refusal') {
      throw new HttpError(422, 'assist_declined', 'Não foi possível organizar este texto. Preencha o pedido manualmente.');
    }
    if (result.kind === 'incomplete') {
      deps.logError(new Error(`request-assist incomplete: ${result.reason}`));
      throw new HttpError(502, 'assist_unavailable', 'O assistente não concluiu a resposta. Preencha o pedido manualmente.');
    }
    try {
      const parsed = parseAssistOutput(result.text, candidates);
      return { data: { ...parsed, candidates: candidates.map(c => ({ slug: c.slug, name: c.name })) } };
    } catch (error) {
      if (error instanceof AssistOutputError) {
        deps.logError(error);
        throw new HttpError(502, 'assist_unavailable', 'O assistente devolveu uma resposta inválida. Preencha o pedido manualmente.');
      }
      throw error;
    }
  });
}
