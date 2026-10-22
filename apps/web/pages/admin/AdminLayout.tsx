import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import RequireAdmin from '../../components/RequireAdmin';

const LINKS = [
  { to: '/admin', label: 'Painel', end: true },
  { to: '/admin/prestadores', label: 'Prestadores', end: false },
  { to: '/admin/disputas', label: 'Disputas', end: false },
  { to: '/admin/pagamentos', label: 'Pagamentos', end: false },
  { to: '/admin/configuracoes', label: 'Configurações', end: false },
  { to: '/admin/auditoria', label: 'Auditoria', end: false },
  { to: '/admin/lgpd', label: 'LGPD', end: false },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap text-sm font-semibold px-3.5 py-2 rounded-xl border ${
    isActive ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
  }`;

/** Shell of /admin: the guard, the section menu and the page of the section. */
const AdminLayout: React.FC = () => (
  <RequireAdmin>
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <nav aria-label="Administração" className="-mx-4 px-4 overflow-x-auto no-scrollbar">
        <ul className="flex gap-2 w-max">
          {LINKS.map(link => (
            <li key={link.to}>
              <NavLink to={link.to} end={link.end} className={linkClass}>
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  </RequireAdmin>
);

export default AdminLayout;
