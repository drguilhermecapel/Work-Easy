import { useState } from 'react';
import { downloadIncident, safety, type SafetyCase } from '../../../services/rideSafety';
import { claimSupportRequest } from '../../../services/rideSupport';
import ErrorAlert from '../../ErrorAlert';
import { inputClass } from '../../admin/styles';
import { Options, TaskButton } from './common';
import { label, useAction, useSafetyPoll, when } from './state';
function AdminCase({ c, refresh }: { c: SafetyCase; refresh: () => void }) {
  const a = useAction(refresh);
  const [proof, setProof] = useState('');
  const [subject, setSubject] = useState('driver');
  const [reason, setReason] = useState('safety');
  const [days, setDays] = useState(1);
  const codes = [
    'acknowledged',
    'escalated',
    ...(c.category === 'lost_item' ? ['request_item_check', 'secure_handoff', 'return_arranged'] : []),
    ...(c.insurance && c.category === 'accident' && c.updates.some((x) => x.code === 'request_claim')
      ? ['insurer_contacted', 'claim_registered']
      : []),
  ];
  return (
    <article className="space-y-2 rounded-lg border p-3">
      <h4>
        {label(c.severity)} · {label(c.category)}
      </h4>
      <p>
        Protocolo {c.protocol}. Retorno até {when(c.due_at)}.
      </p>
      {c.first_response && <p>Primeira resposta {when(c.first_response)}</p>}
      {c.updates.map((u, i) => (
        <p key={i}>
          {when(u.at)} · {label(u.code)} {u.ref}
        </p>
      ))}
      {!c.resolved_at && !c.claimed_by_me && (
        <TaskButton
          disabled={a.busy}
          onClick={() =>
            void a.run('claim', async () => {
              await claimSupportRequest(c.protocol);
            })
          }
        >
          Assumir ocorrência
        </TaskButton>
      )}
      {c.claimed_by_me && !c.resolved_at && (
        <>
          <label className="block">
            Referência do comprovante ou protocolo, quando exigida{' '}
            <input className={inputClass} value={proof} maxLength={80} onChange={(e) => setProof(e.target.value)} />
          </label>
          {codes.map((code) => (
            <TaskButton
              key={code}
              disabled={a.busy}
              onClick={() =>
                void a.run(code, async (key) => {
                  await safety.update(
                    c.protocol,
                    code,
                    ['claim_registered', 'insurer_contacted'].includes(code) ? proof : null,
                    key,
                  );
                })
              }
            >
              {label(code)}
            </TaskButton>
          ))}
          {c.files.map((f) => (
            <TaskButton
              key={f.id}
              onClick={() =>
                void a.run('file:' + f.id, async () => {
                  await downloadIncident(f.id);
                })
              }
            >
              Baixar prova {f.mime}
            </TaskButton>
          ))}
          <details>
            <summary>Registrar restrição fundamentada</summary>
            <label>
              Pessoa{' '}
              <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="driver">Motorista</option>
                <option value="passenger">Passageiro</option>
              </select>
            </label>
            <label>
              Motivo{' '}
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                <Options codes={['identity', 'safety', 'conduct', 'qualification']} />
              </select>
            </label>
            <label>
              Duração em dias{' '}
              <input
                className={inputClass}
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </label>
            <TaskButton
              disabled={a.busy || proof.length < 4}
              onClick={() =>
                void a.run('restrict', async () => {
                  await safety.restrict(c.protocol, subject, reason, proof, days);
                  return 'Restrição registrada com direito a revisão independente.';
                })
              }
            >
              Aplicar decisão revisada
            </TaskButton>
          </details>
        </>
      )}
      {a.message}
    </article>
  );
}
function Desk() {
  const result = useSafetyPoll(() => Promise.all([safety.cases(), safety.appeals()]), 'safety-desk');
  const a = useAction(result.reload);
  const [leg, setLeg] = useState('');
  const [protocol, setProtocol] = useState('');
  const [proof, setProof] = useState('');
  const [pin, setPin] = useState('');
  return (
    <div className="space-y-3">
      <ErrorAlert error={result.error} />
      <details>
        <summary>Recuperação de embarque assistida</summary>
        <p>Verifique a identidade pelo canal homologado e assuma o protocolo do próprio passageiro antes da emissão.</p>
        <label className="block">
          Trecho <input className={inputClass} value={leg} onChange={(e) => setLeg(e.target.value)} />
        </label>
        <label className="block">
          Protocolo <input className={inputClass} value={protocol} onChange={(e) => setProtocol(e.target.value)} />
        </label>
        <label className="block">
          Referência privada da verificação{' '}
          <input className={inputClass} value={proof} onChange={(e) => setProof(e.target.value)} />
        </label>
        <TaskButton
          disabled={a.busy || !leg || !protocol || proof.length < 4}
          onClick={() =>
            void a.run('recover', async () => {
              const r = await safety.recover(leg, protocol, proof);
              setPin(r.pin.split('').join(' ') + ' · até ' + when(r.expires_at));
              return 'Entregue o código apenas à pessoa cuja identidade você confirmou neste protocolo.';
            })
          }
        >
          Emitir PIN de recuperação
        </TaskButton>
        {pin && <p aria-live="polite">{pin}</p>}
      </details>
      <h3>Ocorrências do plantão</h3>
      {result.data?.[0].map((c) => (
        <AdminCase key={c.protocol} c={c} refresh={result.reload} />
      ))}
      <h3>Recursos para revisão independente</h3>
      <label className="block">
        Referência da revisão <input className={inputClass} value={proof} onChange={(e) => setProof(e.target.value)} />
      </label>
      {result.data?.[1].map((r) => (
        <article key={r.id}>
          <p>
            {r.protocol} · {label(r.reason)} · {label(r.appeal_reason)} · prova {r.evidence_ref}
          </p>
          {[true, false].map((lift) => (
            <TaskButton
              key={String(lift)}
              disabled={a.busy || proof.length < 4}
              onClick={() =>
                void a.run(r.id + lift, async () => {
                  await safety.review(r.id, lift, proof);
                })
              }
            >
              {lift ? 'Deferir recurso e retirar restrição' : 'Indeferir recurso fundamentado'}
            </TaskButton>
          ))}
        </article>
      ))}
      {a.message}
    </div>
  );
}
export function RideSafetyAdmin() {
  const [open, setOpen] = useState(false);
  return (
    <section className="mx-auto max-w-3xl p-4">
      <TaskButton onClick={() => setOpen(!open)}>Segurança, sinistros e recursos do plantão</TaskButton>
      {open && <Desk />}
    </section>
  );
}
