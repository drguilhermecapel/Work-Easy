import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import SearchPage from './pages/Search';
import Profile from './pages/Profile';
import Dashboard from './pages/Dashboard';
import Verification from './pages/Verification';
import LegalDocs from './pages/LegalDocs';
import ProviderRegistration from './pages/ProviderRegistration';
import TeleconsultationRoom from './pages/TeleconsultationRoom';
import MedicalRecords from './pages/MedicalRecords';
import HealthSearch from './pages/HealthSearch';
import DoctorProfile from './pages/DoctorProfile';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <div className="min-h-screen bg-gray-50 font-sans">
          <Navbar />
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/search" element={<SearchPage />} />
              
              {/* New Health Routes */}
              <Route path="/health" element={<HealthSearch />} />
              <Route path="/doctor/:id" element={<DoctorProfile />} />
              
              <Route path="/profile/:id" element={<Profile />} />
              {/* Redirect /profile/me to dashboard for demo purposes */}
              <Route path="/profile/me" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/verification" element={<Verification />} />
              <Route path="/legal" element={<LegalDocs />} />
              <Route path="/register-provider" element={<ProviderRegistration />} />
              <Route path="/teleconsultation/:sessionId" element={<TeleconsultationRoom />} />
              <Route path="/medical-records" element={<MedicalRecords />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          
          <footer className="bg-white border-t border-gray-200 py-8 mt-10">
             <div className="max-w-7xl mx-auto px-4 text-center">
               <h2 className="text-xl font-bold text-primary mb-2">WorkEasy</h2>
               <p className="text-gray-500 text-sm mb-4">Conectando quem precisa com quem sabe fazer.</p>
               <div className="flex justify-center gap-4 text-xs text-gray-400 mb-4">
                  <a href="/#/legal" className="hover:text-primary">Termos de Uso</a>
                  <a href="/#/legal" className="hover:text-primary">Privacidade</a>
                  <a href="/#/register-provider" className="hover:text-primary">Trabalhe Conosco</a>
               </div>
               <p className="text-gray-400 text-xs">© 2024 WorkEasy. Todos os direitos reservados.</p>
             </div>
          </footer>
        </div>
      </HashRouter>
    </AuthProvider>
  );
};

export default App;