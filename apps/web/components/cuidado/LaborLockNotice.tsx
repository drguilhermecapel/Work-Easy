import React from 'react';
import { Scale } from 'lucide-react';

interface Props {
  /** Days per week allowed with the same caregiver in the same household (platform_settings). */
  limit: number;
  audience: 'familia' | 'cuidador';
  /** Shown as an answer to a refused action (alert) instead of a standing explanation (note). */
  refused?: boolean;
}

/**
 * The labor lock, explained. The database refuses a third day in the same ISO
 * week for the same caregiver and household (error labor_lock); this text says
 * why and what to do, including direct hiring outside the platform.
 */
const LaborLockNotice: React.FC<Props> = ({ limit, audience, refused = false }) => (
  <section
    role={refused ? 'alert' : 'note'}
    aria-labelledby={`trava-${audience}${refused ? '-recusa' : ''}`}
    className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-gray-700 space-y-2"
  >
    <h2 id={`trava-${audience}${refused ? '-recusa' : ''}`} className="flex items-center gap-2 font-semibold text-gray-800">
      <Scale size={16} className="text-amber-700 shrink-0" aria-hidden="true" />
      {refused
        ? `Limite de ${limit} dias por semana com o mesmo cuidador`
        : `Por que o limite de ${limit} dias por semana com o mesmo cuidador`}
    </h2>
    <p>
      {refused && audience === 'cuidador' && (
        <>Este plantão passaria de {limit} dias diferentes na mesma semana (de segunda a domingo) nesta casa, então não foi confirmado. </>
      )}
      {refused && audience === 'familia' && (
        <>Este plantão passaria de {limit} dias diferentes na mesma semana (de segunda a domingo) com o mesmo cuidador nesta casa. </>
      )}
      A lei pode tratar o trabalho doméstico em mais de {limit} dias por semana na mesma casa como relação de emprego (LC 150/2015). Por isso o
      WorkEasy não confirma o mesmo cuidador em mais de {limit} dias diferentes na mesma semana para a mesma casa. Plantões cancelados não
      contam.
    </p>
    {audience === 'familia' ? (
      <p>
        <strong>O que fazer:</strong> ofereça o plantão a outro cuidador, escolha outra semana ou, se a família quer o mesmo cuidador mais
        dias, contrate diretamente. A contratação direta é feita fora do WorkEasy, com a família como empregadora doméstica: a plataforma
        não registra o vínculo nem calcula encargos. Procure um contador ou advogado trabalhista para orientação.
      </p>
    ) : (
      <p>
        <strong>O que fazer:</strong> escolha outro plantão, em outra semana ou em outra casa. Se você e a família querem trabalhar mais dias
        juntos, a família pode contratar você diretamente, fora do WorkEasy, como empregadora doméstica.
      </p>
    )}
  </section>
);

export default LaborLockNotice;
