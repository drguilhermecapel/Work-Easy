import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initNativeShell } from './platform/native';
import './index.css';

void initNativeShell();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
