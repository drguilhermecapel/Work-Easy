import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft } from 'lucide-react';
import { formatCents } from '../../lib/money';
import { useAsync } from '../../lib/useAsync';
import {
  cancelShift,
  getShift,
  listCaregiverNames,
  listCheckins,
  listHouseholds,
  listOffers,
  listRecipients,
  listReports,
} from '../../services/care';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import CaregiverSearch from '../../components/cuidado/CaregiverSearch';
import CuidadoPage from '../../components/cuidado/CuidadoPage';
import LaborLockNotice from '../../components/cuidado/LaborLockNotice';
import ShiftStatusBadge from '../../components/cuidado/ShiftStatusBadge';
import { CheckinLine, ReportView } from '../../components/cuidado/ShiftRecords';
import { formatShiftPeriod, offersSummary } from '../../components/cuidado/format';
import { inputClass } from '../../components/cuidado/styles';
import { Card, ConfirmButton, Field, SectionTitle } from '../../components/cuidado/ui';
import { useCareUserId } from '../../components/cuidado/useCareUser';
import { useLaborLockLimit } from '../../components/cuidado/useLaborLockLimit';

const load = async (id: string) => {
  const shift = await getShift(id);
  if (!shift) return null;
  const households = await listHouseholds();
  const household = households.find(h => h.id === shift.household_id) ?? null;
  const [recipients, offers, checkins, reports, names] = await Promise.all([
    listRecipients(household ? [household.id] : []),
    listOffers([shift.id]),
    listCheckins([shift.id]),
    listReports([shift.id]),
    listCaregiverNames(shift.provider_id ? [shift.provider_id] : []),
  ]);
  return {
    shift,
    household,
    recipient: recipients.find(r => r.id === shift.care_recipient_id) ?? null,
    offers,
    checkins,
    report: reports[0] ?? null,
    caregiver: shift.provider_id ? (names.get(shift.provider_id) ?? null) : null,
  };
};

const CancelSection: React.FC<{ shiftId: string; assigned: boolean; onCanceled: () => void }> = ({ shiftId, assigned, onCanceled }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  return (
    <Card as="section" labelledBy="plantao-cancelar" className="space-y-3">
      <SectionTitle id="plantao-cancelar">Cancelar o plantão</SectionTitle>
      <Field id="cancelar-motivo" label="Motivo (opcional)">
        <input id="cancelar-motivo" className={inputClass} value={reason} maxLength={500} onChange={e => setReason(e.target.value)} autoComplete="off" />
      </Field>
      <ErrorAlert error={error} />
      <ConfirmButton
        label="Cancelar plantão"
        confirmLabel="Sim, cancelar plantão"
        question={
          assigned
            ? 'Cancelar este plantão? O cuidador confirmado será liberado e as ofertas pendentes expiram.'
            : 'Cancelar este plantão? As ofertas pendentes expiram.'
        }
        onConfirm={async () => {
          setError(null);
          try {
            await cancelShift(shiftId, reason);
            onCanceled();
          } catch (err) {
            setError(err);
          }
        }}
      />
    </Card>
  );
};

const Content: React.FC<{ shiftId: string; userId: string }> = ({ shiftId, userId }) => {
  const result = useAsync(() => load(shiftId), `${userId}:${shiftId}`);
  const limit = useLaborLockLimit();
  const data = result.data;

  if (result.loading && data === undefined) return <PageStatus />;
  if (data === undefined) return <ErrorAlert error={result.error} />;
  if (data === null) {
    return (
      <Card>
        <p className="text-sm text-gray-600">Não encontramos este plantão.</p>
        <Link to="/cuidado/plantoes" className="text-primary underline text-sm">
          Voltar aos plantões
        </Link>
      </Card>
    );
  }

  const { shift, household, recipient, offers, checkins, report, caregiver } = data;
  const canOffer = shift.status === 'open' || shift.status === 'offered';
  const canCancel = canOffer || shift.status === 'assigned';

  return (
    <div className="space-y-5">
      <Link to="/cuidado/plantoes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary">
        <ChevronLeft size={16} aria-hidden="true" /> Plantões
      </Link>
      <ErrorAlert error={result.error} />

      <Card as="section" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <ShiftStatusBadge status={shift.status} />
          {household && <span className="text-xs text-gray-500 break-words">{household.name}</span>}
        </div>
        <h2 className="font-bold text-gray-900 flex items-start gap-1.5">
          <CalendarDays size={18} className="shrink-0 mt-0.5 text-primary" aria-hidden="true" /> <span>{formatShiftPeriod(shift.period)}</span>
        </h2>
        <p className="text-sm text-gray-600 break-words">
          {recipient ? `Cuidado de ${recipient.first_name}` : 'Pessoa cuidada não informada'} · Valor {formatCents(shift.rate_cents)}
        </p>
        {shift.notes && <p className="text-sm text-gray-600 whitespace-pre-line break-words">Observações: {shift.notes}</p>}
        {shift.provider_id && (
          <p className="text-sm text-gray-800 break-words">
            <strong>Cuidador:</strong> {caregiver ?? 'cuidador designado'}
          </p>
        )}
        {shift.status === 'no_show' && <p className="text-sm text-red-700">O cuidador não compareceu a este plantão.</p>}
        <p className="text-sm text-gray-600">{offersSummary(offers)}</p>
      </Card>

      {canOffer && (
        <Card as="section" labelledBy="plantao-oferecer">
          <SectionTitle id="plantao-oferecer">Oferecer a cuidadores</SectionTitle>
          <CaregiverSearch
            shiftId={shift.id}
            neighborhoodId={household?.neighborhood_id ?? null}
            offers={offers}
            onOffered={() => result.reload()}
          />
        </Card>
      )}

      <Card as="section" labelledBy="plantao-registros" className="space-y-3">
        <SectionTitle id="plantao-registros">Entrada, saída e relatório</SectionTitle>
        {checkins.length === 0 ? (
          <p className="text-sm text-gray-500">O cuidador ainda não registrou a entrada.</p>
        ) : (
          <ul className="space-y-1">
            {checkins.map(checkin => (
              <CheckinLine key={checkin.id} checkin={checkin} />
            ))}
          </ul>
        )}
        {report ? (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <h3 className="font-semibold text-gray-800 text-sm">Relatório do dia</h3>
            <ReportView report={report} />
          </div>
        ) : (
          <p className="text-sm text-gray-500 border-t border-gray-100 pt-3">O relatório do dia ainda não foi enviado.</p>
        )}
      </Card>

      {canCancel && <CancelSection shiftId={shift.id} assigned={shift.status === 'assigned'} onCanceled={() => result.reload()} />}

      <LaborLockNotice limit={limit} audience="familia" />
    </div>
  );
};

const PlantaoDetalhe: React.FC = () => {
  const { id = '' } = useParams();
  const userId = useCareUserId();
  return (
    <CuidadoPage title="Plantão">
      <Content shiftId={id} userId={userId} />
    </CuidadoPage>
  );
};

export default PlantaoDetalhe;
