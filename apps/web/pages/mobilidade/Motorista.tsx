import { useState } from 'react';
import { DriverLegPoints } from '../../components/mobility/RouteCases';
import DriverSignals, { DriverAlerts } from '../../components/mobility/DriverSignals';
import RequireSession from '../../components/RequireSession';
import { formatDateTime } from '../../components/admin/format';
import { dangerButton, inputClass, primaryButton, secondaryButton } from '../../components/admin/styles';
import { Card, EmptyState, Field } from '../../components/admin/ui';
import { formatCents } from '../../lib/money';
import { formatDateBR, todayInSaoPaulo } from '../../lib/timezone';
import { acceptRideOffer, applyDriver, declineRideOffer, setDriverOnline, transitionRide } from '../../services/rides';
import { markAtPickup } from '../../services/driverDossier';
import DriverDossier from './DriverDossier';
import DriverConsole, { type ConsoleActions } from './DriverConsole';
import { mobilityLabel, VEHICLES, type Vehicle } from './driverLabels';

const NEXT_STEP = {
  accepted: { to: 'arriving', label: 'Indicar saída para o embarque' },
  arriving: { to: 'boarded', label: 'Confirmar embarque' },
  boarded: { to: 'completed', label: 'Confirmar fim do trecho' },
} as const;

function DriverPanel({ dashboard, userId, busy, run, reload }: ConsoleActions) {
  const [vehicle, setVehicle] = useState<Vehicle>('compact');
  const driver = dashboard.driver;
  const valid = driver?.status === 'approved' && driver.valid_until != null && driver.valid_until >= todayInSaoPaulo();
  const assigned = dashboard.rides.flatMap((ride) => ride.legs.filter((leg) => leg.driver_id === userId));
  return (
    <>
      <Card className="space-y-3">
        <h2 className="font-semibold text-gray-900">Cadastro de motorista</h2>
        {driver && (
          <p className="text-sm">
            {mobilityLabel(driver.status)} · {mobilityLabel(driver.vehicle)}
            {driver.valid_until && ` · Validade até ${formatDateBR(driver.valid_until)}`}
          </p>
        )}
        {(!driver || driver.status === 'rejected') && (
          <form
            className="space-y-3 max-w-sm"
            onSubmit={(event) => {
              event.preventDefault();
              void run(`apply:${vehicle}`, () => applyDriver(vehicle));
            }}
          >
            <Field id="tipo-veiculo" label="Categoria do veículo">
              <select id="tipo-veiculo" className={inputClass} value={vehicle} onChange={(e) => setVehicle(e.target.value as Vehicle)}>
                {Object.entries(VEHICLES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <button type="submit" disabled={busy} className={primaryButton}>
              Enviar para revisão
            </button>
          </form>
        )}
        {driver && !dashboard.simulation && <DriverDossier onChanged={reload} />}
        {driver?.status === 'approved' && ((valid && dashboard.dispatch_enabled) || driver.online) && (
          <button
            type="button"
            className={secondaryButton}
            disabled={busy}
            onClick={() => void run(`online:${!driver.online}`, () => setDriverOnline(!driver.online))}
          >
            {driver.online ? 'Parar de receber ofertas' : 'Ficar disponível para ofertas'}
          </button>
        )}
        {driver?.status === 'approved' && !valid && (
          <p className="text-sm text-amber-800">Cadastro vencido. Peça a revisão da validade à operação.</p>
        )}
      </Card>
      {driver && !dashboard.dispatch_enabled && (
        <p role="status" className="text-sm text-gray-700">
          O recebimento de novas ofertas está pausado neste ambiente.
        </p>
      )}
      {valid && driver?.online && dashboard.dispatch_enabled && (
        <section aria-label="Ofertas disponíveis" className="space-y-2">
          <h2 className="text-lg font-semibold">Ofertas disponíveis</h2>
          {!dashboard.simulation && <DriverAlerts />}
          {dashboard.offers.length === 0 && <EmptyState>Nenhuma oferta disponível agora.</EmptyState>}
          <ul className="space-y-2">
            {dashboard.offers.map((offer) => (
              <li key={offer.leg_id}>
                <Card className="space-y-2">
                  <p className="font-semibold">
                    {offer.origin} → {offer.destination}
                  </p>
                  <p className="text-sm">
                    {formatDateTime(offer.pickup_at) || 'Saída imediata'} · Sua parte {formatCents(offer.driver_cents)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={primaryButton}
                      disabled={busy}
                      onClick={() => void run(`accept:${offer.leg_id}`, (key) => acceptRideOffer(offer.leg_id, key))}
                    >
                      Aceitar trecho
                    </button>
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={busy}
                      onClick={() => void run(`decline:${offer.leg_id}`, (key) => declineRideOffer(offer.leg_id, key))}
                    >
                      Recusar oferta
                    </button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      {assigned.length > 0 && (
        <section aria-label="Seus trechos" className="space-y-2">
          <h2 className="text-lg font-semibold">Seus trechos</h2>
          <ul className="space-y-2">
            {assigned.map((leg) => {
              const step = Object.hasOwn(NEXT_STEP, leg.status) ? NEXT_STEP[leg.status as keyof typeof NEXT_STEP] : undefined;
              return (
                <li key={leg.id}>
                  <Card className="space-y-2">
                    <p className="font-semibold">
                      {leg.origin} → {leg.destination}
                    </p>
                    <p className="text-sm">
                      {formatDateTime(leg.pickup_at) || 'Saída imediata'} · {mobilityLabel(leg.status)}
                      {leg.driver_cents !== null && ` · Sua parte ${formatCents(leg.driver_cents)}`}
                    </p>
                    {step && !dashboard.simulation && (
                      <>
                        <DriverLegPoints legId={leg.id} />
                        <DriverSignals legId={leg.id} />
                      </>
                    )}
                    {step && (
                      <div className="flex flex-wrap gap-2">
                        {leg.status === 'arriving' && (
                          <button
                            type="button"
                            disabled={busy}
                            className={secondaryButton}
                            onClick={() => void run(`${leg.id}:at-pickup`, () => markAtPickup(leg.id))}
                          >
                            Cheguei ao local de embarque
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          className={primaryButton}
                          onClick={() => void run(`${leg.id}:${step.to}`, (key) => transitionRide(leg.id, step.to, key))}
                        >
                          {step.label}
                        </button>
                        {leg.can_cancel && leg.status !== 'boarded' && (
                          <button
                            type="button"
                            disabled={busy}
                            className={secondaryButton}
                            onClick={() => void run(`${leg.id}:cancelled`, (key) => transitionRide(leg.id, 'cancelled', key))}
                          >
                            Cancelar trecho
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          className={dangerButton}
                          onClick={() => void run(`${leg.id}:unknown`, (key) => transitionRide(leg.id, 'unknown', key))}
                        >
                          Informar interrupção e pedir apuração
                        </button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

export default function Motorista() {
  return (
    <RequireSession>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <DriverConsole title="Painel do motorista" content={DriverPanel} />
      </div>
    </RequireSession>
  );
}
