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
  UserRound,
  Wrench,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useConfig } from '../lib/config';
import { useApi } from '../lib/useApi';
import { ROLE_LABELS } from '../lib/constants';
import type { Permission } from '../lib/types';
import { Dialog } from './Dialog';
import { Logo } from './Logo';
import { Alert, Button, cx } from './ui';

interface NavItem {
  to: string;
  label: string;
  shortLabel?: string;
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
  const { data } = useApi<unknown[]>(allowed ? `/proposals?status=neu&n=${encodeURIComponent(pathname)}` : null);
  return allowed ? (data?.length ?? 0) : 0;
}

function SideLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
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
      <span className="flex-1">{item.label}</span>
      <CountBadge count={item.badge} />
    </NavLink>
  );
}

function Navigation({ onNavigate, newProposals = 0 }: { onNavigate?: () => void; newProposals?: number }) {
  const { can } = useAuth();
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
          <p className="mb-1.5 px-3.5 text-[0.85rem] font-bold uppercase sm:mb-2 sm:px-4 tracking-wider text-stone-700">Verwaltung</p>
          <div className="space-y-0.5 sm:space-y-1">
            {admin.map((i) => (
              <SideLink key={i.to} item={i} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

function UserBox({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
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
          <span className="block break-words font-bold text-stone-900">{user.displayName}</span>
          <span className="block break-words text-[0.85rem] text-stone-600">{ROLE_LABELS[user.role]}</span>
        </span>
      </NavLink>
      <button
        type="button"
        onClick={async () => {
          await logout();
          navigate('/login', { replace: true });
        }}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-[0.95rem] font-bold text-stone-700 hover:bg-stone-100 hover:text-stone-900"
      >
        <LogOut className="size-5" aria-hidden />
        Abmelden
      </button>
    </div>
  );
}

function PrototypeNote({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  return (
    <div className="flex items-end justify-between gap-2 px-2">
      <p className="text-[0.85rem] leading-snug text-stone-700">Lokaler Prototyp · nicht für den Netzbetrieb freigegeben</p>
      {!user && <TeamLoginLink onNavigate={onNavigate} />}
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
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-[0.9rem] font-bold text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-stone-200/70 hover:text-stone-900"
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
  const newProposals = useNewProposalCount();

  useEffect(() => {
    setMenuOpen(false);
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const teamProposals = can('vorschlaege:sehen');
  const bottomNav: NavItem[] = [
    // Wer die Vorschläge des Teams sieht, findet „Meine Vorschläge“ im Menü – sonst wird die Leiste auf dem Handy zu eng.
    ...mainNav.filter((i) => !(teamProposals && i.to === '/vorschlaege')),
    // Verwaltung: Übersicht oder – bei Einzelrechten ohne Übersicht – die erste freigegebene Seite.
    ...ADMIN_NAV.filter((i) => i.permission && can(i.permission))
      .slice(0, 1)
      .map((i) => ({ ...i, shortLabel: 'Verwaltung', icon: Wrench })),
    // Team: Vorschläge direkt erreichbar, mit Zahl neuer Vorschläge.
    ...ADMIN_NAV.filter((i) => i.to === '/verwaltung/vorschlaege' && teamProposals).map((i) => ({ ...i, shortLabel: 'Vorschläge', badge: newProposals })),
    ...(user ? [{ to: '/konto', label: 'Mein Konto', shortLabel: 'Konto', icon: UserRound }] : []),
  ];

  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link">
        Zum Inhalt springen
      </a>

      {/* Sidebar – Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-76 flex-col border-r border-stone-200/80 bg-canvas-deep px-5 py-6 lg:flex">
        <NavLink to="/katalog" className="mb-10 rounded-2xl px-2 py-1" aria-label="Mosaik³LAB – zur Startseite">
          <Logo />
        </NavLink>
        <div className="flex-1 overflow-y-auto">
          <Navigation newProposals={newProposals} />
        </div>
        <div className="mt-6 space-y-4">
          <UserBox />
          <PrototypeNote />
        </div>
      </aside>

      {/* Kopfzeile – Mobil & Tablet */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200/80 bg-canvas/90 px-3 py-1.5 backdrop-blur sm:px-4 sm:py-3 lg:hidden">
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
          <PrototypeNote onNavigate={() => setMenuOpen(false)} />
        </div>
      </Dialog>

      <main id="main" tabIndex={-1} className="outline-none lg:pl-76">
        <div className="mx-auto max-w-7xl px-3 pb-24 pt-4 sm:px-6 sm:pb-28 sm:pt-6 lg:px-10 lg:pb-16 lg:pt-10">
          <ConfigErrorNote />
          <Outlet />
        </div>
      </main>

      {/* Untere Navigationsleiste – Smartphone */}
      <nav
        aria-label="Schnellnavigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto flex max-w-xl">
          {bottomNav.map((item) => (
            <li key={item.to} className="min-w-0 flex-1">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-center text-[0.85rem] font-bold leading-tight',
                    isActive ? 'text-brand-800' : 'text-stone-600 hover:text-stone-900',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cx('relative grid h-7 w-full max-w-14 place-items-center rounded-full transition-colors', isActive && 'bg-brand-100')}>
                      <item.icon className="size-5" aria-hidden />
                      <CountBadge count={item.badge} className="absolute -right-0.5 -top-1.5 min-w-5 px-1 text-[0.7rem]" />
                    </span>
                    <span className="max-w-full break-words">{item.shortLabel ?? item.label}</span>
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
