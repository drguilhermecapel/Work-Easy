import { db, invokeFunction, nullable, unwrap, unwrapMaybe } from './client';
import { AppError, toAppErrorAsync } from '../lib/errors';
import { stripImageMetadata } from '../lib/imageMetadata';

export const fileLabels = {
  driver_photo: 'Foto do motorista',
  vehicle_photo: 'Foto do veículo',
  driver_license: 'CNH com EAR',
  municipal_permit: 'CONDUAPP ou dispensa aplicável',
  vehicle_license: 'Licenciamento do veículo',
  vehicle_certificate: 'CSVAPP ou documento municipal aplicável',
  insurance: 'Seguro do veículo',
} as const;
export type DriverFileKind = keyof typeof fileLabels;
export interface DriverDossier {
  id: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  name: string;
  plate: string;
  model: string;
  number: string;
  reason: string | null;
  files: { id: string; kind: DriverFileKind }[];
}
export interface DriverIdentity {
  name: string;
  number: string;
  model: string;
  plate: string;
  photos: Partial<Record<'driver_photo' | 'vehicle_photo', string>>;
}
export const getDriverDossier = async (driverId?: string) =>
  unwrap<{ open: boolean; version?: string; retention_days?: number; dossier?: DriverDossier | null }>(
    await db().rpc('ride_dossier', { p_driver: driverId }),
  );
export const beginDriverDossier = async (details: { name: string; plate: string; model: string; number: string }, version: string) =>
  unwrap<string>(
    await db().rpc('ride_begin_dossier', {
      p_name: details.name,
      p_plate: details.plate,
      p_model: details.model,
      p_number: details.number,
      p_version: version,
    }),
  );
export const submitDriverDossier = async (id: string) => unwrap(await db().rpc('ride_submit_dossier', { p_dossier: id }));
export const decideDriverDossier = async (
  id: string,
  approve: boolean,
  dates: { driver: string; vehicle: string; insurance: string },
  reason: string,
) =>
  unwrap(
    await db().rpc('ride_decide_dossier', {
      p_dossier: id,
      p_approve: approve,
      p_driver_until: nullable(approve ? dates.driver : null)!,
      p_vehicle_until: nullable(approve ? dates.vehicle : null)!,
      p_insurance_until: nullable(approve ? dates.insurance : null)!,
      p_reason: reason,
    }),
  );
export const getDriverIdentity = async (legId: string) =>
  unwrapMaybe<DriverIdentity>(await db().rpc('ride_trip_driver_identity', { p_leg: legId }));
export async function getDossierPhoto(file: string, leg?: string) {
  const { path } = await invokeFunction<{ path: string }>('ride-driver-file', { file, leg });
  if (!path?.startsWith('/storage/v1/object/sign/ride-driver-files/')) throw new AppError('server_error');
  const backendUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!backendUrl) throw new AppError('server_error');
  const origin = new URL(backendUrl).origin;
  return { url: new URL(path, origin).href };
}
export const markAtPickup = async (legId: string) => unwrap(await db().rpc('ride_mark_at_pickup', { p_leg: legId }));

export async function uploadDriverFile(kind: DriverFileKind, file: File) {
  const limit = 8 * 1024 * 1024;
  if (!['image/jpeg', 'image/png'].includes(file.type) || !file.size || file.size > limit) {
    throw new AppError('invalid_input', { message: 'Escolha uma imagem JPEG ou PNG de até 8 MB.' });
  }
  const clean = await stripImageMetadata(file, undefined, limit);
  const form = new FormData();
  form.set('kind', kind);
  form.set('file', clean, 'foto');
  const { data, error } = await db().functions.invoke('ride-driver-file', { body: form });
  if (error) throw await toAppErrorAsync(error);
  if (!data?.ok || typeof data.data?.id !== 'string') throw new AppError('server_error');
}
