import React, { useState } from 'react';
import { findOccupation } from '../../catalog';
import { formatDateBR, todayInSaoPaulo } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { FUNNEL_EVENTS, getDailyFunnel, getWaitlistSummary, type FunnelEvent } from '../../services/admin';
import ErrorAlert from '../ErrorAlert';
import { Card } from './ui';

// Events of the product by day (admin_funnel_daily) and demand outside the pilot (waiting list).
// A day with nothing has no row, and an empty table says so: zeros are never drawn as a result.

const EVENT_LABELS: Record<FunnelEvent, string> = {
  request_created: 'Pedidos',
  proposal_sent: 'Propostas',
  booking_requested: 'Agend. pedidos',
  booking_accepted: 'Atend. aceitos',
  payment_received: 'Pagamentos',
  review_published: 'Avaliações',
  provider_submitted: 'Cadastros enviados',
  provider_approved: 'Prestadores aprovados',
  occupation_approved: 'Ocupações aprovadas',
  pro_trial_started: 'Testes do Pro',
  pro_subscribed: 'Assinaturas Pro',
};

const WINDOWS = [7, 14, 30] as const;

/** "YYYY-MM-DD" n days before another day (calendar arithmetic, no time zone involved). */
const daysBefore = (day: string, n: number): string => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (date ?? 1) - n)).toISOString().slice(0, 10);
};

export const DailyFunnel: React.FC = () => {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(14);
  const today = todayInSaoPaulo();
  const funnel = useAsync(() => getDailyFunnel(daysBefore(today, days - 1), today), `${today}|${days}`);
  const columns = FUNNEL_EVENTS.filter(event => (funnel.data ?? []).some(row => row.counts[event]));

  return (
    <section aria-labelledby="painel-funil-diario" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="painel-funil-diario" className="text-lg font-bold text-gray-800">Funil por dia</h2>
        <div role="group" aria-label="Período" className="flex gap-2">
          {WINDOWS.map(value => (
            <button
              key={value}
              type="button"
              aria-pressed={days === value}
              onClick={() => setDays(value)}
              className={`text-sm font-semibold px-3 py-1.5 rounded-xl border ${
                days === value ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {value} dias
            </button>
          ))}
        </div>
      </div>
      <ErrorAlert error={funnel.error} />
      <Card>
        {funnel.loading && !funnel.data ? (
          <p role="status" className="text-sm text-gray-500">Carregando…</p>
        ) : !funnel.data || funnel.data.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum evento registrado nos últimos {days} dias.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Eventos do produto por dia, do mais recente ao mais antigo</caption>
              <thead>
                <tr className="text-xs text-gray-500">
                  <th scope="col" className="text-left font-medium py-1 pr-3">Dia</th>
                  {columns.map(event => (
                    <th key={event} scope="col" className="text-right font-medium py-1 pl-3 whitespace-nowrap">
                      {EVENT_LABELS[event]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {funnel.data.map(row => (
                  <tr key={row.day}>
                    <th scope="row" className="text-left font-normal text-gray-700 py-1.5 pr-3 whitespace-nowrap">{formatDateBR(row.day)}</th>
                    {columns.map(event => (
                      <td key={event} className="text-right tabular-nums py-1.5 pl-3">
                        {row.counts[event] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-3">Dias no fuso de Brasília. Só aparecem os dias e as colunas com algum evento.</p>
      </Card>
    </section>
  );
};

export const WaitlistCard: React.FC = () => {
  const summary = useAsync(getWaitlistSummary, 'waitlist');
  return (
    <section aria-labelledby="painel-espera" className="space-y-3">
      <h2 id="painel-espera" className="text-lg font-bold text-gray-800">Lista de espera por bairro</h2>
      <ErrorAlert error={summary.error} />
      <Card>
        {summary.loading && !summary.data ? (
          <p role="status" className="text-sm text-gray-500">Carregando…</p>
        ) : !summary.data || summary.data.length === 0 ? (
          <p className="text-sm text-gray-500">Ninguém pediu um bairro fora do piloto ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Pessoas na lista de espera por bairro e serviço</caption>
            <thead>
              <tr className="text-xs text-gray-500">
                <th scope="col" className="text-left font-medium py-1">Bairro</th>
                <th scope="col" className="text-left font-medium py-1">Serviço</th>
                <th scope="col" className="text-right font-medium py-1">Pessoas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.data.slice(0, 20).map(row => (
                <tr key={`${row.neighborhood_id}|${row.occupation_slug ?? ''}`}>
                  <th scope="row" className="text-left font-normal text-gray-700 py-1.5">{row.neighborhood_name}</th>
                  <td className="text-gray-700 py-1.5">
                    {row.occupation_slug ? (findOccupation(row.occupation_slug)?.name ?? row.occupation_slug) : 'Não informado'}
                  </td>
                  <td className="text-right tabular-nums py-1.5 font-semibold">{row.entries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  );
};
