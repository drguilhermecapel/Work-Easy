import type { Json } from '../lib/database.types';
import { toAppError } from '../lib/errors';
import type { ClassOption } from './rideLocalMap';
import type { RideLegInput, RideQuote } from './rides';
import { db, nullable, unwrap } from './client';

// Market catalog, the modality door, vehicle classes by feature and assistance options (O17 stage 6).
// Shapes of the jsonb answers are stated here; the server stays the authority on every rule.

export type ModalityStatus = 'inventory' | 'pilot' | 'authorized';
export interface MarketModality {
  code: string;
  par: string;
  label?: string;
  /** False for a market record without a flow in this product. */
  operational?: boolean;
  status: ModalityStatus;
  available: boolean;
  /** Code of the first refusal, null when available. */
  reason: string | null;
  source: string | null;
  /** Date only, "YYYY-MM-DD". */
  consulted_on: string | null;
  /** What the catalog row says about the authorization it would take. */
  note?: string | null;
  /** Opening hours of the market for this modality, "HH:MM:SS" in the market time zone. */
  open_from?: string | null;
  open_until?: string | null;
}
export interface MarketClass {
  code: string;
  label: string;
  area?: string;
  seats: number;
  luggage?: number;
}
export interface MarketCatalog {
  environment: 'simulation' | 'live';
  market: { code: string; country: string; city: string };
  language: string;
  currency: string;
  timezone: string;
  /** Roles of the caller in this market: "passenger", plus "driver" for an approved driver. */
  roles?: string[];
  gates: { module: boolean; quote: boolean; dispatch: boolean; monetization: boolean };
  /** Largest inspected capacity per vehicle category among approved drivers. */
  vehicles: { category: string; seats: number }[];
  classes: MarketClass[];
  methods: { method: string; origin: string; destination: string }[];
  modalities: MarketModality[];
}
export interface ModalityDoor {
  modality: string;
  flow: string;
}

export type VehicleStandard = 'standard' | 'comfort' | 'premium';
export type Propulsion = 'combustion' | 'hybrid' | 'electric';
/** A class option with the stage 6 keys. They are optional: the list is also read before a route has them. */
export interface ClassFeatureOption extends ClassOption {
  luggage?: number;
  standard?: VehicleStandard;
  electric?: boolean;
  pets?: boolean;
  priority_wait_minutes?: number | null;
  /** Present in the answer of the class menu only. */
  fits?: boolean;
}
/** What the passenger needs to carry. There is no key for assistance animals, on purpose. */
export interface ClassNeeds {
  seats: number;
  luggage: number;
  pets: boolean;
  electric: boolean;
  priority: boolean;
}
export interface ClassMenu {
  options: ClassFeatureOption[];
  /** Code of the class the server suggests when the need does not fit the others. */
  alternative: string | null;
}

export type Assistance = 'boarding' | 'folding_equipment' | 'wheelchair_vehicle';
export interface AccessOption {
  assistance: Assistance;
  available: boolean;
  boarding_minutes: number;
  /** A companion seat can be kept for this assistance in this window. */
  companion: boolean;
}
export interface AccessMenu {
  options: AccessOption[];
  /** Staffed channel published for the area: a phone, an e-mail or a short instruction. */
  channel: string | null;
}

export type AccessEquipment = 'ramp' | 'lift' | 'restraint' | 'companion_seat';
export interface VehicleFeatures {
  luggage: number;
  standard: VehicleStandard;
  propulsion: Propulsion;
  pets: boolean;
  reference: string;
}

/** True when the failure is this database rule, also before the code is listed in lib/errors.ts. */
export const isRideRefusal = (err: unknown, code: string): boolean => {
  const failure = toAppError(err);
  return (failure.code as string) === code || (failure.detail ?? '').trim().startsWith(code);
};

export const rideMarket = {
  catalog: async (origin: string | null, destination: string | null, at: string | null) =>
    unwrap<MarketCatalog>(
      await db().rpc('ride_market_catalog', {
        p_origin: nullable(origin),
        p_destination: nullable(destination),
        p_at: nullable(at),
      }),
    ),
  /** The server door before a flow opens. It needs both areas; `at` is the intended pickup. */
  request: async (modality: string, origin: string, destination: string, at: string | null) =>
    unwrap<ModalityDoor>(
      await db().rpc('ride_request_modality', {
        p_modality: modality,
        p_origin: origin,
        p_destination: destination,
        p_at: nullable(at),
      }),
    ),
  classMenu: async (route: string, departure: string | null, needs: ClassNeeds) =>
    unwrap<ClassMenu>(
      await db().rpc('ride_class_menu', { p_route: route, p_departure: nullable(departure)!, p_needs: { ...needs } }),
    ),
  accessOptions: async (route: string, departure: string | null) =>
    unwrap<AccessMenu>(await db().rpc('ride_access_options', { p_route: route, p_departure: nullable(departure)! })),
  quoteAccessible: async (
    key: string,
    booking: string | null,
    scheduledAt: string | null,
    legs: RideLegInput[],
    assistance: Assistance,
    companion: boolean,
  ) =>
    unwrap<RideQuote>(
      await db().rpc('ride_quote_accessible', {
        p_key: key,
        p_booking: nullable(booking)!,
        p_scheduled_at: nullable(scheduledAt)!,
        p_legs: legs as unknown as Json,
        p_assistance: assistance,
        p_companion: companion,
      }),
    ),
  validateVehicleFeatures: async (driver: string, features: VehicleFeatures) => {
    const { error } = await db().rpc('ride_validate_vehicle_features', {
      p_driver: driver,
      p_luggage: features.luggage,
      p_standard: features.standard,
      p_propulsion: features.propulsion,
      p_pets: features.pets,
      p_reference: features.reference,
    });
    if (error) throw error;
  },
  verifyAccessEquipment: async (
    driver: string,
    kind: AccessEquipment,
    inspected: string,
    trained: string,
    until: string,
  ) => {
    const { error } = await db().rpc('ride_verify_access_equipment', {
      p_driver: driver,
      p_kind: kind,
      p_inspected: inspected,
      p_trained: trained,
      p_until: until,
    });
    if (error) throw error;
  },
};
