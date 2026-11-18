import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { SessionPending } from './auth/SessionPending';
import { Fehlergrenze } from './components/Fehlergrenze';
import { Layout } from './components/Layout';
import { ForbiddenPage, NotFoundPage } from './components/StatusPages';
import { Spinner } from './components/ui';
import { CatalogPage } from './features/katalog/CatalogPage';
import { ItemDetailPage } from './features/katalog/ItemDetailPage';
import { MyOrdersPage } from './features/anfragen/MyOrdersPage';
import { darfMeineAnfragen } from './features/anfragen/zugang';
import { MyProposalsPage } from './features/vorschlaege/MyProposalsPage';
import { ProposalFormPage } from './features/vorschlaege/ProposalFormPage';
import { AccountPage } from './features/konto/AccountPage';
import { LoginPage } from './features/konto/LoginPage';
import { PasswortPage } from './features/konto/PasswortPage';
import { useConfig } from './lib/config';
import type { Permission } from './lib/types';

// Verwaltung und Einstellungen erst bei Bedarf laden – Katalog, Anmeldung und Konto bleiben im Hauptpaket.
const MasterDataPage = lazy(() => import('./features/einstellungen/stammdaten/MasterDataPage').then((m) => ({ default: m.MasterDataPage })));
const SettingsPage = lazy(() => import('./features/einstellungen/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ProposalsAdminPage = lazy(() => import('./features/verwaltung/ProposalsAdminPage').then((m) => ({ default: m.ProposalsAdminPage })));
const DashboardPage = lazy(() => import('./features/verwaltung/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const FilamentsPage = lazy(() => import('./features/verwaltung/FilamentsPage').then((m) => ({ default: m.FilamentsPage })));
const ItemEditPage = lazy(() => import('./features/verwaltung/druckteil-bearbeiten/ItemEditPage').then((m) => ({ default: m.ItemEditPage })));
const ItemsAdminPage = lazy(() => import('./features/verwaltung/ItemsAdminPage').then((m) => ({ default: m.ItemsAdminPage })));
const OrdersAdminPage = lazy(() => import('./features/verwaltung/OrdersAdminPage').then((m) => ({ default: m.OrdersAdminPage })));
const RequestersPage = lazy(() => import('./features/verwaltung/RequestersPage').then((m) => ({ default: m.RequestersPage })));
const PersonenPage = lazy(() => import('./features/verwaltung/PersonenPage').then((m) => ({ default: m.PersonenPage })));

/**
 * Nur für Bereiche des Druck-Teams und der Administration.
 * Katalog und Bestellen sind ohne Anmeldung nutzbar.
 * (Komfort im Frontend – die eigentliche Prüfung erfolgt im Backend.)
 */
function Protected({ permission, children }: { permission?: Permission; children: ReactNode }) {
  const { user, loading, checkError, loggedOut, can } = useAuth();
  const location = useLocation();
  // Server nicht erreichbar ≠ abgemeldet: dann nicht zur Anmeldung umleiten, sondern Hinweis + „Erneut versuchen“.
  if (loading || (checkError && !user)) return <SessionPending />;
  if (!user) {
    const state = loggedOut ? undefined : { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }
  if (permission && !can(permission)) return <ForbiddenPage />;
  return children;
}

/** „Meine Anfragen“ für angemeldete Lehrkräfte oder wenn die Statusanzeige (per Code) eingeschaltet ist. */
function MyOrdersAccess({ children }: { children: ReactNode }) {
  const { config, error } = useConfig();
  const { user, loading, checkError, can } = useAuth();
  if (loading || (checkError && !user)) return <SessionPending />;
  if (!config) return error ? null : <Spinner />; // Fehler zeigt das Layout (mit „Erneut versuchen“)
  return darfMeineAnfragen(can, config) ? children : <Navigate to="/katalog" replace />;
}

/** Startadresse: ohne Anmeldung zur Anmeldeseite, angemeldet in den Katalog. */
function Start() {
  const { user, loading, checkError } = useAuth();
  if (loading || (checkError && !user)) return <SessionPending />;
  return <Navigate to={user ? '/katalog' : '/login'} replace />;
}

/**
 * Bei Bedarf nachgeladene Seiten: Fehlergrenze innerhalb des Layouts (Navigation bleibt), je Adresse neu – nach dem
 * Wechsel auf eine andere Seite ist der Fehler wieder weg.
 */
function NachgeladeneSeiten() {
  const { pathname } = useLocation();
  return (
    <Fehlergrenze key={pathname}>
      <Suspense fallback={<Spinner />}>
        <Outlet />
      </Suspense>
    </Fehlergrenze>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/passwort" element={<PasswortPage />} />
      <Route element={<Layout />}>
        <Route index element={<Start />} />
        <Route path="katalog" element={<CatalogPage />} />
        <Route path="katalog/:id" element={<ItemDetailPage />} />
        <Route path="anfragen" element={<MyOrdersAccess><MyOrdersPage /></MyOrdersAccess>} />
        <Route path="vorschlag/neu" element={<Protected permission="vorschlaege:eigene"><ProposalFormPage /></Protected>} />
        <Route path="vorschlaege" element={<Protected permission="vorschlaege:eigene"><MyProposalsPage /></Protected>} />
        <Route path="konto" element={<Protected><AccountPage /></Protected>} />

        <Route element={<NachgeladeneSeiten />}>
          <Route path="verwaltung" element={<Protected permission="dashboard:view"><DashboardPage /></Protected>} />
          <Route path="verwaltung/bestellungen" element={<Protected permission="orders:view"><OrdersAdminPage /></Protected>} />
          <Route path="verwaltung/vorschlaege" element={<Protected permission="vorschlaege:sehen"><ProposalsAdminPage /></Protected>} />
          <Route path="verwaltung/lehrkraefte" element={<Protected permission="orders:view"><RequestersPage /></Protected>} />
          <Route path="verwaltung/filamente" element={<Protected permission="filaments:manage"><FilamentsPage /></Protected>} />
          <Route path="verwaltung/hilfsmittel" element={<Protected permission="catalog:view"><ItemsAdminPage /></Protected>} />
          <Route path="verwaltung/hilfsmittel/neu" element={<Protected permission="catalog:manage"><ItemEditPage /></Protected>} />
          <Route path="verwaltung/hilfsmittel/:id" element={<Protected permission="catalog:manage"><ItemEditPage /></Protected>} />
          <Route path="verwaltung/personen" element={<Protected permission="users:manage"><PersonenPage /></Protected>} />
          <Route path="verwaltung/benutzer" element={<Navigate to="/verwaltung/personen" replace />} />
          <Route path="verwaltung/stammdaten" element={<Protected permission="masterdata:manage"><MasterDataPage /></Protected>} />
          <Route path="verwaltung/einstellungen" element={<Protected permission="settings:manage"><SettingsPage /></Protected>} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
