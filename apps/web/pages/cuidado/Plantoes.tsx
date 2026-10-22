import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { formatCents } from '../../lib/money';
import { useAsync } from '../../lib/useAsync';
import {
  listCaregiverNames,
  listHouseholds,
  listOffers,
  listRecipients,
  listShifts,
  type CareRecipient,
  type Household,
  type Shift,
  type ShiftOffer,
} from '../../services/care';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import CuidadoPage from '../../components/cuidado/CuidadoPage';
import LaborLockNotice from '../../components/cuidado/LaborLockNotice';
import ShiftForm from '../../components/cuidado/ShiftForm';
import ShiftStatusBadge from '../../components/cuidado/ShiftStatusBadge';
import { formatShiftPeriod, offersSummary } from '../../components/cuidado/format';
import { primaryButton } from '../../components/cuidado/styles';
import { Card, EmptyState, SectionTitle } from '../../components/cuidado/ui';
import { useCareUserId } from '../../components/cuidado/useCareUser';
import { useLaborLockLimit } from '../../components/cuidado/useLaborLockLimit';

const load = async () => {
  const households = await listHouseholds();
  const ids = households.map(h => h.id);
  const [recipients, shifts] = await Promise.all([listRecipients(ids), listShifts(ids)]);
  const [offers, names] = await Promise.all([
    listOffers(shifts.map(s => s.id)),
    listCaregiverNames(shifts.flatMap(s => (s.provider_id ? [s.provider_id] : []))),
  ]);
  return { households, recipients, shifts, offers, names, now: Date.now() };
};

const ShiftItem: React.FC<{
  shift: Shift;
  household?: Household;
  recipient?: CareRecipient;
  offers: ShiftOffer[];
  caregiver?: string;
}> = ({ shift, household, recipient, offers, caregiver }) => (
  <li>
    <Link
      to={`/cuidado/plantoes/${shift.id}`}
      className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4 shadow-xs hover:shadow-md transition-shadow"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <ShiftStatusBadge status={shift.status} />
          {household && <span className="text-xs text-gray-500 break-words">{household.name}</span>}
        </div>
        <p className="font-bold text-gray-900 flex items-start gap-1.5">
          <CalendarDays size={16} className="shrink-0 mt-1 text-primary" aria-hidden="true" /> <span>{formatShiftPeriod(shift.period)}</span>
        </p>
        <p className="text-sm text-gray-600 break-words">
          {recipient ? `Cuidado de ${recipient.first_name}` : 'Pessoa cuidada não informada'} · {formatCents(shift.rate_cents)}
        </p>
        {shift.provider_id ? (
          <p className="text-sm text-gray-600 break-words">Cuidador: {caregiver ?? 'cuidador designado'}</p>
        ) : (
          (shift.status === 'open' || shift.status === 'offered') && <p className="text-sm text-gray-600">{offersSummary(offers)}</p>
        )}
      </div>
      <ChevronRight size={18} className="text-gray-400 shrink-0" aria-hidden="true" />
    </Link>
  </li>
);

const Content: React.FC<{ userId: string }> = ({ userId }) => {
  const result = useAsync(load, userId);
  const [params] = useSearchParams();
  const limit = useLaborLockLimit();
  const [created, setCreated] = useState(false);
  const data = result.data;

  if (result.loading && !data) return <PageStatus />;
  if (!data) return <ErrorAlert error={result.error} />;

  const recipientOf = (shift: Shift) => data.recipients.find(r => r.id === shift.care_recipient_id);
  const upcoming = data.shifts.filter(s => s.status !== 'canceled' && s.status !== 'completed' && s.status !== 'no_show' && s.period.end.getTime() > data.now);
  const past = data.shifts.filter(s => !upcoming.includes(s)).reverse();

  const renderItem = (shift: Shift) => (
    <ShiftItem
      key={shift.id}
      shift={shift}
      household={data.households.find(h => h.id === shift.household_id)}
      recipient={recipientOf(shift)}
      offers={data.offers.filter(o => o.shift_id === shift.id)}
      caregiver={shift.provider_id ? data.names.get(shift.provider_id) : undefined}
    />
  );

  return (
    <div className="space-y-5">
      <ErrorAlert error={result.error} />

      <section aria-labelledby="plantoes-proximos" className="space-y-3">
        <SectionTitle id="plantoes-proximos">Próximos plantões</SectionTitle>
        {upcoming.length === 0 ? <EmptyState>Nenhum plantão marcado. Crie o primeiro abaixo.</EmptyState> : <ul className="space-y-3">{upcoming.map(renderItem)}</ul>}
      </section>

      <Card as="section" labelledBy="plantoes-novo">
        <SectionTitle id="plantoes-novo">Novo plantão</SectionTitle>
        {data.households.length === 0 ? (
          <div className="text-sm text-gray-600 space-y-3">
            <p>Para criar um plantão, cadastre primeiro a casa onde o cuidado acontece.</p>
            <Link to="/cuidado" className={`${primaryButton} no-underline`}>
              Cadastrar casa
            </Link>
          </div>
        ) : (
          <>
            {created && (
              <p role="status" className="text-sm text-green-800 bg-green-50 border border-green-100 rounded-lg p-3 mb-3">
                Plantão criado. Abra o plantão para oferecer a cuidadores.
              </p>
            )}
            <ShiftForm
              households={data.households}
              recipients={data.recipients}
              initialHouseholdId={params.get('casa') ?? undefined}
              onCreated={() => {
                setCreated(true);
                result.reload();
              }}
            />
          </>
        )}
      </Card>

      {past.length > 0 && (
        <section aria-labelledby="plantoes-anteriores" className="space-y-3">
          <SectionTitle id="plantoes-anteriores">Anteriores e cancelados</SectionTitle>
          <ul className="space-y-3">{past.map(renderItem)}</ul>
        </section>
      )}

      <LaborLockNotice limit={limit} audience="familia" />
    </div>
  );
};

const Plantoes: React.FC = () => {
  const userId = useCareUserId();
  return (
    <CuidadoPage title="Plantões" intro="Crie o plantão, ofereça a cuidadores aprovados e acompanhe a entrada, a saída e o relatório do dia.">
      <Content userId={userId} />
    </CuidadoPage>
  );
};

export default Plantoes;
