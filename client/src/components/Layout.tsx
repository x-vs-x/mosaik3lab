import {
  Boxes,
  ClipboardList,
  Lightbulb,
  Database,
  LayoutDashboard,
  Mail,
  Settings,
  LayoutGrid,
  LogIn,
  LogOut,
  Menu,
  PackageSearch,
  Palette,
  RotateCw,
  Server,
  UserRound,
  Wrench,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { withBase } from '../lib/basePath';
import { APP_VERSION } from '../lib/version';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useConfig } from '../lib/config';
import { useApi } from '../lib/useApi';
import { ROLE_LABELS } from '../lib/constants';
import type { Permission } from '../lib/types';
import { Dialog } from './Dialog';
import { useToast } from './Toast';
import { NeuigkeitenDialog } from '../features/neuigkeiten/NeuigkeitenDialog';
import { Logo } from './Logo';
import { Alert, Button, cx } from './ui';

interface NavItem {
  to: string;
  label: string;
  shortLabel?: string;
  /** Noch kürzer für die untere Leiste unter 390 px (fünf Einträge, z. B. 320–375 px); Screenreader hören weiter den Kurznamen. */
  tinyLabel?: string;
  icon: LucideIcon;
  permission?: Permission;
  end?: boolean;
  /** Ausblenden, wenn dieses Recht besteht (die Seite „Personen“ enthält die Lehrkräfte-Liste). */
  hiddenWith?: Permission;
  /** Zähler, z. B. neue Vorschläge – erscheint als Plakette und im Namen für Screenreader. */
  badge?: number;
}

const MAIN_NAV: NavItem[] = [
  { to: '/katalog', label: 'Hilfs- und Lehrmittel', shortLabel: 'Katalog', icon: LayoutGrid },
  { to: '/anfragen', label: 'Meine Anfragen', shortLabel: 'Anfragen', icon: ClipboardList },
  { to: '/vorschlaege', label: 'Meine Vorschläge', shortLabel: 'Vorschläge', icon: Lightbulb, permission: 'vorschlaege:eigene' },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/verwaltung', label: 'Übersicht', shortLabel: 'Verwaltung', icon: LayoutDashboard, permission: 'dashboard:view', end: true },
  { to: '/verwaltung/bestellungen', label: 'Anfragen', icon: PackageSearch, permission: 'orders:view' },
  { to: '/verwaltung/vorschlaege', label: 'Vorschläge', icon: Lightbulb, permission: 'vorschlaege:sehen' },
  { to: '/verwaltung/lehrkraefte', label: 'Lehrkräfte', icon: Mail, permission: 'orders:view', hiddenWith: 'users:manage' },
  { to: '/verwaltung/hilfsmittel', label: 'Druckteile verwalten', icon: Boxes, permission: 'catalog:view' },
  { to: '/verwaltung/filamente', label: 'Farbrollen', icon: Palette, permission: 'filaments:manage' },
  { to: '/verwaltung/stammdaten', label: 'Stammdaten', icon: Database, permission: 'masterdata:manage' },
  { to: '/verwaltung/einstellungen', label: 'Einstellungen', icon: Settings, permission: 'settings:manage' },
  { to: '/verwaltung/personen', label: 'Personen', icon: Users, permission: 'users:manage' },
];

/** Hauptnavigation; „Meine Anfragen“ für angemeldete Lehrkräfte oder bei eingeschalteter Statusanzeige. */
function useMainNav() {
  const { config } = useConfig();
  const { can } = useAuth();
  return MAIN_NAV.filter((i) => (i.permission ? can(i.permission) : i.to !== '/anfragen' || can('orders:own') || config?.features.requesterTracking));
}

/** Plakette mit Anzahl; der Text steht für Screenreader dabei. */
function CountBadge({ count, className }: { count?: number; className?: string }) {
  if (!count) return null;
  return (
    <span className={cx('inline-flex min-w-6 items-center justify-center rounded-full bg-brand-700 px-1.5 py-0.5 text-[0.75rem] font-bold leading-none text-white', className)}>
      {count}
      <span className="sr-only"> neu</span>
    </span>
  );
}

/** Anzahl neuer Vorschläge (nur mit Recht „Vorschläge sehen“); wird bei jedem Seitenwechsel aktualisiert. */
function useNewProposalCount() {
  const { can } = useAuth();
  const { pathname } = useLocation();
  const allowed = can('vorschlaege:sehen');
  // nur die Zahl (nicht die ganze Liste); `n` lädt sie bei jedem Seitenwechsel neu
  const { data } = useApi<{ neu: number }>(allowed ? `/proposals/anzahl-neu?n=${encodeURIComponent(pathname)}` : null);
  return allowed ? (data?.neu ?? 0) : 0;
}

function SideLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const kurz = item.label.length > 18 ? item.shortLabel : undefined;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          'group flex min-h-11 items-center gap-3 rounded-xl px-3.5 font-bold transition-colors sm:min-h-12 sm:rounded-2xl sm:px-4',
          isActive ? 'bg-brand-700 text-white shadow-sm' : 'text-stone-700 hover:bg-stone-200/60 hover:text-stone-900',
        )
      }
    >
      <item.icon className="size-5 shrink-0" aria-hidden />
      {/* iPad quer (lg bis xl): schmale Seitenleiste – Kurzname, falls vorhanden (z. B. „Katalog“); nur bei langen Namen, sonst würde „Meine Anfragen“ zu „Anfragen“ wie in der Verwaltung */}
      <span className={cx('flex-1', kurz && 'lg:max-xl:hidden')}>{item.label}</span>
      {kurz && <span className="hidden flex-1 lg:max-xl:inline">{kurz}</span>}
      <CountBadge count={item.badge} />
    </NavLink>
  );
}

/** Administratoren: immer erreichbarer Weg in den Server-Manager (eigene Seite unter <pfad>/manager, gleiche Anmeldung). */
function ManagerLink() {
  return (
    <a
      href={withBase('/manager/')}
      className="group flex min-h-11 items-center gap-3 rounded-xl px-3.5 font-bold text-stone-700 transition-colors hover:bg-stone-200/60 hover:text-stone-900 sm:min-h-12 sm:rounded-2xl sm:px-4"
      data-testid="nav-manager"
    >
      <Server className="size-5 shrink-0" aria-hidden />
      <span className="flex-1">Server-Manager</span>
    </a>
  );
}

function Navigation({ onNavigate, newProposals = 0 }: { onNavigate?: () => void; newProposals?: number }) {
  const { can, user } = useAuth();
  const mainNav = useMainNav();
  const admin = ADMIN_NAV.filter((i) => (!i.permission || can(i.permission)) && !(i.hiddenWith && can(i.hiddenWith))).map((i) =>
    i.to === '/verwaltung/vorschlaege' ? { ...i, badge: newProposals } : i,
  );
  return (
    <nav aria-label="Hauptnavigation" className="space-y-5 sm:space-y-8">
      <div className="space-y-0.5 sm:space-y-1">
        {mainNav.map((i) => (
          <SideLink key={i.to} item={i} onNavigate={onNavigate} />
        ))}
      </div>
      {admin.length > 0 && (
        <div>
          <p className="mb-1.5 px-3.5 text-hinweis font-bold uppercase sm:mb-2 sm:px-4 tracking-wider text-stone-700">Verwaltung</p>
          <div className="space-y-0.5 sm:space-y-1">
            {admin.map((i) => (
              <SideLink key={i.to} item={i} onNavigate={onNavigate} />
            ))}
            {user?.role === 'admin' && <ManagerLink />}
          </div>
        </div>
      )}
    </nav>
  );
}

function UserBox({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  // Ohne Anmeldung: kein Kasten – der Zugang fürs Team steckt unauffällig im Fußbereich.
  if (!user) return null;
  const initials = user.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3">
      <NavLink
        to="/konto"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-stone-50"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 font-bold text-brand-800" aria-hidden>
          {initials}
        </span>
        <span className="min-w-0">
          <span className="block wrap-anywhere font-bold text-stone-900">{user.displayName}</span>
          <span className="block wrap-anywhere text-hinweis text-stone-600">{ROLE_LABELS[user.role]}</span>
        </span>
      </NavLink>
      <button
        type="button"
        onClick={async () => {
          try {
            await logout();
            navigate('/login', { replace: true });
          } catch {
            toast('error', 'Abmelden hat nicht geklappt – bitte erneut versuchen.');
          }
        }}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-base font-bold text-stone-700 hover:bg-stone-100 hover:text-stone-900"
      >
        <LogOut className="size-5" aria-hidden />
        Abmelden
      </button>
    </div>
  );
}

/** Fußzeile der Seitenleiste: Versionsnummer (eine für alles, siehe CHANGELOG.md) und der Zugang zur Anmeldung. */
function VersionNote({ onNavigate }: { onNavigate?: () => void }) {
  const { user, loading } = useAuth();
  return (
    <div className="flex items-end justify-between gap-2 px-2">
      <p className="text-hinweis leading-snug text-stone-700" data-testid="app-version">Mosaik³LAB · Version {APP_VERSION}</p>
      {!user && !loading && <TeamLoginLink onNavigate={onNavigate} />}
    </div>
  );
}

/** Kleiner, bewusst unauffälliger Zugang zur Anmeldung (Lehrkräfte, Druck-Team, Administration). */
function TeamLoginLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <NavLink
      to="/login"
      onClick={onNavigate}
      title="Anmelden mit Schul-E-Mail"
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-hinweis font-bold text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-stone-200/70 hover:text-stone-900"
    >
      <LogIn className="size-4" aria-hidden />
      Anmelden
    </NavLink>
  );
}

/** Grunddaten (Stammdaten, Schalter) nicht ladbar – z. B. Server aus: Hinweis statt leerer Seiten oder endloser Ladeanzeige. */
function ConfigErrorNote() {
  const { config, error } = useConfig();
  if (!error || config) return null;
  // Neu laden holt Anmeldung, Grunddaten und den Inhalt der Seite gemeinsam – ohne Daten gibt es nichts zu verlieren.
  return (
    <Alert kind="warning" title="Die Grunddaten konnten nicht geladen werden" className="mb-6">
      <p>{error}</p>
      <Button icon={RotateCw} className="mt-3" onClick={() => window.location.reload()}>
        Erneut versuchen
      </Button>
    </Alert>
  );
}

export function Layout() {
  const { can, user } = useAuth();
  const mainNav = useMainNav();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigationType = useNavigationType();
  const newProposals = useNewProposalCount();

  useEffect(() => {
    setMenuOpen(false);
    document.getElementById('main')?.focus({ preventScroll: true });
    // Bei „Zurück“ (POP) stellt der Browser die alte Scrollposition wieder her.
    if (navigationType !== 'POP') window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei Seitenwechsel
  }, [location.pathname]);

  const teamProposals = can('vorschlaege:sehen');
  // Verwaltung: Übersicht oder – bei Einzelrechten ohne Übersicht – die erste freigegebene Seite.
  const adminStart = ADMIN_NAV.find((i) => i.permission && can(i.permission));
  const bottomNav: NavItem[] = [
    // Wer die Vorschläge des Teams sieht, findet „Meine Vorschläge“ im Menü – sonst wird die Leiste auf dem Handy zu eng.
    ...mainNav.filter((i) => !(teamProposals && i.to === '/vorschlaege')),
    // Ist die erste freigegebene Seite selbst „Vorschläge“, nur einmal zeigen (mit Zahl neuer Vorschläge).
    ...(adminStart && adminStart.to !== '/verwaltung/vorschlaege' ? [{ ...adminStart, shortLabel: 'Verwaltung', icon: Wrench }] : []),
    // Team: Vorschläge direkt erreichbar, mit Zahl neuer Vorschläge.
    ...ADMIN_NAV.filter((i) => i.to === '/verwaltung/vorschlaege' && teamProposals).map((i) => ({ ...i, shortLabel: 'Vorschläge', tinyLabel: 'Ideen', badge: newProposals })),
    ...(user ? [{ to: '/konto', label: 'Mein Konto', shortLabel: 'Konto', icon: UserRound }] : []),
  ];

  return (
    <div className="min-h-svh">
      <a href="#main" className="skip-link">
        Zum Inhalt springen
      </a>

      {/* Sidebar – Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-stone-200/80 bg-canvas-deep px-4 py-6 lg:flex xl:w-76 xl:px-5">
        <NavLink to="/katalog" className="mb-10 rounded-2xl px-2 py-1" aria-label="Mosaik³LAB – zur Startseite">
          <Logo />
        </NavLink>
        <div className="flex-1 overflow-y-auto">
          <Navigation newProposals={newProposals} />
        </div>
        <div className="mt-6 space-y-4">
          <UserBox />
          <VersionNote />
        </div>
      </aside>

      {/* Kopfzeile – Mobil & Tablet */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200/80 bg-canvas px-[max(0.75rem,env(safe-area-inset-left))] py-1.5 sm:px-4 sm:py-3 lg:hidden">
        <NavLink to="/katalog" className="inline-flex min-h-11 items-center rounded-xl" aria-label="Mosaik³LAB – zur Startseite">
          <Logo subtitle={false} />
        </NavLink>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex min-h-11 items-center gap-2 rounded-xl px-3.5 font-bold text-stone-800 ring-1 ring-stone-300 hover:bg-white sm:min-h-12 sm:px-4"
          aria-haspopup="dialog"
        >
          <Menu className="size-5" aria-hidden />
          Menü
        </button>
      </header>

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title="Menü" size="sm">
        <div className="space-y-5">
          <Navigation onNavigate={() => setMenuOpen(false)} newProposals={newProposals} />
          <UserBox onNavigate={() => setMenuOpen(false)} />
          <VersionNote onNavigate={() => setMenuOpen(false)} />
        </div>
      </Dialog>

      <main id="main" tabIndex={-1} className="outline-none lg:pl-64 xl:pl-76">
        {/* Unten fester Platz für Icon-Leiste + Home-Balken – bewusst ohne env(), sonst ändert sich die Seitenhöhe, wenn Safari
            die Adressleiste ein-/ausblendet, und die Seite springt beim Ankommen unten. */}
        <div className="mx-auto max-w-7xl px-3 pb-36 pt-4 sm:px-6 sm:pt-6 lg:px-10 lg:pb-16 lg:pt-10">
          <ConfigErrorNote />
          <Outlet />
        </div>
      </main>

      <NeuigkeitenDialog />

      {/* Untere Navigationsleiste – Smartphone */}
      <nav
        aria-label="Schnellnavigation"
        // Safe-Area: Home-Balken (unten) und Notch im Querformat (links/rechts) – braucht viewport-fit=cover in index.html.
        className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:hidden"
      >
        <ul className="mx-auto flex max-w-xl">
          {bottomNav.map((item) => (
            <li key={item.to} className="min-w-0 flex-1">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx(
                    // Unter 360 px (iPhone SE 1) etwas kleiner, damit „Verwaltung“ und „Vorschläge“ nicht umbrechen.
                    'flex min-h-16 flex-col items-center justify-center gap-1 px-0.5 pt-1 text-center text-[0.85rem] font-bold leading-tight max-[359px]:px-0 max-[359px]:text-[0.8rem] max-[359px]:tracking-tight',
                    isActive ? 'text-brand-800' : 'text-stone-600 hover:text-stone-900',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cx('relative grid h-8 w-full max-w-15 place-items-center rounded-full transition-colors', isActive && 'bg-brand-100')}>
                      <item.icon className="size-6" aria-hidden />
                      <CountBadge count={item.badge} className="absolute -right-0.5 -top-1.5 min-w-5 px-1 text-[0.7rem]" />
                    </span>
                    {/* Unter 390 px (bis iPhone SE/mini) ggf. noch kürzer sichtbar; der übliche Name bleibt für Screenreader (sr-only) der Name des Links. */}
                    <span className={cx('max-w-full wrap-anywhere', item.tinyLabel && 'max-[389px]:sr-only')}>{item.shortLabel ?? item.label}</span>
                    {item.tinyLabel && (
                      <span className="hidden max-w-full wrap-anywhere max-[389px]:inline" aria-hidden>
                        {item.tinyLabel}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
