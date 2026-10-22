/* eslint-disable react-refresh/only-export-components -- route table: the lazy pages are not exported */
import { lazy } from 'react';
import { Route } from 'react-router-dom';

const Entrar = lazy(() => import('./Entrar'));
const Conta = lazy(() => import('./Conta'));

/** Account area routes, placed inside <Routes> in AppShell.tsx. */
export const contaRoutes = (
  <>
    <Route path="/entrar" element={<Entrar />} />
    <Route path="/conta" element={<Conta />} />
  </>
);
