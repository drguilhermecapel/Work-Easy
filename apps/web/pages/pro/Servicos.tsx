import React, { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { findOccupation } from '../../catalog';
import { PRICE_UNIT_LABELS } from '../../catalog/labels';
import type { PriceUnit } from '../../catalog/types';
import { AppError } from '../../lib/errors';
import { formatCents } from '../../lib/money';
import { useAsync } from '../../lib/useAsync';
import { getPolicies, listMyOccupations } from '../../services/providers';
import { centsToInput, parseReaisToCents } from '../../services/proFormat';
import { deleteService, listMyServices, saveService, setServiceActive, type ServiceRow } from '../../services/proServices';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import ProPage from '../../components/pro/ProPage';
import { useProvider } from '../../components/pro/proContext';
import { Badge, Card, ConfirmButton, EmptyState, Field, SectionTitle } from '../../components/pro/ui';
import { inputClass, primaryButton, secondaryButton } from '../../components/pro/styles';

interface Draft {
  id?: string;
  occupation: string;
  title: string;
  description: string;
  priceMin: string;
  priceMax: string;
  unit: PriceUnit | '';
  duration: string;
  active: boolean;
}

const emptyDraft = (occupation: string): Draft => ({
  occupation,
  title: '',
  description: '',
  priceMin: '',
  priceMax: '',
  unit: '',
  duration: '',
  active: true,
});

const draftOf = (service: ServiceRow): Draft => ({
  id: service.id,
  occupation: service.occupation_slug,
  title: service.title,
  description: service.description ?? '',
  priceMin: centsToInput(service.price_min_cents),
  priceMax: service.price_max_cents === null ? '' : centsToInput(service.price_max_cents),
  unit: service.unit,
  duration: service.duration_minutes === null ? '' : String(service.duration_minutes),
  active: service.active,
});

const priceText = (service: Pick<ServiceRow, 'price_min_cents' | 'price_max_cents' | 'unit'>): string => {
  const { price_min_cents: min, price_max_cents: max } = service;
  const range = max !== null && max !== min ? `${formatCents(min)} a ${formatCents(max)}` : formatCents(min);
  return `${range} ${PRICE_UNIT_LABELS[service.unit]}`;
};

const toInput = (providerId: string, draft: Draft) => {
  const min = parseReaisToCents(draft.priceMin);
  if (min === null) throw new AppError('invalid_input', { message: 'Informe o preço em reais, por exemplo 150,00.' });
  const max = draft.priceMax.trim() ? parseReaisToCents(draft.priceMax) : null;
  if (draft.priceMax.trim() && max === null) throw new AppError('invalid_input', { message: 'Confira o preço máximo, por exemplo 200,00.' });
  if (!draft.unit) throw new AppError('invalid_input', { message: 'Escolha a unidade do preço.' });
  const duration = draft.duration.trim() ? Number(draft.duration) : null;
  return {
    id: draft.id,
    providerId,
    occupationSlug: draft.occupation,
    title: draft.title,
    description: draft.description,
    priceMinCents: min,
    priceMaxCents: max,
    unit: draft.unit,
    durationMinutes: duration,
    active: draft.active,
  };
};

const ServiceForm: React.FC<{ providerId: string; initial: Draft; occupations: string[]; onDone: () => void; onCancel: () => void }> = ({
  providerId,
  initial,
  occupations,
  onDone,
  onCancel,
}) => {
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const policies = useAsync(() => getPolicies([draft.occupation]), draft.occupation);
  const allowed = policies.data?.[draft.occupation]?.priceUnits;
  // Without a known policy every unit is offered and the database has the last word (unit_not_allowed)
  const units = (allowed && allowed.length > 0 ? allowed : (Object.keys(PRICE_UNIT_LABELS) as PriceUnit[]));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveService(toInput(providerId, draft));
      onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-label={draft.id ? 'Editar serviço' : 'Novo serviço'}>
      {occupations.length > 1 && (
        <Field id="srv-ocupacao" label="Ocupação">
          <select
            id="srv-ocupacao"
            className={inputClass}
            value={draft.occupation}
            onChange={e => setDraft(current => ({ ...current, occupation: e.target.value, unit: '' }))}
          >
            {occupations.map(slug => (
              <option key={slug} value={slug}>
                {findOccupation(slug)?.name ?? slug}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field id="srv-titulo" label="Nome do serviço">
        <input id="srv-titulo" className={inputClass} value={draft.title} onChange={e => set('title', e.target.value)} />
      </Field>
      <Field id="srv-descricao" label="Descrição (opcional)">
        <textarea id="srv-descricao" className={inputClass} rows={3} maxLength={2000} value={draft.description} onChange={e => set('description', e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field id="srv-preco-min" label="Preço (R$)">
          <input id="srv-preco-min" className={inputClass} inputMode="decimal" placeholder="150,00" value={draft.priceMin} onChange={e => set('priceMin', e.target.value)} />
        </Field>
        <Field id="srv-preco-max" label="Preço máximo (R$, opcional)">
          <input id="srv-preco-max" className={inputClass} inputMode="decimal" placeholder="200,00" value={draft.priceMax} onChange={e => set('priceMax', e.target.value)} />
        </Field>
        <Field id="srv-unidade" label="Cobrado">
          <select id="srv-unidade" className={inputClass} value={draft.unit} onChange={e => set('unit', e.target.value as PriceUnit)}>
            <option value="">Escolha…</option>
            {units.map(unit => (
              <option key={unit} value={unit}>
                {PRICE_UNIT_LABELS[unit]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {allowed && allowed.length > 0 && (
        <p className="text-xs text-gray-500">Para esta ocupação, o preço pode ser cobrado: {allowed.map(unit => PRICE_UNIT_LABELS[unit]).join(', ')}.</p>
      )}
      <Field id="srv-duracao" label="Duração em minutos (opcional)" hint="De 5 minutos a 24 horas (1440).">
        <input id="srv-duracao" className={inputClass} inputMode="numeric" value={draft.duration} onChange={e => set('duration', e.target.value.replace(/\D/g, ''))} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-gray-800">
        <input type="checkbox" checked={draft.active} onChange={e => set('active', e.target.checked)} /> Serviço ativo (aparece na sua página)
      </label>
      <ErrorAlert error={error} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar serviço'}
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
};

const Services: React.FC = () => {
  const { provider } = useProvider();
  const data = useAsync(async () => ({ services: await listMyServices(provider.id), occupations: await listMyOccupations(provider.id) }), provider.id);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (data.loading && !data.data) return <PageStatus />;
  const occupations = (data.data?.occupations ?? []).map(item => item.occupation_slug);
  const primary = data.data?.occupations.find(item => item.is_primary)?.occupation_slug ?? occupations[0] ?? '';

  const act = async (run: () => Promise<void>) => {
    setError(null);
    try {
      await run();
      data.reload();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="space-y-5">
      <ErrorAlert error={data.error} />
      <ErrorAlert error={error} />
      {editing ? (
        <Card as="section">
          <SectionTitle id="srv-form">{editing.id ? 'Editar serviço' : 'Novo serviço'}</SectionTitle>
          <ServiceForm
            providerId={provider.id}
            initial={editing}
            occupations={occupations}
            onCancel={() => setEditing(null)}
            onDone={() => {
              setEditing(null);
              data.reload();
            }}
          />
        </Card>
      ) : (
        <button type="button" className={primaryButton} onClick={() => setEditing(emptyDraft(primary))} disabled={!primary}>
          <Plus size={16} aria-hidden="true" /> Novo serviço
        </button>
      )}
      {data.data && data.data.services.length === 0 && !editing && (
        <EmptyState>
          Você ainda não cadastrou serviços. Os serviços com preço aparecem na sua página e nas buscas depois da aprovação do cadastro.
        </EmptyState>
      )}
      <ul className="space-y-3">
        {(data.data?.services ?? []).map(service => (
          <Card as="li" key={service.id}>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="font-bold text-gray-900 break-words min-w-0">{service.title}</h2>
              <Badge className={service.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>{service.active ? 'Ativo' : 'Desativado'}</Badge>
            </div>
            <p className="text-sm text-gray-700">
              {findOccupation(service.occupation_slug)?.name ?? service.occupation_slug} · {priceText(service)}
              {service.duration_minutes ? ` · ${service.duration_minutes} min` : ''}
            </p>
            {service.description && <p className="text-sm text-gray-500 mt-1 break-words">{service.description}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" className={secondaryButton} onClick={() => setEditing(draftOf(service))} aria-label={`Editar ${service.title}`}>
                <Pencil size={14} aria-hidden="true" /> Editar
              </button>
              <button
                type="button"
                className={secondaryButton}
                onClick={() => act(() => setServiceActive(service.id, !service.active))}
                aria-label={`${service.active ? 'Desativar' : 'Ativar'} ${service.title}`}
              >
                {service.active ? 'Desativar' : 'Ativar'}
              </button>
              <ConfirmButton
                label="Excluir"
                question={`Excluir ${service.title}?`}
                confirmLabel="Sim, excluir"
                onConfirm={() => act(() => deleteService(service.id))}
              />
            </div>
          </Card>
        ))}
      </ul>
    </div>
  );
};

const Servicos: React.FC = () => (
  <ProPage title="Serviços e preços">
    <Services />
  </ProPage>
);

export default Servicos;
