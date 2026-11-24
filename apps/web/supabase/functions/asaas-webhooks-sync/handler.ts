// asaas-webhooks-sync (administrador): confere e refaz o webhook de cada subconta do Asaas.
//
// O webhook da subconta só era enviado dentro de POST /v3/accounts e nada conferia depois. Aqui,
// com a chave da PRÓPRIA subconta (a documentação do Asaas não diz se a conta-raiz enxerga os
// webhooks de subcontas), lista-se GET /v3/webhooks, acha-se o nosso pela URL (`?acct=<provider_id>`)
// e se faz PUT (existe) ou POST (não existe). O authToken nunca volta na listagem; regravar o token
// derivado é a única forma de garantir que ele é o esperado (por exemplo, depois de trocar
// ASAAS_WEBHOOK_TOKEN). Nada disso foi chamado contra o Asaas real: a primeira execução deve ser
// dry_run no sandbox (docs/RUNBOOKS.md).
//
// A resposta e a auditoria nunca levam chave de subconta nem token.

import { AsaasError, type AsaasClient, type AsaasWebhook } from '../_shared/asaas-client.ts';
import {
  type AuditEntry, type AuthUser, type BaseDeps, auditSafely, corsOf, validated,
} from '../_shared/handler-kit.ts';
import { errors, HttpError, readJson, route } from '../_shared/http.ts';
import { deriveSubaccountToken } from '../_shared/secrets.ts';
import { SUBACCOUNT_WEBHOOK_EVENTS, subaccountWebhookUrl, webhookUrlKey } from '../_shared/subaccount-webhook.ts';
import { boolean, int, object, optional, uuid } from '../_shared/validate.ts';

/** Asaas allows 10 webhooks per account. */
export const MAX_WEBHOOKS_PER_ACCOUNT = 10;
export const MAX_BATCH = 50;
export const DEFAULT_BATCH = 20;
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export type SyncResultKind = 'created' | 'updated' | 'unchanged_dry_run' | 'key_rejected' | 'failed';

export interface SyncResult {
  provider_id: string;
  result: SyncResultKind;
  /** failed: why (`too_many_webhooks`, `key_missing`, an Asaas error code...). */
  code?: string;
  /** unchanged_dry_run: what a real run would do. */
  would?: 'create' | 'update';
  /** More than one webhook with our URL in the subaccount (only the first is touched). */
  duplicates?: number;
}

export interface SyncDeps extends BaseDeps {
  /** Root client: only used to build one client per subaccount key. */
  asaas: AsaasClient | null;
  /** `${SUPABASE_URL}/functions/v1/asaas-webhook`. */
  webhookUrl: string | null;
  webhookToken?: string;
  /** Address for new webhooks when the provider has none on file (from EMAIL_FROM). */
  fallbackEmail: string | null;
  session(req: Request): Promise<{ user: AuthUser; isAdmin(): Promise<boolean> } | null>;
  admin: {
    /**
     * Receiving accounts with a stored key, ordered by provider_id, after `after`, at most `limit`;
     * `remaining` counts the ones after the last returned. With `providerId`, only that one.
     */
    listTargets(args: { providerId?: string; after?: string; limit: number }): Promise<{ ids: string[]; remaining: number }>;
    readKey(providerId: string): Promise<string | null>;
    /** The provider's e-mail on file, for the `email` Asaas requires when creating a webhook. */
    emailOf(providerId: string): Promise<string | null>;
    audit(entry: AuditEntry): Promise<void>;
  };
}

const Body = object({
  provider_id: optional(uuid()),
  dry_run: optional(boolean()),
  /** provider_id of the last account of the previous batch (`next_cursor`). */
  cursor: optional(uuid()),
  limit: optional(int({ min: 1, max: MAX_BATCH })),
});

export function handler(req: Request, deps: SyncDeps): Promise<Response> {
  return route(req, { methods: ['POST'], ...corsOf(deps), onError: deps.logError }, async () => {
    const session = await deps.session(req);
    if (!session) throw errors.unauthorized();
    if (!(await session.isAdmin())) throw errors.notAllowed();
    const root = deps.asaas;
    if (!root) throw errors.paymentsNotConfigured();
    if (!deps.webhookUrl || !deps.webhookToken) {
      throw new HttpError(503, 'webhook_not_configured', 'ASAAS_WEBHOOK_TOKEN ou SUPABASE_URL não está configurado.');
    }
    const input = validated(Body, await readJson(req));
    const dryRun = input.dry_run === true;
    const limit = input.limit ?? DEFAULT_BATCH;

    const { ids, remaining } = await deps.admin.listTargets({ providerId: input.provider_id, after: input.cursor, limit });
    if (input.provider_id && ids.length === 0) throw errors.notFound('Conta de recebimento com chave guardada');

    const results: SyncResult[] = [];
    let rateLimited = false;
    let lastDone: string | undefined = input.cursor;
    for (const providerId of ids) {
      const outcome = await syncOne(deps, root, providerId, dryRun);
      if (outcome === 'rate_limited') {
        // Not finished: the next batch starts at this account again
        rateLimited = true;
        break;
      }
      results.push(outcome);
      lastDone = providerId;
    }

    const left = remaining + (ids.length - results.length);
    const tally = (kind: SyncResultKind) => results.filter(r => r.result === kind).length;
    const summary = {
      dry_run: dryRun,
      processed: results.length,
      created: tally('created'),
      updated: tally('updated'),
      unchanged_dry_run: tally('unchanged_dry_run'),
      key_rejected: tally('key_rejected'),
      failed: tally('failed'),
      rate_limited: rateLimited,
    };
    const failedCodes: Record<string, number> = {};
    for (const r of results) if (r.code) failedCodes[r.code] = (failedCodes[r.code] ?? 0) + 1;
    await auditSafely(deps, {
      actor_id: session.user.id,
      action: 'asaas_webhooks.sync',
      entity: 'asaas_webhooks',
      entity_id: input.provider_id ?? 'all',
      data: { ...summary, remaining: left, codes: failedCodes, ...(input.provider_id ? { provider_id: input.provider_id } : {}) },
    });

    return {
      data: {
        ...summary,
        remaining: left,
        next_cursor: input.provider_id || left === 0 ? null : lastDone ?? null,
        results,
      },
    };
  });
}

/** One subaccount. Never throws: a failure becomes that account's result (429 aside). */
async function syncOne(deps: SyncDeps, root: AsaasClient, providerId: string, dryRun: boolean): Promise<SyncResult | 'rate_limited'> {
  try {
    const key = await deps.admin.readKey(providerId);
    if (!key) return { provider_id: providerId, result: 'failed', code: 'key_missing' };
    const client = root.withApiKey(key);

    const url = subaccountWebhookUrl(deps.webhookUrl as string, providerId);
    const wanted = webhookUrlKey(url);
    const all = await listAllWebhooks(client);
    const ours = all.filter(w => webhookUrlKey(w.url) === wanted);
    const duplicates = ours.length > 1 ? { duplicates: ours.length } : {};
    const existing = ours[0];

    if (!existing && all.length >= MAX_WEBHOOKS_PER_ACCOUNT) {
      return { provider_id: providerId, result: 'failed', code: 'too_many_webhooks' };
    }
    if (dryRun) {
      return { provider_id: providerId, result: 'unchanged_dry_run', would: existing ? 'update' : 'create', ...duplicates };
    }

    const authToken = await deriveSubaccountToken(deps.webhookToken as string, providerId);
    if (existing) {
      await client.updateWebhook(existing.id, {
        url, authToken, enabled: true, interrupted: false, sendType: 'SEQUENTIALLY', events: SUBACCOUNT_WEBHOOK_EVENTS,
      });
      return { provider_id: providerId, result: 'updated', ...duplicates };
    }
    const email = (await deps.admin.emailOf(providerId)) ?? deps.fallbackEmail;
    if (!email) return { provider_id: providerId, result: 'failed', code: 'email_missing' };
    await client.createWebhook({
      name: 'WorkEasy', url, email, enabled: true, interrupted: false, sendType: 'SEQUENTIALLY',
      apiVersion: 3, authToken, events: SUBACCOUNT_WEBHOOK_EVENTS,
    });
    return { provider_id: providerId, result: 'created' };
  } catch (error) {
    if (error instanceof AsaasError) {
      if (error.status === 429) return 'rate_limited';
      // The subaccount key was revoked, expired or lost its access
      if (error.status === 401 || error.status === 403) return { provider_id: providerId, result: 'key_rejected' };
      return { provider_id: providerId, result: 'failed', code: safeCode(error.errors[0]?.code ?? `http_${error.status}`) };
    }
    deps.logError(error);
    return {
      provider_id: providerId,
      result: 'failed',
      code: error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'timeout' : 'unexpected',
    };
  }
}

async function listAllWebhooks(client: AsaasClient): Promise<AsaasWebhook[]> {
  const all: AsaasWebhook[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await client.listWebhooks({ offset: page * PAGE_SIZE, limit: PAGE_SIZE });
    all.push(...result.data);
    if (!result.hasMore || result.data.length === 0) break;
  }
  return all;
}

/** Asaas error codes are short identifiers; anything else is cut so free text never reaches the result. */
const safeCode = (code: string) => (/^[\w.-]{1,64}$/.test(code) ? code : 'asaas_error');
