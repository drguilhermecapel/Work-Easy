// account-delete (usuário): requires {"confirm":"EXCLUIR"}, records the
// request in data_requests, calls anonymize_user (payments and bookings stay,
// anonymized, for tax obligations) and deletes the user from Supabase Auth.

import { type AuditEntry, type AuthUser, type BaseDeps, validated } from '../_shared/handler-kit.ts';
import { errors, HttpError, readJson, route } from '../_shared/http.ts';
import { object, string } from '../_shared/validate.ts';

export const CONFIRMATION = 'EXCLUIR';

export interface DeleteDeps extends BaseDeps {
  session(req: Request): Promise<{ user: AuthUser } | null>;
  admin: {
    createRequest(userId: string): Promise<string>;
    updateRequest(id: string, patch: { status: string; completed_at?: string }): Promise<void>;
    anonymizeUser(userId: string): Promise<void>;
    deleteAuthUser(userId: string): Promise<void>;
    audit(entry: AuditEntry): Promise<void>;
  };
}

const Body = object({ confirm: string({ min: 1, max: 20 }) });

export function handler(req: Request, deps: DeleteDeps): Promise<Response> {
  return route(req, { methods: ['POST'], siteUrl: deps.siteUrl, onError: deps.logError }, async () => {
    const session = await deps.session(req);
    if (!session) throw errors.unauthorized();
    const body = await readJson(req);
    const input = (() => {
      try {
        return validated(Body, body);
      } catch {
        return null;
      }
    })();
    if (!input || input.confirm !== CONFIRMATION) {
      throw new HttpError(400, 'confirmation_required', `Para excluir a conta, envie a confirmação "${CONFIRMATION}".`);
    }
    const { user } = session;

    const requestId = await deps.admin.createRequest(user.id);
    try {
      await deps.admin.anonymizeUser(user.id);
    } catch (error) {
      await deps.admin.updateRequest(requestId, { status: 'failed' }).catch(deps.logError);
      throw error;
    }
    await deps.admin.updateRequest(requestId, { status: 'anonymized' });
    await deps.admin.audit({
      actor_id: user.id,
      action: 'account.delete',
      entity: 'profiles',
      entity_id: user.id,
      data: { data_request_id: requestId },
    });
    try {
      await deps.admin.deleteAuthUser(user.id);
    } catch (error) {
      deps.logError(error);
      throw new HttpError(
        500,
        'auth_delete_failed',
        'Seus dados foram anonimizados, mas o login não pôde ser removido. Tente novamente ou fale com o suporte.',
      );
    }
    const completedAt = deps.now().toISOString();
    // The Auth delete may cascade to rows tied to the user; this update is best effort
    await deps.admin.updateRequest(requestId, { status: 'completed', completed_at: completedAt }).catch(deps.logError);
    return { data: { deleted: true, data_request_id: requestId, completed_at: completedAt } };
  });
}
