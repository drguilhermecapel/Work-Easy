import React from 'react';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import PwaUpdateNotice from './components/PwaUpdateNotice';
import { initNativeShell } from './platform/native';
import { initObservability } from './lib/observability';
import { mountWithStaticHandoff } from './lib/staticHandoff';
import './index.css';

void initNativeShell();
// Checked here, on the variable itself, so the build can drop the SDK when no DSN is set.
if (import.meta.env.VITE_SENTRY_DSN) void initObservability();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// A content page prerendered by scripts/prerender.mjs stays on screen until React has the same route ready (lib/staticHandoff.tsx).
// The native shells use hash URLs and have no static pages.
mountWithStaticHandoff(
  rootElement,
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <PwaUpdateNotice />
    </ErrorBoundary>
  </React.StrictMode>,
  { enabled: import.meta.env.VITE_ROUTER !== 'hash' },
);
