import { ChevronDown, Clock, Layers, Lightbulb, PackageOpen, RotateCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import {
  KATALOG_SEITE,
  ladeAnzahl,
  ladePosition,
  merkeAnzahl,
  merkePosition,
  naechsteAnzahl,
  sollPositionWiederherstellen,
} from './katalogScroll';
import { NachladenFuss } from './Nachladen';
import { ItemImage } from '../../components/ItemImage';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Badge, Button, Card, cx, DemoBadge, LinkButton, PageHeader, Select, Spinner } from '../../components/ui';
import { ColorSwatch } from '../../components/ColorSwatch';
import { useMasterData } from '../../lib/config';
import { availableFilaments } from '../../lib/filaments';
import { categoryMeta } from '../../lib/constants';
import { formatDuration } from '../../lib/format';
import { isConnectionProblem } from '../../lib/api';
import { ITEM_KIND_LABELS, type Item, type ItemKind } from '../../lib/types';

const MAX_SWATCHES = 6;
import { useApi, useDebounced, useDocumentTitle } from '../../lib/useApi';

export function CatalogPage() {
  useDocumentTitle('Katalog');
  const { user, can } = useAuth();
  // Lehrkräfte und Gäste (Gäste melden sich beim Klick an); das Druck-Team reicht nichts ein.
  const canPropose = !user || can('vorschlaege:eigene');
  const md = useMasterData();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('kategorie') ?? '';
  const area = params.get('bereich') ?? '';
  const kind = params.get('art') ?? '';
  const debouncedQ = useDebounced(q);

  const query = useMemo(() => {
    const s = new URLSearchParams();
    if (debouncedQ.trim()) s.set('q', debouncedQ.trim());
    if (category) s.set('category', category);
    if (area) s.set('area', area);
    if (kind) s.set('kind', kind);
    return `/items?${s.toString()}`;
  }, [debouncedQ, category, area, kind]);

  // Die Liste kommt immer vollständig (Suche und Filter über alle Druckteile), angezeigt wird nur der Anfang.
  const { data: items, error, loading, reload } = useApi<Item[]>(query);
  useEinmalWiederholen(query, error, loading, reload);
  // Fehler beim Aktualisieren: Die alte Liste bleibt sichtbar, aber als „nicht aktuell“ (keine Zahl, abgeblendet).
  const veraltet = !!error && !loading;
  const [anzahl, setAnzahl] = useState(KATALOG_SEITE);
  // Neue Suche oder neuer Filter: wieder mit der ersten Seite beginnen.
  const [anzahlFuer, setAnzahlFuer] = useState(query);
  if (anzahlFuer !== query) {
    setAnzahlFuer(query);
    setAnzahl(KATALOG_SEITE);
  }
  const gesamt = items?.length ?? 0;
  const [laedtMehr, startMehr] = useTransition();
  const mehr = useCallback(() => startMehr(() => setAnzahl((a) => naechsteAnzahl(a, gesamt))), [gesamt]);
  useScrollPositionMerken(!!items, anzahl, setAnzahl);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const hasFilters = !!(q || category || area || kind);
  // Handy: Art, Einsatzbereich und Kategorien hinter „Filter“ (offen, wenn schon gefiltert); ab sm immer sichtbar.
  const activeFilters = [category, area, kind].filter(Boolean).length;
  const [filterOpen, setFilterOpen] = useState(activeFilters > 0);
  const filterClass = cx(!filterOpen && 'hidden', 'sm:block');

  return (
    <>
      <PageHeader
        eyebrow="Mosaik³LAB"
        title="Katalog der Hilfs- und Lehrmittel"
        description="Finden Sie 3D-gedruckte Hilfs- und Lehrmittel für Unterricht, Therapie und Alltag – und fragen Sie sie direkt beim 3D-Druck-Team an."
        actions={
          canPropose && (
            <LinkButton to="/vorschlag/neu" variant="secondary" icon={Lightbulb}>
              Etwas vorschlagen
            </LinkButton>
          )
        }
      />

      {/* Suche & Filter */}
      <Card className="mb-5 p-3 sm:mb-8 sm:p-5">
        <div className="grid gap-2.5 sm:gap-4 md:grid-cols-2 xl:flex xl:flex-row">
          <div className="relative md:col-span-2 xl:flex-1">
            <label htmlFor="catalog-search" className="sr-only">
              Druckteile suchen
            </label>
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-500" aria-hidden />
            <input
              id="catalog-search"
              type="search"
              value={q}
              onChange={(e) => update('q', e.target.value)}
              // Kurz genug für 320 px breite Handys (vorher „… oder „Essen““ abgeschnitten).
              placeholder="Suchen, z. B. „Stift“"
              className="block min-h-11 w-full rounded-xl border border-stone-300 bg-stone-50/60 pl-12 pr-4 text-base sm:min-h-13 sm:rounded-2xl placeholder:text-stone-500 hover:border-stone-400 focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-600/20"
            />
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen((o) => !o)}
            aria-expanded={filterOpen}
            aria-controls="catalog-filter-art catalog-filter-bereich catalog-filter-kategorie"
            className="flex min-h-11 items-center gap-2 rounded-xl px-3 font-bold text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-50 sm:hidden"
          >
            <SlidersHorizontal className="size-5" aria-hidden />
            Filter{activeFilters > 0 && ` (${activeFilters} aktiv)`}
            <ChevronDown className={cx('ml-auto size-5 transition-transform', filterOpen && 'rotate-180')} aria-hidden />
          </button>
          <div id="catalog-filter-art" className={cx('xl:w-56', filterClass)}>
            <label htmlFor="kind-filter" className="sr-only">
              Art
            </label>
            <Select id="kind-filter" value={kind} onChange={(e) => update('art', e.target.value)} className="sm:min-h-13 sm:rounded-2xl">
              <option value="">Alle Arten</option>
              {(Object.keys(ITEM_KIND_LABELS) as ItemKind[])
                .filter((k) => k !== 'beides')
                .map((k) => (
                  <option key={k} value={k}>
                    {ITEM_KIND_LABELS[k]}
                  </option>
                ))}
            </Select>
          </div>
          <div id="catalog-filter-bereich" className={cx('xl:w-64', filterClass)}>
            <label htmlFor="area-filter" className="sr-only">
              Einsatzbereich
            </label>
            <Select id="area-filter" value={area} onChange={(e) => update('bereich', e.target.value)} className="sm:min-h-13 sm:rounded-2xl">
              <option value="">Alle Einsatzbereiche</option>
              {md.useAreas.map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div id="catalog-filter-kategorie" className={cx('mt-3 sm:mt-4', filterClass)} role="group" aria-label="Nach Kategorie filtern">
          <div className="flex flex-wrap gap-2">
            <CategoryChip label="Alle" active={!category} onClick={() => update('kategorie', '')} />
            {md.categories.map((c) => (
              <CategoryChip
                key={c.id}
                label={c.name}
                icon={categoryMeta(md, c.name).icon}
                active={category === c.name}
                onClick={() => update('kategorie', category === c.name ? '' : c.name)}
              />
            ))}
          </div>
        </div>
      </Card>

      <div className="mb-3 flex min-h-10 flex-wrap items-center justify-between gap-3 sm:mb-5">
        <p className="font-bold text-stone-700" aria-live="polite" aria-atomic="true">
          {items && !veraltet ? (items.length === 1 ? '1 Druckteil' : `${items.length} Druckteile`) : ' '}
          {hasFilters && items && !veraltet ? ' gefunden' : ''}
        </p>
        {hasFilters && (
          <Button variant="ghost" size="sm" icon={X} onClick={() => setParams({}, { replace: true })}>
            Filter zurücksetzen
          </Button>
        )}
      </div>

      {veraltet && (
        <Alert kind="error" className="mb-4" title={items ? 'Der Katalog konnte nicht aktualisiert werden' : 'Der Katalog konnte nicht geladen werden'}>
          <p>
            {error.message}
            {items && ' Darunter steht noch der vorige Stand – er passt vielleicht nicht zur Suche oder zum Filter.'}
          </p>
          <Button variant="secondary" icon={RotateCw} className="mt-3" onClick={() => void reload()}>
            Erneut versuchen
          </Button>
        </Alert>
      )}
      {loading && !items && <Spinner label="Katalog wird geladen …" />}

      {items && items.length === 0 && (
        <div className="rounded-3xl border-2 border-dashed border-stone-200 bg-white/60 px-4 py-10 text-center sm:px-6 sm:py-14">
          <PackageOpen className="mx-auto mb-3 size-10 text-stone-400" aria-hidden />
          <p className="text-abschnitt font-bold text-stone-800">Keine passenden Druckteile gefunden.</p>
          <p className="mt-1 text-stone-600">Versuchen Sie einen anderen Suchbegriff oder entfernen Sie Filter.</p>
          {canPropose && (
            <LinkButton to="/vorschlag/neu" icon={Lightbulb} className="mt-5">
              Nicht gefunden? Vorschlag machen
            </LinkButton>
          )}
        </div>
      )}

      {items && items.length > 0 && (
        <ul className={cx('grid gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3', (loading || veraltet) && 'opacity-60 transition-opacity')}>
          {items.slice(0, anzahl).map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}
      {items && <NachladenFuss angezeigt={Math.min(anzahl, gesamt)} gesamt={gesamt} laedt={laedtMehr} onMehr={mehr} />}

      {items?.some((i) => i.isDemo) && (
        <p className="mt-10 text-center text-hinweis text-stone-500">
          Mit „Beispiel“ gekennzeichnete Einträge sind Beispieldaten für die Erprobung.
        </p>
      )}
    </>
  );
}

/** Verbindungsfehler (WLAN kurz weg, Server startet neu): je Suche/Filter einmal nach 2 s selbst erneut versuchen. */
function useEinmalWiederholen(query: string, error: unknown, loading: boolean, reload: () => Promise<void>) {
  const wiederholtFuer = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !isConnectionProblem(error) || wiederholtFuer.current === query) return;
    wiederholtFuer.current = query;
    const t = setTimeout(() => void reload(), 2000);
    return () => clearTimeout(t);
  }, [query, error, loading, reload]);
}

/**
 * Merkt die Scrollhöhe je Katalog-Adresse (Suche/Filter) und stellt sie wieder her, wenn man vom Druckteil
 * zurückkommt – per Zurück-Taste/-Geste (POP) oder per Link/Navigation. Erst wenn die Liste geladen ist: Vorher ist
 * die Seite zu kurz, deshalb klappte das Zurückspringen des Browsers allein nicht. Die Anzahl der angezeigten
 * Druckteile wird mitgemerkt und zuerst wiederhergestellt, sonst wäre die Seite weit unten zu kurz.
 */
function useScrollPositionMerken(geladen: boolean, anzahl: number, setAnzahl: (n: number) => void) {
  const { search } = useLocation();
  const navigationType = useNavigationType();
  // Art des Seitenwechsels beim Öffnen; Filter ändern sie danach (REPLACE).
  const [navBeimOeffnen] = useState(navigationType);
  const [bereit, setBereit] = useState(false);
  // Zielhöhe nach dem Laden (0 = nicht wiederherstellen); null = noch nicht entschieden.
  const [ziel, setZiel] = useState<number | null>(null);

  useEffect(() => {
    if (!geladen || ziel !== null) return;
    // Erst hier prüfen: Das Layout meldet den Seitenwechsel nach dem ersten Zeichnen des Katalogs.
    const y = sollPositionWiederherstellen(navBeimOeffnen) ? ladePosition(search) : null;
    if (y) setAnzahl(ladeAnzahl(search));
    setZiel(y ?? 0);
  }, [geladen, ziel, navBeimOeffnen, search, setAnzahl]);

  useEffect(() => {
    if (ziel === null || bereit) return;
    // Kurz danach, damit die Liste (mit der gemerkten Anzahl) steht – und nach dem „nach oben“ im Layout.
    const timer = setTimeout(() => {
      if (ziel) window.scrollTo({ top: ziel, behavior: 'instant' });
      setBereit(true);
    });
    return () => clearTimeout(timer);
  }, [ziel, bereit]);

  useEffect(() => {
    if (bereit) merkeAnzahl(search, anzahl);
  }, [bereit, search, anzahl]);

  useEffect(() => {
    if (!bereit) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Beim Wechsel zum Druckteil wird die Seite kürzer, bevor der Katalog ganz weg ist – das nicht merken.
        if (window.location.pathname.endsWith('/katalog') && window.location.search === search) {
          merkePosition(search, window.scrollY);
        }
      }, 100);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [bereit, search]);
}

function CategoryChip({
  label,
  active,
  onClick,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: typeof Layers;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full px-3.5 text-base font-bold transition-colors sm:gap-2 sm:px-4',
        active
          ? 'bg-stone-900 text-white'
          : 'bg-white text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-stone-50 hover:ring-stone-400',
      )}
    >
      {Icon && <Icon className="size-4" aria-hidden />}
      {label}
    </button>
  );
}

function ItemCard({ item }: { item: Item }) {
  const md = useMasterData();
  const meta = categoryMeta(md, item.category);
  const filaments = availableFilaments(md, item.colors);
  const extra = filaments.length - MAX_SWATCHES;
  return (
    <li>
      <Link
        to={`/katalog/${item.id}`}
        state={{ fromCatalog: true }}
        // Höhe sicher merken, auch wenn kein Scroll-Ereignis mehr kam.
        onClick={() => merkePosition(window.location.search, window.scrollY)}
        className="group flex h-full flex-col overflow-hidden rounded-2xl border sm:rounded-3xl border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)] transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_14px_32px_-16px_rgba(28,25,23,0.25)]"
      >
        <div className="relative aspect-[5/2] overflow-hidden sm:aspect-[4/3]">
          <ItemImage item={item} className="transition-transform duration-300 group-hover:scale-[1.03]" />
          <div className="absolute inset-x-2.5 top-2.5 flex gap-2 sm:inset-x-3 sm:top-3">
            <Badge className={cx(meta.chip, 'bg-white/95')} icon={meta.icon}>
              {item.category}
            </Badge>
          </div>
          {item.isDemo && (
            <div className="absolute inset-x-2.5 bottom-2.5 flex justify-end sm:inset-x-3 sm:bottom-3">
              <DemoBadge />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <h2 className="wrap-anywhere text-abschnitt font-bold text-stone-900 group-hover:text-brand-800">{item.name}</h2>
          <p className="mt-1 line-clamp-3 flex-1 text-stone-600 sm:mt-1.5">{item.shortDescription}</p>
          {filaments.length > 0 && (
            <div className="mt-3 flex items-center gap-1.5">
              <span className="sr-only">
                Verfügbare Farben: {filaments.map((f) => f.colorName).join(', ')}
              </span>
              {filaments.slice(0, MAX_SWATCHES).map((f) => (
                <ColorSwatch key={f.id} hex={f.hex} className="size-4" />
              ))}
              {extra > 0 && (
                <span className="text-hinweis font-bold text-stone-600" aria-hidden>
                  +{extra}
                </span>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-stone-100 pt-3 text-hinweis sm:mt-4 sm:pt-4 text-stone-600">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4 text-stone-500" aria-hidden />
              <span className="sr-only">Druckdauer:</span>
              {formatDuration(item.printTimeMinutes)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Layers className="size-4 text-stone-500" aria-hidden />
              <span className="sr-only">Material:</span>
              {item.material}
            </span>
            <span className="ml-auto font-bold text-brand-700 group-hover:underline">Details</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
