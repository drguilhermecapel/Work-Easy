// quote-assist (prestador, fase 3): turns the description of a job into a DRAFT of quote items
// and a short intro text with Claude on the server. Nothing is saved: the provider reviews and
// edits everything in the quote form. The model never sets a price: a unit price comes back
// only when the provider passed reference prices and the item points to one of them. Without
// ANTHROPIC_API_KEY the function answers 503. Every call costs money on the platform's account,
// so each user gets `hourlyLimit` assist calls per hour (429 above it), taken atomically in the
// database (take_assist_quota) before the model is called.

import { AiOutputError, findInstruction } from '../_shared/ai-guard.ts';
import { aiErrors, type AiUsage, type ModelRequest, type ModelResult, takeQuota } from '../_shared/ai-model.ts';
import { type AuditEntry, type AuthUser, type BaseDeps, auditSafely, corsOf, validated } from '../_shared/handler-kit.ts';
import { errors, readJson, route } from '../_shared/http.ts';
import {
  allowedUnits, buildQuoteUserMessage, type OccupationContext, parseQuoteOutput, QUOTE_ASSIST_SYSTEM_PROMPT, QUOTE_NOTICE,
  QuoteAssistBody, quoteSchema,
} from '../_shared/quote-assist.ts';

export interface QuoteAssistDeps extends BaseDeps {
  /** Model name, recorded in the audit entry. */
  model: string;
  /** Null when ANTHROPIC_API_KEY is not set. */
  classify: ((request: ModelRequest) => Promise<ModelResult>) | null;
  /** Assist calls per user per hour (ASSIST_HOURLY_LIMIT). */
  hourlyLimit: number;
  usage: AiUsage;
  admin: { audit(entry: AuditEntry): Promise<void> };
  session(req: Request): Promise<{
    user: AuthUser;
    /** The occupation and its price units from the catalog, or null when the slug does not exist. */
    getOccupation(slug: string): Promise<OccupationContext | null>;
  } | null>;
}

const MESSAGES = {
  notConfigured: 'O assistente de orçamentos depende de configuração no servidor (ANTHROPIC_API_KEY).',
  rateLimited: 'Você atingiu o limite de sugestões de IA nesta hora. Tente de novo mais tarde ou monte os itens manualmente.',
  declined: 'A IA não conseguiu sugerir itens para este texto. Monte os itens manualmente.',
  incomplete: 'A IA não concluiu a resposta. Monte os itens manualmente.',
  invalid: 'A IA devolveu uma resposta que não pôde ser usada. Monte os itens manualmente.',
};

export function handler(req: Request, deps: QuoteAssistDeps): Promise<Response> {
  return route(req, { methods: ['POST'], ...corsOf(deps), onError: deps.logError }, async () => {
    const session = await deps.session(req);
    if (!session) throw errors.unauthorized();
    const classify = deps.classify;
    if (!classify) throw aiErrors.notConfigured(MESSAGES.notConfigured);
    const input = validated(QuoteAssistBody, await readJson(req));
    const { user } = session;

    let occupation: OccupationContext | null = null;
    if (input.occupation_slug) {
      occupation = await session.getOccupation(input.occupation_slug);
      if (!occupation) throw errors.invalidInput(['occupation_slug: ocupação desconhecida']);
    }
    const references = input.reference_prices ?? [];
    const units = allowedUnits(occupation);

    await takeQuota(deps, user.id, MESSAGES.rateLimited);

    // The audit entry says who asked and what happened, never what was written or answered
    const record = (outcome: string, extra: Record<string, unknown> = {}) =>
      auditSafely(deps, {
        actor_id: user.id,
        action: 'ai.quote_assist',
        entity: 'profiles',
        entity_id: user.id,
        data: {
          outcome,
          model: deps.model,
          description_chars: input.description.length,
          occupation_slug: occupation?.slug ?? null,
          reference_prices: references.length,
          suspicious_input: findInstruction(input.description) !== null,
          ...extra,
        },
      });

    let result: ModelResult;
    try {
      result = await classify({
        system: QUOTE_ASSIST_SYSTEM_PROMPT,
        user: buildQuoteUserMessage({ description: input.description, occupation, references, units }),
        schema: quoteSchema(references, units),
      });
    } catch (error) {
      await record('error');
      throw error;
    }
    if (result.kind === 'refusal') {
      await record('refusal', result.category ? { category: result.category } : {});
      throw aiErrors.declined(MESSAGES.declined);
    }
    if (result.kind === 'incomplete') {
      deps.logError(new Error(`quote-assist incomplete: ${result.reason}`));
      await record('incomplete');
      throw aiErrors.unavailable(MESSAGES.incomplete);
    }
    try {
      const suggestion = parseQuoteOutput(result.text, { references, units });
      await record('ok', { items: suggestion.items.length });
      return { data: { ...suggestion, ai_generated: true, notice: QUOTE_NOTICE } };
    } catch (error) {
      if (error instanceof AiOutputError) {
        deps.logError(error);
        await record('invalid_output');
        throw aiErrors.unavailable(MESSAGES.invalid);
      }
      throw error;
    }
  });
}
