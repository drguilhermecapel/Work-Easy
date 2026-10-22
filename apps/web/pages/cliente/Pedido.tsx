import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, MessageCircle, Search, Send } from 'lucide-react';
import { OCCUPATIONS, findArea, findOccupation } from '../../catalog';
import { searchOccupations } from '../../utils/search';
import { useAuth } from '../../contexts/AuthContext';
import { features } from '../../config/features';
import { DEFAULT_CITY, LOCAL_NEIGHBORHOODS } from '../../config/neighborhoods';
import { backendEnabled } from '../../lib/supabase';
import { AppError } from '../../lib/errors';
import { toE164BR } from '../../lib/phone';
import { useAsync } from '../../lib/useAsync';
import { clearRequestDraft, readRequestDraft, saveRequestDraft } from '../../lib/requestDraft';
import { DESCRIPTION_MAX, DESCRIPTION_MIN, createRequest } from '../../services/requests';
import { listNeighborhoods } from '../../services/neighborhoods';
import { updateProfile } from '../../services/account';
import BackendNotice from '../../components/BackendNotice';
import ErrorAlert from '../../components/ErrorAlert';
import TermsGate from '../../components/TermsGate';
import { buildConciergeMessage, conciergeLink } from './concierge';

const STEPS = ['O que você precisa', 'Bairro', 'Descrição e quando', 'Contato'] as const;

interface Draft {
  occupationSlug: string;
  /** Neighborhood id (backend) or slug (concierge list). */
  neighborhood: string;
  description: string;
  when: string;
  urgent: boolean;
}

interface NeighborhoodOption {
  value: string;
  name: string;
  zone: string;
}

const EMPTY_DRAFT: Draft = { occupationSlug: '', neighborhood: '', description: '', when: '', urgent: false };

/** The stored draft, keeping only fields of the right type. */
const readDraft = (): Partial<Draft> => {
  const stored = readRequestDraft();
  const draft: Partial<Draft> = {};
  for (const key of ['occupationSlug', 'neighborhood', 'description', 'when'] as const) {
    if (typeof stored[key] === 'string') draft[key] = stored[key];
  }
  if (typeof stored.urgent === 'boolean') draft.urgent = stored.urgent;
  return draft;
};

const initialDraft = (servico: string | null): Draft => {
  const stored = { ...EMPTY_DRAFT, ...readDraft() };
  const fromLink = findOccupation(servico);
  return fromLink ? { ...stored, occupationSlug: fromLink.slug } : stored;
};

const LOCAL_OPTIONS: NeighborhoodOption[] = LOCAL_NEIGHBORHOODS.map(n => ({ value: n.slug, name: n.name, zone: n.zone }));

const groupByZone = (options: NeighborhoodOption[]): Array<[zone: string, options: NeighborhoodOption[]]> => {
  const groups = new Map<string, NeighborhoodOption[]>();
  for (const option of options) {
    const zone = option.zone || 'Outros';
    groups.set(zone, [...(groups.get(zone) ?? []), option]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
};

const inputClass =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base bg-white focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:border-primary';
const primaryButton =
  'inline-flex items-center justify-center gap-2 bg-primary text-white text-sm font-semibold rounded-xl px-4 py-3 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed';
const secondaryButton =
  'inline-flex items-center justify-center gap-1 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl px-4 py-3 hover:bg-gray-50';

const Pedido: React.FC = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const online = backendEnabled && auth.mode === 'backend';
  const conciergeNumber = features.conciergeWhatsApp;

  const [draft, setDraft] = useState<Draft>(() => initialDraft(params.get('servico')));
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState('');
  const [contactName, setContactName] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const remote = useAsync(() => (online ? listNeighborhoods() : Promise.resolve([])), online ? 'remote' : 'local');
  const options: NeighborhoodOption[] = useMemo(
    () => (online ? (remote.data ?? []).map(n => ({ value: n.id, name: n.name, zone: n.zone ?? '' })) : LOCAL_OPTIONS),
    [online, remote.data],
  );

  useEffect(() => saveRequestDraft(draft), [draft]);

  useEffect(() => {
    if (step > 0) headingRef.current?.focus();
  }, [step]);

  if (!online && !conciergeNumber) {
    const chosen = findOccupation(draft.occupationSlug);
    return (
      <BackendNotice title="Pedido online ainda não disponível">
        <p>Nesta versão de demonstração, ainda não é possível fazer pedidos pelo app.</p>
        <p>Você pode conhecer as categorias e as regras de cada serviço enquanto isso.</p>
        {chosen && (
          <p>
            <Link to={`/search?q=${encodeURIComponent(chosen.name)}`} className="text-primary underline">
              Ver profissionais de demonstração de {chosen.name}
            </Link>
          </p>
        )}
      </BackendNotice>
    );
  }

  const occupation = findOccupation(draft.occupationSlug);
  const neighborhood = options.find(o => o.value === draft.neighborhood);
  const matches = searchOccupations(OCCUPATIONS, query, 8);
  const update = (changes: Partial<Draft>) => setDraft(d => ({ ...d, ...changes }));
  const descriptionLength = draft.description.trim().length;

  const name = contactName ?? auth.profile?.full_name ?? '';
  const phone = contactPhone ?? auth.profile?.phone ?? '';

  const validate = (index: number): string | null => {
    if (index === 0 && !occupation) return 'Escolha o serviço que você precisa.';
    if (index === 1 && !neighborhood) return 'Escolha o bairro onde o serviço será feito.';
    if (index === 2 && (descriptionLength < DESCRIPTION_MIN || descriptionLength > DESCRIPTION_MAX))
      return `Descreva o que precisa com ${DESCRIPTION_MIN} a ${DESCRIPTION_MAX} caracteres.`;
    return null;
  };

  const goNext = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validate(step);
    setStepError(problem);
    if (!problem) setStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setStepError(null);
    setError(null);
    setStep(s => Math.max(s - 1, 0));
  };

  const submitOnline = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth.authUser || !occupation || !neighborhood) return;
    setBusy(true);
    setError(null);
    try {
      const normalizedPhone = phone.trim() ? toE164BR(phone) : null;
      if (phone.trim() && !normalizedPhone) throw new AppError('invalid_phone');
      const profile = auth.profile;
      if (profile && (name.trim() !== (profile.full_name ?? '') || (normalizedPhone ?? '') !== (profile.phone ?? ''))) {
        await updateProfile(auth.authUser.id, { full_name: name, phone: normalizedPhone });
        auth.refreshProfile?.();
      }
      const request = await createRequest({
        clientId: auth.authUser.id,
        occupationSlug: occupation.slug,
        neighborhoodId: neighborhood.value,
        description: draft.description,
        preferredDates: draft.when,
        urgent: draft.urgent,
      });
      clearRequestDraft();
      navigate(`/pedidos/${request.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const whatsappHref =
    conciergeNumber && occupation && neighborhood
      ? conciergeLink(
          conciergeNumber,
          buildConciergeMessage({
            occupationName: occupation.name,
            neighborhoodName: neighborhood.name,
            city: DEFAULT_CITY,
            description: draft.description,
            when: draft.when,
            urgent: draft.urgent,
            name,
          }),
        )
      : null;

  const backButton =
    step > 0 ? (
      <button type="button" className={secondaryButton} onClick={goBack}>
        <ChevronLeft size={16} aria-hidden="true" /> Voltar
      </button>
    ) : (
      <span />
    );

  const stepAlert = stepError ? (
    <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">
      {stepError}
    </p>
  ) : null;

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Pedir um serviço</h1>
        <p className="text-sm text-gray-500 mt-1">
          {online
            ? 'Conte o que você precisa. Profissionais que atendem o seu bairro podem mandar propostas.'
            : 'Conte o que você precisa. O pedido vai pelo WhatsApp para a operação do WorkEasy.'}
        </p>
      </header>

      <ol className="grid grid-cols-4 gap-1.5" aria-label="Etapas do pedido">
        {STEPS.map((label, index) => (
          <li key={label} aria-current={index === step ? 'step' : undefined} className="min-w-0">
            <span className={`block h-1.5 rounded-full ${index <= step ? 'bg-primary' : 'bg-gray-200'}`} aria-hidden="true" />
            <span className={`block text-[11px] mt-1 truncate ${index === step ? 'text-primary font-semibold' : 'text-gray-400'}`}>
              {index + 1}. {label}
            </span>
          </li>
        ))}
      </ol>

      <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs">
        <h2 ref={headingRef} tabIndex={-1} className="font-bold text-gray-800 mb-4 outline-hidden">
          Etapa {step + 1} de {STEPS.length}: {STEPS[step]}
        </h2>

        {step === 0 && (
          <form onSubmit={goNext} className="space-y-4" noValidate>
            {occupation && (
              <p className="flex items-center gap-2 text-sm bg-primary/5 border border-primary/20 rounded-lg p-3">
                <Check size={16} className="text-primary shrink-0" aria-hidden="true" />
                <span>
                  Serviço escolhido: <strong>{occupation.name}</strong>
                  {findArea(occupation.areaSlug) && <span className="text-gray-500"> · {findArea(occupation.areaSlug)?.name}</span>}
                </span>
              </p>
            )}
            <div>
              <label htmlFor="pedido-busca" className="block text-sm font-medium text-gray-700 mb-1">
                {occupation ? 'Trocar o serviço' : 'O que você precisa?'}
              </label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  id="pedido-busca"
                  type="search"
                  className={`${inputClass} pl-9`}
                  placeholder="Ex.: faxina, encanador, aula de inglês"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
            {query.trim().length >= 2 &&
              (matches.length > 0 ? (
                <ul className="space-y-2" aria-label="Serviços encontrados">
                  {matches.map(o => (
                    <li key={o.slug}>
                      <button
                        type="button"
                        aria-pressed={draft.occupationSlug === o.slug}
                        onClick={() => {
                          update({ occupationSlug: o.slug });
                          setQuery('');
                          setStepError(null);
                        }}
                        className={`w-full text-left border rounded-xl px-3 py-2.5 text-sm ${
                          draft.occupationSlug === o.slug ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/50'
                        }`}
                      >
                        <span className="font-medium text-gray-800">{o.name}</span>
                        <span className="block text-xs text-gray-500">{findArea(o.areaSlug)?.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">
                  Nenhum serviço encontrado. Tente outra palavra ou veja as{' '}
                  <Link to="/categorias" className="text-primary underline">categorias</Link>.
                </p>
              ))}
            {stepAlert}
            <div className="flex justify-between gap-3">
              {backButton}
              <button type="submit" className={primaryButton}>Continuar</button>
            </div>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={goNext} className="space-y-4" noValidate>
            <div>
              <label htmlFor="pedido-bairro" className="block text-sm font-medium text-gray-700 mb-1">
                Bairro onde o serviço será feito ({DEFAULT_CITY})
              </label>
              {online && remote.loading && !remote.data ? (
                <p role="status" className="text-sm text-gray-400">Carregando bairros…</p>
              ) : (
                <select
                  id="pedido-bairro"
                  className={inputClass}
                  value={neighborhood ? draft.neighborhood : ''}
                  onChange={e => {
                    update({ neighborhood: e.target.value });
                    setStepError(null);
                  }}
                >
                  <option value="">Escolha o bairro</option>
                  {groupByZone(options).map(([zone, list]) => (
                    <optgroup key={zone} label={zone === 'Centro' || zone === 'Outros' ? zone : `Zona ${zone}`}>
                      {list.map(o => (
                        <option key={o.value} value={o.value}>{o.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              <ErrorAlert error={online ? remote.error : null} className="mt-2" />
            </div>
            {stepAlert}
            <div className="flex justify-between gap-3">
              {backButton}
              <button type="submit" className={primaryButton}>Continuar</button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={goNext} className="space-y-4" noValidate>
            <div>
              <label htmlFor="pedido-descricao" className="block text-sm font-medium text-gray-700 mb-1">
                Descreva o que você precisa
              </label>
              <textarea
                id="pedido-descricao"
                className={`${inputClass} min-h-32`}
                maxLength={DESCRIPTION_MAX}
                placeholder="Ex.: limpeza de apartamento de 2 quartos, com janelas."
                value={draft.description}
                onChange={e => update({ description: e.target.value })}
                aria-describedby="pedido-descricao-ajuda"
              />
              <p id="pedido-descricao-ajuda" className="text-xs text-gray-500 mt-1">
                {descriptionLength}/{DESCRIPTION_MAX} caracteres, mínimo {DESCRIPTION_MIN}. Não coloque telefone, endereço completo
                nem dados de saúde.
              </p>
            </div>
            <div>
              <label htmlFor="pedido-quando" className="block text-sm font-medium text-gray-700 mb-1">
                Quando? <span className="font-normal text-gray-400">(opcional)</span>
              </label>
              <input
                id="pedido-quando"
                className={inputClass}
                maxLength={200}
                placeholder="Ex.: sábado de manhã, ou a partir de 20/10"
                value={draft.when}
                onChange={e => update({ when: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={draft.urgent} onChange={e => update({ urgent: e.target.checked })} />
              É urgente
            </label>
            {stepAlert}
            <div className="flex justify-between gap-3">
              {backButton}
              <button type="submit" className={primaryButton}>Continuar</button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 bg-gray-50 rounded-xl p-3">
              <dt className="text-gray-500">Serviço</dt>
              <dd className="text-gray-800">{occupation?.name}</dd>
              <dt className="text-gray-500">Bairro</dt>
              <dd className="text-gray-800">{neighborhood?.name}</dd>
              {draft.when.trim() && (
                <>
                  <dt className="text-gray-500">Quando</dt>
                  <dd className="text-gray-800">{draft.when}</dd>
                </>
              )}
              {draft.urgent && (
                <>
                  <dt className="text-gray-500">Urgência</dt>
                  <dd className="text-gray-800">Urgente</dd>
                </>
              )}
              <dt className="text-gray-500">Descrição</dt>
              <dd className="text-gray-800 whitespace-pre-line break-words">{draft.description.trim()}</dd>
            </dl>

            {!online && (
              <>
                <div>
                  <label htmlFor="pedido-nome" className="block text-sm font-medium text-gray-700 mb-1">
                    Como podemos te chamar? <span className="font-normal text-gray-400">(opcional)</span>
                  </label>
                  <input
                    id="pedido-nome"
                    className={inputClass}
                    autoComplete="given-name"
                    value={name}
                    onChange={e => setContactName(e.target.value)}
                  />
                </div>
                <p className="text-sm text-gray-600">
                  O botão abre o WhatsApp com a mensagem pronta para a operação do WorkEasy. Nada é enviado até você tocar em
                  enviar no WhatsApp. A operação responde pelo WhatsApp.
                </p>
                <div className="flex justify-between gap-3">
                  {backButton}
                  {whatsappHref && (
                    <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={primaryButton} onClick={clearRequestDraft}>
                      <MessageCircle size={16} aria-hidden="true" /> Abrir o WhatsApp
                    </a>
                  )}
                </div>
              </>
            )}

            {online && auth.loading && <p role="status" className="text-sm text-gray-400">Carregando sua conta…</p>}

            {online && !auth.loading && !auth.isAuthenticated && (
              <>
                <p className="text-sm text-gray-600">
                  Entre na sua conta para enviar o pedido. O que você preencheu fica guardado neste navegador.
                </p>
                <div className="flex justify-between gap-3">
                  {backButton}
                  <Link to={`/entrar?next=${encodeURIComponent('/pedido')}`} className={primaryButton}>
                    Entrar para enviar
                  </Link>
                </div>
              </>
            )}

            {online && !auth.loading && auth.isAuthenticated && auth.authUser && (
              <TermsGate userId={auth.authUser.id}>
                <form onSubmit={submitOnline} className="space-y-4" noValidate>
                  <div>
                    <label htmlFor="pedido-nome" className="block text-sm font-medium text-gray-700 mb-1">Seu nome</label>
                    <input
                      id="pedido-nome"
                      className={inputClass}
                      autoComplete="name"
                      value={name}
                      onChange={e => setContactName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="pedido-telefone" className="block text-sm font-medium text-gray-700 mb-1">
                      Celular com DDD <span className="font-normal text-gray-400">(opcional)</span>
                    </label>
                    <input
                      id="pedido-telefone"
                      className={inputClass}
                      type="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={e => setContactPhone(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Os profissionais veem o pedido sem o seu telefone e o seu e-mail. As propostas aparecem em Meus pedidos.
                  </p>
                  <ErrorAlert error={error} />
                  <div className="flex justify-between gap-3">
                    {backButton}
                    <button type="submit" className={primaryButton} disabled={busy}>
                      <Send size={16} aria-hidden="true" /> {busy ? 'Enviando…' : 'Enviar pedido'}
                    </button>
                  </div>
                </form>
              </TermsGate>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default Pedido;
