import { useState } from 'react';
import { safety, type TrustStatus } from '../../../services/rideSafety';
import { Options, TaskButton } from './common';
import { label, useAction, when } from './state';
import { inputClass } from '../../admin/styles';
export function RideTrust({
  leg,
  data,
  refresh,
  active,
}: {
  leg: string;
  data: TrustStatus;
  refresh: () => void;
  active: boolean;
}) {
  const a = useAction(refresh);
  const [cue, setCue] = useState(data.cue ?? 'text');
  const [assistance, setAssistance] = useState(data.assistance ?? 'none');
  const [share, setShare] = useState(data.sharing ?? false);
  const [stars, setStars] = useState(5);
  const [appeal, setAppeal] = useState('decision_review');
  return (
    <details className="space-y-3">
      <summary>Acessibilidade, avaliação e bloqueio</summary>
      {active && data.role === 'passenger' && (
        <fieldset className="space-y-2">
          <legend>Preferências deste trecho</legend>
          <label className="block">
            Como receber orientação{' '}
            <select className={inputClass} value={cue} onChange={(e) => setCue(e.target.value)}>
              <Options codes={['text', 'visual', 'sound']} />
            </select>
          </label>
          <label className="block">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Mostrar a preferência
            de orientação ao motorista.
          </label>
          <label className="block">
            Assistência ao embarcar{' '}
            <select className={inputClass} value={assistance} onChange={(e) => setAssistance(e.target.value)}>
              <Options codes={['none', 'boarding', 'folding_equipment', 'wheelchair_vehicle']} />
            </select>
          </label>
          <p>Cão-guia não exige cadastro nem adicional. A assistência depende de veículo e motorista habilitados.</p>
          <TaskButton
            disabled={a.busy}
            onClick={() =>
              void a.run('access', async () => {
                const r = await safety.access(leg, cue, assistance, share);
                return r.available
                  ? 'Preferência registrada. Sem adicional.'
                  : 'Preferência registrada. Sem par compatível disponível agora. Consulte outra janela ou o plantão.';
              })
            }
          >
            Salvar preferências
          </TaskButton>
        </fieldset>
      )}
      {data.role === 'driver' && active && (
        <p>
          {data.cue && 'Orientação autorizada: ' + label(data.cue) + '. '}
          {data.assistance && data.assistance !== 'none' && 'Assistência solicitada: ' + label(data.assistance) + '.'}
        </p>
      )}
      {data.can_rate &&
        (data.my_stars ? (
          <p>Sua avaliação: {data.my_stars}/5.</p>
        ) : (
          <div>
            <label>
              Avaliar {data.role === 'driver' ? 'passageiro' : 'motorista'}{' '}
              <select className={inputClass} value={stars} onChange={(e) => setStars(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} de 5
                  </option>
                ))}
              </select>
            </label>
            <TaskButton
              disabled={a.busy}
              onClick={() =>
                void a.run('rate', async () => {
                  await safety.rate(leg, stars);
                })
              }
            >
              Registrar nota definitiva
            </TaskButton>
          </div>
        ))}
      {data.can_block && (
        <TaskButton
          disabled={a.busy}
          onClick={() =>
            void a.run('block', async () => {
              await safety.block(leg, !data.blocked);
            })
          }
        >
          {data.blocked ? 'Permitir novas combinações' : 'Bloquear novas combinações deste par'}
        </TaskButton>
      )}
      {data.restrictions.map((s) => (
        <div key={s.id}>
          <p>
            Restrição: {label(s.reason)} · {label(s.state)} · até {when(s.until)}. Prazo de recurso:{' '}
            {when(s.appeal_until)}.
          </p>
          {s.state === 'available' && (
            <>
              <label>
                Motivo do recurso{' '}
                <select value={appeal} onChange={(e) => setAppeal(e.target.value)}>
                  <Options codes={['decision_review', 'new_evidence', 'incorrect_identity']} />
                </select>
              </label>
              <TaskButton
                disabled={a.busy}
                onClick={() =>
                  void a.run('appeal:' + s.id, async () => {
                    await safety.appeal(s.id, appeal);
                    return 'Recurso encaminhado a outro revisor.';
                  })
                }
              >
                Recorrer da restrição
              </TaskButton>
            </>
          )}
        </div>
      ))}
      {a.message}
    </details>
  );
}
