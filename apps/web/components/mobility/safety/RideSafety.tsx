import { useState } from 'react';
import ErrorAlert from '../../ErrorAlert';
import { safety } from '../../../services/rideSafety';
import { BoardingPin, RideCommunication } from './RideCommunication';
import { Incident } from './Incident';
import { RideTrust } from './Trust';
import { TaskButton } from './common';
import { label, useSafetyPoll } from './state';

function Panel({ leg, onChange }: { leg: string; onChange?: () => void }) {
  const result = useSafetyPoll(
    () => Promise.all([safety.status(leg), safety.communication(leg), safety.trust(leg)]),
    leg,
  );
  const content = result.data;
  if (!content)
    return (
      <>
        <p role="status">{result.loading ? 'Consultando trecho…' : null}</p>
        <ErrorAlert error={result.error} />
      </>
    );
  const [status, com, trust] = content;
  const active = ['requested', 'accepted', 'arriving', 'boarded'].includes(status.status);
  const refresh = () => {
    result.reload();
    onChange?.();
  };
  return (
    <div className="space-y-4">
      <ErrorAlert error={result.error} />
      {['accepted', 'arriving'].includes(status.status) && status.role === 'passenger' && (
        <BoardingPin leg={leg} driver={false} refresh={refresh} />
      )}
      <Incident leg={leg} status={status} refresh={refresh} />
      {['accepted', 'arriving', 'boarded'].includes(status.status) && (
        <RideCommunication data={com} leg={leg} refresh={refresh} />
      )}
      <RideTrust leg={leg} data={trust} refresh={refresh} active={active} />
    </div>
  );
}
function WellnessPrompt({ leg, show }: { leg: string; show: () => void }) {
  const state = useSafetyPoll(() => safety.status(leg), leg);
  if (!state.data?.wellness || state.error) return null;
  return (
    <div role="status">
      <p>{label(state.data.wellness)} Você precisa de ajuda?</p>
      <TaskButton onClick={show}>Responder à checagem de bem-estar</TaskButton>
    </div>
  );
}
export function RideSafety({ leg, status, onChange }: { leg: string; status: string; onChange?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Segurança deste trecho" className="space-y-3">
      {!open && ['boarded', 'unknown', 'cancelled'].includes(status) && (
        <WellnessPrompt leg={leg} show={() => setOpen(true)} />
      )}
      <TaskButton onClick={() => setOpen(!open)}>
        {open ? 'Fechar central de segurança' : 'Segurança, assistência e emergência'}
      </TaskButton>
      {open && <Panel leg={leg} onChange={onChange} />}
    </section>
  );
}
