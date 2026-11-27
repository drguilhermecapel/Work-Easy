import { db, unwrap } from './client';

export interface DriverDiary {
  paid_meters: number;
  empty_meters: number;
  cost_cents: number;
}

export interface DriverBookEntry {
  operation_id: string;
  leg_id: string;
  kind: string;
  at_time: string;
  gross: number | null;
  income: number;
  reward: number;
  paid: number;
  fee: number;
  extras: number;
  toll_cents: number | null;
  status: string;
  protocol: string | null;
}

export interface DriverStatement {
  from_day: string;
  until_day: string;
  simulation: boolean;
  metrics: {
    income: number; rewards: number; paid: number; reimbursements: number; opening: number; closing: number;
    online_seconds: number; committed_seconds: number; approach_seconds: number; wait_seconds: number;
    passenger_seconds: number; service_seconds: number;
    time_incomplete: boolean; missing_days: number; paid_meters: number; empty_meters: number;
    costs: number; base_net: number; total_net: number;
    per_online_hour: number | null; per_committed_hour: number | null; per_km: number | null;
  };
  entries: DriverBookEntry[];
  diary: DriverDiary | null;
  trends: {
    as_of: string;
    cells: {zone: string; hour_block: number; demand: number; completed: number; typical_cents: number}[];
  };
}

export async function driverStatement(day: string, week: boolean) {
  return unwrap<DriverStatement>(await db().rpc('ride_driver_statement', { p_day: day, p_week: week }));
}

export async function recordDriverDiary(day: string, entry: DriverDiary) {
  return unwrap<boolean>(await db().rpc('ride_driver_diary', {
    p_day: day, p_paid_meters: entry.paid_meters, p_empty_meters: entry.empty_meters, p_cost_cents: entry.cost_cents,
  }));
}
