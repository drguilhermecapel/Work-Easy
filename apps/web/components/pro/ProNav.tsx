import React from 'react';
import { NavLink } from 'react-router-dom';

const LINKS: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/pro', label: 'Painel', end: true },
  { to: '/pro/cadastro', label: 'Cadastro' },
  { to: '/pro/servicos', label: 'Serviços' },
  { to: '/pro/agenda', label: 'Agenda' },
  { to: '/pro/pedidos', label: 'Pedidos' },
  { to: '/pro/orcamentos', label: 'Orçamentos' },
  { to: '/pro/clientes', label: 'Clientes' },
  { to: '/pro/cobrancas', label: 'Cobranças' },
  { to: '/pro/assinatura', label: 'Assinatura' },
];

/** Tabs between the Pro screens; scrolls sideways on a phone instead of wrapping. */
const ProNav: React.FC = () => (
  <nav aria-label="Ferramentas do profissional" className="-mx-4 px-4 overflow-x-auto no-scrollbar">
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

export default ProNav;
