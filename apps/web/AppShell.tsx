import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import DemoBanner from './components/DemoBanner';
import SiteFooter from './components/SiteFooter';
import { features } from './config/features';
import { backendRoutes, demoRoutes } from './pages/prototype/routes';
import { legalRoutes } from './pages/legal/routes';
import { contaRoutes } from './pages/conta/routes';
import { clienteRoutes } from './pages/cliente/routes';
import { proRoutes } from './pages/pro/routes';
import { publicoRoutes } from './pages/publico/routes';
import { adminRoutes } from './pages/admin/routes';
import { cuidadoRoutes } from './pages/cuidado/routes';
import { captacaoRoutes } from './pages/captacao/routes';
import { plantoesRoutes } from './pages/pro/plantoes/routes';
import AccessibilityLayer, { MAIN_ID } from './components/AccessibilityLayer';
import RoutePrefetcher from './components/RoutePrefetcher';

// Each page is a separate chunk, so the first load only ships what it shows
const Home = lazy(() => import('./pages/Home'));
const Categories = lazy(() => import('./pages/Categories'));
const AreaPage = lazy(() => import('./pages/AreaPage'));
const OccupationPage = lazy(() => import('./pages/OccupationPage'));
const OccupationNeighborhoodPage = lazy(() => import('./pages/OccupationNeighborhoodPage'));

const PageFallback: React.FC = () => (
  <div role="status" className="py-24 text-center text-gray-400 text-sm">Carregando…</div>
);

// Demo mode shows the prototype screens (fictitious data). With a backend the same URLs redirect to
// the real equivalent, are replaced by a real page or say they are a future feature (pages/prototype).
const prototypeRoutes = features.backendEnabled ? backendRoutes : demoRoutes;

/** Layout and routes, independent of the router flavour (browser, hash or memory). */
const AppShell: React.FC = () => (
  <div className="min-h-screen bg-gray-50 font-sans">
    <AccessibilityLayer />
    <RoutePrefetcher />
    <DemoBanner />
    <Navbar />
    <main id={MAIN_ID} tabIndex={-1} className="outline-hidden">
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/categorias" element={<Categories />} />
          <Route path="/categorias/:slug" element={<AreaPage />} />
          <Route path="/servicos/:slug" element={<OccupationPage />} />
          <Route path="/servicos/:slug/:bairro" element={<OccupationNeighborhoodPage />} />
          {prototypeRoutes}
          {legalRoutes}
          {/* MVP areas: each block lazy-loads its pages (pages/<área>/routes.tsx) */}
          {contaRoutes}
          {clienteRoutes}
          {proRoutes}
          {publicoRoutes}
          {adminRoutes}
          {cuidadoRoutes}
          {plantoesRoutes}
          {captacaoRoutes}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </main>

    <SiteFooter />
  </div>
);

export default AppShell;
