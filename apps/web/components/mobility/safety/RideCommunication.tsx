import { features } from '../../../config/features';
import { useState } from 'react';
import { useHref } from 'react-router-dom';
import { safety, type Communication } from '../../../services/rideSafety';
import { TaskButton } from './common';
import { useAction, when } from './state';
import { inputClass } from '../../admin/styles';

export function BoardingPin({ leg, driver, refresh }: { leg: string; driver: boolean; refresh: () => void }) {
  const [pin, setPin] = useState('');
  const [until, setUntil] = useState('');
  const a = useAction(refresh);
  return (
    <div className="space-y-2">
      <h4 className="font-semibold">Confirmação de embarque</h4>
      {driver ? (
        <>
          <label className="block">
            PIN informado pelo passageiro{' '}
            <input
              className={inputClass}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <TaskButton
            disabled={a.busy || pin.length !== 6}
            onClick={() =>
              void a.run('board:' + pin, async (key) => {
                const result = await safety.board(leg, pin, key);
                if (!result.ok)
                  return result.reason === 'locked'
                    ? 'Limite atingido. Aguarde o prazo de recuperação.'
                    : 'PIN inválido, utilizado ou fora da validade. Confira com o passageiro.';
                setPin('');
                return 'Embarque confirmado.';
              })
            }
          >
            Confirmar embarque com PIN
          </TaskButton>
        </>
      ) : (
        <>
          <TaskButton
            disabled={a.busy}
            onClick={() =>
              void a.run('pin', async () => {
                const next = await safety.pin(leg);
                setPin(next.pin);
                setUntil(next.expires_at);
                return 'PIN gerado.';
              })
            }
          >
            Gerar PIN para este embarque
          </TaskButton>
          {pin && (
            <p aria-live="polite">
              PIN <strong>{pin.split('').join(' ')}</strong> · válido até {when(until)}. Informe apenas ao motorista
              atribuído, no embarque.
            </p>
          )}
          <p>Se precisar recuperar o PIN, abra um protocolo de ajuda neste trecho e procure o plantão.</p>
        </>
      )}
      {a.message}
    </div>
  );
}
export function RideCommunication({ leg, data, refresh }: { leg: string; data: Communication; refresh: () => void }) {
  const a = useAction(refresh);
  const [email, setEmail] = useState('');
  const [minutes, setMinutes] = useState(15);
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const href = useHref('/corridas/convite');
  return (
    <details className="space-y-2">
      <summary>Conversa e compartilhamento</summary>
      <div className="space-y-2">
        <h4>Conversar com a outra pessoa do trecho</h4>
        <ul aria-live="polite">
          {data.messages.map((m) => (
            <li key={m.id}>
              {m.mine ? 'Você' : 'Outra pessoa'} · {when(m.at)} · {m.text}
            </li>
          ))}
        </ul>
        <label className="block">
          Mensagem <input className={inputClass} maxLength={400} value={msg} onChange={(e) => setMsg(e.target.value)} />
        </label>
        <TaskButton
          disabled={a.busy || !msg.trim()}
          onClick={() =>
            void a.run('message:' + msg, async (key) => {
              await safety.send(leg, msg, key);
              setMsg('');
              return 'Mensagem registrada no trecho.';
            })
          }
        >
          Enviar no chat
        </TaskButton>
        <h4>Compartilhar com uma pessoa de confiança</h4>
        <p>
          O convite exige acesso à conta com o e-mail escolhido. Ele mostra o estado, a previsão disponível e a posição
          aproximada durante a viagem.
        </p>
        <label className="block">
          E-mail do convidado{' '}
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Duração{' '}
          <select className={inputClass} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[5, 15, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} minutos
              </option>
            ))}
          </select>
        </label>
        <TaskButton
          disabled={a.busy || !email.includes('@')}
          onClick={() =>
            void a.run('invite', async () => {
              const site = features.siteUrl;
              if (import.meta.env.VITE_ROUTER === 'hash' && !site)
                return 'O domínio de convites ainda não foi configurado para este aplicativo.';
              const page = site
                ? new URL('corridas/convite', site + '/').href
                : new URL(href, window.location.href).href;
              const x = await safety.invite(leg, email, minutes);
              setLink(page + '#convite=' + x.token);
              return 'Envie o convite pelo seu canal de confiança.';
            })
          }
        >
          Gerar convite
        </TaskButton>
        {link && (
          <label className="block">
            Link para copiar <input readOnly className={inputClass} value={link} onFocus={(e) => e.target.select()} />
          </label>
        )}
        {data.shares.map((s) => (
          <p key={s.id}>
            Convite até {when(s.expires_at)}{' '}
            <TaskButton
              disabled={a.busy}
              onClick={() =>
                void a.run('revoke:' + s.id, async () => {
                  await safety.revoke(s.id);
                  setLink('');
                  return 'Convite revogado.';
                })
              }
            >
              Revogar convite
            </TaskButton>
          </p>
        ))}
        {a.message}
      </div>
    </details>
  );
}
