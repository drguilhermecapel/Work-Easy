import type { useAction } from '../../components/mobility/safety/state';

// Helpers shared by the console of ride accounts (O17 stage 5) and its lazy panels.

export type Action = ReturnType<typeof useAction>;

const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** "2026-10" or "2026-10-01" → "outubro de 2026". */
export const monthName = (month: string) => MONTH.format(new Date(month.slice(0, 7) + '-01T00:00:00Z'));

/** A reference code as the database takes it for evidence of a review: no spaces, no free text. */
export const EVIDENCE = /^[A-Za-z0-9_-]{4,80}$/;
export const evidenceProblem = (value: string) =>
  value && !EVIDENCE.test(value) ? 'Use de 4 a 80 letras, números, hífen ou sublinhado, sem espaços.' : null;

/** Runs a decision and tells the question whether it may close. */
export async function attempt(action: Action, intent: string, work: (key: string) => Promise<string>): Promise<boolean> {
  let done = false;
  await action.run(intent, async (key) => {
    const notice = await work(key);
    done = true;
    return notice;
  });
  return done;
}
