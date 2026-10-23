/* eslint-disable react-refresh/only-export-components -- route table: the lazy pages are not exported */
import { lazy } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { DashboardRedirect, RegisterProviderRedirect } from './redirects';

// Each page is a separate chunk, so the first load only ships what it shows
const SearchPage = lazy(() => import('../Search'));
const Profile = lazy(() => import('../Profile'));
const Dashboard = lazy(() => import('../Dashboard'));
const Verification = lazy(() => import('../Verification'));
const ProviderRegistration = lazy(() => import('../ProviderRegistration'));
const TeleconsultationRoom = lazy(() => import('../TeleconsultationRoom'));
const MedicalRecords = lazy(() => import('../MedicalRecords'));
const HealthSearch = lazy(() => import('../HealthSearch'));
const DoctorProfile = lazy(() => import('../DoctorProfile'));
const CatalogSearch = lazy(() => import('./CatalogSearch'));
const FutureFeaturePage = lazy(() => import('./FutureFeaturePage'));

/** Demo mode (no backend): the prototype screens with fictitious data. */
export const demoRoutes = (
  <>
    <Route path="/search" element={<SearchPage />} />
    <Route path="/health" element={<HealthSearch />} />
    <Route path="/doctor/:id" element={<DoctorProfile />} />
    {/* /profile/me is the signed-in user's area in the demo */}
    <Route path="/profile/me" element={<Navigate to="/dashboard" replace />} />
    <Route path="/profile/:id" element={<Profile />} />
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/verification" element={<Verification />} />
    <Route path="/register-provider" element={<ProviderRegistration />} />
    <Route path="/teleconsultation/:sessionId" element={<TeleconsultationRoom />} />
    <Route path="/medical-records" element={<MedicalRecords />} />
  </>
);

/**
 * With a backend no fictitious data may appear. The old URLs keep working, each
 * one redirected to its real equivalent, replaced by a real page, or explained as
 * a future feature.
 */
export const backendRoutes = (
  <>
    <Route path="/search" element={<CatalogSearch />} />
    <Route path="/health" element={<FutureFeaturePage kind="saude" />} />
    <Route path="/doctor/:id" element={<FutureFeaturePage kind="medico" />} />
    <Route path="/profile/me" element={<Navigate to="/conta" replace />} />
    <Route path="/profile/:id" element={<Navigate to="/categorias" replace />} />
    <Route path="/dashboard" element={<DashboardRedirect />} />
    <Route path="/verification" element={<FutureFeaturePage kind="verificacao" />} />
    <Route path="/register-provider" element={<RegisterProviderRedirect />} />
    <Route path="/teleconsultation/:sessionId" element={<FutureFeaturePage kind="teleconsulta" />} />
    <Route path="/medical-records" element={<FutureFeaturePage kind="prontuario" />} />
  </>
);
