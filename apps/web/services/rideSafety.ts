import type { Json } from '../lib/database.types';
import type { RideLegInput, RideQuote } from './rides';
import { db, nullable, unwrap, unwrapMaybe } from './client';

export interface SafetyCase {
  protocol: string;
  leg: string;
  category: string;
  severity: string;
  opened: string;
  due_at: string | null;
  first_response: string | null;
  resolved_at: string | null;
  insurance: boolean;
  claimed_by_me: boolean;
  updates: { code: string; at: string; ref: string | null }[];
  files: { id: string; mime: string; until: string }[];
}
export interface SafetyStatus {
  lost_checks: { protocol: string; opened: string }[];
  role: 'passenger' | 'driver';
  status: string;
  simulation: boolean;
  wellness: string | null;
  notice_given: boolean;
  recording_allowed: boolean;
  media_enabled: boolean;
  dial: string | null;
  location: { lat: number; lng: number; at: string } | null;
  vehicle: { model: string; plate: string } | null;
  policy: {
    insurer: string;
    coverage: string;
    exclusions: string;
    territory: string;
    from: string;
    until: string;
    claim_channel: string;
  } | null;
  cases: SafetyCase[];
}
export interface TrustStatus {
  role: string;
  can_rate: boolean;
  my_stars: number | null;
  can_block: boolean;
  blocked: boolean;
  cue: string | null;
  assistance: string | null;
  sharing: boolean | null;
  restrictions: { id: string; reason: string; until: string; appeal_until: string; state: string }[];
}
export interface Communication {
  role: string;
  status: string;
  shares: { id: string; expires_at: string }[];
  messages: { id: string; mine: boolean; text: string; at: string }[];
}
export interface SharedProgress {
  status: string;
  eta: string | null;
  approximate_position: { lat: number; lng: number; at: string } | null;
  expires_at: string;
  simulation: boolean;
}
export interface Appeal {
  id: string;
  protocol: string;
  reason: string;
  appeal_reason: string;
  evidence_ref: string;
  until: string;
}
export const safety = {
  status: async (leg: string) => unwrap<SafetyStatus>(await db().rpc('ride_safety_status', { p_leg: leg })),
  trust: async (leg: string) => unwrap<TrustStatus>(await db().rpc('ride_trust_overview', { p_leg: leg })),
  communication: async (leg: string) => unwrap<Communication>(await db().rpc('ride_communication', { p_leg: leg })),
  pin: async (leg: string) =>
    unwrap<{ pin: string; expires_at: string }>(await db().rpc('ride_issue_pin', { p_leg: leg })),
  recover: async (leg: string, protocol: string, proof: string) =>
    unwrap<{ pin: string; expires_at: string }>(
      await db().rpc('ride_recover_pin', { p_leg: leg, p_protocol: protocol, p_proof: proof }),
    ),
  board: async (leg: string, pin: string, key: string) =>
    unwrap<{ ok: boolean; reason?: string }>(
      await db().rpc('ride_verify_boarding', { p_leg: leg, p_pin: pin, p_key: key }),
    ),
  invite: async (leg: string, email: string, minutes: number) =>
    unwrap<{ id: string; token: string; expires_at: string }>(
      await db().rpc('ride_share_invite', { p_leg: leg, p_email: email, p_minutes: minutes }),
    ),
  revoke: async (id: string) => unwrap<boolean>(await db().rpc('ride_share_revoke', { p_id: id })),
  shared: async (token: string) =>
    unwrapMaybe<SharedProgress>(await db().rpc('ride_shared_progress', { p_token: token })),
  send: async (leg: string, text: string, key: string) =>
    unwrap<string>(await db().rpc('ride_chat_send', { p_leg: leg, p_text: text, p_key: key })),
  acknowledge: async (leg: string) => unwrap<boolean>(await db().rpc('ride_wellness_ack', { p_leg: leg })),
  report: async (leg: string, category: string, key: string, parent?: string) =>
    unwrap<string>(
      await db().rpc('ride_safety_case', { p_leg: leg, p_category: category, p_key: key, p_parent: parent }),
    ),
  update: async (protocol: string, code: string, ref: string | null, key: string) =>
    unwrap<string>(
      await db().rpc('ride_case_update', {
        p_protocol: protocol,
        p_code: code,
        p_reference: nullable(ref)!,
        p_key: key,
      }),
    ),
  notice: async (leg: string, agree: boolean) =>
    unwrap<boolean>(await db().rpc('ride_recording_notice', { p_leg: leg, p_agree: agree })),
  attach: async (protocol: string, mime: string, content: string, key: string) =>
    unwrap<string>(
      await db().rpc('ride_attach_incident', { p_protocol: protocol, p_mime: mime, p_content: content, p_key: key }),
    ),
  file: async (id: string) =>
    unwrap<{ mime: string; content: string }>(await db().rpc('ride_incident_file', { p_id: id })),
  access: async (leg: string, cue: string, assistance: string, share: boolean) =>
    unwrap<{ available: boolean }>(
      await db().rpc('ride_set_access', { p_leg: leg, p_cue: cue, p_assistance: assistance, p_share: share }),
    ),
  rate: async (leg: string, stars: number) =>
    unwrap<boolean>(await db().rpc('ride_rate_pair', { p_leg: leg, p_stars: stars })),
  block: async (leg: string, enable: boolean) =>
    unwrap<boolean>(await db().rpc('ride_block_pair', { p_leg: leg, p_enable: enable })),
  appeal: async (id: string, reason: string) =>
    unwrap<boolean>(await db().rpc('ride_appeal', { p_id: id, p_reason: reason })),
  cases: async () => unwrap<SafetyCase[]>(await db().rpc('admin_ride_safety_cases')),
  appeals: async () => unwrap<Appeal[]>(await db().rpc('admin_ride_appeals')),
  restrict: async (protocol: string, subject: string, reason: string, proof: string, days: number) =>
    unwrap<string>(
      await db().rpc('admin_ride_restrict', {
        p_protocol: protocol,
        p_subject: subject,
        p_reason: reason,
        p_evidence: proof,
        p_days: days,
      }),
    ),
  review: async (id: string, lift: boolean, proof: string) =>
    unwrap<boolean>(await db().rpc('admin_ride_decide_appeal', { p_id: id, p_lift: lift, p_evidence: proof })),
};

export function encodeMedia(file: File): Promise<string> {
  if (file.size > 1048576) throw new Error('O limite por anexo é 1 MiB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Não foi possível ler este arquivo.'));
    reader.readAsDataURL(file);
  });
}

export async function downloadIncident(id: string) {
  const file = await safety.file(id);
  const bytes = Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download =
    'ocorrencia-' +
    id +
    '.' +
    ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'audio/webm': 'webm', 'audio/mp4': 'm4a' }[file.mime] ?? 'bin');
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function quoteRideWithAccess(
  key: string,
  booking: string | null,
  starts: string | null,
  legs: RideLegInput[],
  assistance: string,
) {
  return unwrap<RideQuote>(
    await db().rpc('ride_quote_with_access', {
      p_key: key,
      p_booking: nullable(booking)!,
      p_scheduled_at: nullable(starts)!,
      p_legs: legs as unknown as Json,
      p_assistance: assistance,
    }),
  );
}
export const offerAssistance = async (leg: string) =>
  unwrapMaybe<string>(await db().rpc('ride_offer_assistance', { p_leg: leg }));
export const sendPickupCue = async (leg: string, key: string) =>
  unwrap<boolean>(await db().rpc('ride_pickup_cue', { p_leg: leg, p_key: key }));
export const readPickupCue = async (leg: string) =>
  unwrapMaybe<{ at: string; mode: string }>(await db().rpc('ride_read_cue', { p_leg: leg }));
