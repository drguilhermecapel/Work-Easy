import { useEffect, useRef, useState } from 'react';
import {
  downloadIncident,
  encodeMedia,
  safety,
  type SafetyCase,
  type SafetyStatus,
} from '../../../services/rideSafety';
import { Options, TaskButton } from './common';
import { label, useAction, when } from './state';
import { inputClass } from '../../admin/styles';

function OptionalRecording({ allowed, onFile }: { allowed: boolean; onFile: (f: File) => void }) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const active = useRef(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  function stop() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
  }
  useEffect(() => {
    active.current = allowed;
    if (!allowed) stop();
    return () => {
      active.current = false;
      stop();
    };
  }, [allowed]);
  async function start() {
    setError('');
    if (!allowed || recording) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error('Gravação indisponível neste aparelho.');
      const mime = ['audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error('Formato de áudio indisponível neste aparelho.');
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active.current) {
        audio.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = audio;
      const r = new MediaRecorder(audio, { mimeType: mime, audioBitsPerSecond: 32000 });
      const parts: BlobPart[] = [];
      let size = 0;
      r.ondataavailable = (e) => {
        size += e.data.size;
        if (size <= 1048576) parts.push(e.data);
        else stop();
      };
      r.onstop = () => {
        audio.getTracks().forEach((t) => t.stop());
        if (!active.current) return;
        setRecording(false);
        if (size > 1048576) setError('O áudio excedeu 1 MiB. Faça uma gravação mais curta.');
        else if (parts.length)
          onFile(new File(parts, 'registro.' + (mime === 'audio/mp4' ? 'm4a' : 'webm'), { type: mime }));
      };
      recorder.current = r;
      r.start(500);
      setRecording(true);
    } catch (err) {
      stop();
      setError(err instanceof Error ? err.message : 'Microfone indisponível.');
    }
  }
  return (
    <div>
      <TaskButton disabled={!allowed} onClick={() => (recording ? stop() : void start())}>
        {recording ? 'Parar gravação' : 'Gravar áudio opcional'}
      </TaskButton>
      {recording && <p role="status">O microfone está gravando neste aparelho.</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
function Case({ item, status, refresh }: { item: SafetyCase; status: SafetyStatus; refresh: () => void }) {
  const a = useAction(refresh);
  const [file, setFile] = useState<File>();
  const [consent, setConsent] = useState(false);
  const act = (code: string) =>
    void a.run(code, async (key) => {
      await safety.update(item.protocol, code, null, key);
      return 'Atualização registrada.';
    });
  return (
    <article className="space-y-2 rounded-lg border p-3">
      <h4 className="font-semibold">
        {label(item.category)} · {label(item.severity)}
      </h4>
      <p>
        Protocolo {item.protocol}.{' '}
        {item.resolved_at ? 'Encerrado em ' + when(item.resolved_at) : 'Aberto em ' + when(item.opened)}.
      </p>
      {item.due_at && (
        <p>
          Retorno previsto até {when(item.due_at)}.{' '}
          {item.first_response && 'Primeira resposta em ' + when(item.first_response) + '.'}
        </p>
      )}
      {item.updates.map((u, i) => (
        <p key={i}>
          {label(u.code)} · {when(u.at)} {u.ref && '· Referência ' + u.ref}
        </p>
      ))}
      {item.files.map((f) => (
        <TaskButton
          key={f.id}
          onClick={() =>
            void a.run('file:' + f.id, async () => {
              await downloadIncident(f.id);
              return 'Arquivo preparado.';
            })
          }
        >
          Baixar anexo {f.mime}
        </TaskButton>
      ))}
      {item.resolved_at ? (
        <TaskButton
          disabled={a.busy}
          onClick={() =>
            void a.run(
              'reopen',
              async (key) => 'Novo protocolo ' + (await safety.report(item.leg, item.category, key, item.protocol)),
            )
          }
        >
          Reabrir ocorrência
        </TaskButton>
      ) : (
        <>
          {item.category === 'lost_item' && (
            <>
              {['item_found', 'item_received'].map((code) => (
                <TaskButton key={code} disabled={a.busy} onClick={() => act(code)}>
                  {label(code)}
                </TaskButton>
              ))}
              <p>Combine a devolução pelo plantão, sem divulgar o telefone pessoal.</p>
            </>
          )}
          {item.category === 'accident' && item.insurance && (
            <TaskButton disabled={a.busy} onClick={() => act('request_claim')}>
              Solicitar abertura de sinistro ao plantão
            </TaskButton>
          )}
          {status.media_enabled &&
            ['accident', 'emergency', 'harassment', 'discrimination'].includes(item.category) && (
              <fieldset className="space-y-2">
                <legend>Anexo voluntário · até 1 MiB</legend>
                <label className="block">
                  Selecionar registro{' '}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,audio/webm,audio/mp4"
                    onChange={(e) => setFile(e.target.files?.[0])}
                  />
                </label>
                <OptionalRecording allowed={status.recording_allowed} onFile={setFile} />
                {file && <p>Arquivo selecionado: {file.name}</p>}
                <label className="block">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Autorizo
                  anexar este arquivo ao meu protocolo.
                </label>
                <TaskButton
                  disabled={a.busy || !file || !consent}
                  onClick={() =>
                    void a.run('attach:' + file?.name, async (key) => {
                      if (!file) return;
                      await safety.attach(item.protocol, file.type, await encodeMedia(file), key);
                      setFile(undefined);
                      setConsent(false);
                      return 'Arquivo anexado com acesso restrito.';
                    })
                  }
                >
                  Anexar ao protocolo
                </TaskButton>
              </fieldset>
            )}
        </>
      )}
      {a.message}
    </article>
  );
}
export function Incident({ leg, status, refresh }: { leg: string; status: SafetyStatus; refresh: () => void }) {
  const a = useAction(refresh);
  const [category, setCategory] = useState('accident');
  const [dialNotice, setDialNotice] = useState('');
  return (
    <div className="space-y-3">
      <h4 className="font-semibold">Bem-estar e emergência</h4>
      {status.wellness && (
        <div role="status">
          <p>{label(status.wellness)} Você precisa de ajuda?</p>
          <TaskButton
            disabled={a.busy}
            onClick={() =>
              void a.run('ok', async () => {
                await safety.acknowledge(leg);
                return 'Resposta de bem-estar registrada.';
              })
            }
          >
            Estou bem
          </TaskButton>{' '}
          <TaskButton
            disabled={a.busy}
            onClick={() =>
              void a.run('wellness', async (key) => 'Protocolo ' + (await safety.report(leg, 'wellness', key)))
            }
          >
            Preciso de ajuda do plantão
          </TaskButton>
        </div>
      )}
      {status.vehicle && (
        <p>
          Veículo {status.vehicle.model} · {status.vehicle.plate}
        </p>
      )}
      {status.location && (
        <p>
          Última posição {status.location.lat.toFixed(5)}°, {status.location.lng.toFixed(5)}° em{' '}
          {when(status.location.at)}.
        </p>
      )}
      {status.simulation ? (
        <TaskButton onClick={() => setDialNotice('Ensaio de abertura do discador. Nenhuma chamada foi iniciada.')}>
          Ensaiar discador de emergência
        </TaskButton>
      ) : (
        status.dial && (
          <a
            className="font-semibold underline"
            href={'tel:' + status.dial}
            onClick={() => setDialNotice('Abertura do discador solicitada. Confirme a chamada no aparelho.')}
          >
            Abrir discador de emergência · {status.dial}
          </a>
        )
      )}
      {dialNotice && <p role="status">{dialNotice}</p>}
      {status.policy && (
        <details>
          <summary>Proteção e canal de sinistro</summary>
          <p>
            {status.policy.insurer} · {status.policy.coverage}
          </p>
          <p>Exclusões: {status.policy.exclusions}</p>
          <p>
            {status.policy.territory} · de {when(status.policy.from)} até {when(status.policy.until)}
          </p>
          <p>Canal homologado: {status.policy.claim_channel}</p>
        </details>
      )}
      {status.media_enabled && ['accepted', 'arriving', 'boarded'].includes(status.status) && (
        <div>
          <p>A gravação é voluntária. Avise os ocupantes. A captura no app depende de confirmação das duas partes.</p>
          <TaskButton
            disabled={a.busy}
            onClick={() =>
              void a.run('notice', async () => {
                await safety.notice(leg, !status.notice_given);
              })
            }
          >
            {status.notice_given
              ? 'Revogar concordância com gravação'
              : 'Confirmar ciência e concordância com gravação'}
          </TaskButton>
        </div>
      )}
      <label className="block">
        Tipo de ocorrência{' '}
        <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          <Options codes={['accident', 'emergency', 'harassment', 'discrimination', 'lost_item', 'other']} />
        </select>
      </label>
      <TaskButton
        disabled={a.busy}
        onClick={() =>
          void a.run('report:' + category, async (key) => 'Protocolo ' + (await safety.report(leg, category, key)))
        }
      >
        Abrir ocorrência com o plantão
      </TaskButton>
      {status.lost_checks?.map((c) => (
        <div key={c.protocol}>
          <p>O plantão solicita que confira se ficou um objeto neste trecho. Protocolo {c.protocol}.</p>
          <TaskButton
            disabled={a.busy}
            onClick={() =>
              void a.run('located:' + c.protocol, async (key) => {
                await safety.update(c.protocol, 'item_found', null, key);
                return 'Plantão informado.';
              })
            }
          >
            Informar objeto localizado
          </TaskButton>
        </div>
      ))}
      {status.cases.map((c) => (
        <Case key={c.protocol} item={c} status={status} refresh={refresh} />
      ))}
      {a.message}
    </div>
  );
}
