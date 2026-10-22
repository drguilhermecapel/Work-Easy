import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, HandHeart, MapPin } from 'lucide-react';
import { formatCents } from '../../lib/money';
import { useAsync } from '../../lib/useAsync';
import { latestConsents, listConsents } from '../../services/account';
import {
  acceptShiftOffer,
  cancelMyShift,
  careCode,
  listCaregiverShifts,
  listMyCheckins,
  listMyOffers,
  listMyReports,
  type CaregiverShift,
  type Checkin,
  type DailyReport,
} from '../../services/care';
import ProPage from '../../components/pro/ProPage';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import CareError from '../../components/cuidado/CareError';
import CheckinPanel, { type CheckinDone } from '../../components/cuidado/CheckinPanel';
import HealthDataNotice from '../../components/cuidado/HealthDataNotice';
import ReportForm from '../../components/cuidado/ReportForm';
import ShiftStatusBadge from '../../components/cuidado/ShiftStatusBadge';
import { CheckinLine } from '../../components/cuidado/ShiftRecords';
import { formatShiftPeriod, formatTime } from '../../components/cuidado/format';
import { inputClass, primaryButton, secondaryButton } from '../../components/cuidado/styles';
import { Card, ConfirmButton, EmptyState, Field, SectionTitle } from '../../components/cuidado/ui';
import { useCareUserId } from '../../components/cuidado/useCareUser';

const load = async (userId: string) => {
  const [shifts, offers, checkins, reports, consents] = await Promise.all([
    listCaregiverShifts(),
    listMyOffers(userId),
    listMyCheckins(userId),
    listMyReports(userId),
    listConsents(userId),
  ]);
  return { shifts, offers, checkins, reports, locationGranted: latestConsents(consents).location?.granted === true };
};

type Data = Awaited<ReturnType<typeof load>>;

interface Notice {
  text: string;
  /** Something to pay attention to (e.g. a record made without location). */
  warning?: string;
}

const ShiftFacts: React.FC<{ shift: CaregiverShift }> = ({ shift }) => (
  <div className="space-y-1">
    <p className="font-bold text-gray-900 flex items-start gap-1.5">
      <CalendarDays size={16} className="shrink-0 mt-1 text-primary" aria-hidden="true" /> <span>{formatShiftPeriod(shift.period)}</span>
    </p>
    <p className="text-sm text-gray-600 break-words">
      {shift.recipient_first_name ? `Cuidado de ${shift.recipient_first_name}` : 'Pessoa cuidada não informada'}
      {shift.neighborhood_name ? ` · Bairro ${shift.neighborhood_name}` : ''}
    </p>
    <p className="text-sm font-semibold text-gray-800">
      {shift.caregiver_payout_cents !== null ? `Valor: ${formatCents(shift.caregiver_payout_cents)}` : 'Valor não informado'}
    </p>
    {shift.notes && <p className="text-sm text-gray-600 whitespace-pre-line break-words">Observações da família: {shift.notes}</p>}
  </div>
);

// ---- Offers ---------------------------------------------------------------------------

const OfferCard: React.FC<{ shift: CaregiverShift; onAccepted: (shift: CaregiverShift) => void; onRefresh: () => void }> = ({
  shift,
  onAccepted,
  onRefresh,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptShiftOffer(shift.shift_id);
      onAccepted(shift);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  // Someone else was first (or the family canceled): the list must be read again
  const stale = error ? ['not_allowed', 'invalid_transition'].includes(careCode(error) ?? '') : false;

  return (
    <Card as="li" className="space-y-3">
      <ShiftFacts shift={shift} />
      <CareError error={error} audience="cuidador" />
      <div className="flex flex-wrap gap-2">
        {!stale && (
          <button type="button" className={primaryButton} disabled={busy} onClick={accept}>
            <HandHeart size={16} aria-hidden="true" /> {busy ? 'Aceitando…' : 'Aceitar plantão'}
          </button>
        )}
        {stale && (
          <button type="button" className={secondaryButton} onClick={onRefresh}>
            Atualizar a lista
          </button>
        )}
      </div>
    </Card>
  );
};

/** Collapsible report form; open on first sight when there is no report yet, and left as the user set it afterwards. */
const ReportSection: React.FC<{ shiftId: string; report?: DailyReport; onSent: () => void }> = ({ shiftId, report, onSent }) => {
  const [open] = useState(!report);
  return (
    <details className="border-t border-gray-100 pt-3" open={open}>
      <summary className="cursor-pointer text-sm font-semibold text-gray-800">{report ? 'Relatório do dia (já enviado)' : 'Relatório do dia'}</summary>
      <div className="mt-3">
        <ReportForm shiftId={shiftId} existing={report} onSent={onSent} />
      </div>
    </details>
  );
};

// ---- My shifts ---------------------------------------------------------------------------

const MyShiftCard: React.FC<{
  userId: string;
  shift: CaregiverShift;
  checkins: Checkin[];
  report?: DailyReport;
  locationGranted: boolean;
  onCheckin: (done: CheckinDone) => void;
  onChanged: (notice?: Notice) => void;
}> = ({ userId, shift, checkins, report, locationGranted, onCheckin, onChanged }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const done = new Set(checkins.map(c => c.kind));

  return (
    <Card as="li" className="space-y-4">
      <div className="space-y-2">
        <ShiftStatusBadge status={shift.status} />
        <ShiftFacts shift={shift} />
      </div>

      {checkins.length > 0 && (
        <ul className="space-y-1" aria-label="Registros deste plantão">
          {checkins.map(checkin => (
            <CheckinLine key={checkin.id} checkin={checkin} />
          ))}
        </ul>
      )}

      {shift.status === 'assigned' && !done.has('in') && (
        <CheckinPanel userId={userId} shift={shift} kind="in" locationGranted={locationGranted} onDone={onCheckin} />
      )}
      {shift.status === 'checked_in' && !done.has('out') && (
        <CheckinPanel userId={userId} shift={shift} kind="out" locationGranted={locationGranted} onDone={onCheckin} />
      )}

      {(shift.status === 'checked_in' || shift.status === 'completed') && (
        <ReportSection shiftId={shift.shift_id} report={report} onSent={() => onChanged()} />
      )}

      {shift.status === 'assigned' && (
        <div className="border-t border-gray-100 pt-3 space-y-3">
          <Field id={`desistir-${shift.shift_id}`} label="Motivo para desistir (opcional)">
            <input
              id={`desistir-${shift.shift_id}`}
              className={inputClass}
              value={reason}
              maxLength={500}
              onChange={e => setReason(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <CareError error={error} audience="cuidador" />
          <ConfirmButton
            label="Cancelar meu plantão"
            confirmLabel="Sim, cancelar"
            question="Cancelar este plantão? Ele volta a ficar aberto e é oferecido de novo aos outros cuidadores convidados pela família."
            onConfirm={async () => {
              setError(null);
              try {
                await cancelMyShift(shift.shift_id, reason);
                onChanged({ text: 'Plantão cancelado. Ele foi devolvido à família e oferecido de novo aos outros cuidadores convidados.' });
              } catch (err) {
                setError(err);
              }
            }}
          />
        </div>
      )}
    </Card>
  );
};

// ---- Screen -------------------------------------------------------------------------------

const Content: React.FC<{ userId: string }> = ({ userId }) => {
  const result = useAsync(() => load(userId), userId);
  const [notice, setNotice] = useState<Notice | null>(null);
  const data: Data | undefined = result.data;

  if (result.loading && !data) return <PageStatus />;
  if (!data) return <ErrorAlert error={result.error} />;

  const offered = data.shifts.filter(s => s.status === 'offered' && s.offer_status === 'offered');
  const closedRows = data.shifts.filter(s => s.offer_status === 'expired');
  const mine = data.shifts.filter(s => !offered.includes(s) && !closedRows.includes(s));
  const active = mine.filter(s => s.status === 'assigned' || s.status === 'checked_in');
  const past = mine.filter(s => !active.includes(s)).reverse();
  // Offers the list no longer shows because they expired: someone else accepted, or the family canceled
  const shown = new Set(data.shifts.map(s => s.shift_id));
  const expiredHidden = data.offers.filter(o => o.status === 'expired' && !shown.has(o.shift_id)).length;

  const afterChange = (next?: Notice) => {
    setNotice(next ?? null);
    result.reload();
  };

  const checkinDone = (done: CheckinDone) => {
    const label = done.kind === 'in' ? 'Entrada' : 'Saída';
    setNotice({
      text: `${label} registrada às ${formatTime(done.at)}.`,
      warning: done.coords
        ? undefined
        : `O registro ficou sem localização. ${done.locationNote ?? ''} A família verá que a localização não foi enviada.`.trim(),
    });
    result.reload();
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Plantões de cuidado oferecidos pelas famílias. Antes de aceitar você vê só o primeiro nome da pessoa cuidada, o bairro, o horário
        (de Brasília) e o valor.
      </p>

      {notice && (
        <div className="space-y-2">
          <p role="status" className="text-sm text-green-800 bg-green-50 border border-green-100 rounded-lg p-3">
            {notice.text}
          </p>
          {notice.warning && (
            <p role="alert" className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg p-3">
              <MapPin size={16} className="shrink-0 mt-0.5" aria-hidden="true" /> <span>{notice.warning}</span>
            </p>
          )}
        </div>
      )}
      <ErrorAlert error={result.error} />

      <section aria-labelledby="plantoes-ofertas" className="space-y-3">
        <SectionTitle id="plantoes-ofertas">Ofertas para você</SectionTitle>
        {offered.length === 0 ? (
          <EmptyState>
            Nenhuma oferta agora. Quando uma família oferecer um plantão a você, ele aparece aqui. Para receber ofertas, o cadastro precisa
            estar aprovado em uma ocupação de cuidado (veja em <Link to="/pro/cadastro" className="text-primary underline">Cadastro</Link>).
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {offered.map(shift => (
              <OfferCard
                key={shift.shift_id}
                shift={shift}
                onRefresh={() => afterChange()}
                onAccepted={accepted =>
                  afterChange({ text: `Plantão aceito: ${formatShiftPeriod(accepted.period)}. Ele já está em “Meus plantões”.` })
                }
              />
            ))}
          </ul>
        )}
        {(closedRows.length > 0 || expiredHidden > 0) && (
          <ul className="space-y-2" aria-label="Ofertas encerradas">
            {closedRows.map(shift => (
              <li key={shift.shift_id} className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">
                <span className="font-medium">{formatShiftPeriod(shift.period)}</span>:{' '}
                {shift.status === 'canceled' ? 'a família cancelou este plantão.' : 'outro cuidador já aceitou este plantão.'}
              </li>
            ))}
            {expiredHidden > 0 && (
              <li className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">
                {expiredHidden === 1 ? '1 oferta encerrada' : `${expiredHidden} ofertas encerradas`}: outro cuidador aceitou primeiro ou a
                família cancelou.
              </li>
            )}
          </ul>
        )}
      </section>

      <section aria-labelledby="plantoes-meus" className="space-y-3">
        <SectionTitle id="plantoes-meus">Meus plantões</SectionTitle>
        {active.length === 0 ? (
          <EmptyState>Você não tem plantões confirmados no momento.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {active.map(shift => (
              <MyShiftCard
                key={shift.shift_id}
                userId={userId}
                shift={shift}
                checkins={data.checkins.filter(c => c.shift_id === shift.shift_id)}
                report={data.reports.find(r => r.shift_id === shift.shift_id)}
                locationGranted={data.locationGranted}
                onCheckin={checkinDone}
                onChanged={afterChange}
              />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section aria-labelledby="plantoes-anteriores" className="space-y-3">
          <SectionTitle id="plantoes-anteriores">Anteriores</SectionTitle>
          <ul className="space-y-3">
            {past.map(shift => (
              <MyShiftCard
                key={shift.shift_id}
                userId={userId}
                shift={shift}
                checkins={data.checkins.filter(c => c.shift_id === shift.shift_id)}
                report={data.reports.find(r => r.shift_id === shift.shift_id)}
                locationGranted={data.locationGranted}
                onCheckin={checkinDone}
                onChanged={afterChange}
              />
            ))}
          </ul>
        </section>
      )}

      <HealthDataNotice className="mt-2">
        Os relatórios são textos simples sobre o dia. Se a pessoa cuidada passar mal, ligue para a família e, se for urgente, para o SAMU
        (192).
      </HealthDataNotice>
    </div>
  );
};

const Plantoes: React.FC = () => {
  const userId = useCareUserId();
  return (
    <ProPage title="Plantões">
      <Content userId={userId} />
    </ProPage>
  );
};

export default Plantoes;
