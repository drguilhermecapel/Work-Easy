import React, { ReactNode, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { backendEnabled } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { fetchIsAdmin } from '../services/account';
import BackendNotice from './BackendNotice';
import ErrorAlert from './ErrorAlert';
import PageStatus from './PageStatus';
import RequireSession from './RequireSession';

const Restricted: React.FC = () => (
  <div className="max-w-xl mx-auto px-4 py-12">
    <div role="alert" className="bg-white border border-gray-100 rounded-2xl p-6 shadow-xs">
      <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
        <Lock size={20} className="text-primary shrink-0" aria-hidden="true" /> Acesso restrito
      </h1>
      <p className="text-sm text-gray-600 mt-3">Esta área é só para a administração do WorkEasy e a sua conta não tem esse acesso.</p>
      <Link to="/" className="inline-block mt-5 text-sm font-semibold bg-primary text-white px-4 py-2.5 rounded-xl hover:bg-purple-700">
        Voltar ao início
      </Link>
    </div>
  </div>
);

/**
 * Decides whether the screens show. When the session context already read the account as an administrator
 * (`known`) they show at once. Otherwise that read may have said "no" or may have failed (network), and the
 * session context cannot tell the two apart, so the question is asked again here: a failure offers a retry
 * instead of saying the access is restricted.
 *
 * The children always sit at the same place in the tree, whichever way access was learned. Switching between
 * two wrappers would remount them (state lost, data fetched twice) the moment the session context catches up.
 */
const AccessGate: React.FC<{ children: ReactNode; known: boolean; onAdmin: () => void }> = ({ children, known, onAdmin }) => {
  const check = useAsync(() => (known ? Promise.resolve(true) : fetchIsAdmin()), `admin-access:${known}`);
  const confirmed = known || check.data === true;

  useEffect(() => {
    // Let the session context learn what was just confirmed here
    if (!known && check.data === true) onAdmin();
  }, [known, check.data, onAdmin]);

  if (confirmed) return <>{children}</>;
  if (check.loading && check.data === undefined) return <PageStatus />;
  if (check.error) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 space-y-4">
        <h1 className="text-xl font-bold text-gray-800">Não foi possível confirmar o seu acesso</h1>
        <p className="text-sm text-gray-600">Isto não quer dizer que a sua conta perdeu o acesso: a consulta falhou. Tente de novo.</p>
        <ErrorAlert error={check.error} />
        <button
          type="button"
          onClick={check.reload}
          className="text-sm font-semibold bg-primary text-white px-4 py-2.5 rounded-xl hover:bg-purple-700"
        >
          Tentar de novo
        </button>
      </div>
    );
  }
  return <Restricted />;
};

/**
 * Administration screens: needs the backend and an administrator account.
 * This only hides the interface; the database refuses every admin read and
 * action from anyone else (RLS and is_admin() in each admin_* function).
 */
const RequireAdmin: React.FC<{ children: ReactNode }> = ({ children }) => {
  const auth = useAuth();

  if (!backendEnabled || auth.mode !== 'backend') {
    return (
      <BackendNotice title="Administração indisponível na demonstração">
        <p>A área de administração trabalha com dados reais e só funciona com o servidor configurado e uma conta de administrador.</p>
        <p>Nesta versão de demonstração nada é guardado e não há o que administrar.</p>
      </BackendNotice>
    );
  }

  return (
    <RequireSession>
      <AccessGate known={auth.isAdmin} onAdmin={auth.refreshProfile}>
        {children}
      </AccessGate>
    </RequireSession>
  );
};

export default RequireAdmin;
