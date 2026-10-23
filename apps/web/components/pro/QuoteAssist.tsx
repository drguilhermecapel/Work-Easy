import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { PRICE_UNIT_LABELS } from '../../catalog/labels';
import { formatCents } from '../../lib/money';
import { useAsync } from '../../lib/useAsync';
import { QUOTE_ASSIST_LIMITS, suggestQuote, type QuoteSuggestion, type ReferencePrice } from '../../services/aiAssist';
import { listMyOccupations } from '../../services/providers';
import { listMyServices, type ServiceRow } from '../../services/proServices';
import ErrorAlert from '../ErrorAlert';
import { inputClass, primaryButton, secondaryButton } from './styles';
import { Field } from './ui';

/** What the provider is told before anything is sent. */
export const QUOTE_ASSIST_NOTICE =
  'O texto que você escrever aqui é enviado a um serviço de inteligência artificial de terceiros, que devolve uma sugestão de itens. Não escreva CPF, telefone, endereço nem dados de saúde de ninguém. A IA pode errar: revise itens, quantidades e preços antes de salvar. Nada é salvo nem enviado ao cliente automaticamente.';

const referenceOf = (service: ServiceRow): ReferencePrice => ({
  label: service.title,
  unit_price_cents: service.price_min_cents,
  unit: service.unit,
});

/** "Pintura de parede · R$ 35,00 por m²"; a range says both ends, and the AI uses the lower one. */
const serviceLabel = (service: ServiceRow): string => {
  const range =
    service.price_max_cents !== null && service.price_max_cents !== service.price_min_cents
      ? `${formatCents(service.price_min_cents)} a ${formatCents(service.price_max_cents)}`
      : formatCents(service.price_min_cents);
  return `${service.title} · ${range} ${PRICE_UNIT_LABELS[service.unit]}`;
};

const Panel: React.FC<{ providerId: string; onApply: (suggestion: QuoteSuggestion) => void; onClose: () => void }> = ({
  providerId,
  onApply,
  onClose,
}) => {
  // The provider's own services are the only source of reference prices; failing to read them only means none are offered
  const context = useAsync(async () => {
    const [services, occupations] = await Promise.all([listMyServices(providerId).catch(() => []), listMyOccupations(providerId).catch(() => [])]);
    return { services: services.filter(service => service.active && service.price_min_cents > 0), occupations };
  }, providerId);
  const [description, setDescription] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [applied, setApplied] = useState('');

  const services = context.data?.services ?? [];
  const occupations = context.data?.occupations ?? [];
  const tooShort = description.trim().length < QUOTE_ASSIST_LIMITS.descriptionMin;

  const toggle = (id: string) => setChosen(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]));

  const ask = async () => {
    setBusy(true);
    setError(null);
    setApplied('');
    try {
      const primary = occupations.find(occupation => occupation.is_primary) ?? occupations[0];
      const suggestion = await suggestQuote({
        description,
        occupationSlug: primary?.occupation_slug ?? null,
        referencePrices: services.filter(service => chosen.includes(service.id)).map(referenceOf),
      });
      onApply(suggestion);
      setApplied(
        `Sugestão aplicada ao orçamento: ${suggestion.items.length} ${suggestion.items.length === 1 ? 'item' : 'itens'}. Revise tudo antes de salvar; preços em branco são para você preencher.`,
      );
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="group" aria-labelledby="orc-ia-titulo" className="space-y-3 border border-purple-100 bg-purple-50/40 rounded-xl p-4">
      <h3 id="orc-ia-titulo" className="font-bold text-gray-800 flex items-center gap-2">
        <Sparkles size={16} className="text-primary" aria-hidden="true" /> Sugestão de itens com IA
      </h3>
      <p role="note" className="text-sm text-gray-700">
        {QUOTE_ASSIST_NOTICE}
      </p>
      <Field
        id="orc-ia-descricao"
        label="Descreva o serviço"
        hint={`De ${QUOTE_ASSIST_LIMITS.descriptionMin} a ${QUOTE_ASSIST_LIMITS.descriptionMax} caracteres. Ex.: pintar sala e corredor, uns 40 m² de parede, duas demãos, material por minha conta.`}
      >
        <textarea
          id="orc-ia-descricao"
          className={inputClass}
          rows={4}
          maxLength={QUOTE_ASSIST_LIMITS.descriptionMax}
          value={description}
          onChange={event => setDescription(event.target.value)}
        />
      </Field>
      {services.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">Preços de referência (opcional)</legend>
          <p className="text-xs text-gray-500">
            Marque os serviços cujo preço a IA pode usar. A IA nunca inventa preços: sem preço de referência, ele fica em branco para você
            preencher. Em faixas de preço, ela usa o menor valor.
          </p>
          {services.map(service => (
            <label key={service.id} className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" className="mt-1" checked={chosen.includes(service.id)} onChange={() => toggle(service.id)} />
              <span>{serviceLabel(service)}</span>
            </label>
          ))}
        </fieldset>
      )}
      <ErrorAlert error={error} />
      {applied && (
        <p role="status" className="text-sm text-green-700">
          {applied}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={primaryButton} disabled={busy || tooShort} onClick={() => void ask()}>
          {busy ? 'Gerando…' : 'Gerar sugestão'}
        </button>
        <button type="button" className={secondaryButton} onClick={onClose}>
          Fechar sugestão
        </button>
      </div>
    </div>
  );
};

/**
 * "Sugerir itens com IA" in the quote form: asks the server for a draft of items from a description
 * and hands it to the form, which the provider edits. Nothing is saved or sent from here.
 */
const QuoteAssist: React.FC<{ providerId: string; onApply: (suggestion: QuoteSuggestion) => void }> = ({ providerId, onApply }) => {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div>
        <button type="button" className={secondaryButton} aria-expanded="false" onClick={() => setOpen(true)}>
          <Sparkles size={16} aria-hidden="true" /> Sugerir itens com IA
        </button>
      </div>
    );
  }
  return <Panel providerId={providerId} onApply={onApply} onClose={() => setOpen(false)} />;
};

export default QuoteAssist;
