import React from 'react';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AppShell from './AppShell';

// The website uses clean URLs (better for sharing and search engines). The
// native shells (Capacitor and Tauri) serve files from a custom scheme with no
// server-side rewrite, so they use hash URLs. The npm scripts set VITE_ROUTER.
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter;

const App: React.FC = () => (
  <AuthProvider>
    <Router>
      <AppShell />
    </Router>
  </AuthProvider>
);

export default App;
