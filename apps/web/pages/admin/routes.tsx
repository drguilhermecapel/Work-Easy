/* eslint-disable react-refresh/only-export-components -- route table: the lazy pages are not exported */
import { lazy } from 'react';
import { Route } from 'react-router-dom';

const AdminLayout = lazy(() => import('./AdminLayout'));
const Painel = lazy(() => import('./Painel'));
const Prestadores = lazy(() => import('./Prestadores'));
const PrestadorDetalhe = lazy(() => import('./PrestadorDetalhe'));
const Disputas = lazy(() => import('./Disputas'));
const Pagamentos = lazy(() => import('./Pagamentos'));
const Configuracoes = lazy(() => import('./Configuracoes'));
const Auditoria = lazy(() => import('./Auditoria'));
const Lgpd = lazy(() => import('./Lgpd'));

/** Administration routes, placed inside <Routes> in AppShell.tsx. */
export const adminRoutes = (
  <Route path="/admin" element={<AdminLayout />}>
    <Route index element={<Painel />} />
    <Route path="prestadores" element={<Prestadores />} />
    <Route path="prestadores/:id" element={<PrestadorDetalhe />} />
    <Route path="disputas" element={<Disputas />} />
    <Route path="pagamentos" element={<Pagamentos />} />
    <Route path="configuracoes" element={<Configuracoes />} />
    <Route path="auditoria" element={<Auditoria />} />
    <Route path="lgpd" element={<Lgpd />} />
  </Route>
);
