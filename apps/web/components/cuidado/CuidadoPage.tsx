import React, { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { HeartHandshake } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { backendEnabled } from '../../lib/supabase';
import BackendNotice from '../BackendNotice';
import RequireSession from '../RequireSession';
import TermsGate from '../TermsGate';

const LINKS: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/cuidado', label: 'Casas e assistidos', end: true },
  { to: '/cuidado/plantoes', label: 'Plantões' },
  { to: '/cuidado/relatorios', label: 'Relatórios' },
];

const CareNav: React.FC = () => (
  <nav aria-label="Linha de cuidado" className="-mx-4 px-4 overflow-x-auto no-scrollbar">
    <ul className="flex gap-1 w-max">
      {LINKS.map(link => (
        <li key={link.to}>
          <NavLink
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `block whitespace-nowrap text-sm font-semibold px-3 py-2 rounded-xl ${
                isActive ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
              }`
            }
          >
            {link.label}
          </NavLink>
        </li>
      ))}
    </ul>
  </nav>
);

interface Props {
  title: string;
  children: ReactNode;
  /** Sentence under the title. */
  intro?: ReactNode;
}

/**
 * Frame of the family screens of the care line: needs a session and the accepted
 * terms; the demo mode shows a notice instead (nothing is stored there).
 */
const CuidadoPage: React.FC<Props> = ({ title, intro, children }) => {
  const auth = useAuth();
  if (!backendEnabled || auth.mode !== 'backend') {
    return (
      <BackendNotice title="Linha de cuidado ainda não disponível">
        <p>
          Casas, plantões e relatórios dependem de login e do servidor do WorkEasy. Nesta versão de demonstração nada é guardado e não
          há cuidadores cadastrados.
        </p>
        <p>
          Quer um cuidador? Faça um <Link to="/pedido" className="text-primary underline">pedido</Link> e
          receba propostas.
        </p>
      </BackendNotice>
    );
  }
  return (
    <RequireSession>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <CareNav />
        <header>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <HeartHandshake size={22} className="text-primary shrink-0" aria-hidden="true" /> {title}
          </h1>
          {intro && <div className="text-sm text-gray-600 mt-1">{intro}</div>}
        </header>
        <TermsGate userId={auth.authUser?.id ?? ''}>{children}</TermsGate>
      </div>
    </RequireSession>
  );
};

export default CuidadoPage;
