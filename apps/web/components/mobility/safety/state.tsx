import { useEffect, useRef, useState } from 'react';
import ErrorAlert from '../../ErrorAlert';
import { useAsync } from '../../../lib/useAsync';
import { formatDateTime } from '../../admin/format';
export const meanings: Record<string, string> = {
  requested: 'Aguardando motorista',
  accepted: 'Motorista confirmado',
  arriving: 'A caminho do embarque',
  boarded: 'Passageiro embarcado',
  completed: 'Trecho concluído',
  stale_signal: 'O sinal de localização está ausente ou desatualizado.',
  long_stop: 'Foi observada uma parada prolongada.',
  route_deviation: 'O sinal recente está fora do percurso de referência.',
  unexpected_end: 'O trecho terminou ou ficou incerto depois do embarque.',
  accident: 'Acidente',
  discrimination: 'Discriminação',
  lost_item: 'Objeto perdido',
  wellness: 'Preciso de auxílio',
  emergency: 'Emergência',
  request_item_check: 'Solicitar busca à outra parte',
  harassment: 'Assédio',
  other: 'Outra ocorrência',
  urgent: 'Urgente',
  priority: 'Prioritária',
  normal: 'Regular',
  acknowledged: 'Equipe em atendimento',
  secure_handoff: 'Entrega intermediada',
  return_arranged: 'Devolução combinada',
  item_found: 'Objeto localizado',
  item_received: 'Objeto recebido',
  request_claim: 'Solicitação de sinistro',
  insurer_contacted: 'Seguradora contatada',
  claim_registered: 'Sinistro protocolado',
  escalated: 'Encaminhado ao responsável',
  text: 'Mensagem escrita',
  visual: 'Sinal visual',
  sound: 'Aviso sonoro',
  none: 'Sem assistência especial',
  boarding: 'Ajuda para embarcar',
  folding_equipment: 'Equipamento portátil ou dobrável',
  wheelchair_vehicle: 'Veículo adaptado para viajar na cadeira',
  identity: 'Identidade',
  safety: 'Segurança',
  conduct: 'Conduta',
  qualification: 'Habilitação',
  available: 'Recurso disponível',
  pending: 'Em revisão',
  lifted: 'Restrição retirada',
  maintained: 'Restrição mantida',
  incorrect_identity: 'Identidade incorreta',
  new_evidence: 'Nova evidência',
  decision_review: 'Revisão da decisão',
};
export const label = (code: string) => meanings[code] ?? code;
export const when = (at: string | null) => (at ? formatDateTime(at) + ' (São Paulo)' : 'Sem prazo publicado');
export function useAction(refresh?: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  const keys = useRef(new Map<string, string>());
  async function run(intent: string, work: (key: string) => Promise<string | void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    setNotice('');
    const key = keys.current.get(intent) ?? crypto.randomUUID();
    keys.current.set(intent, key);
    try {
      const result = await work(key);
      setNotice(result ?? 'Atualizado.');
      keys.current.delete(intent);
    } catch (err) {
      setError(err);
    } finally {
      locked.current = false;
      setBusy(false);
      refresh?.();
    }
  }
  return {
    busy,
    run,
    message: (
      <>
        <ErrorAlert error={error} />
        {notice && <p role="status">{notice}</p>}
      </>
    ),
  };
}
export function useSafetyPoll<T>(load: () => Promise<T>, key: string) {
  const result = useAsync(load, key);
  const reload = result.reload;
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') reload();
    };
    const id = window.setInterval(refresh, 20_000);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', refresh);
    };
  }, [reload]);
  return result;
}
