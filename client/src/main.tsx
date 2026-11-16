import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/400-italic.css';
import '@fontsource/atkinson-hyperlegible/700.css';
// Schrift der Wortmarke (wie im Logo)
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';
import { ConfigProvider } from './lib/config';
import { BASE_PATH } from './lib/basePath';
import { ersteinrichtungPruefen } from './lib/ersteinrichtung';

const render = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={BASE_PATH || undefined}>
      <ConfigProvider>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </ConfigProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Noch kein Administrator → direkt zur Einrichtung (lib/ersteinrichtung.ts), sonst App starten.
void ersteinrichtungPruefen().then((starten) => starten && render());
