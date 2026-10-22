import { AppError } from '../lib/errors';
import type { PriceUnit } from '../catalog/types';
import type { Tables } from '../lib/database.types';
import { db, unwrap, unwrapMaybe } from './client';
import { guard } from './proErrors';

export type ServiceRow = Pick<
  Tables<'services'>,
  'id' | 'provider_id' | 'occupation_slug' | 'title' | 'description' | 'price_min_cents' | 'price_max_cents' | 'unit' | 'duration_minutes' | 'active'
>;

const SERVICE_COLUMNS =
  'id, provider_id, occupation_slug, title, description, price_min_cents, price_max_cents, unit, duration_minutes, active';

export interface ServiceInput {
  id?: string;
  providerId: string;
  occupationSlug: string;
  title: string;
  description?: string;
  priceMinCents: number;
  priceMaxCents: number | null;
  unit: PriceUnit;
  durationMinutes: number | null;
  active: boolean;
}

export const listMyServices = (providerId: string): Promise<ServiceRow[]> =>
  guard(async () =>
    unwrap<ServiceRow[]>(
      await db().from('services').select(SERVICE_COLUMNS).eq('provider_id', providerId).order('created_at', { ascending: true }),
    ),
  );

/** Same bounds as the checks on the services table. */
const validate = (input: ServiceInput): void => {
  const title = input.title.trim();
  if (title.length < 2 || title.length > 120) {
    throw new AppError('invalid_input', { message: 'O título do serviço precisa ter de 2 a 120 caracteres.' });
  }
  if ((input.description?.trim().length ?? 0) > 2000) {
    throw new AppError('invalid_input', { message: 'A descrição pode ter até 2000 caracteres.' });
  }
  if (!Number.isSafeInteger(input.priceMinCents) || input.priceMinCents < 0) {
    throw new AppError('invalid_input', { message: 'Informe o preço do serviço.' });
  }
  if (input.priceMaxCents !== null && (!Number.isSafeInteger(input.priceMaxCents) || input.priceMaxCents < input.priceMinCents)) {
    throw new AppError('invalid_input', { message: 'O preço máximo não pode ser menor que o mínimo.' });
  }
  if (input.durationMinutes !== null && (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 1440)) {
    throw new AppError('invalid_input', { message: 'A duração precisa ficar entre 5 minutos e 24 horas.' });
  }
};

/** Creates or updates a service. The unit must be one the occupation policy allows (the database answers `unit_not_allowed`). */
export const saveService = (input: ServiceInput): Promise<ServiceRow> =>
  guard(async () => {
    validate(input);
    const row = {
      occupation_slug: input.occupationSlug,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      price_min_cents: input.priceMinCents,
      price_max_cents: input.priceMaxCents,
      unit: input.unit,
      duration_minutes: input.durationMinutes,
      active: input.active,
    };
    if (input.id) {
      return unwrap<ServiceRow>(await db().from('services').update(row).eq('id', input.id).select(SERVICE_COLUMNS).single());
    }
    return unwrap<ServiceRow>(
      await db().from('services').insert({ ...row, provider_id: input.providerId }).select(SERVICE_COLUMNS).single(),
    );
  });

export const setServiceActive = (id: string, active: boolean): Promise<void> =>
  guard(async () => {
    unwrapMaybe<unknown>(await db().from('services').update({ active }).eq('id', id));
  });

export const deleteService = (id: string): Promise<void> =>
  guard(async () => {
    unwrapMaybe<unknown>(await db().from('services').delete().eq('id', id));
  });
