import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileUp } from 'lucide-react';
import { AREAS, findOccupation } from '../../catalog';
import { VERIFICATION_LABELS } from '../../catalog/labels';
import type { VerificationStep } from '../../catalog/types';
import { DEFAULT_CITY } from '../../config/neighborhoods';
import { formatDateBR } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { latestConsents, listConsents, recordConsent } from '../../services/account';
import { listNeighborhoods } from '../../services/neighborhoods';
import {
  DOCUMENT_TYPES,
  addMyNeighborhood,
  becomeProvider,
  deleteProviderDocument,
  getPolicies,
  isSlugAvailable,
  listMyDocuments,
  listMyNeighborhoodIds,
  listMyOccupations,
  removeMyNeighborhood,
  slugify,
  submitForReview,
  updateMyProvider,
  uploadProviderDocument,
} from '../../services/providers';
import { missingStepsOf } from '../../services/proErrors';
import type { ProviderRow } from '../../services/types';
import ErrorAlert from '../../components/ErrorAlert';
import { Badge, Card, ConfirmButton, Field, SectionTitle } from '../../components/pro/ui';
import ProPage from '../../components/pro/ProPage';
import { useProvider, usePro } from '../../components/pro/proContext';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_STYLES,
  PROVIDER_STATUS_HELP,
  PROVIDER_STATUS_LABELS,
  PROVIDER_STATUS_STYLES,
  REGISTRY_STATUS_LABELS,
} from '../../components/pro/labels';
import { requiredSteps, summarizeSteps } from '../../components/pro/pendencies';
import { inputClass, primaryButton, secondaryButton } from '../../components/pro/styles';

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const ACCEPTED_FILES = Object.keys(DOCUMENT_TYPES).join(',');

// ---- Step 1: profile ----------------------------------------------------------

const BecomeProviderForm: React.FC<{ onCreated: () => void }> = ({ onCreated }) => {
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [occupation, setOccupation] = useState('');
  const [registryNumber, setRegistryNumber] = useState('');
  const [registryUf, setRegistryUf] = useState('');
  const [slugCheck, setSlugCheck] = useState<'idle' | 'checking' | 'taken' | 'free'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const policy = useAsync(() => getPolicies(occupation ? [occupation] : []), occupation);
  const requirement = occupation ? policy.data?.[occupation] : undefined;

  const changeName = (value: string) => {
    setDisplayName(value);
    if (!slugTouched) setSlug(slugify(value));
    setSlugCheck('idle');
  };

  const checkSlug = async () => {
    setError(null);
    setSlugCheck('checking');
    try {
      setSlugCheck((await isSlugAvailable(slug)) ? 'free' : 'taken');
    } catch (err) {
      setSlugCheck('idle');
      setError(err);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await becomeProvider({ displayName, slug, occupation, registryNumber, registryUf });
      onCreated();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-label="Criar cadastro de profissional">
      <Field id="cad-nome" label="Nome de exibição" hint="Como os clientes verão você: seu nome ou o nome do seu negócio.">
        <input id="cad-nome" className={inputClass} autoComplete="name" value={displayName} onChange={e => changeName(e.target.value)} />
      </Field>
      <Field id="cad-slug" label="Endereço da sua página" hint="Só letras minúsculas, números e hífens. Sua página fica em /p/ seguido deste endereço, depois da aprovação.">
        <div className="flex gap-2">
          <input
            id="cad-slug"
            className={inputClass}
            autoCapitalize="none"
            autoComplete="off"
            aria-describedby="cad-slug-dica cad-slug-status"
            value={slug}
            onChange={e => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
              setSlugCheck('idle');
            }}
          />
          <button type="button" className={secondaryButton} onClick={checkSlug} disabled={!slug || slugCheck === 'checking'}>
            Verificar
          </button>
        </div>
        <p id="cad-slug-status" role="status" className="text-xs mt-1 text-gray-600">
          {slugCheck === 'checking' && 'Verificando…'}
          {slugCheck === 'taken' && <span className="text-red-700">Este endereço não está disponível. Escolha outro.</span>}
          {slugCheck === 'free' && 'Este endereço está livre. A confirmação final acontece quando você criar o cadastro.'}
        </p>
      </Field>
      <Field id="cad-ocupacao" label="Ocupação principal">
        <select id="cad-ocupacao" className={inputClass} value={occupation} onChange={e => setOccupation(e.target.value)}>
          <option value="">Escolha…</option>
          {AREAS.map(area => (
            <optgroup key={area.slug} label={area.name}>
              {area.occupations.map(item => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      {requirement && (
        <div className="space-y-3 bg-gray-50 border border-gray-100 rounded-xl p-3">
          {requirement.requiresRegistry ? (
            <>
              <p className="text-sm text-gray-700">
                Esta ocupação exige o número do registro
                {requirement.registryName ? ` (${requirement.registryName})` : ''}
                {requirement.regulatorBody ? ` no ${requirement.regulatorBody}` : ''}. Ele fica como informado por você até a equipe do
                WorkEasy confirmar.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Field id="cad-registro" label="Número do registro" className="col-span-2">
                  <input id="cad-registro" className={inputClass} inputMode="text" value={registryNumber} onChange={e => setRegistryNumber(e.target.value)} />
                </Field>
                <Field id="cad-uf" label="UF">
                  <select id="cad-uf" className={inputClass} value={registryUf} onChange={e => setRegistryUf(e.target.value)}>
                    <option value="">UF</option>
                    {UFS.map(uf => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-700">Esta ocupação não pede número de registro profissional.</p>
          )}
        </div>
      )}
      <ErrorAlert error={error} />
      <button type="submit" className={primaryButton} disabled={busy}>
        {busy ? 'Criando…' : 'Criar cadastro'}
      </button>
    </form>
  );
};

const ProfileSummary: React.FC<{ provider: ProviderRow; onSaved: () => void }> = ({ provider, onSaved }) => {
  const [displayName, setDisplayName] = useState(provider.display_name);
  const [bio, setBio] = useState(provider.bio ?? '');
  const [acceptsRequests, setAcceptsRequests] = useState(provider.accepts_platform_requests);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const occupations = useAsync(async () => {
    const list = await listMyOccupations(provider.id);
    return { list, policies: await getPolicies(list.map(item => item.occupation_slug)) };
  }, provider.id);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateMyProvider(provider.id, { display_name: displayName, bio, accepts_platform_requests: acceptsRequests });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">
        Endereço da sua página: <strong>/p/{provider.slug}</strong>.{' '}
        {provider.status === 'approved' ? (
          <Link to={`/p/${provider.slug}`} className="text-primary underline">Ver minha página</Link>
        ) : (
          'Ela fica pública depois da aprovação.'
        )}
      </p>
      <ErrorAlert error={occupations.error} />
      <ul className="space-y-1 text-sm text-gray-700">
        {(occupations.data?.list ?? []).map(item => {
          const policy = occupations.data?.policies[item.occupation_slug];
          return (
            <li key={item.occupation_slug}>
              <strong>{findOccupation(item.occupation_slug)?.name ?? item.occupation_slug}</strong>
              {item.is_primary ? ' (principal)' : ''}
              {item.registry_number && (
                <>
                  {' · '}
                  {policy?.registryName || 'Registro'} {item.registry_number}
                  {item.registry_uf ? `/${item.registry_uf}` : ''}
                </>
              )}{' '}
              <Badge className="bg-gray-100 text-gray-700">{REGISTRY_STATUS_LABELS[item.registry_status]}</Badge>
            </li>
          );
        })}
      </ul>
      <form onSubmit={save} className="space-y-3" noValidate aria-label="Dados da página">
        <Field id="cad-nome" label="Nome de exibição">
          <input id="cad-nome" className={inputClass} value={displayName} onChange={e => setDisplayName(e.target.value)} />
        </Field>
        <Field id="cad-bio" label="Apresentação" hint="Conte sua experiência em poucas linhas (até 2000 caracteres).">
          <textarea id="cad-bio" className={inputClass} rows={3} maxLength={2000} value={bio} onChange={e => setBio(e.target.value)} />
        </Field>
        <div className="flex items-start gap-2">
          <input
            id="cad-aceita-pedidos"
            type="checkbox"
            className="mt-1"
            checked={acceptsRequests}
            onChange={e => setAcceptsRequests(e.target.checked)}
            aria-describedby="cad-aceita-pedidos-dica"
          />
          <div>
            <label htmlFor="cad-aceita-pedidos" className="text-sm font-medium text-gray-700">
              Receber pedidos novos de clientes pelo WorkEasy
            </label>
            <p id="cad-aceita-pedidos-dica" className="text-xs text-gray-500">
              Desmarcado, você deixa de ver e de responder a pedidos novos de clientes. Seus atendimentos e a sua página continuam como estão.
            </p>
          </div>
        </div>
        <ErrorAlert error={error} />
        {saved && <p role="status" className="text-sm text-green-700">Dados salvos.</p>}
        <button type="submit" className={secondaryButton} disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar dados'}
        </button>
      </form>
    </div>
  );
};

// ---- Step 2: neighborhoods ----------------------------------------------------

const NeighborhoodsStep: React.FC<{ providerId: string }> = ({ providerId }) => {
  const all = useAsync(() => listNeighborhoods(), 'neighborhoods');
  const mine = useAsync(() => listMyNeighborhoodIds(providerId), providerId);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const selected = useMemo(() => new Set(mine.data ?? []), [mine.data]);
  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return (all.data ?? []).filter(item => !term || item.name.toLowerCase().includes(term) || (item.zone ?? '').toLowerCase().includes(term));
  }, [all.data, filter]);

  const toggle = async (id: string, on: boolean) => {
    setBusyId(id);
    setError(null);
    try {
      if (on) await addMyNeighborhood(providerId, id);
      else await removeMyNeighborhood(providerId, id);
      mine.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Marque os bairros de {DEFAULT_CITY} em que você atende. Você só recebe pedidos desses bairros.
      </p>
      <ErrorAlert error={all.error ?? mine.error} />
      <ErrorAlert error={error} />
      <p role="status" className="text-sm font-medium text-gray-800">
        {selected.size === 0 ? 'Nenhum bairro escolhido.' : `${selected.size} ${selected.size === 1 ? 'bairro escolhido' : 'bairros escolhidos'}.`}
      </p>
      <Field id="cad-filtro-bairro" label="Buscar bairro">
        <input id="cad-filtro-bairro" className={inputClass} type="search" value={filter} onChange={e => setFilter(e.target.value)} />
      </Field>
      <fieldset className="border border-gray-100 rounded-xl p-3">
        <legend className="text-sm font-medium text-gray-700 px-1">Bairros</legend>
        <div className="max-h-72 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          {visible.map(item => (
            <label key={item.id} className="flex items-center gap-2 py-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                disabled={busyId === item.id || mine.loading}
                onChange={e => toggle(item.id, e.target.checked)}
              />
              <span>
                {item.name}
                {item.zone && <span className="text-gray-400"> · {item.zone}</span>}
              </span>
            </label>
          ))}
          {all.data && visible.length === 0 && <p className="text-sm text-gray-500 py-2">Nenhum bairro encontrado.</p>}
        </div>
      </fieldset>
    </div>
  );
};

// ---- Step 3: documents --------------------------------------------------------

const DocumentsStep: React.FC<{ provider: ProviderRow; userId: string }> = ({ provider, userId }) => {
  const data = useAsync(async () => {
    const occupations = await listMyOccupations(provider.id);
    const policies = await getPolicies(occupations.map(item => item.occupation_slug));
    const documents = await listMyDocuments(provider.id);
    const consents = latestConsents(await listConsents(userId));
    return { occupations, policies, documents, backgroundConsent: consents.background_check?.granted === true };
  }, provider.id);
  const [busyStep, setBusyStep] = useState<VerificationStep | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  const steps = useMemo(
    () => (data.data ? requiredSteps(data.data.occupations, data.data.policies) : []),
    [data.data],
  );
  const summaries = useMemo(() => (data.data ? summarizeSteps(steps, data.data.documents) : []), [data.data, steps]);

  const upload = async (step: VerificationStep, file: File | undefined) => {
    if (!file) return;
    setBusyStep(step);
    setError(null);
    try {
      // The certificate of criminal record is only used with the provider's consent (LGPD)
      if (step === 'antecedentes' && !data.data?.backgroundConsent) await recordConsent(userId, 'background_check', true);
      await uploadProviderDocument({ providerId: provider.id, step, file });
      data.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusyStep(null);
    }
  };

  const remove = async (doc: { id: string; storage_path: string }) => {
    setError(null);
    try {
      await deleteProviderDocument(doc);
      data.reload();
    } catch (err) {
      setError(err);
    }
  };

  if (data.loading && !data.data) return <p role="status" className="text-sm text-gray-400">Carregando os documentos…</p>;

  return (
    <div className="space-y-4">
      <ErrorAlert error={data.error} />
      <ErrorAlert error={error} />
      {data.data && steps.length === 0 && (
        <p className="text-sm text-gray-600">A política da sua ocupação não pede documentos para o cadastro.</p>
      )}
      <p className="text-sm text-gray-600">
        Envie uma foto ou um PDF de até 10 MB para cada item. Os arquivos ficam em um espaço privado, visível só para você e para a equipe
        que analisa o cadastro.
      </p>
      <ul className="space-y-3">
        {summaries.map(item => {
          const docs = (data.data?.documents ?? []).filter(doc => doc.step === item.step);
          const needsConsent = item.step === 'antecedentes' && !data.data?.backgroundConsent;
          const inputId = `doc-${item.step}`;
          return (
            <li key={item.step} className="border border-gray-100 rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-800">{VERIFICATION_LABELS[item.step]}</span>
                <Badge className={DOCUMENT_STATUS_STYLES[item.state]}>
                  {item.state === 'missing' ? 'Não enviado' : DOCUMENT_STATUS_LABELS[item.state]}
                </Badge>
              </div>
              {item.rejectionReason && (
                <p className="text-sm text-red-700">Motivo da recusa: {item.rejectionReason}</p>
              )}
              {item.step === 'registro_profissional' && (
                <p className="text-xs text-gray-500">O número do registro foi informado no passo 1; aqui vai o comprovante.</p>
              )}
              {needsConsent && (
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="mt-1" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} />
                  <span>
                    Autorizo o WorkEasy a usar a certidão de antecedentes para analisar o meu cadastro. Posso retirar a autorização em{' '}
                    <Link to="/conta" className="text-primary underline">Minha conta</Link>.
                  </span>
                </label>
              )}
              {docs.length > 0 && (
                <ul className="text-sm text-gray-600 space-y-1">
                  {docs.map(doc => (
                    <li key={doc.id} className="flex flex-wrap items-center gap-2">
                      <span>
                        Enviado em {formatDateBR(doc.created_at)} · {DOCUMENT_STATUS_LABELS[doc.status]}
                      </span>
                      {doc.status === 'submitted' && (
                        <ConfirmButton
                          label="Remover"
                          question="Remover este arquivo?"
                          confirmLabel="Sim, remover"
                          onConfirm={() => remove(doc)}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <label htmlFor={inputId} className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <FileUp size={16} className="text-primary" aria-hidden="true" />
                  {item.state === 'missing' ? 'Enviar arquivo' : 'Enviar outro arquivo'}
                  <span className="sr-only"> — {VERIFICATION_LABELS[item.step]}</span>
                </label>
                <input
                  id={inputId}
                  type="file"
                  accept={ACCEPTED_FILES}
                  disabled={busyStep !== null || (needsConsent && !consentChecked)}
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white disabled:opacity-50"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    void upload(item.step, file);
                  }}
                />
                {busyStep === item.step && <p role="status" className="text-xs text-gray-500 mt-1">Enviando…</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// ---- Step 4: review -----------------------------------------------------------

const ReviewStep: React.FC<{ provider: ProviderRow; onSubmitted: () => void }> = ({ provider, onSubmitted }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await submitForReview();
      setSent(true);
      onSubmitted();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const missing = error ? missingStepsOf(error) : [];

  return (
    <div className="space-y-3">
      {provider.status === 'draft' ? (
        <>
          <p className="text-sm text-gray-600">
            Quando os bairros e os documentos estiverem prontos, envie o cadastro. A equipe do WorkEasy analisa e você vê a situação aqui.
          </p>
          <ErrorAlert error={error} />
          {missing.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-red-700">
              {missing.map(step => (
                <li key={step}>{VERIFICATION_LABELS[step]}</li>
              ))}
            </ul>
          )}
          <button type="button" className={primaryButton} onClick={submit} disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar para análise'}
          </button>
        </>
      ) : (
        <p className="text-sm text-gray-600">Não há nada para enviar agora. Se a equipe recusar um documento, ele aparece no passo 3 com o motivo.</p>
      )}
      {sent && (
        <p role="status" className="flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2 size={16} aria-hidden="true" /> Cadastro enviado para análise.
        </p>
      )}
    </div>
  );
};

const StatusCard: React.FC<{ provider: ProviderRow }> = ({ provider }) => (
  <Card as="section">
    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-800">
      Situação do cadastro:
      <Badge className={PROVIDER_STATUS_STYLES[provider.status]}>{PROVIDER_STATUS_LABELS[provider.status]}</Badge>
    </p>
    <p className="text-sm text-gray-600 mt-1">{PROVIDER_STATUS_HELP[provider.status]}</p>
  </Card>
);

// ---- Page ---------------------------------------------------------------------

const Steps: React.FC = () => {
  const { provider, refresh, userId } = useProvider();
  return (
    <div className="space-y-5">
      <StatusCard provider={provider} />
      <Card as="section">
        <SectionTitle id="cad-passo-perfil">1. Seu perfil</SectionTitle>
        <ProfileSummary provider={provider} onSaved={refresh} />
      </Card>
      <Card as="section">
        <SectionTitle id="cad-passo-bairros">2. Bairros atendidos</SectionTitle>
        <NeighborhoodsStep providerId={provider.id} />
      </Card>
      <Card as="section">
        <SectionTitle id="cad-passo-documentos">3. Documentos</SectionTitle>
        <DocumentsStep provider={provider} userId={userId} />
      </Card>
      <Card as="section">
        <SectionTitle id="cad-passo-analise">4. Enviar para análise</SectionTitle>
        <ReviewStep provider={provider} onSubmitted={refresh} />
      </Card>
    </div>
  );
};

const Content: React.FC = () => {
  const { provider, refresh } = usePro();
  if (provider) return <Steps />;
  return (
    <Card as="section">
      <SectionTitle id="cad-passo-perfil">1. Seu perfil</SectionTitle>
      <p className="text-sm text-gray-600 mb-4">
        Escolha como você aparece para os clientes e a sua ocupação principal. Depois você escolhe os bairros, envia os documentos que a
        sua ocupação exige e manda o cadastro para análise.
      </p>
      <BecomeProviderForm onCreated={refresh} />
    </Card>
  );
};

const Cadastro: React.FC = () => (
  <ProPage title="Cadastro de profissional" needsProvider={false} banner={false}>
    <Content />
  </ProPage>
);

export default Cadastro;
