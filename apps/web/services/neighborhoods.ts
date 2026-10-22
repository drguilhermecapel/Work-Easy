import { DEFAULT_CITY } from '../config/neighborhoods';
import { db, unwrap } from './client';
import type { NeighborhoodRow } from './types';

/** Neighborhoods of a city, by name (public read). */
export const listNeighborhoods = async (city: string = DEFAULT_CITY): Promise<NeighborhoodRow[]> =>
  unwrap<NeighborhoodRow[]>(
    await db().from('neighborhoods').select('id, city, name, slug, zone').eq('city', city).order('name', { ascending: true }),
  );
