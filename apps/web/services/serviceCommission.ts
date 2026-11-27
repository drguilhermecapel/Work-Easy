import { db, unwrap } from './client';
import { guard } from './proErrors';

export interface ServiceCommissionOption {
  occupation_slug: string;
  version: string;
  terms_reference: string;
  accepted_at: string | null;
  applies_from: string | null;
}

export const serviceCommissionOptions = (): Promise<ServiceCommissionOption[]> =>
  guard(async () => unwrap(await db().rpc('service_commission_options')));

export const acceptServiceCommission = (option: Pick<ServiceCommissionOption, 'occupation_slug' | 'version'>): Promise<string> =>
  guard(async () => unwrap(await db().rpc('accept_service_commission', {
    p_occupation: option.occupation_slug,
    p_version: option.version,
  })));

export const serviceProSalesAllowed = (providerId: string): Promise<boolean> =>
  guard(async () => unwrap(await db().rpc('service_pro_sales_allowed', { p_provider: providerId })));
