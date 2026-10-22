/* eslint-disable react-refresh/only-export-components -- route table: the lazy pages are not exported */
import { lazy } from 'react';
import { Route } from 'react-router-dom';

const Painel = lazy(() => import('./Painel'));
const Cadastro = lazy(() => import('./Cadastro'));
const Servicos = lazy(() => import('./Servicos'));
const Agenda = lazy(() => import('./Agenda'));
const Pedidos = lazy(() => import('./Pedidos'));
const Orcamentos = lazy(() => import('./Orcamentos'));
const Clientes = lazy(() => import('./Clientes'));
const Cobrancas = lazy(() => import('./Cobrancas'));
const Assinatura = lazy(() => import('./Assinatura'));

/** Provider (WorkEasy Pro) area routes, placed inside <Routes> in AppShell.tsx. /pro/plantoes belongs to the care area. */
export const proRoutes = (
  <>
    <Route path="/pro" element={<Painel />} />
    <Route path="/pro/cadastro" element={<Cadastro />} />
    <Route path="/pro/servicos" element={<Servicos />} />
    <Route path="/pro/agenda" element={<Agenda />} />
    <Route path="/pro/pedidos" element={<Pedidos />} />
    <Route path="/pro/orcamentos" element={<Orcamentos />} />
    <Route path="/pro/clientes" element={<Clientes />} />
    <Route path="/pro/cobrancas" element={<Cobrancas />} />
    <Route path="/pro/assinatura" element={<Assinatura />} />
  </>
);
