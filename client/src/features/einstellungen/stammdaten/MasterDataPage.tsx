import { Layers, Palette, Tags, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, cx, PageHeader, Spinner } from '../../../components/ui';
import { useConfig, useMasterData } from '../../../lib/config';
import type { MasterDataList } from '../../../lib/types';
import { useDocumentTitle } from '../../../lib/useApi';
import { useVerlassenWarnung } from '../../../lib/useEntwurf';
import { CategoriesPanel } from './CategoriesPanel';
import { FilamentsPanel } from './FilamentsPanel';
import { SimplePanel } from './SimplePanel';

// Stammdaten-Seite: drei Tabs; „Material & Farben“ zeigt Materialien und Farbrollen untereinander.
// Der Anfrage-Ablauf (Status an/aus) steht unter Einstellungen.

type TabKey = 'categories' | 'useAreas' | 'materials';

const TABS: { key: TabKey; label: string; icon: LucideIcon; lists: MasterDataList[] }[] = [
  { key: 'categories', label: 'Kategorien', icon: Tags, lists: ['categories'] },
  { key: 'useAreas', label: 'Einsatzbereiche', icon: Layers, lists: ['useAreas'] },
  { key: 'materials', label: 'Material & Farben', icon: Palette, lists: ['materials', 'filaments'] },
];

/** Auch alte Links (?liste=filaments) führen zum passenden Tab. */
const tabFor = (v: string | null): TabKey => TABS.find((t) => t.key === v || t.lists.includes(v as MasterDataList))?.key ?? 'categories';

export function MasterDataPage() {
  useDocumentTitle('Stammdaten');
  const { config, error } = useConfig();
  const md = useMasterData();
  const [params, setParams] = useSearchParams();
  const active = tabFor(params.get('liste'));
  const [dirty, setDirty] = useState<Partial<Record<MasterDataList, boolean>>>({});
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const baseId = useId();

  const select = (key: TabKey, focus = false) => {
    const next = new URLSearchParams(params);
    next.set('liste', key);
    setParams(next, { replace: true });
    if (focus) tabRefs.current[key]?.focus();
  };

  const onTabKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.key === active);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TABS.length - 1;
    if (n >= 0) {
      e.preventDefault();
      select(TABS[n].key, true);
    }
  };

  // Link „Farbrollen bearbeiten“ (?liste=filaments): direkt zu den Farbrollen unter den Materialien springen.
  const toFilaments = params.get('liste') === 'filaments' && !!config;
  useEffect(() => {
    if (toFilaments) document.getElementById(`${baseId}-farbrollen`)?.scrollIntoView({ block: 'start' });
  }, [toFilaments, baseId]);

  const anyDirty = Object.values(dirty).some(Boolean);
  useVerlassenWarnung(anyDirty);

  const markDirty = useCallback(
    (key: MasterDataList, value: boolean) => setDirty((d) => (d[key] === value ? d : { ...d, [key]: value })),
    [],
  );

  return (
    <>
      <PageHeader
        eyebrow="Einstellungen"
        title="Stammdaten"
        description="Die Auswahllisten für Druckteile: Kategorien, Einsatzbereiche, Material und Farben. Änderungen gelten nach dem Speichern sofort für die ganze App."
      />

      {error && !config && <Alert kind="error">{error}</Alert>}
      {!config && !error && <Spinner />}

      {config && (
        <>
          <div
            role="tablist"
            aria-label="Stammdaten-Listen"
            onKeyDown={onTabKey}
            className="mb-6 grid gap-2 sm:flex sm:flex-wrap"
          >
            {TABS.map((t) => {
              const selected = t.key === active;
              const changed = t.lists.some((l) => dirty[l]);
              return (
                <button
                  key={t.key}
                  ref={(el) => {
                    tabRefs.current[t.key] = el;
                  }}
                  id={`${baseId}-tab-${t.key}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel-${t.key}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => select(t.key)}
                  className={cx(
                    'inline-flex min-h-12 max-w-full items-center gap-2 rounded-2xl px-4 font-bold transition-colors',
                    selected
                      ? 'bg-stone-900 text-white'
                      : 'bg-white text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-stone-50',
                  )}
                >
                  <t.icon className="size-5" aria-hidden />
                  {t.label}
                  {t.lists.length === 1 && (
                    <span className={cx('rounded-full px-2 py-0.5 text-hinweis', selected ? 'bg-white/20' : 'bg-stone-100 text-stone-600')}>
                      {md[t.lists[0]].length}
                    </span>
                  )}
                  {changed && (
                    <span className="inline-flex items-center gap-1 text-hinweis text-amber-600">
                      <span className={cx('size-2 rounded-full', selected ? 'bg-amber-300' : 'bg-amber-500')} aria-hidden />
                      <span className={selected ? 'text-amber-200' : 'text-amber-800'}>geändert</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {TABS.map((t) => (
            <div
              key={t.key}
              id={`${baseId}-panel-${t.key}`}
              role="tabpanel"
              aria-labelledby={`${baseId}-tab-${t.key}`}
              hidden={t.key !== active}
              tabIndex={0}
              className="focus:outline-none"
            >
              {t.key === 'categories' && <CategoriesPanel md={md} onDirty={(v) => markDirty('categories', v)} />}
              {t.key === 'useAreas' && (
                <SimplePanel list="useAreas" md={md} noun="Einsatzbereich" placeholder="z. B. Unterricht" onDirty={(v) => markDirty('useAreas', v)} />
              )}
              {t.key === 'materials' && (
                <div className="space-y-6">
                  <SimplePanel list="materials" md={md} noun="Material" placeholder="z. B. PETG" onDirty={(v) => markDirty('materials', v)} />
                  <div id={`${baseId}-farbrollen`} className="scroll-mt-6">
                    <FilamentsPanel md={md} onDirty={(v) => markDirty('filaments', v)} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      <p className="mt-10 max-w-3xl text-stone-600" data-testid="hinweis-austausch">
        Druckteile an eine andere Schule weitergeben oder von dort übernehmen: unter{' '}
        <Link to="/verwaltung/hilfsmittel" className="font-bold text-brand-800 underline">
          Druckteile verwalten
        </Link>{' '}
        anhaken und „Exportieren“ bzw. „Einspielen …“. Sicherungen des ganzen Systems macht der Server-Manager.
      </p>
    </>
  );
}
