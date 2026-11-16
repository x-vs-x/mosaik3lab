import { Clock, Layers, Lightbulb, PackageOpen, Search, X } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ItemImage } from '../../components/ItemImage';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Badge, Button, Card, cx, DemoBadge, LinkButton, PageHeader, Select, Spinner } from '../../components/ui';
import { ColorSwatch } from '../../components/ColorSwatch';
import { useMasterData } from '../../lib/config';
import { availableFilaments } from '../../lib/filaments';
import { categoryMeta } from '../../lib/constants';
import { formatDuration } from '../../lib/format';
import { ITEM_KIND_LABELS, type Item, type ItemKind } from '../../lib/types';

const MAX_SWATCHES = 6;
import { useApi, useDebounced, useDocumentTitle } from '../../lib/useApi';

export function CatalogPage() {
  useDocumentTitle('Katalog der Hilfs- und Lehrmittel');
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

  const { data: items, error, loading } = useApi<Item[]>(query);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const hasFilters = !!(q || category || area || kind);

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
              placeholder="Suchen, z. B. „Stift“, „Tablet“ oder „Essen“"
              className="block min-h-11 w-full rounded-xl border border-stone-300 bg-stone-50/60 pl-12 pr-4 text-[1.05rem] sm:min-h-13 sm:rounded-2xl placeholder:text-stone-500 hover:border-stone-400 focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-600/20"
            />
          </div>
          <div className="xl:w-56">
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
          <div className="xl:w-64">
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

        <div className="mt-3 sm:mt-4" role="group" aria-label="Nach Kategorie filtern">
          <div className="no-scrollbar relative -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap">
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
          {items ? (items.length === 1 ? '1 Druckteil' : `${items.length} Druckteile`) : ' '}
          {hasFilters && items ? ' gefunden' : ''}
        </p>
        {hasFilters && (
          <Button variant="ghost" size="sm" icon={X} onClick={() => setParams({}, { replace: true })}>
            Filter zurücksetzen
          </Button>
        )}
      </div>

      {error && <Alert kind="error">{error.message}</Alert>}
      {loading && !items && <Spinner label="Katalog wird geladen …" />}

      {items && items.length === 0 && (
        <div className="rounded-3xl border-2 border-dashed border-stone-200 bg-white/60 px-4 py-10 text-center sm:px-6 sm:py-14">
          <PackageOpen className="mx-auto mb-3 size-10 text-stone-400" aria-hidden />
          <p className="text-lg font-bold text-stone-800">Keine passenden Druckteile gefunden.</p>
          <p className="mt-1 text-stone-600">Versuchen Sie einen anderen Suchbegriff oder entfernen Sie Filter.</p>
          {canPropose && (
            <LinkButton to="/vorschlag/neu" icon={Lightbulb} className="mt-5">
              Nicht gefunden? Vorschlag machen
            </LinkButton>
          )}
        </div>
      )}

      {items && items.length > 0 && (
        <ul className={cx('grid gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3', loading && 'opacity-60 transition-opacity')}>
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}

      {items?.some((i) => i.isDemo) && (
        <p className="mt-10 text-center text-[0.9rem] text-stone-500">
          Mit „Beispiel“ gekennzeichnete Einträge sind Beispieldaten für die Erprobung.
        </p>
      )}
    </>
  );
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
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[0.95rem] font-bold transition-colors sm:gap-2 sm:px-4',
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
        className="group flex h-full flex-col overflow-hidden rounded-2xl border sm:rounded-3xl border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)] transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_14px_32px_-16px_rgba(28,25,23,0.25)]"
      >
        <div className="relative aspect-[2/1] overflow-hidden sm:aspect-[4/3]">
          <ItemImage item={item} className="transition-transform duration-300 group-hover:scale-[1.03]" />
          <div className="absolute left-2.5 top-2.5 flex gap-2 sm:left-3 sm:top-3">
            <Badge className={cx(meta.chip, 'bg-white/95')} icon={meta.icon}>
              {item.category}
            </Badge>
          </div>
          {item.isDemo && (
            <div className="absolute bottom-2.5 right-2.5 sm:bottom-3 sm:right-3">
              <DemoBadge />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <h2 className="break-words text-[1.1rem] font-bold leading-snug sm:text-[1.15rem] text-stone-900 group-hover:text-brand-800">{item.name}</h2>
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
                <span className="text-[0.85rem] font-bold text-stone-600" aria-hidden>
                  +{extra}
                </span>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-stone-100 pt-3 text-[0.9rem] sm:mt-4 sm:pt-4 text-stone-600">
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
