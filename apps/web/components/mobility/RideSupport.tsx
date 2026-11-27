import { useEffect, useRef, useState } from 'react';
import { useAsync } from '../../lib/useAsync';
import { openRideHelp } from '../../services/rideAftercare';
import {
  claimSupportRequest,
  getSupportContact,
  helpReasons,
  listSupportQueue,
  resolveSupportRequest,
  supportOutcomes,
  type HelpReason,
  type RideSupportContact,
  type SupportOutcome,
  type SupportQueueItem,
} from '../../services/rideSupport';
import ErrorAlert from '../ErrorAlert';
import { formatDateTime } from '../admin/format';
import { inputClass, linkClass, secondaryButton } from '../admin/styles';

function reasonLabel(reason: string | null) {
  return reason && Object.hasOwn(helpReasons, reason) ? helpReasons[reason as HelpReason] : 'Revisão pela equipe';
}

function Contact({ contact }: { contact: RideSupportContact }) {
  const { address, channel, environment, team, from, until, on_duty: onDuty } = contact;
  if (environment === 'simulation')
    return <p className="font-medium">Plantão simulado. Use o protocolo deste ensaio para acompanhar o teste.</p>;
  return (
    <div className="space-y-1">
      <h4 className="font-semibold">{team || 'Equipe de atendimento'}</h4>
      {from && until && (
        <p>
          {onDuty ? 'Plantão em andamento' : 'Plantão previsto'} de {formatDateTime(from)} a {formatDateTime(until)} (São Paulo).
        </p>
      )}
      {!onDuty && <p>Sem plantão ativo agora. Você pode registrar o pedido e acompanhar o protocolo aqui.</p>}
      {address && channel ? (
        <p>
          <a className={linkClass} href={(channel === 'email' ? 'mailto:' : 'tel:') + address}>
            {address}
          </a>
        </p>
      ) : (
        <p>Canal direto ainda não publicado para este trecho.</p>
      )}
    </div>
  );
}

function LegHelp({ legId }: { legId: string }) {
  const contact = useAsync(() => getSupportContact(legId), legId);
  const [reason, setReason] = useState<HelpReason>('safety');
  const [protocol, setProtocol] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const submit = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    setProtocol('');
    try {
      setProtocol(await openRideHelp(legId, reason));
    } catch (err) {
      setError(err);
    } finally {
      sending.current = false;
      setBusy(false);
      contact.reload();
    }
  };
  return (
    <div className="space-y-2 rounded-xl border border-gray-200 p-3">
      {contact.data && <Contact contact={contact.data} />}
      {contact.loading && !contact.data && <p role="status">Consultando o plantão…</p>}
      <label className="block font-medium">
        Motivo da ajuda
        <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value as HelpReason)}>
          {Object.entries(helpReasons).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className={secondaryButton} disabled={busy} onClick={() => void submit()}>
        Registrar pedido de ajuda
      </button>
      {protocol && <p role="status">Pedido registrado. Protocolo {protocol}.</p>}
      {contact.data && contact.data.requests.length > 0 && (
        <div>
          <h4 className="font-semibold">Seus protocolos deste trecho</h4>
          <ul>
            {contact.data.requests.map((item) => (
              <li key={item.protocol} className="my-1 break-words">
                {item.protocol} · {reasonLabel(item.reason)} · {formatDateTime(item.created_at)}
                {item.resolved_at
                  ? ' · Encerrado em ' + formatDateTime(item.resolved_at) + (item.code ? ' · ' + supportOutcomes[item.code] : '')
                  : ' · Em aberto'}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ErrorAlert error={error ?? contact.error} />
      <button type="button" className={linkClass} onClick={contact.reload} disabled={contact.loading}>
        Atualizar plantão e protocolos
      </button>
    </div>
  );
}

export function RideHelp({ legId }: { legId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <button type="button" className={secondaryButton} aria-expanded={open} onClick={() => setOpen(!open)}>
        Pedir ajuda com o trecho
      </button>
      {open && <LegHelp key={legId} legId={legId} />}
    </div>
  );
}

const kindLabels: Record<SupportQueueItem['kind'], string> = {
  ride_help: 'Pedido de ajuda',
  ride_receipt_incomplete: 'Recibo incompleto',
  ride_deletion_review: 'Revisão de exclusão de conta',
};
function SupportRow({ item, refresh }: { item: SupportQueueItem; refresh: () => void }) {
  const [code, setCode] = useState<SupportOutcome | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const working = useRef(false);
  async function run(action: 'claim' | 'resolve') {
    if (working.current || (action === 'claim' ? !item.can_claim : !item.can_resolve || !code)) return;
    working.current = true;
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      if (action === 'claim') await claimSupportRequest(item.protocol);
      else if (code) await resolveSupportRequest(item.protocol, code);
      setNotice(action === 'claim' ? 'Atendimento assumido.' : 'Encerramento registrado.');
    } catch (err) {
      setError(err);
    } finally {
      working.current = false;
      setBusy(false);
      refresh();
    }
  }
  return (
    <li className="space-y-2 rounded-xl border border-gray-200 p-3">
      <p className="font-semibold">
        {kindLabels[item.kind]}
        {item.environment === 'simulation' && ' · Ensaio'}
      </p>
      <p className="break-words">
        Protocolo {item.protocol}
        {item.leg && ' · Trecho ' + item.leg}
      </p>
      <p>
        {formatDateTime(item.created_at)} (São Paulo){item.reason && ' · ' + reasonLabel(item.reason)}
      </p>
      {item.resolved_at ? (
        <p>
          Encerrado em {formatDateTime(item.resolved_at)}
          {item.code && ' · ' + supportOutcomes[item.code]}
        </p>
      ) : (
        <>
          <p>{item.claimed_by_me ? 'Atribuído a você' : item.claimed_by ? 'Atribuído a outro operador' : 'Aguardando responsável'}</p>
          {item.can_claim && (
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => void run('claim')}>
              Assumir atendimento
            </button>
          )}
          {item.can_resolve && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="font-medium">
                Resultado do atendimento
                <select className={inputClass} value={code} onChange={(e) => setCode(e.target.value as SupportOutcome)}>
                  <option value="">Selecione o resultado</option>
                  {Object.entries(supportOutcomes).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className={secondaryButton} disabled={!code || busy} onClick={() => void run('resolve')}>
                Encerrar atendimento
              </button>
            </div>
          )}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      <ErrorAlert error={error} />
    </li>
  );
}

export function RideSupportQueue() {
  const queue = useAsync(listSupportQueue, 'queue');
  const { reload } = queue;
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') reload();
    };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reload]);
  return (
    <section className="mt-4 space-y-3 text-sm" aria-label="Fila de ajuda das corridas">
      <h2 className="text-lg font-semibold">Fila de ajuda das corridas</h2>
      <button type="button" className={secondaryButton} disabled={queue.loading} onClick={reload}>
        Atualizar fila
      </button>
      {queue.loading && !queue.data && <p role="status">Carregando a fila…</p>}
      <ErrorAlert error={queue.error} />
      {queue.data?.length === 0 && <p>Nenhuma ocorrência na fila.</p>}
      <ul className="space-y-2">
        {queue.data?.map((item) => (
          <SupportRow key={item.protocol} item={item} refresh={reload} />
        ))}
      </ul>
    </section>
  );
}
