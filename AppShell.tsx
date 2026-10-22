import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import Navbar from './components/Navbar';
import DemoBanner from './components/DemoBanner';
import { contaRoutes } from './pages/conta/routes';
import { clienteRoutes } from './pages/cliente/routes';

// Each page is a separate chunk, so the first load only ships what it shows
const Home = lazy(() => import('./pages/Home'));
const SearchPage = lazy(() => import('./pages/Search'));
const Profile = lazy(() => import('./pages/Profile'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Verification = lazy(() => import('./pages/Verification'));
const LegalDocs = lazy(() => import('./pages/LegalDocs'));
const ProviderRegistration = lazy(() => import('./pages/ProviderRegistration'));
const TeleconsultationRoom = lazy(() => import('./pages/TeleconsultationRoom'));
const MedicalRecords = lazy(() => import('./pages/MedicalRecords'));
const HealthSearch = lazy(() => import('./pages/HealthSearch'));
const DoctorProfile = lazy(() => import('./pages/DoctorProfile'));
const Categories = lazy(() => import('./pages/Categories'));
const AreaPage = lazy(() => import('./pages/AreaPage'));
const OccupationPage = lazy(() => import('./pages/OccupationPage'));

const PageFallback: React.FC = () => (
  <div role="status" className="py-24 text-center text-gray-400 text-sm">Carregando…</div>
);

/** Layout and routes, independent of the router flavour (browser, hash or memory). */
const AppShell: React.FC = () => (
  <div className="min-h-screen bg-gray-50 font-sans">
    <DemoBanner />
    <Navbar />
    <main>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/categorias" element={<Categories />} />
          <Route path="/categorias/:slug" element={<AreaPage />} />
          <Route path="/servicos/:slug" element={<OccupationPage />} />
          <Route path="/health" element={<HealthSearch />} />
          <Route path="/doctor/:id" element={<DoctorProfile />} />
          {/* /profile/me is the signed-in user's area in the demo */}
          <Route path="/profile/me" element={<Navigate to="/dashboard" replace />} />
          <Route path="/profile/:id" element={<Profile />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/verification" element={<Verification />} />
          <Route path="/legal" element={<LegalDocs />} />
          <Route path="/register-provider" element={<ProviderRegistration />} />
          <Route path="/teleconsultation/:sessionId" element={<TeleconsultationRoom />} />
          <Route path="/medical-records" element={<MedicalRecords />} />
          {/* MVP areas: each block lazy-loads its pages (pages/<área>/routes.tsx) */}
          {contaRoutes}
          {clienteRoutes}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </main>

    <footer className="bg-white border-t border-gray-200 py-8 mt-10">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <h2 className="text-xl font-bold text-primary mb-2">WorkEasy</h2>
        <p className="text-gray-500 text-sm mb-4">Conectando quem precisa com quem sabe fazer.</p>
        <div className="flex justify-center gap-4 text-xs text-gray-400 mb-4">
          <Link to="/legal" className="hover:text-primary">Termos de Uso</Link>
          <Link to="/legal" className="hover:text-primary">Privacidade</Link>
          <Link to="/register-provider" className="hover:text-primary">Trabalhe Conosco</Link>
        </div>
        <p className="text-gray-400 text-xs">© 2026 WorkEasy. Protótipo de demonstração. Todos os direitos reservados.</p>
      </div>
    </footer>
  </div>
);

export default AppShell;
