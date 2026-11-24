import { AppError } from '../lib/errors';
import { db, unwrap, unwrapMaybe } from './client';

// Reporting content and blocking accounts (supabase/migrations/20261124100002_reports_and_blocks.sql).
// Every write goes through a database function: the app never writes these tables.

export const REPORT_REASONS = ['ofensivo', 'assedio', 'fraude', 'spam', 'conteudo_improprio', 'outro'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  ofensivo: 'Linguagem ofensiva ou discriminatória',
  assedio: 'Assédio ou ameaça',
  fraude: 'Golpe, fraude ou pedido de pagamento por fora',
  spam: 'Propaganda ou spam',
  conteudo_improprio: 'Conteúdo impróprio',
  outro: 'Outro motivo',
};

export const REPORT_DETAILS_MAX = 1000;

/** What is being reported: a provider page, a review shown on it, or a request a provider received. */
export type ReportTarget =
  | { type: 'provider'; providerId: string }
  | { type: 'review'; providerId: string; createdAt: string }
  | { type: 'request'; requestId: string };

export const reportContent = async (target: ReportTarget, reason: ReportReason, details: string): Promise<void> => {
  const text = details.trim();
  if (text.length > REPORT_DETAILS_MAX) {
    throw new AppError('invalid_input', { message: `O texto pode ter até ${REPORT_DETAILS_MAX} caracteres.` });
  }
  const p_details = text || null;
  if (target.type === 'review') {
    unwrap<string>(
      await db().rpc('report_review', { p_provider: target.providerId, p_created_at: target.createdAt, p_reason: reason, p_details }),
    );
    return;
  }
  const p_target = target.type === 'provider' ? target.providerId : target.requestId;
  unwrap<string>(await db().rpc('report_content', { p_type: target.type, p_target, p_reason: reason, p_details }));
};

export const blockProvider = async (providerId: string): Promise<void> => {
  unwrapMaybe<unknown>(await db().rpc('block_provider', { p_provider: providerId }));
};

/** Blocks whoever wrote the request; the provider never learns who it is. */
export const blockRequestAuthor = async (requestId: string): Promise<void> => {
  unwrapMaybe<unknown>(await db().rpc('block_request_author', { p_request: requestId }));
};

export const unblockUser = async (blockedId: string): Promise<void> => {
  unwrapMaybe<unknown>(await db().rpc('unblock_user', { p_blocked: blockedId }));
};

export interface BlockEntry {
  blocked_id: string;
  /** Public name of a blocked provider; null for the author of a request. */
  label: string | null;
  origin: 'provider' | 'request';
  created_at: string;
}

export const listMyBlocks = async (): Promise<BlockEntry[]> => unwrapMaybe<BlockEntry[]>(await db().rpc('my_blocks')) ?? [];
