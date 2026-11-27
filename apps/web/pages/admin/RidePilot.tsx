import { useEffect, useState } from 'react';
import { Card, Field } from '../../components/admin/ui';
import { inputClass, primaryButton } from '../../components/admin/styles';
import { db } from '../../services/client';
import { formatCents } from '../../lib/money';

type Row = {
  month: string;
  market: string;
  stratum: string;
  arm: string;
  eligible: number;
  closed: number;
  completed: number;
  cents_per_eligible: number | null;
  minutes_per_eligible: number | null;
};
type Report = { environment: string; rows: Row[] };
const names: Record<string, string> = { offer: 'Com oferta', comparison: 'Comparação', public: 'Avulsas' };
const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

export default function RidePilot() {
  const [report, setReport] = useState<Report | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [msg, setMsg] = useState('');
  const [key, setKey] = useState('');
  const [market, setMarket] = useState('services');
  const [stratum, setStratum] = useState('');
  const [completed, setCompleted] = useState(false);
  const [margin, setMargin] = useState('');
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void db()
      .rpc('ride_pilot_report')
      .then(({ error, data }) => {
        if (!active) return;
        if (error) setMsg('Não foi possível consultar o registro do piloto.');
        else setReport(data as unknown as Report);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  const keyField = (id: string) => (
    <Field id={id} label="Referência da solicitação (UUID do registro de operação)">
      <input
        id={id}
        type="text"
        className={inputClass}
        pattern={uuid}
        value={key}
        onChange={(e) => setKey(e.target.value.trim())}
        required
      />
    </Field>
  );
  async function submit(close: boolean) {
    setBusy(true);
    try {
      if (close) {
        const { error } = await db().rpc('ride_close_observation', {
          p_reference: key,
          p_completed: completed,
          p_margin_cents: Math.round(Number(margin) * 100),
          p_support_minutes: Number(minutes),
        });
        if (error) throw error;
        setMsg('Desfecho registrado.');
      } else {
        const { error, data } = await db().rpc('ride_enroll', {
          p_reference: key,
          p_market: market,
          p_stratum: stratum,
        });
        if (error) throw error;
        setMsg(
          'Grupo atribuído para esta solicitação: ' + (names[String(data)] ?? 'Consulte a operação') + '.',
        );
      }
      setRefresh((n) => n + 1);
    } catch {
      setMsg(
        'Operação recusada. Confira o identificador original, o estado da solicitação e a abertura do piloto.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">Medição do piloto</h1>
      {report?.environment === 'simulation' && (
        <p>Ambiente de ensaio. Os registros desta tela são sintéticos.</p>
      )}
      {msg && <p role="status">{msg}</p>}
      <Card>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
        >
          <h2 className="font-bold">Incluir antes da oferta</h2>
          {keyField('pilot-enroll-key')}
          <Field id="pilot-market" label="Mercado">
            <select
              id="pilot-market"
              className={inputClass}
              value={market}
              onChange={(e) => setMarket(e.target.value)}
            >
              <option value="services">Serviços</option>
              <option value="public">Corridas avulsas</option>
            </select>
          </Field>
          <Field id="pilot-stratum" label="Grupo comparável (categoria, corredor e janela)">
            <input
              id="pilot-stratum"
              className={inputClass}
              maxLength={80}
              required
              value={stratum}
              onChange={(e) => setStratum(e.target.value)}
            />
          </Field>
          <button className={primaryButton} disabled={busy}>
            Registrar elegibilidade
          </button>
        </form>
      </Card>
      <Card>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(true);
          }}
        >
          <h2 className="font-bold">Encerrar após conciliação</h2>
          {keyField('pilot-close-key')}
          <label>
            <input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.target.checked)} />{' '}
            Serviço ou corrida avulsa concluída
          </label>
          <Field id="pilot-margin" label="Contribuição conciliada, incluindo cancelamentos (R$)">
            <input
              id="pilot-margin"
              className={inputClass}
              type="number"
              step="0.01"
              required
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
            />
          </Field>
          <Field id="pilot-support" label="Minutos de suporte">
            <input
              id="pilot-support"
              className={inputClass}
              type="number"
              min="0"
              step="1"
              required
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </Field>
          <button className={primaryButton} disabled={busy}>
            Registrar desfecho
          </button>
        </form>
      </Card>
      <Card>
        <h2 className="font-bold">Resultados por solicitação elegível</h2>
        {report?.rows.length === 0 && <p>Nenhuma solicitação registrada.</p>}
        {report?.rows.map((row) => (
          <article className="border-t py-3" key={[row.month, row.market, row.stratum, row.arm].join('|')}>
            <h3>
              {row.month} · {row.stratum} · {names[row.arm]}
            </h3>
            <p>
              {row.eligible} elegíveis · {row.closed} desfechos registrados · {row.completed} concluídos
            </p>
            <p>
              {row.cents_per_eligible === null
                ? 'Aguardando conciliação do grupo.'
                : formatCents(Math.round(row.cents_per_eligible)) +
                  ' de contribuição e ' +
                  row.minutes_per_eligible +
                  ' min de suporte por elegível.'}
            </p>
          </article>
        ))}
      </Card>
    </main>
  );
}
