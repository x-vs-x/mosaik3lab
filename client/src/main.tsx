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
import { nachladeFehlerBehandeln } from './lib/neuLaden';
import { Fehlergrenze } from './components/Fehlergrenze';

// Zuerst: Programmteil nicht nachladbar (alter Tab nach Update, WLAN weg) → einmal automatisch neu laden.
nachladeFehlerBehandeln();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Fehlergrenze ganzeSeite>
      <BrowserRouter basename={BASE_PATH || undefined}>
        <ConfigProvider>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </ConfigProvider>
      </BrowserRouter>
    </Fehlergrenze>
  </StrictMode>,
);

// Noch kein Administrator → zur Einrichtung (lib/ersteinrichtung.ts). Läuft neben dem ersten Anzeigen, damit die App auf
// langsamem WLAN nicht bis zu 3 s auf die Antwort des Server-Managers wartet.
void ersteinrichtungPruefen();
