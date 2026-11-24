/* eslint-disable react-refresh/only-export-components -- route table: the lazy pages are not exported */
import { lazy } from 'react';
import { Route } from 'react-router-dom';

const ParaProfissionais = lazy(() => import('./ParaProfissionais'));
const ParaFamilias = lazy(() => import('./ParaFamilias'));
const ComoFunciona = lazy(() => import('./ComoFunciona'));

/**
 * Public acquisition pages (no login), placed inside <Routes> in AppShell.tsx. Their heading and opening
 * paragraphs live in data/static-pages.json, which scripts/prerender.mjs also reads.
 */
export const captacaoRoutes = (
  <>
    <Route path="/para-profissionais" element={<ParaProfissionais />} />
    <Route path="/para-familias" element={<ParaFamilias />} />
    <Route path="/como-funciona" element={<ComoFunciona />} />
  </>
);
