import React, { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { backendEnabled } from '../../lib/supabase';
import BackendNotice from '../BackendNotice';
import RequireSession from '../RequireSession';
import TermsGate from '../TermsGate';
import { ProContext } from './proContext';
import ProNav from './ProNav';
import { PROVIDER_STATUS_HELP, PROVIDER_STATUS_LABELS, PROVIDER_STATUS_STYLES } from './labels';
import { Badge } from './ui';
import { card, primaryButton } from './styles';

interface Props {
  title: string;
  children: ReactNode;
  /** Screens that only make sense for a provider (all but the onboarding). Default true. */
  needsProvider?: boolean;
  /** Shows the approval status when it is not "approved". Default true. */
  banner?: boolean;
  /** Next to the title. */
  actions?: ReactNode;
}

const Inner: React.FC<Props & { userId: string }> = ({ title, children, needsProvider = true, banner = true, actions, userId }) => {
  const auth = useAuth();
  const provider = auth.mode === 'backend' ? auth.provider : null;
  const refresh = auth.mode === 'backend' ? auth.refreshProfile : () => undefined;

  return (
    <ProContext.Provider value={{ userId, provider, refresh }}>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {provider && <ProNav />}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
          {actions}
        </header>
        <TermsGate userId={userId}>
          {provider && banner && provider.status !== 'approved' && (
            <div role="note" className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-gray-700 space-y-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-gray-800">
                Cadastro <Badge className={PROVIDER_STATUS_STYLES[provider.status]}>{PROVIDER_STATUS_LABELS[provider.status]}</Badge>
              </p>
              <p>{PROVIDER_STATUS_HELP[provider.status]}</p>
              <Link to="/pro/cadastro" className="text-primary underline font-medium">
                Ir para o cadastro
              </Link>
            </div>
          )}
          {!provider && needsProvider ? (
            <section className={`${card} space-y-3`} aria-labelledby="pro-sem-cadastro">
              <h2 id="pro-sem-cadastro" className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Briefcase size={18} className="text-primary" aria-hidden="true" /> Você ainda não é profissional no WorkEasy
              </h2>
              <p className="text-sm text-gray-600">
                Crie o cadastro de profissional para ter página própria, receber pedidos e usar a agenda, os orçamentos e as cobranças.
              </p>
              <Link to="/pro/cadastro" className={primaryButton}>
                Começar o cadastro
              </Link>
            </section>
          ) : (
            children
          )}
        </TermsGate>
      </div>
    </ProContext.Provider>
  );
};

/**
 * Frame of every Pro screen: needs a session (demo mode shows a notice instead),
 * the accepted terms and, unless told otherwise, a provider record. The plan and
 * the approval status always come from the database through the provider row.
 */
const ProPage: React.FC<Props> = props => {
  const auth = useAuth();
  if (!backendEnabled || auth.mode !== 'backend') {
    return (
      <BackendNotice title="Ferramenta do profissional ainda não disponível">
        <p>
          Esta tela depende do cadastro real de profissional, com login. Nesta versão de demonstração nada é guardado e não há conta
          de profissional.
        </p>
        <p>
          O painel de demonstração continua em <Link to="/dashboard" className="text-primary underline">Meu painel</Link>, com dados fictícios.
        </p>
      </BackendNotice>
    );
  }
  return (
    <RequireSession>
      <Inner {...props} userId={auth.authUser?.id ?? ''} />
    </RequireSession>
  );
};

export default ProPage;
