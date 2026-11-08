// care-summary (família, linha de cuidado, fase 3): summary of the week of one household, made
// from the shift reports of the last 7 days with Claude on the server. STRICTLY non-clinical:
// no diagnosis, no medical reading, no medication advice, no judgement of urgency. The caller
// must own the household; the reports are read through the caller's own client, so RLS applies.
// What leaves the server: the text of the reports with the registered names replaced by
// markers (a report that mentions health is not sent at all), inside delimited blocks, to a
// model without tools that answers a JSON schema only. The answer is checked again here
// (schema, links, instructions, clinical vocabulary, known names) before the family sees it.
// Without ANTHROPIC_API_KEY the function answers 503. The hourly quota (take_assist_quota,
// shared with request-assist and quote-assist) is taken before the model is called, and only
// when there is something to summarize.

import { AiOutputError } from '../_shared/ai-guard.ts';
import { aiErrors, type AiUsage, type ModelRequest, type ModelResult, takeQuota } from '../_shared/ai-model.ts';
import {
  buildWeekInput, CARE_SUMMARY_SYSTEM_PROMPT, careSummarySchema, HEALTH_NOTICE, parseSummaryOutput, SUMMARY_NOTICE, summaryWindow,
  WINDOW_DAYS, type WeekData,
} from '../_shared/care-summary.ts';
import { type AuditEntry, type AuthUser, type BaseDeps, auditSafely, corsOf, validated } from '../_shared/handler-kit.ts';
import { errors, readJson, route } from '../_shared/http.ts';
import { object, uuid } from '../_shared/validate.ts';

export interface CareSummaryDeps extends BaseDeps {
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
    /** The household as the caller's own query sees it (RLS), or null. Admins see other people's. */
    getHousehold(id: string): Promise<{ id: string; owner_id: string } | null>;
    /** The week of the household through the caller's own client: shifts, reports and the names to remove. */
    loadWeek(householdId: string, window: { from: Date; to: Date }): Promise<WeekData>;
  } | null>;
}

const MESSAGES = {
  notConfigured: 'O resumo da semana depende de configuração no servidor (ANTHROPIC_API_KEY).',
  rateLimited: 'Você atingiu o limite de usos da IA nesta hora. Tente de novo mais tarde: os relatórios continuam disponíveis para leitura.',
  notOwner: 'Você só pode pedir o resumo das suas próprias casas.',
  declined: 'A IA não conseguiu resumir estes relatórios. Leia os relatórios abaixo.',
  incomplete: 'A IA não concluiu o resumo. Leia os relatórios abaixo.',
  invalid: 'A IA devolveu um resumo que não pôde ser usado. Leia os relatórios abaixo.',
};

const Body = object({ household_id: uuid() });

export function handler(req: Request, deps: CareSummaryDeps): Promise<Response> {
  return route(req, { methods: ['POST'], ...corsOf(deps), onError: deps.logError }, async () => {
    const session = await deps.session(req);
    if (!session) throw errors.unauthorized();
    const classify = deps.classify;
    if (!classify) throw aiErrors.notConfigured(MESSAGES.notConfigured);
    const { household_id: householdId } = validated(Body, await readJson(req));
    const { user } = session;

    // Same answer for a house that does not exist, one the caller cannot see and one that is
    // someone else's (an admin sees every house through RLS and still may not ask for a summary)
    const household = await session.getHousehold(householdId);
    if (!household || household.owner_id !== user.id) throw errors.notAllowed(MESSAGES.notOwner);

    const now = deps.now();
    const input = buildWeekInput(await session.loadWeek(household.id, summaryWindow(now)), now);
    const health = input.counts.reports_omitted > 0;
    const base = { period: input.period, ...input.counts, ai_generated: true, notice: SUMMARY_NOTICE };
    // Nothing the model could summarize: no call, and no quota spent
    if (!input.user) return { data: { ...base, summary: null, mentions_health: health, health_notice: health ? HEALTH_NOTICE : null } };

    await takeQuota(deps, user.id, MESSAGES.rateLimited);

    // The audit entry says whose house and what happened, never what the reports or the summary say
    const record = (outcome: string, extra: Record<string, unknown> = {}) =>
      auditSafely(deps, {
        actor_id: user.id,
        action: 'ai.care_summary',
        entity: 'households',
        entity_id: household.id,
        data: {
          outcome,
          model: deps.model,
          window_days: WINDOW_DAYS,
          input_chars: input.user.length,
          suspicious_input: input.suspicious,
          ...input.counts,
          ...extra,
        },
      });

    let result: ModelResult;
    try {
      result = await classify({ system: CARE_SUMMARY_SYSTEM_PROMPT, user: input.user, schema: careSummarySchema() });
    } catch (error) {
      await record('error');
      throw error;
    }
    if (result.kind === 'refusal') {
      await record('refusal', result.category ? { category: result.category } : {});
      throw aiErrors.declined(MESSAGES.declined);
    }
    if (result.kind === 'incomplete') {
      deps.logError(new Error(`care-summary incomplete: ${result.reason}`));
      await record('incomplete');
      throw aiErrors.unavailable(MESSAGES.incomplete);
    }
    try {
      const { mentions_health: modelFlag, ...summary } = parseSummaryOutput(result.text, input.names);
      const mentionsHealth = modelFlag || health;
      await record('ok', { mentions_health: mentionsHealth });
      return { data: { ...base, summary, mentions_health: mentionsHealth, health_notice: mentionsHealth ? HEALTH_NOTICE : null } };
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
