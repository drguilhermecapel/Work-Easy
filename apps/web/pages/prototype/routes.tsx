/* eslint-disable react-refresh/only-export-components -- route table: the lazy pages are not exported */
import { lazy } from 'react';
import { Navigate, Route } from 'react-router-dom';

// Each page is a separate chunk, so the first load only ships what it shows
const SearchPage = /* @__PURE__ */ lazy(() => import('../Search'));
const Profile = /* @__PURE__ */ lazy(() => import('../Profile'));
const Dashboard = /* @__PURE__ */ lazy(() => import('../Dashboard'));
const Verification = /* @__PURE__ */ lazy(() => import('../Verification'));
const ProviderRegistration = /* @__PURE__ */ lazy(() => import('../ProviderRegistration'));
const TeleconsultationRoom = /* @__PURE__ */ lazy(() => import('../TeleconsultationRoom'));
const MedicalRecords = /* @__PURE__ */ lazy(() => import('../MedicalRecords'));
const HealthSearch = /* @__PURE__ */ lazy(() => import('../HealthSearch'));
const DoctorProfile = /* @__PURE__ */ lazy(() => import('../DoctorProfile'));
const CatalogSearch = lazy(() => import('./CatalogSearch'));
const FutureFeaturePage = /* @__PURE__ */ lazy(() => import('./FutureFeaturePage'));
// The redirects read the catalog (571 kB of JSON). Imported statically here they pulled it into
// the entry chunk of every visit; as a chunk of their own the catalog stays out of the first load.
const DashboardRedirect = lazy(() => import('./redirects').then(module => ({ default: module.DashboardRedirect })));
const RegisterProviderRedirect = lazy(() => import('./redirects').then(module => ({ default: module.RegisterProviderRedirect })));

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

/** Live routes and redirects shared by the site and the store builds. */
export const backendRoutes = (
  <>
    <Route path="/search" element={<CatalogSearch />} />
    <Route path="/profile/me" element={<Navigate to="/conta" replace />} />
    <Route path="/profile/:id" element={<Navigate to="/categorias" replace />} />
    <Route path="/dashboard" element={<DashboardRedirect />} />
    <Route path="/register-provider" element={<RegisterProviderRedirect />} />
  </>
);

/** Explanatory pages for old URLs on the site and other non-iOS builds. */
export const futureRoutes = (
  <>
    <Route path="/health" element={<FutureFeaturePage kind="saude" />} />
    <Route path="/doctor/:id" element={<FutureFeaturePage kind="medico" />} />
    <Route path="/verification" element={<FutureFeaturePage kind="verificacao" />} />
    <Route path="/teleconsultation/:sessionId" element={<FutureFeaturePage kind="teleconsulta" />} />
    <Route path="/medical-records" element={<FutureFeaturePage kind="prontuario" />} />
  </>
);
