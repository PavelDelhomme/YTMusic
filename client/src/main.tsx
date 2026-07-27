import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { installGlobalTelemetry } from './lib/telemetry';
import { initNativeShell } from './lib/native';

installGlobalTelemetry();
void initNativeShell();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
