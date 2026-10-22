import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';
import { PRICE_UNIT_LABELS } from '../../catalog/labels';
import { formatCents } from '../../lib/money';
import { useAsync } from '../../lib/useAsync';
import { listNeighborhoods } from '../../services/neighborhoods';
import { LIMITS, listCareOccupations, offerShift, searchCaregivers, type ShiftOffer } from '../../services/care';
import type { ProviderSummary } from '../../services/discovery';
import ErrorAlert from '../ErrorAlert';
import CareError from './CareError';
import { NeighborhoodOptions } from './HouseholdForm';
import { inputClass, primaryButton } from './styles';
import { Field } from './ui';

interface Props {
  shiftId: string;
  /** Neighborhood of the household, to start the search there. */
  neighborhoodId: string | null;
  /** Offers already sent for this shift. */
  offers: ShiftOffer[];
  onOffered: (open: number) => void;
}

const REGISTRY_TEXT: Record<string, string> = {
  informed: 'Registro profissional informado pelo cuidador',
  confirmed: 'Registro profissional confirmado pelo WorkEasy',
};

const priceText = (p: ProviderSummary): string | null => {
  if (p.price_min_cents === null) return null;
  const range =
    p.price_max_cents !== null && p.price_max_cents > p.price_min_cents
      ? `${formatCents(p.price_min_cents)} a ${formatCents(p.price_max_cents)}`
      : formatCents(p.price_min_cents);
  return p.unit ? `${range} ${PRICE_UNIT_LABELS[p.unit]}` : range;
};

/** Finds approved caregivers of a care occupation and offers them the shift (offer_shift). */
const CaregiverSearch: React.FC<Props> = ({ shiftId, neighborhoodId, offers, onOffered }) => {
  const occupations = useAsync(() => listCareOccupations(), 'care-occupations');
  const neighborhoods = useAsync(() => listNeighborhoods().catch(() => []), 'neighborhoods');
  const [occupation, setOccupation] = useState('');
  const [neighborhood, setNeighborhood] = useState(neighborhoodId ?? '');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<number | null>(null);

  const slug = occupation || occupations.data?.[0]?.slug || '';
  const found = useAsync(() => (slug ? searchCaregivers(slug, neighborhood || null) : Promise.resolve([])), `${slug}:${neighborhood}`);

  const active = new Set(offers.filter(o => o.status === 'offered' || o.status === 'accepted').map(o => o.provider_id));
  // Offers to a caregiver who declined or let one expire are renewed, not counted again against the limit of the shift
  const known = new Set(offers.map(o => o.provider_id));
  const room = LIMITS.offersPerShift - offers.length;

  const toggle = (id: string) => setChosen(current => (current.includes(id) ? current.filter(x => x !== id) : [...current, id]));

  const send = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const open = await offerShift(shiftId, chosen);
      setDone(open);
      setChosen([]);
      onOffered(open);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (occupations.loading && !occupations.data) return <p role="status" className="text-sm text-gray-400">Carregando…</p>;
  if (occupations.data && occupations.data.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        Ainda não há ocupações de cuidado cadastradas para oferecer plantões. Volte mais tarde.
      </p>
    );
  }

  const results = found.data ?? [];
  const newOnes = chosen.filter(id => !active.has(id));
  const brandNew = newOnes.filter(id => !known.has(id));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        O plantão é oferecido a cuidadores com cadastro aprovado. O primeiro que aceitar fica com ele e as outras ofertas expiram. Cada
        plantão recebe no máximo {LIMITS.offersPerShift} ofertas.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="oferta-ocupacao" label="Tipo de cuidador">
          <select id="oferta-ocupacao" className={inputClass} value={slug} onChange={e => setOccupation(e.target.value)}>
            {(occupations.data ?? []).map(o => (
              <option key={o.slug} value={o.slug}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="oferta-bairro" label="Bairro de atendimento">
          <select id="oferta-bairro" className={inputClass} value={neighborhood} onChange={e => setNeighborhood(e.target.value)}>
            <option value="">Todos os bairros</option>
            <NeighborhoodOptions neighborhoods={neighborhoods.data ?? []} />
          </select>
        </Field>
      </div>

      <ErrorAlert error={found.error} />
      {found.loading && !found.data && <p role="status" className="text-sm text-gray-400">Buscando cuidadores…</p>}
      {found.data && results.length === 0 && (
        <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-4">
          Nenhum cuidador aprovado atende este bairro agora. Tente “Todos os bairros” ou outro tipo de cuidador.
        </p>
      )}

      {results.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-gray-800 mb-1">Escolha para quem oferecer</legend>
          {results.map(p => {
            const already = active.has(p.provider_id);
            const checked = chosen.includes(p.provider_id);
            const price = priceText(p);
            const registry = p.registry_status ? REGISTRY_TEXT[p.registry_status] : undefined;
            const full = !checked && !known.has(p.provider_id) && brandNew.length >= room;
            return (
              <label
                key={p.provider_id}
                className={`flex items-start gap-3 border rounded-xl p-3 text-sm ${already ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'}`}
              >
                <input
                  type="checkbox"
                  className="mt-1 shrink-0"
                  checked={checked || already}
                  disabled={already || full}
                  onChange={() => toggle(p.provider_id)}
                />
                <span className="min-w-0 space-y-0.5">
                  <span className="block font-semibold text-gray-900 break-words">{p.display_name}</span>
                  {already && <span className="block text-xs text-gray-500">Já recebeu a oferta deste plantão</span>}
                  {price && <span className="block text-gray-700">{price}</span>}
                  {registry && <span className="block text-xs text-gray-600">{registry}</span>}
                  {p.bio && <span className="block text-gray-600 line-clamp-2 break-words">{p.bio}</span>}
                  <Link
                    to={`/p/${encodeURIComponent(p.slug)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-xs text-primary underline"
                    onClick={event => event.stopPropagation()}
                  >
                    Ver página do cuidador
                  </Link>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      <CareError error={error} audience="familia" />
      {done !== null && (
        <p role="status" className="text-sm text-green-800 bg-green-50 border border-green-100 rounded-lg p-3">
          Oferta enviada. Agora há {done} {done === 1 ? 'oferta aguardando resposta' : 'ofertas aguardando resposta'}. Volte a esta tela para ver quem
          aceitou.
        </p>
      )}
      <button type="button" className={primaryButton} disabled={busy || newOnes.length === 0} onClick={send}>
        <Send size={14} aria-hidden="true" />{' '}
        {busy ? 'Enviando…' : newOnes.length > 0 ? `Oferecer a ${newOnes.length} ${newOnes.length === 1 ? 'cuidador' : 'cuidadores'}` : 'Escolha ao menos um cuidador'}
      </button>
    </div>
  );
};

export default CaregiverSearch;
