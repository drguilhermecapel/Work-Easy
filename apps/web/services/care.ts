import { loadPolicies } from '../catalog';
import { AppError, toAppError } from '../lib/errors';
import { formatTstzRange, parseTstzRange, type Period } from '../lib/tstzrange';
import type { Coordinates } from '../platform/geolocation';
import { db, unwrap, unwrapMaybe } from './client';
import { searchProviders, type ProviderSummary } from './discovery';
import { occupationNames } from './occupationNames';

// Care line (WorkEasy Cuidado): households, care recipients, shifts offered to
// caregivers, check-in/out and the daily report. The database decides who may
// do what (RLS and the functions of 09_care.sql); this file only sends the
// calls and turns the answers into types and sentences in pt-BR.
// No health data enters here: see findHealthTerm.

// ---- Types --------------------------------------------------------------------

export type ShiftStatus = 'open' | 'offered' | 'assigned' | 'checked_in' | 'completed' | 'canceled' | 'no_show';
export type OfferStatus = 'offered' | 'accepted' | 'declined' | 'expired';
export type CheckinKind = 'in' | 'out';

export interface Household {
  id: string;
  name: string;
  neighborhood_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface CareRecipient {
  id: string;
  household_id: string;
  first_name: string;
  birth_year: number | null;
  preferences: string | null;
  emergency_contact: string | null;
}

/** A shift as the family reads it (table `shifts`), with its period parsed. */
export interface Shift {
  id: string;
  household_id: string;
  care_recipient_id: string | null;
  provider_id: string | null;
  period: Period;
  rate_cents: number;
  caregiver_payout_cents: number | null;
  status: ShiftStatus;
  notes: string | null;
  created_at: string;
}

export interface ShiftOffer {
  shift_id: string;
  provider_id: string;
  status: OfferStatus;
  created_at: string;
}

export interface Checkin {
  id: string;
  shift_id: string;
  provider_id: string | null;
  kind: CheckinKind;
  at: string;
  lat: number | null;
  lng: number | null;
}

export interface DailyReport {
  id: string;
  shift_id: string;
  provider_id: string | null;
  meals: string | null;
  activities: string | null;
  mood: string | null;
  notes: string | null;
  created_at: string;
}

/** One row of caregiver_shifts(): all a caregiver learns about a shift (no family rate, no contact). */
export interface CaregiverShift {
  shift_id: string;
  period: Period;
  status: ShiftStatus;
  /** This caregiver's own offer: null when the row is only shown because he is assigned. */
  offer_status: OfferStatus | null;
  caregiver_payout_cents: number | null;
  notes: string | null;
  neighborhood_name: string | null;
  recipient_first_name: string | null;
}

const HOUSEHOLD_COLUMNS = 'id, name, neighborhood_id, notes, created_at';
const RECIPIENT_COLUMNS = 'id, household_id, first_name, birth_year, preferences, emergency_contact';
const SHIFT_COLUMNS =
  'id, household_id, care_recipient_id, provider_id, period, rate_cents, caregiver_payout_cents, status, notes, created_at';
const OFFER_COLUMNS = 'shift_id, provider_id, status, created_at';
const CHECKIN_COLUMNS = 'id, shift_id, provider_id, kind, at, lat, lng';
const REPORT_COLUMNS = 'id, shift_id, provider_id, meals, activities, mood, notes, created_at';

// ---- Limits (same as the table constraints) ------------------------------------

export const LIMITS = {
  householdName: 120,
  householdNotes: 2000,
  firstName: 60,
  preferences: 2000,
  emergencyContact: 300,
  shiftNotes: 2000,
  meals: 2000,
  activities: 2000,
  mood: 500,
  reportNotes: 2000,
  birthYearMin: 1900,
  birthYearMax: 2100,
  /** offer_shift: offers per shift. */
  offersPerShift: 10,
} as const;

// ---- Health data guard ----------------------------------------------------------

// The platform does not keep health data (diagnosis, medication, symptoms,
// exams): no field asks for it and these words stop a text that carries it.
// A heuristic, not a promise to catch everything: the screens say it in words too.
const HEALTH_TERMS: Array<[label: string, pattern: RegExp]> = [
  ['diagnóstico', /\bdiagnostic[oa]s?\b/],
  ['medicamento', /\bmedicamentos?\b/],
  ['medicação', /\bmedicacao\b|\bmedicacoes\b/],
  ['remédio', /\bremedios?\b/],
  ['dose', /\bdoses?\b|\bdosagem\b|\b\d+\s*(mg|mcg|ml|gotas)\b/],
  ['receita médica', /\breceita medica\b/],
  ['insulina', /\binsulina\b/],
  ['doença', /\bdoencas?\b|\benfermidades?\b/],
  ['sintoma', /\bsintomas?\b/],
  ['exame', /\bexames?\b|\blaudos?\b/],
  ['prontuário', /\bprontuario\b/],
  ['CID', /\bcid[- ]?10\b/],
  ['pressão arterial', /\bpressao (arterial|alta|baixa)\b|\bglicemia\b|\bhipertensao\b/],
  ['diabetes', /\bdiabet(es|ico|ica)\b/],
  ['demência', /\bdemencia\b|\balzheimer\b|\bparkinson\b/],
  ['AVC', /\bavc\b|\bderrame\b|\binfarto\b|\bcancer\b|\btumor\b/],
  ['febre', /\bfebre\b|\bvomit(o|os|ou)\b|\btontura\b/],
];

const normalizeText = (text: string): string => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** The first health-data word found in the texts, or null. */
export const findHealthTerm = (...texts: Array<string | null | undefined>): string | null => {
  for (const text of texts) {
    if (!text) continue;
    const normalized = normalizeText(text);
    for (const [label, pattern] of HEALTH_TERMS) if (pattern.test(normalized)) return label;
  }
  return null;
};

export const HEALTH_DATA_NOTICE =
  'O WorkEasy não guarda dados de saúde. Não escreva doenças, diagnósticos, remédios, doses, exames ou sintomas: combine esses cuidados direto com o cuidador, fora do app.';

const assertNoHealthData = (...texts: Array<string | null | undefined>): void => {
  const term = findHealthTerm(...texts);
  if (term) {
    throw new AppError('invalid_input', {
      message: `Há informação de saúde no texto (“${term}”). ${HEALTH_DATA_NOTICE}`,
    });
  }
};

// ---- Errors ---------------------------------------------------------------------

type Overrides = Partial<Record<string, string>>;

const SHARED_MESSAGES: Overrides = {
  checkin_window:
    'Fora do horário de registro. A entrada vale de 2 horas antes a 2 horas depois do início do plantão, e a saída de 2 horas antes a 2 horas depois do fim.',
  offer_limit: `Limite de ofertas atingido: no máximo ${LIMITS.offersPerShift} cuidadores por plantão e 30 ofertas novas por dia.`,
};

/** The rule the database raised (it puts the code in the message), or null. */
export const careCode = (err: unknown): string | null => toAppError(err).detail?.trim().match(/^[a-z_]+/)?.[0] ?? null;

/**
 * The same error with the sentence of the care line when the database raised a
 * rule lib/errors.ts does not know (checkin_window, offer_limit) or one that
 * means something specific in this operation (`overrides`, by raw code).
 */
export const careError = (err: unknown, overrides: Overrides = {}): AppError => {
  const error = toAppError(err);
  const code = careCode(error);
  const message = code ? (overrides[code] ?? SHARED_MESSAGES[code]) : undefined;
  return message ? new AppError(error.code, { cause: error.cause, detail: error.detail, message }) : error;
};

const guard = async <T>(run: () => Promise<T>, overrides?: Overrides): Promise<T> => {
  try {
    return await run();
  } catch (err) {
    throw careError(err, overrides);
  }
};

// ---- Small helpers --------------------------------------------------------------

const clean = (value: string | null | undefined): string | null => value?.trim() || null;

const tooLong = (value: string | null, max: number, what: string): void => {
  if (value && value.length > max) throw new AppError('invalid_input', { message: `${what}: no máximo ${max} caracteres.` });
};

const list = <T>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : []);

const toShift = (row: Record<string, unknown>): Shift | null => {
  const period = parseTstzRange(row.period as string | null);
  return period ? ({ ...row, period } as unknown as Shift) : null;
};

const byStart = <T extends { period: Period }>(a: T, b: T): number => a.period.start.getTime() - b.period.start.getTime();

// ---- Households -----------------------------------------------------------------

export interface HouseholdInput {
  name: string;
  neighborhoodId: string | null;
  notes: string | null;
}

const householdRow = (input: HouseholdInput) => {
  const name = input.name.trim();
  if (!name) throw new AppError('invalid_input', { message: 'Dê um nome para a casa, por exemplo “Casa da vó”.' });
  const notes = clean(input.notes);
  tooLong(name, LIMITS.householdName, 'Nome da casa');
  tooLong(notes, LIMITS.householdNotes, 'Observações');
  assertNoHealthData(name, notes);
  return { name, neighborhood_id: input.neighborhoodId || null, notes };
};

export const listHouseholds = (): Promise<Household[]> =>
  guard(async () =>
    unwrap<Household[]>(await db().from('households').select(HOUSEHOLD_COLUMNS).order('created_at', { ascending: true })),
  );

export const createHousehold = (ownerId: string, input: HouseholdInput): Promise<Household> =>
  guard(async () =>
    unwrap<Household>(
      await db()
        .from('households')
        .insert({ owner_id: ownerId, ...householdRow(input) })
        .select(HOUSEHOLD_COLUMNS)
        .single(),
    ),
  );

export const updateHousehold = (id: string, input: HouseholdInput): Promise<Household> =>
  guard(async () =>
    unwrap<Household>(await db().from('households').update(householdRow(input)).eq('id', id).select(HOUSEHOLD_COLUMNS).single()),
  );

/** Deletes the household together with its care recipients, shifts, check-ins and reports (on delete cascade). */
export const deleteHousehold = (id: string): Promise<void> =>
  guard(async () => {
    unwrapMaybe<unknown>(await db().from('households').delete().eq('id', id));
  });

// ---- Care recipients ------------------------------------------------------------

export interface RecipientInput {
  firstName: string;
  /** Typed text; empty = not informed. */
  birthYear: string;
  preferences: string | null;
  emergencyContact: string | null;
}

const recipientRow = (input: RecipientInput) => {
  const firstName = input.firstName.trim();
  if (!firstName) throw new AppError('invalid_input', { message: 'Informe o primeiro nome da pessoa cuidada.' });
  if (/\s/.test(firstName)) throw new AppError('invalid_input', { message: 'Informe só o primeiro nome. O sobrenome não é guardado.' });
  tooLong(firstName, LIMITS.firstName, 'Primeiro nome');
  const yearText = input.birthYear.trim();
  let birthYear: number | null = null;
  if (yearText) {
    birthYear = Number(yearText);
    if (!/^\d{4}$/.test(yearText) || birthYear < LIMITS.birthYearMin || birthYear > LIMITS.birthYearMax) {
      throw new AppError('invalid_input', { message: `Informe o ano de nascimento com 4 dígitos, entre ${LIMITS.birthYearMin} e ${LIMITS.birthYearMax}.` });
    }
  }
  const preferences = clean(input.preferences);
  const emergencyContact = clean(input.emergencyContact);
  tooLong(preferences, LIMITS.preferences, 'Preferências');
  tooLong(emergencyContact, LIMITS.emergencyContact, 'Contato de emergência');
  assertNoHealthData(preferences, emergencyContact);
  return { first_name: firstName, birth_year: birthYear, preferences, emergency_contact: emergencyContact };
};

export const listRecipients = (householdIds: string[]): Promise<CareRecipient[]> =>
  guard(async () => {
    if (householdIds.length === 0) return [];
    return unwrap<CareRecipient[]>(
      await db().from('care_recipients').select(RECIPIENT_COLUMNS).in('household_id', householdIds).order('created_at', { ascending: true }),
    );
  });

export const createRecipient = (householdId: string, input: RecipientInput): Promise<CareRecipient> =>
  guard(async () =>
    unwrap<CareRecipient>(
      await db()
        .from('care_recipients')
        .insert({ household_id: householdId, ...recipientRow(input) })
        .select(RECIPIENT_COLUMNS)
        .single(),
    ),
  );

export const updateRecipient = (id: string, input: RecipientInput): Promise<CareRecipient> =>
  guard(async () =>
    unwrap<CareRecipient>(await db().from('care_recipients').update(recipientRow(input)).eq('id', id).select(RECIPIENT_COLUMNS).single()),
  );

/** The shifts of this person stay, without a recipient (foreign key `on delete set null`). */
export const deleteRecipient = (id: string): Promise<void> =>
  guard(async () => {
    unwrapMaybe<unknown>(await db().from('care_recipients').delete().eq('id', id));
  });

// ---- Shifts (family) ------------------------------------------------------------

export interface ShiftInput {
  householdId: string;
  careRecipientId: string | null;
  period: Period;
  /** Agreed value of the shift; the caregiver sees the same value. */
  valueCents: number;
  notes: string | null;
  /** Instant used to refuse a shift that already started; tests pass a fixed one. */
  now?: Date;
}

export const MAX_SHIFT_CENTS = 100_000_00;

export const createShift = (input: ShiftInput): Promise<Shift> =>
  guard(async () => {
    const { start, end } = input.period;
    if (!(end.getTime() > start.getTime())) throw new AppError('invalid_input', { message: 'O fim do plantão precisa ser depois do início.' });
    if (start.getTime() <= (input.now ?? new Date()).getTime()) {
      throw new AppError('invalid_input', { message: 'O plantão precisa começar no futuro.' });
    }
    if (end.getTime() - start.getTime() > 24 * 3_600_000) {
      throw new AppError('invalid_input', { message: 'Um plantão tem no máximo 24 horas.' });
    }
    if (!Number.isSafeInteger(input.valueCents) || input.valueCents <= 0 || input.valueCents > MAX_SHIFT_CENTS) {
      throw new AppError('invalid_input', { message: 'Informe o valor do plantão em reais, por exemplo 280,00.' });
    }
    const notes = clean(input.notes);
    tooLong(notes, LIMITS.shiftNotes, 'Observações');
    assertNoHealthData(notes);
    const row = unwrap<Record<string, unknown>>(
      await db()
        .from('shifts')
        .insert({
          household_id: input.householdId,
          care_recipient_id: input.careRecipientId || null,
          period: formatTstzRange(input.period),
          rate_cents: input.valueCents,
          // No commission is applied to shifts: the caregiver sees the agreed value
          caregiver_payout_cents: input.valueCents,
          notes,
        })
        .select(SHIFT_COLUMNS)
        .single(),
    );
    const shift = toShift(row);
    if (!shift) throw new AppError('server_error');
    return shift;
  });

/** The shifts of these households, soonest first. */
export const listShifts = (householdIds: string[]): Promise<Shift[]> =>
  guard(async () => {
    if (householdIds.length === 0) return [];
    const rows = unwrap<Array<Record<string, unknown>>>(
      await db().from('shifts').select(SHIFT_COLUMNS).in('household_id', householdIds).order('created_at', { ascending: false }),
    );
    return rows.flatMap(row => toShift(row) ?? []).sort(byStart);
  });

/**
 * One shift, or null when it does not exist, is not the family's, or the address carries something that is not a
 * shift identifier (the database refuses the format with 22P02, which is the same answer for the family: not found).
 */
export const getShift = (id: string): Promise<Shift | null> =>
  guard(async () => {
    try {
      const row = unwrapMaybe<Record<string, unknown>>(await db().from('shifts').select(SHIFT_COLUMNS).eq('id', id).maybeSingle());
      return row ? toShift(row) : null;
    } catch (err) {
      if (toAppError(err).code === 'invalid_input') return null;
      throw err;
    }
  });

export const listOffers = (shiftIds: string[]): Promise<ShiftOffer[]> =>
  guard(async () => {
    if (shiftIds.length === 0) return [];
    return unwrap<ShiftOffer[]>(await db().from('shift_offers').select(OFFER_COLUMNS).in('shift_id', shiftIds));
  });

export const listCheckins = (shiftIds: string[]): Promise<Checkin[]> =>
  guard(async () => {
    if (shiftIds.length === 0) return [];
    const rows = unwrap<Array<Checkin & { lat: number | string | null; lng: number | string | null }>>(
      await db().from('checkins').select(CHECKIN_COLUMNS).in('shift_id', shiftIds).order('at', { ascending: true }),
    );
    return rows.map(toCheckin);
  });

export const listReports = (shiftIds: string[]): Promise<DailyReport[]> =>
  guard(async () => {
    if (shiftIds.length === 0) return [];
    return unwrap<DailyReport[]>(await db().from('daily_reports').select(REPORT_COLUMNS).in('shift_id', shiftIds));
  });

// PostgREST may send numeric columns as strings
const toCheckin = (row: Checkin & { lat: number | string | null; lng: number | string | null }): Checkin => ({
  ...row,
  lat: row.lat === null ? null : Number(row.lat),
  lng: row.lng === null ? null : Number(row.lng),
});

/**
 * Names of the caregivers assigned to the family's shifts, when the database lets this family read them. The name
 * is the one the caregiver shows to clients (providers.display_name, as in the search); the account name is only
 * the fallback for a caregiver without one.
 */
export const listCaregiverNames = async (providerIds: string[]): Promise<Map<string, string>> => {
  const names = new Map<string, string>();
  const ids = [...new Set(providerIds)];
  if (ids.length === 0) return names;
  try {
    const { data } = await db().from('providers').select('id, display_name').in('id', ids);
    for (const row of list<{ id: string; display_name: string | null }>(data)) if (row.display_name?.trim()) names.set(row.id, row.display_name.trim());
  } catch {
    // Falls back to the account name below
  }
  const missing = ids.filter(id => !names.has(id));
  if (missing.length > 0) {
    try {
      const { data } = await db().from('profiles').select('id, full_name').in('id', missing);
      for (const row of list<{ id: string; full_name: string | null }>(data)) if (row.full_name) names.set(row.id, row.full_name);
    } catch {
      // Without names the screen says "cuidador designado"
    }
  }
  return names;
};

const CANCEL_FAMILY: Overrides = {
  invalid_transition: 'Este plantão não pode mais ser cancelado: ele já começou, foi concluído ou já estava cancelado. Atualize a página.',
  not_allowed: 'Só quem criou o plantão pode cancelá-lo.',
};

/** Family cancels: returns the new status ('canceled'). */
export const cancelShift = (shiftId: string, reason?: string | null): Promise<ShiftStatus> =>
  guard(async () => {
    const text = clean(reason);
    tooLong(text, 500, 'Motivo');
    assertNoHealthData(text);
    const status = unwrap<ShiftStatus>(await db().rpc('cancel_shift', { p_shift: shiftId, ...(text ? { p_reason: text } : {}) }));
    return status;
  }, CANCEL_FAMILY);

// ---- Offering a shift (family) -----------------------------------------------------

export interface CareOccupation {
  slug: string;
  name: string;
}

/** Occupations priced by shift ('plantao'): the ones a shift can be offered to. The database is the source; the static catalog is the fallback. */
export const listCareOccupations = async (): Promise<CareOccupation[]> => {
  let slugs: string[] = [];
  try {
    const { data } = await db().from('occupation_policies').select('occupation_slug, price_units');
    slugs = list<{ occupation_slug: string; price_units: string[] | null }>(data)
      .filter(row => row.price_units?.includes('plantao'))
      .map(row => row.occupation_slug);
  } catch {
    // The static catalog below answers
  }
  if (slugs.length === 0) {
    const policies = await loadPolicies();
    slugs = Object.entries(policies)
      .filter(([, policy]) => policy.priceUnits.includes('plantao'))
      .map(([slug]) => slug);
  }
  // An occupation that exists only in the database has no entry in the static catalog: its name is read from the table
  const names = await occupationNames(slugs);
  return slugs.map(slug => ({ slug, name: names.get(slug) ?? slug })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
};

/** Approved caregivers of an occupation (public search), optionally by neighborhood. */
export const searchCaregivers = (occupation: string, neighborhoodId: string | null): Promise<ProviderSummary[]> =>
  guard(() => searchProviders({ occupation, neighborhoodId, limit: 30 }));

const OFFER_OVERRIDES: Overrides = {
  not_allowed:
    'Este plantão não pode ser oferecido a algum dos cuidadores escolhidos: só recebem ofertas cuidadores com cadastro aprovado em uma ocupação de cuidado. Atualize a busca e tente de novo.',
  invalid_transition: 'Este plantão não aceita mais ofertas: ele já tem cuidador, começou ou foi cancelado. Atualize a página.',
};

/** Offers the shift to these caregivers; returns how many offers are open afterwards. */
export const offerShift = (shiftId: string, providerIds: string[]): Promise<number> =>
  guard(async () => {
    const ids = [...new Set(providerIds)];
    if (ids.length === 0) throw new AppError('invalid_input', { message: 'Escolha ao menos um cuidador.' });
    if (ids.length > LIMITS.offersPerShift) {
      throw new AppError('invalid_input', { message: `Escolha no máximo ${LIMITS.offersPerShift} cuidadores por plantão.` });
    }
    const count = unwrap<number>(await db().rpc('offer_shift', { p_shift: shiftId, p_providers: ids }));
    return Number(count);
  }, OFFER_OVERRIDES);

// ---- Caregiver ---------------------------------------------------------------------

/** Offered and assigned shifts of the signed-in caregiver, soonest first. */
export const listCaregiverShifts = (): Promise<CaregiverShift[]> =>
  guard(async () => {
    const data = unwrapMaybe<unknown>(await db().rpc('caregiver_shifts'));
    return list<Record<string, unknown>>(data)
      .flatMap(row => {
        const period = parseTstzRange(row.period as string | null);
        return period ? [{ ...row, period } as unknown as CaregiverShift] : [];
      })
      .sort(byStart);
  });

/** The caregiver's own offers (the only part of shift_offers he reads). */
export const listMyOffers = (providerId: string): Promise<ShiftOffer[]> =>
  guard(async () => unwrap<ShiftOffer[]>(await db().from('shift_offers').select(OFFER_COLUMNS).eq('provider_id', providerId)));

export const listMyCheckins = (providerId: string): Promise<Checkin[]> =>
  guard(async () =>
    unwrap<Array<Checkin & { lat: number | string | null; lng: number | string | null }>>(
      await db().from('checkins').select(CHECKIN_COLUMNS).eq('provider_id', providerId).order('at', { ascending: true }),
    ).map(toCheckin),
  );

export const listMyReports = (providerId: string): Promise<DailyReport[]> =>
  guard(async () => unwrap<DailyReport[]>(await db().from('daily_reports').select(REPORT_COLUMNS).eq('provider_id', providerId)));

export const TOO_LATE_MESSAGE =
  'Este plantão não está mais disponível para você: outro cuidador aceitou primeiro, a família cancelou ou a oferta venceu.';

const ACCEPT_OVERRIDES: Overrides = {
  not_allowed: TOO_LATE_MESSAGE,
  invalid_transition: TOO_LATE_MESSAGE,
  slot_unavailable: 'Você já tem outro plantão neste horário.',
};

/** First caregiver to accept takes the shift. labor_lock comes through as an AppError of that code. */
export const acceptShiftOffer = (shiftId: string): Promise<ShiftStatus> =>
  guard(async () => unwrap<ShiftStatus>(await db().rpc('accept_shift_offer', { p_shift: shiftId })), ACCEPT_OVERRIDES);

const CHECKIN_OVERRIDES: Overrides = {
  not_allowed: 'Só o cuidador designado para este plantão registra entrada e saída.',
  invalid_transition: 'Este registro não é possível agora. A entrada vem antes da saída, e cada uma é registrada uma vez.',
};

/** Check-in ('in') or check-out ('out'); coordinates are optional (refused location still registers). Returns the check-in id. */
export const checkIn = (input: { shiftId: string; kind: CheckinKind; coords?: Coordinates | null }): Promise<string> =>
  guard(async () => {
    const { shiftId, kind, coords } = input;
    return unwrap<string>(
      await db().rpc('check_in', {
        p_shift: shiftId,
        p_kind: kind,
        ...(coords ? { p_lat: coords.lat, p_lng: coords.lng } : {}),
      }),
    );
  }, CHECKIN_OVERRIDES);

export interface ReportInput {
  shiftId: string;
  meals: string;
  activities: string;
  mood: string;
  notes: string;
}

const REPORT_OVERRIDES: Overrides = {
  not_allowed: 'O relatório só pode ser enviado pelo cuidador designado, depois do registro de entrada.',
};

/** Non-clinical daily report; sending again replaces the previous one. Returns the report id. */
export const submitDailyReport = (input: ReportInput): Promise<string> =>
  guard(async () => {
    const meals = clean(input.meals);
    const activities = clean(input.activities);
    const mood = clean(input.mood);
    const notes = clean(input.notes);
    if (!meals && !activities && !mood && !notes) throw new AppError('invalid_input', { message: 'Preencha ao menos um campo do relatório.' });
    tooLong(meals, LIMITS.meals, 'Refeições');
    tooLong(activities, LIMITS.activities, 'Atividades');
    tooLong(mood, LIMITS.mood, 'Humor');
    tooLong(notes, LIMITS.reportNotes, 'Observações');
    assertNoHealthData(meals, activities, mood, notes);
    return unwrap<string>(
      await db().rpc('submit_daily_report', { p_shift: input.shiftId, p_meals: meals, p_activities: activities, p_mood: mood, p_notes: notes }),
    );
  }, REPORT_OVERRIDES);

const CANCEL_CAREGIVER: Overrides = {
  invalid_transition: 'O plantão só pode ser cancelado antes de começar. Depois do registro de entrada, fale com a família.',
  not_allowed: 'Só o cuidador designado cancela o próprio plantão.',
};

/** Caregiver gives the shift up: it opens again and is offered to the others already invited. Returns the new status. */
export const cancelMyShift = (shiftId: string, reason?: string | null): Promise<ShiftStatus> =>
  guard(async () => {
    const text = clean(reason);
    tooLong(text, 500, 'Motivo');
    assertNoHealthData(text);
    return unwrap<ShiftStatus>(await db().rpc('cancel_shift', { p_shift: shiftId, ...(text ? { p_reason: text } : {}) }));
  }, CANCEL_CAREGIVER);

// ---- Check-in window (mirrors check_in) --------------------------------------------

/** The database accepts a check-in or check-out within 2 hours of the start or the end of the shift. */
export const CHECKIN_WINDOW_MS = 2 * 3_600_000;

export interface CheckinWindow {
  opensAt: Date;
  closesAt: Date;
  /** 'early' and 'late' are outside the window; the database has the last word. */
  state: 'early' | 'open' | 'late';
}

export const checkinWindow = (period: Period, kind: CheckinKind, now: Date = new Date()): CheckinWindow => {
  const anchor = (kind === 'in' ? period.start : period.end).getTime();
  const opensAt = new Date(anchor - CHECKIN_WINDOW_MS);
  const closesAt = new Date(anchor + CHECKIN_WINDOW_MS);
  const t = now.getTime();
  return { opensAt, closesAt, state: t < opensAt.getTime() ? 'early' : t > closesAt.getTime() ? 'late' : 'open' };
};
