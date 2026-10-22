/* eslint-disable react-refresh/only-export-components -- route table: the lazy pages are not exported */
import { lazy } from 'react';
import { Route } from 'react-router-dom';

const PaginaPrestador = lazy(() => import('./PaginaPrestador'));
const Agendar = lazy(() => import('./Agendar'));
const Orcamento = lazy(() => import('./Orcamento'));

/** Public pages: provider page, direct booking and the quote link (no login needed to open them). */
export const publicoRoutes = (
  <>
    <Route path="/p/:slug" element={<PaginaPrestador />} />
    <Route path="/agendar/:slug" element={<Agendar />} />
    <Route path="/orcamento/:token" element={<Orcamento />} />
  </>
);
