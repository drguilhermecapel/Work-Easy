import { todayInSaoPaulo, validityEnd } from '../../lib/timezone';

// Plain helpers of the registry panels of the operation (DD125).

export { centsToInput, parseReaisToCents } from '../../services/proFormat';
export const row = 'space-y-2 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0';
export const LIVE_RULE =
  'No ambiente real, ligar exige a referência da evidência conferida (não de ensaio) e uma validade de no máximo 24 meses.';

/** "até 31/12/2027" or, for an open-ended rehearsal row, "sem prazo (ensaio)". */
export const untilText = (until: string | null) =>
  until ? 'válido até ' + new Date(until).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'sem prazo (ensaio)';
/** The São Paulo day of a stored validity end (exclusive midnight → the last valid day). */
export const untilDay = (until: string | null) => {
  if (!until) return '';
  const last = new Date(Date.parse(until) - 1);
  return todayInSaoPaulo(last);
};
/** The date field as the instant the server stores: the end of that São Paulo day. */
export const untilInstant = (day: string) => (day ? (validityEnd(day)?.toISOString() ?? null) : null);

