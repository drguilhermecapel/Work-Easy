import React from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import {
  listCaregiverNames,
  listCheckins,
  listHouseholds,
  listRecipients,
  listReports,
  listShifts,
} from '../../services/care';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import CuidadoPage from '../../components/cuidado/CuidadoPage';
import { CheckinLine, ReportView } from '../../components/cuidado/ShiftRecords';
import { formatShiftPeriod } from '../../components/cuidado/format';
import { Card, EmptyState } from '../../components/cuidado/ui';
import { useCareUserId } from '../../components/cuidado/useCareUser';

const load = async () => {
  const households = await listHouseholds();
  const ids = households.map(h => h.id);
  const [recipients, shifts] = await Promise.all([listRecipients(ids), listShifts(ids)]);
  // Shifts that already have a check-in or a report; newest first
  const started = shifts.filter(s => s.status === 'checked_in' || s.status === 'completed' || s.status === 'no_show').reverse();
  const shiftIds = started.map(s => s.id);
  const [checkins, reports, names] = await Promise.all([
    listCheckins(shiftIds),
    listReports(shiftIds),
    listCaregiverNames(started.flatMap(s => (s.provider_id ? [s.provider_id] : []))),
  ]);
  return { started, recipients, checkins, reports, names };
};

const Content: React.FC<{ userId: string }> = ({ userId }) => {
  const result = useAsync(load, userId);
  const data = result.data;
  if (result.loading && !data) return <PageStatus />;
  if (!data) return <ErrorAlert error={result.error} />;

  return (
    <div className="space-y-4">
      <ErrorAlert error={result.error} />
      {data.started.length === 0 ? (
        <EmptyState>
          Ainda não há relatórios. Quando um cuidador registrar a entrada e enviar o relatório do dia, ele aparece aqui, junto com os
          horários de entrada e saída.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {data.started.map(shift => {
            const recipient = data.recipients.find(r => r.id === shift.care_recipient_id);
            const checkins = data.checkins.filter(c => c.shift_id === shift.id);
            const report = data.reports.find(r => r.shift_id === shift.id);
            const caregiver = shift.provider_id ? data.names.get(shift.provider_id) : undefined;
            return (
              <Card as="li" key={shift.id} className="space-y-3">
                <div>
                  <h2 className="font-bold text-gray-900">{formatShiftPeriod(shift.period)}</h2>
                  <p className="text-sm text-gray-600 break-words">
                    {recipient ? `Cuidado de ${recipient.first_name}` : 'Pessoa cuidada não informada'}
                    {caregiver ? ` · Cuidador: ${caregiver}` : ''}
                  </p>
                </div>
                {checkins.length > 0 && (
                  <ul className="space-y-1">
                    {checkins.map(checkin => (
                      <CheckinLine key={checkin.id} checkin={checkin} />
                    ))}
                  </ul>
                )}
                {report ? (
                  <ReportView report={report} />
                ) : (
                  <p className="text-sm text-gray-500">O relatório deste dia ainda não foi enviado.</p>
                )}
                <Link to={`/cuidado/plantoes/${shift.id}`} className="inline-block text-sm text-primary underline">
                  Abrir o plantão
                </Link>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const Relatorios: React.FC = () => {
  const userId = useCareUserId();
  return (
    <CuidadoPage
      title="Relatórios"
      intro="O que o cuidador registrou em cada plantão: entrada, saída e o relatório do dia. São textos escritos por ele, não informação de saúde nem laudo."
    >
      <Content userId={userId} />
    </CuidadoPage>
  );
};

export default Relatorios;
