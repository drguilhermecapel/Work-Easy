import { useState } from 'react';
import { formatDateTime, shortId } from '../../components/admin/format';
import { dangerButton, inputClass, primaryButton, secondaryButton } from '../../components/admin/styles';
import { Card, EmptyState, Field } from '../../components/admin/ui';
import { formatCents } from '../../lib/money';
import { formatDateBR, todayInSaoPaulo } from '../../lib/timezone';
import { resolveRide, reviewDriver, type RideDashboard } from '../../services/rides';
import { RideLedgerPanel } from '../admin/RideLedgerPanel';
import DriverConsole, { type ConsoleActions } from './DriverConsole';
import { mobilityLabel } from './driverLabels';

type DriverReview = RideDashboard['reviews'][number];

const amount = (value: number | null) => value === null ? '—' : formatCents(value);

function ReviewCard({ driver, busy, own, review }: {
  driver: DriverReview;
  busy: boolean;
  own: boolean;
  review: (approve: boolean, validUntil: string | null) => void;
}) {
  const [expiry, setExpiry] = useState('');
  const today = todayInSaoPaulo();
  return <Card className="space-y-2">
    <h3 className="font-semibold">Motorista {shortId(driver.driver_id)}</h3>
    <p className="text-sm text-gray-700">
      {mobilityLabel(driver.vehicle)} · {mobilityLabel(driver.status)}
      {driver.valid_until && ` · Validade até ${formatDateBR(driver.valid_until)}`}
    </p>
    {own ? <p className="text-sm text-gray-600">Outro administrador deve revisar a sua ficha.</p> :
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
      event.preventDefault();
      if (expiry && expiry >= today) review(true, expiry);
    }}>
      <Field id={`validade-${driver.driver_id}`} label="Validade da aprovação">
        <input type="date" id={`validade-${driver.driver_id}`} required min={today} className={inputClass}
          value={expiry} onChange={event => setExpiry(event.target.value)} />
      </Field>
      <button type="submit" className={primaryButton} disabled={busy || !expiry || expiry < today}>Aprovar cadastro</button>
      <button type="button" className={dangerButton} disabled={busy || driver.status === 'rejected'} onClick={() => review(false, null)}>Rejeitar cadastro</button>
    </form>}
  </Card>;
}

function ResolveLeg({ busy, resolve }: { busy: boolean; resolve: (to: 'completed' | 'cancelled') => void }) {
  const [outcome, setOutcome] = useState<'' | 'completed' | 'cancelled'>('');
  return <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
    event.preventDefault();
    if (outcome) resolve(outcome);
  }}>
    <label className="text-sm font-medium">Resultado conferido
      <select className={inputClass} required value={outcome} onChange={event => setOutcome(event.target.value as typeof outcome)}>
        <option value="">Selecione após conferir a ocorrência</option>
        <option value="completed">Trecho concluído</option>
        <option value="cancelled">Trecho cancelado</option>
      </select>
    </label>
    <button className={secondaryButton} disabled={!outcome || busy}>Registrar resolução</button>
  </form>;
}

function OperationsPanel({ dashboard, userId, busy, run }: ConsoleActions) {
  const [ledgerLeg, setLedgerLeg] = useState<string | null>(null);
  return <>
      <section aria-label="Revisão de motoristas" className="space-y-2">
        <h2 className="text-lg font-semibold">Revisão de motoristas</h2>
        {dashboard.reviews.length === 0 && <EmptyState>Nenhuma ficha de motorista disponível para revisão.</EmptyState>}
        <ul className="grid sm:grid-cols-2 gap-3">{dashboard.reviews.map(driver => <li key={driver.driver_id}>
          <ReviewCard driver={driver} busy={busy} own={driver.driver_id === userId} review={(approve, date) => {
            void run(`review:${driver.driver_id}:${approve}:${date}`, () => reviewDriver(driver.driver_id, approve, date));
          }} />
        </li>)}</ul>
      </section>
      <section aria-label="Viagens e ocorrências" className="space-y-2">
        <h2 className="text-lg font-semibold">Viagens e ocorrências</h2>
        {dashboard.rides.length === 0 && <EmptyState>Nenhuma viagem registrada.</EmptyState>}
        <ul className="space-y-3">{dashboard.rides.map(ride => <li key={ride.id}>
          <Card className="space-y-3">
            <h3 className="font-semibold">Corrida {shortId(ride.id)}</h3>
            {ride.booking_id && <p className="text-sm text-gray-600">Vinculada ao atendimento {shortId(ride.booking_id)}</p>}
            <ol className="divide-y divide-gray-100">{ride.legs.map(leg => <li key={leg.id} className="space-y-1 py-2">
              <p className="font-medium">{leg.origin} → {leg.destination}</p>
              <p className="text-sm">{formatDateTime(leg.pickup_at) || 'Saída imediata'} · {mobilityLabel(leg.status)}</p>
              <p className="text-sm text-gray-600">Tarifa cotada {amount(leg.fare_cents)} · Motorista {amount(leg.driver_cents)} · Plataforma {amount(leg.fee_cents)}</p>
              <p className="text-sm text-gray-600">Pagador: {leg.payer === 'provider' ? 'prestador' : leg.payer === 'client' ? 'cliente do serviço' : 'passageiro'} · Adicionais autorizados {amount(leg.extras_cents)} · Limite {amount(leg.limit_cents)}</p>
              {leg.status === 'unknown' && <ResolveLeg busy={busy} resolve={to => {
                void run(`resolve:${leg.id}:${to}`, key => resolveRide(leg.id, to, key));
              }} />}
              {['completed', 'cancelled', 'unknown'].includes(leg.status) && <>
                <button type="button" className={secondaryButton} aria-expanded={ledgerLeg === leg.id}
                  onClick={() => setLedgerLeg(ledgerLeg === leg.id ? null : leg.id)}>
                  {ledgerLeg === leg.id ? 'Fechar conciliação' : 'Conciliar trecho'}
                </button>
                {ledgerLeg === leg.id && <RideLedgerPanel key={leg.id} legId={leg.id} />}
              </>}
            </li>)}</ol>
          </Card>
        </li>)}</ul>
      </section>
  </>;
}

export default function Operacao() {
  return <DriverConsole title="Operação de corridas" content={OperationsPanel} />;
}
