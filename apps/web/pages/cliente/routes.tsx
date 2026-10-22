/* eslint-disable react-refresh/only-export-components -- route table: the lazy pages are not exported */
import { lazy } from 'react';
import { Route } from 'react-router-dom';

const Pedido = lazy(() => import('./Pedido'));
const Pedidos = lazy(() => import('./Pedidos'));
const PedidoDetalhe = lazy(() => import('./PedidoDetalhe'));
const Atendimentos = lazy(() => import('./Atendimentos'));
const AtendimentoDetalhe = lazy(() => import('./AtendimentoDetalhe'));

/** Client area routes, placed inside <Routes> in AppShell.tsx. */
export const clienteRoutes = (
  <>
    <Route path="/pedido" element={<Pedido />} />
    <Route path="/pedidos" element={<Pedidos />} />
    <Route path="/pedidos/:id" element={<PedidoDetalhe />} />
    <Route path="/atendimentos" element={<Atendimentos />} />
    <Route path="/atendimentos/:id" element={<AtendimentoDetalhe />} />
  </>
);
