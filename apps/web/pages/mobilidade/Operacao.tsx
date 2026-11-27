import { RideSafetyAdmin } from '../../components/mobility/safety/RideSafetyAdmin';
import { releaseReservation } from '../../services/driverJourney';
import {DriverCapacityReview} from '../../components/mobility/DriverCapacityReview';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTime, shortId } from '../../components/admin/format';
import { dangerButton, inputClass, primaryButton, secondaryButton } from '../../components/admin/styles';
import { Card, EmptyState, Field } from '../../components/admin/ui';
import { formatCents } from '../../lib/money';
import { formatDateBR, saoPauloDateTime, todayInSaoPaulo } from '../../lib/timezone';
import { resolveCompletedRide, resolveRide, reviewDriver, type RideDashboard } from '../../services/rides';
import { RideSupportQueue } from '../../components/mobility/RideSupport';
import { RouteCases } from '../../components/mobility/RouteCases';
import { RidePspReviews } from '../../components/mobility/RideCheckout';
import { RideLedgerPanel } from '../admin/RideLedgerPanel';
import DriverDossier from './DriverDossier';
import DriverConsole, { type ConsoleActions } from './DriverConsole';
import { mobilityLabel } from './driverLabels';

type DriverReview = RideDashboard['reviews'][number];

const amount = (value: number | null) => (value === null ? '—' : formatCents(value));

function ReviewCard({
  driver,
  busy,
  own,
  review,
}: {
  driver: DriverReview;
  busy: boolean;
  own: boolean;
  review: (approve: boolean, validUntil: string | null) => void;
}) {
  const [expiry, setExpiry] = useState('');
  const today = todayInSaoPaulo();
  return (
    <Card className="space-y-2">
      <h3 className="font-semibold">Motorista {shortId(driver.driver_id)}</h3>
      <p className="text-sm text-gray-700">
        {mobilityLabel(driver.vehicle)} · {mobilityLabel(driver.status)}
        {driver.valid_until && ` · Validade até ${formatDateBR(driver.valid_until)}`}
      </p>
      {own ? (
        <p className="text-sm text-gray-600">Outro administrador deve revisar a sua ficha.</p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (expiry && expiry >= today) review(true, expiry);
          }}
        >
          <Field id={`validade-${driver.driver_id}`} label="Validade da aprovação">
            <input
              type="date"
              id={`validade-${driver.driver_id}`}
              required
              min={today}
              className={inputClass}
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
            />
          </Field>
          <button type="submit" className={primaryButton} disabled={busy || !expiry || expiry < today}>
            Aprovar cadastro
          </button>
          <button
            type="button"
            className={dangerButton}
            disabled={busy || driver.status === 'rejected'}
            onClick={() => review(false, null)}
          >
            Rejeitar cadastro
          </button>
        </form>
      )}
    </Card>
  );
}

interface CompletionProof {
  ref: string;
  boardedAt: string;
  endedAt: string;
}

function ResolveLeg({ busy, resolve }: { busy: boolean; resolve: (proof: CompletionProof | null) => void }) {
  const [outcome, setOutcome] = useState<'' | 'completed' | 'cancelled'>('');
  const [reference, setReference] = useState('');
  const [boarded, setBoarded] = useState('');
  const [ended, setEnded] = useState('');
  const instant = (input: string) => {
    const [day, time] = input.split('T');
    return day && time ? saoPauloDateTime(day, time)?.toISOString() : null;
  };
  const start = instant(boarded);
  const finish = instant(ended);
  const ref = reference.trim();
  const validReference = /^[A-Za-z0-9][A-Za-z0-9_./:-]{3,159}$/.test(ref) && !ref.includes('//');
  const valid = outcome === 'cancelled' || (outcome === 'completed' && validReference && start && finish && finish >= start);
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (outcome === 'cancelled') resolve(null);
        if (valid && outcome === 'completed' && start && finish) resolve({ ref: reference.trim(), boardedAt: start, endedAt: finish });
      }}
    >
      <label className="text-sm font-medium">
        Resultado conferido
        <select className={inputClass} required value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}>
          <option value="">Selecione após conferir a ocorrência</option>
          <option value="completed">Trecho concluído</option>
          <option value="cancelled">Trecho cancelado</option>
        </select>
      </label>
      {outcome === 'completed' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            Referência do comprovante em custódia
            <input
              className={inputClass}
              value={reference}
              required
              minLength={4}
              maxLength={160}
              title="Identificador do comprovante, sem nome, endereço ou descrição da pessoa"
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Embarque confirmado (São Paulo)
            <input
              className={inputClass}
              type="datetime-local"
              step={1}
              required
              value={boarded}
              onChange={(e) => setBoarded(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Desembarque confirmado (São Paulo)
            <input
              className={inputClass}
              type="datetime-local"
              step={1}
              required
              value={ended}
              min={boarded}
              onChange={(e) => setEnded(e.target.value)}
            />
          </label>
        </div>
      )}
      <button className={secondaryButton} disabled={!valid || busy}>
        Registrar resolução
      </button>
    </form>
  );
}

function OperationsPanel({ dashboard, userId, busy, run, reload }: ConsoleActions) {
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [ledgerLeg, setLedgerLeg] = useState<string | null>(null);
  return (
    <>
      {dashboard.quote_enabled && <RouteCases bookingId={null} areas={dashboard.areas} admin />}
      <section aria-label="Revisão de motoristas" className="space-y-2">
        <h2 className="text-lg font-semibold">Revisão de motoristas</h2>
        {dashboard.reviews.length === 0 && <EmptyState>Nenhuma ficha de motorista disponível para revisão.</EmptyState>}
        <ul className="grid sm:grid-cols-2 gap-3">
          {dashboard.reviews.map((driver) => (
            <li key={driver.driver_id}>
              {dashboard.simulation ? (
                <ReviewCard
                  driver={driver}
                  busy={busy}
                  own={driver.driver_id === userId}
                  review={(approve, date) => {
                    void run(`review:${driver.driver_id}:${approve}:${date}`, () => reviewDriver(driver.driver_id, approve, date));
                  }}
                />
              ) : (
                <Card className="space-y-2">
                  <h3 className="font-semibold">Motorista {shortId(driver.driver_id)}</h3>
                  <p className="text-sm">
                    {mobilityLabel(driver.status)} · {mobilityLabel(driver.vehicle)}
                  </p>
                  <button
                    type="button"
                    className={secondaryButton}
                    aria-expanded={reviewing === driver.driver_id}
                    onClick={() => setReviewing(reviewing === driver.driver_id ? null : driver.driver_id)}
                  >
                    {reviewing === driver.driver_id ? 'Fechar dossiê' : 'Abrir dossiê'}
                  </button>
                  {reviewing === driver.driver_id && <DriverDossier driverId={driver.driver_id} onChanged={reload} />}
                </Card>
              )}
              {driver.status==='approved' && driver.driver_id!==userId && <DriverCapacityReview driverId={driver.driver_id}/>}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Viagens e ocorrências" className="space-y-2">
        <h2 className="text-lg font-semibold">Viagens e ocorrências</h2>
        {dashboard.rides.length === 0 && <EmptyState>Nenhuma viagem registrada.</EmptyState>}
        <ul className="space-y-3">
          {dashboard.rides.map((ride) => (
            <li key={ride.id}>
              <Card className="space-y-3">
                <h3 className="font-semibold">Corrida {shortId(ride.id)}</h3>
                {ride.booking_id && <p className="text-sm text-gray-600">Vinculada ao atendimento {shortId(ride.booking_id)}</p>}
                <ol className="divide-y divide-gray-100">
                  {ride.legs.map((leg) => (
                    <li key={leg.id} className="space-y-1 py-2">
                      <p className="font-medium">
                        {leg.origin} → {leg.destination}
                      </p>
                      <p className="text-sm">
                        {formatDateTime(leg.pickup_at) || 'Saída imediata'} · {mobilityLabel(leg.status)}
                      </p>
                      <p className="text-sm text-gray-600">
                        Tarifa cotada {amount(leg.fare_cents)} · Motorista {amount(leg.driver_cents)} · Plataforma {amount(leg.fee_cents)}
                      </p>
                      <p className="text-sm text-gray-600">
                        Pagador: {leg.payer === 'provider' ? 'prestador' : leg.payer === 'client' ? 'cliente do serviço' : 'passageiro'} ·
                        Adicionais autorizados {amount(leg.extras_cents)} · Limite {amount(leg.limit_cents)}
                      </p>
                      {dashboard.dispatch_waves && ride.scheduled_at && leg.can_review_no_show && (
                        <details><summary>Revisar ausência do motorista</summary>
                        <p>Consulte a ocorrência e confirme o contato com o motorista antes de devolver esta reserva ao despacho.</p>
                        <button type="button" className={secondaryButton} disabled={busy}
                          onClick={()=>void run('no-show:'+leg.id,key=>releaseReservation(leg.id,key,true))}>
                          Confirmar ausência após o horário e buscar substituto
                        </button></details>)}
                      {leg.status === 'unknown' && (
                        <ResolveLeg
                          busy={busy}
                          resolve={(proof) => {
                            if (proof)
                              void run(JSON.stringify(['resolve', leg.id, proof]), (key) =>
                                resolveCompletedRide(leg.id, key, proof.ref, proof.boardedAt, proof.endedAt),
                              );
                            else void run(`resolve:${leg.id}:cancelled`, (key) => resolveRide(leg.id, 'cancelled', key));
                          }}
                        />
                      )}
                      {['completed', 'cancelled', 'unknown'].includes(leg.status) && (
                        <>
                          <button
                            type="button"
                            className={secondaryButton}
                            aria-expanded={ledgerLeg === leg.id}
                            onClick={() => setLedgerLeg(ledgerLeg === leg.id ? null : leg.id)}
                          >
                            {ledgerLeg === leg.id ? 'Fechar conciliação' : 'Conciliar trecho'}
                          </button>
                          {ledgerLeg === leg.id && <RideLedgerPanel key={leg.id} legId={leg.id} />}
                        </>
                      )}
                      {!dashboard.simulation && <RidePspReviews legId={leg.id} />}
                    </li>
                  ))}
                </ol>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default function Operacao() {
  const { authUser } = useAuth();
  return (
    <>
      <DriverConsole title="Operação de corridas" content={OperationsPanel} />
      {authUser && <><RideSupportQueue key={authUser.id} /><RideSafetyAdmin/></>}
    </>
  );
}
