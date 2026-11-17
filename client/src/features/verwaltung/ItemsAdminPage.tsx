import { ArrowDownToLine, ArrowUpFromLine, Boxes, Eye, Pencil, Plus, Search, SearchX, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { DateiLaden } from '../../components/DateiLaden';
import { Dialog } from '../../components/Dialog';
import { ItemImage } from '../../components/ItemImage';
import { useToast } from '../../components/Toast';
import {
  ActionBar,
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  cx,
  DemoBadge,
  EmptyState,
  inputClass,
  LinkButton,
  PageHeader,
  Spinner,
  Switch,
} from '../../components/ui';
import { ColorSwatch } from '../../components/ColorSwatch';
import { api, ApiError } from '../../lib/api';
import { useConfig, useMasterData } from '../../lib/config';
import { filamentLabel, findFilament } from '../../lib/constants';
import { formatDuration, formatRelative, plural } from '../../lib/format';
import { ITEM_KIND_LABELS, type Filament, type Item, type MasterData } from '../../lib/types';
import { useApi, useDocumentTitle } from '../../lib/useApi';
import { EinspielenDialog, exportUrl, MAX_AUSWAHL } from './DruckteileAustausch';
import { ANSICHTEN, filtereDruckteile, leseAnsicht, zaehleAnsichten, type Ansicht } from './druckteilFilter';

const MAX_SWATCHES = 10;

/** Farbtupfer der verfügbaren Farben (Namen für Screenreader und als Tooltip). */
function ItemColors({ ids, md }: { ids: string[]; md: MasterData }) {
  const list = ids.map((id) => findFilament(md, id)).filter((f): f is Filament => !!f);
  if (list.length === 0) {
    return <p className="mt-1 text-hinweis font-bold text-amber-800">Noch keine Farben ausgewählt</p>;
  }
  const shown = list.slice(0, MAX_SWATCHES);
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className="sr-only">
        {list.length} {list.length === 1 ? 'Farbe' : 'Farben'}: {list.map((f) => f.colorName).join(', ')}
      </span>
      {shown.map((f) => (
        <span key={f.id} title={filamentLabel(f)} className="inline-flex">
          <ColorSwatch hex={f.hex} className="size-4" />
        </span>
      ))}
      <span className="ml-1 text-hinweis text-stone-500" aria-hidden>
        {list.length > MAX_SWATCHES ? `+${list.length - MAX_SWATCHES} · ` : ''}
        {list.length} {list.length === 1 ? 'Farbe' : 'Farben'}
      </span>
    </p>
  );
}

export function ItemsAdminPage() {
  useDocumentTitle('Druckteile verwalten');
  const { data: items, setData, error, loading, reload } = useApi<Item[]>('/items?all=1');
  // Suche und Ansicht in der Adresse, damit sie „Zurück“ und Neuladen überstehen (wie bei den Anfragen).
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const ansicht = leseAnsicht(params.get('ansicht'));
  const setParam = (key: 'q' | 'ansicht', value: string) => {
    const next = new URLSearchParams(params);
    if (value && !(key === 'ansicht' && value === 'alle')) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const setQ = (value: string) => setParam('q', value);
  const setAnsicht = (value: Ansicht) => setParam('ansicht', value);
  const [toDelete, setToDelete] = useState<Item>();
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string>();
  const toast = useToast();
  const md = useMasterData();
  const { reload: reloadConfig } = useConfig();
  // Ohne „Katalog bearbeiten“ nur ansehen (das Backend prüft zusätzlich).
  const { can } = useAuth();
  const canEdit = can('catalog:manage');
  const canExport = can('daten:export');
  const canImport = can('daten:import');
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [einspielen, setEinspielen] = useState(false);

  const filtered = useMemo(() => filtereDruckteile(items ?? [], q, ansicht), [items, q, ansicht]);
  const zahlen = useMemo(() => zaehleAnsichten(items ?? [], q), [items, q]);
  const gefiltert = !!q.trim() || ansicht !== 'alle';

  // Auswahl für den Export (nur, was es noch gibt)
  const auswahl = (items ?? []).filter((i) => gewaehlt.has(i.id));
  const alleGewaehlt = !!items?.length && auswahl.length === items.length;
  const sichtbarAlleGewaehlt = filtered.length > 0 && filtered.every((i) => gewaehlt.has(i.id));
  const waehle = (ids: string[], an: boolean) =>
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      for (const id of ids) {
        if (an) neu.add(id);
        else neu.delete(id);
      }
      return neu;
    });

  const replace = (updated: Item) => setData((list) => list?.map((i) => (i.id === updated.id ? updated : i)));

  const togglePublish = async (item: Item, published: boolean) => {
    setBusyId(item.id);
    try {
      const updated = await api<Item>(`/items/${item.id}/publish`, { method: 'PATCH', body: { published } });
      replace(updated);
      toast('success', published ? `„${item.name}“ ist jetzt im Katalog sichtbar.` : `„${item.name}“ wurde ausgeblendet.`);
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusyId(undefined);
    }
  };

  // Während des Löschens nicht schließen (Abbrechen, Escape, Hintergrund).
  const closeDelete = () => {
    if (!deleting) setToDelete(undefined);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api(`/items/${toDelete.id}`, { method: 'DELETE' });
      setData((list) => list?.filter((i) => i.id !== toDelete.id));
      toast('success', `„${toDelete.name}“ wurde gelöscht.`);
      setToDelete(undefined);
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Löschen fehlgeschlagen.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Verwaltung"
        title="Druckteile verwalten"
        description="Einträge anlegen, bearbeiten, mit Bildern und Druckdateien versehen und veröffentlichen."
        actions={
          (canEdit || canImport) && (
            <div className="flex flex-wrap gap-2">
              {canImport && (
                <Button variant="secondary" icon={ArrowUpFromLine} onClick={() => setEinspielen(true)} data-testid="einspielen-open">
                  Einspielen …
                </Button>
              )}
              {canEdit && (
                <LinkButton to="/verwaltung/hilfsmittel/neu" icon={Plus}>
                  Neues Druckteil
                </LinkButton>
              )}
            </div>
          )
        }
      />
      {canImport && <EinspielenDialog open={einspielen} onClose={() => setEinspielen(false)} onDone={() => {
            // Das Einspielen kann Kategorien, Materialien, Einsatzbereiche und Farbrollen anlegen.
            void reload();
            void reloadConfig();
          }} />}

      {error && <Alert kind="error">{error.message}</Alert>}
      {loading && !items && <Spinner />}

      {items && items.length === 0 && (
        <EmptyState
          icon={Boxes}
          title="Noch keine Druckteile"
          action={
            canEdit && (
              <LinkButton to="/verwaltung/hilfsmittel/neu" icon={Plus}>
                Erstes Druckteil anlegen
              </LinkButton>
            )
          }
        />
      )}

      {items && items.length > 0 && (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:mb-5 lg:flex-row lg:items-center">
            <div className="relative w-full max-w-md">
              <label htmlFor="admin-item-search" className="sr-only">
                Druckteile filtern
              </label>
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-500" aria-hidden />
              <input
                id="admin-item-search"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, Kategorie, Material …"
                className={`${inputClass()} pl-12`}
              />
            </div>
            {/* Handy: eine Reihe über die ganze Breite, Zahl unter der Beschriftung; ab sm Zahl daneben */}
            <div role="group" aria-label="Druckteile anzeigen" className="flex gap-2 sm:flex-wrap" data-testid="ansicht-filter">
              {ANSICHTEN.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={ansicht === a.id}
                  onClick={() => setAnsicht(a.id)}
                  data-testid={`ansicht-${a.id}`}
                  className={cx(
                    'inline-flex min-h-12 min-w-0 flex-auto flex-col items-center justify-center rounded-xl px-2 py-1 font-bold leading-tight ring-1 sm:min-h-11 sm:flex-none sm:flex-row sm:gap-1.5 sm:px-4',
                    ansicht === a.id ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-stone-700 ring-stone-300 hover:bg-stone-50',
                  )}
                >
                  {a.label}
                  <span className={cx('text-hinweis', ansicht === a.id ? 'text-white/85' : 'text-stone-500')}>
                    <span className="sr-only">, Anzahl: </span>
                    <span aria-hidden>(</span>
                    {zahlen[a.id]}
                    <span aria-hidden>)</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {canExport && (
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-3 sm:px-4" data-testid="export-leiste">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 font-bold text-stone-900">
                <input
                  type="checkbox"
                  className="size-5 accent-brand-700"
                  checked={sichtbarAlleGewaehlt}
                  onChange={(e) => waehle(filtered.map((i) => i.id), e.target.checked)}
                  data-testid="auswahl-alle"
                />
                {gefiltert ? `Alle ${filtered.length} Treffer auswählen` : 'Alle auswählen'}
              </label>
              <span className="text-hinweis text-stone-700 sm:text-base" role="status" aria-live="polite" data-testid="auswahl-zahl">
                {auswahl.length === 0 ? 'Zum Exportieren Druckteile anhaken.' : alleGewaehlt ? `Alle ${items.length} ausgewählt` : `${auswahl.length} ausgewählt`}
              </span>
              <span className="flex-1" />
              {auswahl.length > 0 && (alleGewaehlt || auswahl.length <= MAX_AUSWAHL) ? (
                // Per fetch statt Link: auf dem iPad (Web-App) führte der Link in eine Dateivorschau ohne Rückweg.
                <DateiLaden
                  pfad={exportUrl(alleGewaehlt ? undefined : auswahl.map((i) => i.id))}
                  ersatzname="mosaik3lab-druckteile.json"
                  titel="Druckteile-Export"
                  icon={ArrowDownToLine}
                  className={buttonClass('primary', 'md')}
                  data-testid="export-start"
                >
                  Exportieren
                </DateiLaden>
              ) : (
                <Button icon={ArrowDownToLine} disabled>
                  Exportieren
                </Button>
              )}
              {auswahl.length > MAX_AUSWAHL && !alleGewaehlt ? (
                <p className="w-full text-hinweis text-stone-600">Höchstens {MAX_AUSWAHL} auf einmal – oder „Alle auswählen“.</p>
              ) : (
                // Erklärung nur ab Tablet – auf dem Handy nimmt sie viel Platz weg.
                <p className="hidden w-full text-hinweis text-stone-600 sm:block">
                  Es entsteht eine Datei mit den angehakten Druckteilen samt Bildern, Videos und Druckdateien – zum Weitergeben oder für eine andere Schule.
                </p>
              )}
            </div>
          )}

          <ul className="space-y-3">
            {filtered.map((item) => (
              <Card as="li" key={item.id} className="p-3.5 sm:p-5">
                <div className="flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-4">
                    {canExport && (
                      <input
                        type="checkbox"
                        className="size-6 shrink-0 cursor-pointer accent-brand-700"
                        checked={gewaehlt.has(item.id)}
                        onChange={(e) => waehle([item.id], e.target.checked)}
                        aria-label={`„${item.name}“ zum Exportieren auswählen`}
                        data-testid={`auswahl-${item.id}`}
                      />
                    )}
                    <div className="size-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-stone-200 sm:size-20 sm:rounded-2xl">
                      <ItemImage item={item} iconSize="size-8" />
                    </div>
                    <div className="min-w-0 flex-1 wrap-anywhere">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={canEdit ? `/verwaltung/hilfsmittel/${item.id}` : `/katalog/${item.id}`}
                          className="inline-flex min-h-11 items-center text-base font-bold text-stone-900 hover:text-brand-800 hover:underline"
                        >
                          {item.name}
                        </Link>
                        {item.isDemo && <DemoBadge />}
                      </div>
                      <p className="mt-0.5 text-hinweis text-stone-600">
                        {ITEM_KIND_LABELS[item.kind ?? 'hilfsmittel']} · {item.category || 'Ohne Kategorie'} · {item.material || 'Material offen'} · {formatDuration(item.printTimeMinutes)}
                      </p>
                      <ItemColors ids={item.colors} md={md} />
                      <p className="mt-1 flex flex-wrap gap-2 text-hinweis text-stone-500">
                        <span className="hidden sm:inline">{plural(item.images.length, 'Bild', 'Bilder')} ·</span><span className="hidden sm:inline">{plural(item.modelFileCount, 'Druckdatei', 'Druckdateien')} ·</span>
                        <span>geändert {formatRelative(item.updatedAt)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Feste Breite ab xl: Schalter steht in jeder Zeile an derselben Stelle – egal ob „Ansehen“ da ist
                      (nur bei veröffentlichten) oder wie lang „Veröffentlicht“/„Entwurf“ ist. */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3 sm:gap-3 sm:pt-4 xl:w-[31rem] xl:shrink-0 xl:flex-nowrap xl:border-0 xl:pt-0">
                    <div className="w-52 shrink-0">
                      <Switch
                        checked={item.published}
                        disabled={!canEdit || busyId === item.id}
                        onChange={(v) => togglePublish(item, v)}
                        label={item.published ? 'Veröffentlicht' : 'Entwurf'}
                        srLabel={`„${item.name}“ im Katalog veröffentlichen`}
                        description={item.published ? 'Im Katalog sichtbar' : 'Nur für das Team sichtbar'}
                      />
                    </div>
                    <div className="flex gap-2">
                      {(item.published || !canEdit) && (
                        <LinkButton to={`/katalog/${item.id}`} variant="ghost" size="sm" icon={Eye} aria-label={`„${item.name}“ im Katalog ansehen`}>
                          <span className="hidden xl:inline">Ansehen</span>
                        </LinkButton>
                      )}
                      {canEdit && (
                        <>
                          <LinkButton to={`/verwaltung/hilfsmittel/${item.id}`} variant="secondary" size="sm" icon={Pencil}>
                            Bearbeiten
                          </LinkButton>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            onClick={() => setToDelete(item)}
                            className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                            aria-label={`„${item.name}“ löschen`}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </ul>
          {filtered.length === 0 && (
            <EmptyState
              icon={SearchX}
              title={
                q.trim()
                  ? `Keine Treffer für „${q.trim()}“${ansicht === 'entwurf' ? ' unter den Entwürfen' : ansicht === 'veroeffentlicht' ? ' unter den veröffentlichten' : ''}`
                  : ansicht === 'entwurf'
                    ? 'Keine Entwürfe – alle Druckteile sind veröffentlicht'
                    : 'Noch kein Druckteil veröffentlicht'
              }
              action={
                <Button variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })} data-testid="filter-zuruecksetzen">
                  Alle Druckteile anzeigen
                </Button>
              }
            />
          )}
        </>
      )}

      <Dialog open={!!toDelete} onClose={closeDelete} title="Druckteil löschen?" size="sm">
        <p className="text-stone-700">
          „<strong>{toDelete?.name}</strong>“ wird mit allen Bildern und Druckdateien dauerhaft gelöscht. Bestehende
          Anfragen bleiben erhalten.
        </p>
        <ActionBar
          className="mt-6"
          secondary={<Button variant="secondary" onClick={closeDelete} disabled={deleting}>Abbrechen</Button>}
          primary={<Button variant="danger" icon={Trash2} loading={deleting} onClick={confirmDelete}>Endgültig löschen</Button>}
        />
        {toDelete?.isDemo && (
          <Badge className="mt-4 bg-amber-50 text-amber-900 ring-amber-300">Beispieldatensatz</Badge>
        )}
      </Dialog>
    </>
  );
}
