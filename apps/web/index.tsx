import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import PwaUpdateNotice from './components/PwaUpdateNotice';
import { initNativeShell } from './platform/native';
import { initObservability } from './lib/observability';
import './index.css';

void initNativeShell();
// Checked here, on the variable itself, so the build can drop the SDK when no DSN is set.
if (import.meta.env.VITE_SENTRY_DSN) void initObservability();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <PwaUpdateNotice />
    </ErrorBoundary>
  </React.StrictMode>
);
