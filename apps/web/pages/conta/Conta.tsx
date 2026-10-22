import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CheckCircle2, Download, FileCheck2, LogOut, Trash2, UserRound } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { backendEnabled } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { downloadJson } from '../../lib/download';
import { clearRequestDraft } from '../../lib/requestDraft';
import { formatPhoneBR } from '../../lib/phone';
import { APP_TIME_ZONE, todayInSaoPaulo } from '../../lib/timezone';
import { CONSENT_VERSIONS } from '../../config/legal';
import {
  DELETE_CONFIRMATION,
  deleteMyAccount,
  exportMyData,
  latestConsents,
  listConsents,
  recordConsent,
  updateProfile,
} from '../../services/account';
import type { ConsentPurpose, ConsentRow, ProfileRow } from '../../services/types';
import BackendNotice from '../../components/BackendNotice';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import TermsGate from '../../components/TermsGate';

const card = 'bg-white border border-gray-100 rounded-2xl p-5 shadow-xs';
const inputClass =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:border-primary';
const primaryButton =
  'bg-primary text-white text-sm font-semibold rounded-xl px-4 py-2.5 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed';
const secondaryButton =
  'bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl px-4 py-2.5 hover:bg-gray-50 disabled:opacity-50';

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: APP_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const ROLE_LABELS: Record<ProfileRow['role'], string> = { client: 'Cliente', provider: 'Prestador de serviço' };

// ---- Profile ---------------------------------------------------------------

const ProfileForm: React.FC<{ profile: ProfileRow; onSaved: () => void }> = ({ profile, onSaved }) => {
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [phone, setPhone] = useState(formatPhoneBR(profile.phone));
  const [city, setCity] = useState(profile.city ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfile(profile.id, { full_name: fullName, phone, city });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label htmlFor="conta-nome" className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
        <input id="conta-nome" className={inputClass} autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="conta-telefone" className="block text-sm font-medium text-gray-700 mb-1">Telefone com DDD</label>
          <input
            id="conta-telefone"
            className={inputClass}
            type="tel"
            autoComplete="tel"
            placeholder="(11) 98765-4321"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="conta-cidade" className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
          <input id="conta-cidade" className={inputClass} autoComplete="address-level2" value={city} onChange={e => setCity(e.target.value)} />
        </div>
      </div>
      <div>
        <span className="block text-sm font-medium text-gray-700 mb-1">Tipo de conta</span>
        <p className="text-sm text-gray-800">{ROLE_LABELS[profile.role]}</p>
        <p className="text-xs text-gray-500 mt-1">
          Não é editável aqui. Para oferecer serviços, faça o{' '}
          <Link to="/register-provider" className="text-primary underline">cadastro de profissional</Link>.
        </p>
      </div>
      <ErrorAlert error={error} />
      {saved && <p role="status" className="text-sm text-green-700">Dados salvos.</p>}
      <button type="submit" className={primaryButton} disabled={busy}>
        {busy ? 'Salvando…' : 'Salvar dados'}
      </button>
    </form>
  );
};

// ---- Consents --------------------------------------------------------------

const CONSENTS: Array<{ purpose: ConsentPurpose; title: string; description: string; revocable: boolean }> = [
  {
    purpose: 'terms',
    title: 'Termos de Uso',
    description: 'Regras de uso da plataforma para clientes e profissionais.',
    revocable: false,
  },
  {
    purpose: 'privacy',
    title: 'Política de Privacidade',
    description: 'Como seus dados pessoais são tratados e como exercer seus direitos (LGPD).',
    revocable: false,
  },
  {
    purpose: 'marketing',
    title: 'Comunicações de novidades',
    description: 'Receber novidades e ofertas por WhatsApp ou e-mail. Mensagens sobre seus pedidos não dependem disto.',
    revocable: true,
  },
  {
    purpose: 'background_check',
    title: 'Consulta de antecedentes',
    description: 'Para profissionais cuja ocupação exige certidão de antecedentes criminais no cadastro.',
    revocable: true,
  },
  {
    purpose: 'location',
    title: 'Localização',
    description: 'Usar a localização do aparelho, por exemplo no registro de entrada e saída de plantões.',
    revocable: true,
  },
];

const PURPOSE_TITLES = Object.fromEntries(CONSENTS.map(c => [c.purpose, c.title])) as Record<ConsentPurpose, string>;

const ConsentsSection: React.FC<{ userId: string }> = ({ userId }) => {
  const history = useAsync(() => listConsents(userId), userId);
  const [busyPurpose, setBusyPurpose] = useState<ConsentPurpose | null>(null);
  const [error, setError] = useState<unknown>(null);

  const decide = async (purpose: ConsentPurpose, granted: boolean) => {
    setBusyPurpose(purpose);
    setError(null);
    try {
      await recordConsent(userId, purpose, granted);
      history.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusyPurpose(null);
    }
  };

  if (history.loading && !history.data) return <p role="status" className="text-sm text-gray-400">Carregando consentimentos…</p>;
  if (history.error && !history.data) return <ErrorAlert error={history.error} />;

  const rows: ConsentRow[] = history.data ?? [];
  const latest = latestConsents(rows);

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-gray-100">
        {CONSENTS.map(({ purpose, title, description, revocable }) => {
          const current = latest[purpose];
          const outdated = current?.granted && current.version !== CONSENT_VERSIONS[purpose];
          const status = !current
            ? 'Sem registro'
            : current.granted
              ? `Aceito em ${formatDateTime(current.at)} (versão ${current.version})`
              : `Recusado em ${formatDateTime(current.at)}`;
          return (
            <li key={purpose} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div className="min-w-0">
                <p className="font-medium text-gray-800">{title}</p>
                <p className="text-xs text-gray-500">{description}</p>
                <p className="text-xs text-gray-700 mt-1">
                  {status}
                  {outdated && ' · há uma versão nova'}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {(!current?.granted || outdated) && (
                  <button type="button" className={secondaryButton} disabled={busyPurpose !== null} onClick={() => decide(purpose, true)}>
                    {outdated ? 'Aceitar versão nova' : 'Aceitar'}
                  </button>
                )}
                {revocable && current?.granted && (
                  <button type="button" className={secondaryButton} disabled={busyPurpose !== null} onClick={() => decide(purpose, false)}>
                    Revogar
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <ErrorAlert error={error} />
      <details className="text-sm">
        <summary className="cursor-pointer text-primary">Histórico de consentimentos ({rows.length})</summary>
        {rows.length === 0 ? (
          <p className="text-gray-500 mt-2">Nenhum registro ainda.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-gray-700">
            {rows.map(row => (
              <li key={row.id} className="text-xs">
                {formatDateTime(row.at)}: {PURPOSE_TITLES[row.purpose] ?? row.purpose}, {row.granted ? 'aceito' : 'recusado'} (versão{' '}
                {row.version})
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
};

// ---- Data export and deletion ---------------------------------------------

const ExportSection: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const data = await exportMyData();
      downloadJson(data, `workeasy-meus-dados-${todayInSaoPaulo()}.json`);
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Um arquivo JSON com os dados pessoais que a plataforma guarda sobre você, para guardar ou levar a outro serviço.
      </p>
      <ErrorAlert error={error} />
      {done && <p role="status" className="text-sm text-green-700">Arquivo gerado. Confira seus downloads.</p>}
      <button type="button" className={`${secondaryButton} inline-flex items-center gap-2`} onClick={run} disabled={busy}>
        <Download size={16} aria-hidden="true" /> {busy ? 'Gerando arquivo…' : 'Baixar meus dados'}
      </button>
    </div>
  );
};

const DeleteSection: React.FC<{ onDeleted: () => void }> = ({ onDeleted }) => {
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const confirmed = confirmation === DELETE_CONFIRMATION;

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount(confirmation);
      onDeleted();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={run} className="space-y-3">
      <p className="text-sm text-gray-600">
        Seus dados pessoais são apagados e você sai do app. Pagamentos e atendimentos já realizados continuam registrados de
        forma anonimizada, sem seu nome e contatos, porque a lei fiscal obriga a guardar esses registros.
      </p>
      <div>
        <label htmlFor="conta-excluir" className="block text-sm font-medium text-gray-700 mb-1">
          Para confirmar, digite {DELETE_CONFIRMATION}
        </label>
        <input
          id="conta-excluir"
          className={inputClass}
          autoComplete="off"
          autoCapitalize="characters"
          value={confirmation}
          onChange={e => setConfirmation(e.target.value)}
        />
      </div>
      <ErrorAlert error={error} />
      <button
        type="submit"
        className="inline-flex items-center gap-2 bg-red-600 text-white text-sm font-semibold rounded-xl px-4 py-2.5 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!confirmed || busy}
      >
        <Trash2 size={16} aria-hidden="true" /> {busy ? 'Excluindo…' : 'Excluir minha conta'}
      </button>
    </form>
  );
};

// ---- Page ------------------------------------------------------------------

const Conta: React.FC = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [deleted, setDeleted] = useState(false);
  const [signOutError, setSignOutError] = useState<unknown>(null);
  const [consentsVersion, setConsentsVersion] = useState(0);

  if (!backendEnabled || auth.mode !== 'backend') {
    return (
      <BackendNotice title="Conta ainda não disponível">
        <p>Esta versão é uma demonstração: não há contas reais e nenhum dado pessoal é guardado.</p>
        <p>Dados do perfil, consentimentos, cópia dos dados e exclusão da conta ficam aqui quando o app estiver ligado ao servidor.</p>
      </BackendNotice>
    );
  }

  if (deleted) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div role="status" className={card}>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <CheckCircle2 size={20} className="text-green-600" aria-hidden="true" /> Conta excluída
          </h1>
          <p className="text-sm text-gray-600 mt-3">
            Seus dados pessoais foram apagados. Registros fiscais de pagamentos e atendimentos ficam guardados sem identificar você.
          </p>
          <Link to="/" className={`${primaryButton} inline-block mt-5`}>Voltar ao início</Link>
        </div>
      </div>
    );
  }

  if (auth.loading) return <PageStatus />;
  if (!auth.isAuthenticated || !auth.authUser) return <Navigate to={`/entrar?next=${encodeURIComponent('/conta')}`} replace />;

  const { authUser, profile } = auth;

  const signOut = async () => {
    setSignOutError(null);
    try {
      await auth.signOut();
      navigate('/', { replace: true });
    } catch (err) {
      setSignOutError(err);
    }
  };

  const onDeleted = async () => {
    clearRequestDraft();
    setDeleted(true);
    try {
      await auth.signOut();
    } catch {
      // The user no longer exists on the server; the local session is dropped anyway
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-800">Minha conta</h1>
          <p className="text-sm text-gray-500 break-all">{authUser.email || formatPhoneBR(authUser.phone)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/pedidos" className={secondaryButton}>Meus pedidos</Link>
          <button type="button" className={`${secondaryButton} inline-flex items-center gap-2`} onClick={signOut}>
            <LogOut size={16} aria-hidden="true" /> Sair
          </button>
        </div>
      </header>
      <ErrorAlert error={signOutError} />
      {/* Whoever came in by the e-mail link (or whose acceptance failed in /entrar) accepts here */}
      <TermsGate userId={authUser.id} onAccepted={() => setConsentsVersion(v => v + 1)} />

      <section className={card} aria-labelledby="conta-dados">
        <h2 id="conta-dados" className="font-bold text-gray-800 flex items-center gap-2 mb-4">
          <UserRound size={18} className="text-primary" aria-hidden="true" /> Seus dados
        </h2>
        {profile ? (
          <ProfileForm key={profile.id} profile={profile} onSaved={auth.refreshProfile} />
        ) : (
          <p className="text-sm text-gray-500">Não foi possível carregar seu perfil. Atualize a página.</p>
        )}
      </section>

      <section className={card} aria-labelledby="conta-consentimentos">
        <h2 id="conta-consentimentos" className="font-bold text-gray-800 flex items-center gap-2 mb-2">
          <FileCheck2 size={18} className="text-primary" aria-hidden="true" /> Consentimentos
        </h2>
        <p className="text-xs text-gray-500 mb-2">
          Cada decisão fica registrada com data e versão do texto. Revogar não apaga o histórico.
        </p>
        <ConsentsSection key={consentsVersion} userId={authUser.id} />
      </section>

      <section className={card} aria-labelledby="conta-exportar">
        <h2 id="conta-exportar" className="font-bold text-gray-800 flex items-center gap-2 mb-2">
          <Download size={18} className="text-primary" aria-hidden="true" /> Cópia dos seus dados
        </h2>
        <ExportSection />
      </section>

      <section className={`${card} border-red-100`} aria-labelledby="conta-excluir-titulo">
        <h2 id="conta-excluir-titulo" className="font-bold text-red-700 flex items-center gap-2 mb-2">
          <Trash2 size={18} aria-hidden="true" /> Excluir minha conta
        </h2>
        <DeleteSection onDeleted={onDeleted} />
      </section>
    </div>
  );
};

export default Conta;
