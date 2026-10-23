import React, { useState } from 'react';
import { ShieldAlert, Sparkles } from 'lucide-react';
import { formatDateBR } from '../../lib/timezone';
import { summarizeWeek, type WeekSummary as WeekSummaryData } from '../../services/aiAssist';
import type { Household } from '../../services/care';
import ErrorAlert from '../ErrorAlert';
import { card, primaryButton } from './styles';

/** What the family is told before anything is sent. */
export const WEEK_SUMMARY_NOTICE =
  'Ao pedir o resumo, os relatórios dos últimos 7 dias da casa escolhida são enviados a um serviço de inteligência artificial de terceiros. Os nomes cadastrados da pessoa cuidada e do cuidador são trocados por termos neutros antes do envio, e relatórios que citam saúde não são enviados. O resumo não é guardado, pode conter erros e não é avaliação de saúde: leia os relatórios abaixo. Para qualquer preocupação com a saúde, ligue 192 (SAMU) ou procure um médico.';

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** Why there is no summary, in the family's words. */
const nothingToSummarize = (data: WeekSummaryData): string => {
  if (data.shifts === 0) return 'Não houve plantões iniciados nos últimos 7 dias, então não há o que resumir.';
  if (data.reports_omitted > 0) return 'Os relatórios desta semana citam saúde e não foram enviados à IA. Leia-os abaixo.';
  return 'Nenhum relatório foi enviado nos últimos 7 dias, então não há o que resumir.';
};

const Section: React.FC<{ title: string; items: string[] }> = ({ title, items }) =>
  items.length === 0 ? null : (
    <div>
      <h4 className="font-semibold text-gray-800">{title}</h4>
      <ul className="list-disc pl-5 text-gray-700 space-y-1">
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="break-words">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );

const Result: React.FC<{ data: WeekSummaryData }> = ({ data }) => {
  const notes = [
    data.reports_missing > 0 ? `${plural(data.reports_missing, 'plantão sem relatório enviado', 'plantões sem relatório enviado')}` : null,
    data.reports_omitted > 0
      ? `${plural(data.reports_omitted, 'relatório não enviado à IA', 'relatórios não enviados à IA')} porque ${data.reports_omitted === 1 ? 'cita' : 'citam'} saúde`
      : null,
    data.reports_truncated > 0 ? `${plural(data.reports_truncated, 'plantão ficou', 'plantões ficaram')} de fora por excesso de texto` : null,
  ].filter(Boolean);
  return (
    <div className="space-y-3 text-sm" aria-live="polite">
      <h3 className="font-bold text-gray-900">
        Resumo de {formatDateBR(data.period.from)} a {formatDateBR(data.period.to)}
      </h3>
      {data.summary ? (
        <>
          <p className="text-gray-700 break-words">{data.summary.overview}</p>
          <Section title="Atividades" items={data.summary.activities} />
          <Section title="Rotina" items={data.summary.routine} />
          <Section title="O que combinar ou perguntar ao cuidador" items={data.summary.follow_up} />
          <p className="text-xs text-gray-500">
            Feito a partir de {plural(data.reports_used, 'relatório', 'relatórios')} de {plural(data.shifts, 'plantão', 'plantões')}.
            {notes.length > 0 && ` ${notes.join('; ')}.`}
          </p>
        </>
      ) : (
        <p className="text-gray-700">{nothingToSummarize(data)}</p>
      )}
      {data.health_notice && (
        <p role="note" className="flex items-start gap-2 text-gray-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
          <ShieldAlert size={16} className="text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{data.health_notice}</span>
        </p>
      )}
      <p className="text-xs text-gray-500">{data.notice}</p>
    </div>
  );
};

/**
 * "Resumo da semana" on the family's reports screen: asks the server for a non-clinical summary of
 * the last 7 days of one house. The summary is shown, never stored.
 */
const WeekSummary: React.FC<{ households: Household[] }> = ({ households }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ householdId: string; data: WeekSummaryData } | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (households.length === 0) return null;
  const several = households.length > 1;

  const ask = async (household: Household) => {
    setBusy(household.id);
    setError(null);
    try {
      setResult({ householdId: household.id, data: await summarizeWeek(household.id) });
    } catch (err) {
      setResult(null);
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  const shown = result && households.find(household => household.id === result.householdId);
  return (
    <section aria-labelledby="resumo-semana" className={`${card} space-y-3`}>
      <h2 id="resumo-semana" className="text-lg font-bold text-gray-800 flex items-center gap-2">
        <Sparkles size={18} className="text-primary shrink-0" aria-hidden="true" /> Resumo da semana com IA
      </h2>
      <p role="note" className="text-sm text-gray-700">
        {WEEK_SUMMARY_NOTICE}
      </p>
      <div className="flex flex-wrap gap-3">
        {households.map(household => (
          <button
            key={household.id}
            type="button"
            className={primaryButton}
            disabled={busy !== null}
            aria-label={several ? `Resumo da semana: ${household.name}` : undefined}
            onClick={() => void ask(household)}
          >
            {busy === household.id ? 'Gerando…' : several ? `Resumo da semana · ${household.name}` : 'Resumo da semana'}
          </button>
        ))}
      </div>
      <ErrorAlert error={error} />
      {result && (
        <div className="space-y-1">
          {several && shown && <p className="text-xs text-gray-500">Casa: {shown.name}</p>}
          <Result data={result.data} />
        </div>
      )}
    </section>
  );
};

export default WeekSummary;
