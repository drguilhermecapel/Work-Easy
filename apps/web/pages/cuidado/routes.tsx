/* eslint-disable react-refresh/only-export-components -- route table: the lazy pages are not exported */
import { lazy } from 'react';
import { Route } from 'react-router-dom';

const Casas = lazy(() => import('./Casas'));
const Plantoes = lazy(() => import('./Plantoes'));
const PlantaoDetalhe = lazy(() => import('./PlantaoDetalhe'));
const Relatorios = lazy(() => import('./Relatorios'));

/** Care line routes for families, placed inside <Routes> in AppShell.tsx. The caregiver side is /pro/plantoes. */
export const cuidadoRoutes = (
  <>
    <Route path="/cuidado" element={<Casas />} />
    <Route path="/cuidado/plantoes" element={<Plantoes />} />
    <Route path="/cuidado/plantoes/:id" element={<PlantaoDetalhe />} />
    <Route path="/cuidado/relatorios" element={<Relatorios />} />
  </>
);
