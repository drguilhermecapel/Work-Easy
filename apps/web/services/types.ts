// Row types written by hand from docs/ARQUITETURA.md, only for the columns
// the screens use. They go away when lib/database.types.ts is generated
// (see the TODO in lib/supabase.ts).

export type UserRole = 'client' | 'provider';
export type ProviderStatus = 'draft' | 'pending_review' | 'approved' | 'suspended';
export type PlanCode = 'free' | 'pro';
export type RequestStatus = 'open' | 'matched' | 'closed' | 'canceled';
export type ProposalStatus = 'sent' | 'accepted' | 'declined' | 'withdrawn';
export type ConsentPurpose = 'terms' | 'privacy' | 'marketing' | 'background_check' | 'location';
export type DataRequestKind = 'export' | 'delete';

/** profiles */
export interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  city: string | null;
  deleted_at: string | null;
  created_at: string;
}

/** Columns the user may change on their own profile (never role, deleted_at or id). */
export type ProfileUpdate = Partial<Pick<ProfileRow, 'full_name' | 'phone' | 'city'>>;

/** providers */
export interface ProviderRow {
  id: string;
  display_name: string;
  slug: string;
  bio: string | null;
  avatar_path: string | null;
  status: ProviderStatus;
  plan: PlanCode;
  base_neighborhood_id: string | null;
  accepts_platform_requests: boolean;
  created_at: string;
}

/** neighborhoods */
export interface NeighborhoodRow {
  id: string;
  city: string;
  name: string;
  slug: string;
  zone: string | null;
}

/** requests */
export interface RequestRow {
  id: string;
  client_id: string;
  occupation_slug: string;
  neighborhood_id: string;
  description: string;
  preferred_dates: string | null;
  urgent: boolean;
  status: RequestStatus;
  expires_at: string;
  created_at: string;
}

export type RequestInsert = Pick<
  RequestRow,
  'client_id' | 'occupation_slug' | 'neighborhood_id' | 'description' | 'preferred_dates' | 'urgent'
>;

/** proposals */
export interface ProposalRow {
  id: string;
  request_id: string;
  provider_id: string;
  price_cents: number;
  message: string | null;
  valid_until: string | null;
  status: ProposalStatus;
  created_at: string;
}

/** consents (insert-only history) */
export interface ConsentRow {
  id: string;
  user_id: string;
  purpose: ConsentPurpose;
  version: string;
  granted: boolean;
  at: string;
}

/** platform_settings */
export interface PlatformSettingRow {
  key: string;
  value: unknown;
  updated_at: string;
}

/** Error body of an Edge Function (supabase/functions/_shared/http.ts, ErrorBody). */
export interface FunctionErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/** Edge Function answer: { ok, data | error } */
export type FunctionResult<T> = { ok: true; data: T } | { ok: false; error: FunctionErrorBody };
