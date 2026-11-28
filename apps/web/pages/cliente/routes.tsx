/* eslint-disable react-refresh/only-export-components -- route table: the lazy pages are not exported */
import { lazy } from 'react';
import { Route } from 'react-router-dom';

const Convite = lazy(() => import('../mobilidade/Convite'));
const Corridas = lazy(() => import('../mobilidade/Corridas'));
const Grupos = lazy(() => import('../mobilidade/Grupos'));
const Empresa = lazy(() => import('../mobilidade/Empresa'));
const Frota = lazy(() => import('../mobilidade/Frota'));
const Motorista = lazy(() => import('../mobilidade/Motorista'));
const Pedido = lazy(() => import('./Pedido'));
const Pedidos = lazy(() => import('./Pedidos'));
const PedidoDetalhe = lazy(() => import('./PedidoDetalhe'));
const Atendimentos = lazy(() => import('./Atendimentos'));
const AtendimentoDetalhe = lazy(() => import('./AtendimentoDetalhe'));

/** Client area routes, placed inside <Routes> in AppShell.tsx. */
export const clienteRoutes = (
  <>
    <Route path="/corridas/convite" element={<Convite />} />
    <Route path="/corridas" element={<Corridas />} />
    <Route path="/corridas/motorista" element={<Motorista />} />
    <Route path="/corridas/grupos" element={<Grupos />} />
    <Route path="/corridas/empresa" element={<Empresa />} />
    <Route path="/corridas/frota" element={<Frota />} />
    <Route path="/atendimentos/:id/mobilidade" element={<Corridas />} />
    <Route path="/pedido" element={<Pedido />} />
    <Route path="/pedidos" element={<Pedidos />} />
    <Route path="/pedidos/:id" element={<PedidoDetalhe />} />
    <Route path="/atendimentos" element={<Atendimentos />} />
    <Route path="/atendimentos/:id" element={<AtendimentoDetalhe />} />
  </>
);
