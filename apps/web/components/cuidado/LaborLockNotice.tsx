import React from 'react';
import { Scale } from 'lucide-react';

interface Props {
  /** Days per week allowed with the same caregiver for the same family (platform_settings). */
  limit: number;
  audience: 'familia' | 'cuidador';
  /** Shown as an answer to a refused action (alert) instead of a standing explanation (note). */
  refused?: boolean;
}

/**
 * The labor lock, explained. The database refuses a third day in the same ISO week for the same caregiver and
 * family (error labor_lock). The text says why and what the person can do in the app. It does not guide to hiring
 * the caregiver outside the platform.
 */
const LaborLockNotice: React.FC<Props> = ({ limit, audience, refused = false }) => {
  const id = `trava-${audience}${refused ? '-recusa' : ''}`;
  return (
    <section role={refused ? 'alert' : 'note'} aria-labelledby={id} className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-gray-700 space-y-2">
      <h2 id={id} className="flex items-center gap-2 font-semibold text-gray-800">
        <Scale size={16} className="text-amber-700 shrink-0" aria-hidden="true" />
        {refused
          ? `Limite de ${limit} dias por semana com o mesmo cuidador`
          : `Por que o limite de ${limit} dias por semana com o mesmo cuidador`}
      </h2>
      {refused ? (
        <p>
          {audience === 'familia'
            ? `Este cuidador já atingiu o limite de ${limit} dias por semana para esta família. Você pode escolher outro cuidador ou falar com a equipe do WorkEasy.`
            : `Você já atingiu o limite de ${limit} dias por semana para esta família. Escolha outro plantão ou fale com a equipe do WorkEasy.`}
        </p>
      ) : (
        <>
          <p>
            A lei pode tratar o trabalho doméstico em mais de {limit} dias por semana para esta família como relação de emprego (LC 150/2015).
            Por isso o WorkEasy não confirma o mesmo cuidador em mais de {limit} dias diferentes na mesma semana para esta família. Plantões
            cancelados não contam.
          </p>
          <p>
            <strong>O que fazer:</strong>{' '}
            {audience === 'familia'
              ? 'ofereça o plantão a outro cuidador ou escolha outra semana.'
              : 'escolha outro plantão, em outra semana. Se tiver dúvida, fale com a equipe do WorkEasy.'}
          </p>
        </>
      )}
    </section>
  );
};

export default LaborLockNotice;
