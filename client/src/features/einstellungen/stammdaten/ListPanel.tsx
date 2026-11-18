import { ArrowDown, ArrowUp, ChevronDown, Plus, RotateCcw, Save, Trash2, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToast } from '../../../components/Toast';
import { Alert, Badge, Button, Card, cx } from '../../../components/ui';
import { api, ApiError, fehlerText } from '../../../lib/api';
import { useConfig } from '../../../lib/config';
import type { MasterData, MasterDataList } from '../../../lib/types';
import { newKey, same, serverRowErrors, strip, toRows, type Entry, type Row } from './listRows';

// Generische Listenbearbeitung (lokal bearbeiten, dann als Ganzes speichern)

const ADD_BUTTON = '__hinzufuegen';

export interface PanelTools<T extends Entry> {
  dirty: boolean;
  /** Nach serverseitigen Änderungen (z. B. Import) Liste übernehmen. */
  applySaved: (md: MasterData) => Promise<void>;
  rows: Row<T>[];
}

export function ListPanel<T extends Entry>({
  list,
  source,
  title,
  intro,
  noun,
  addLabel,
  blank,
  validate,
  validateAll,
  rowLabel,
  renderRow,
  toolbar,
  onDirty,
  onSaved,
  layout = 'cards',
}: {
  list: MasterDataList;
  source: T[];
  title: string;
  intro?: ReactNode;
  noun: string;
  addLabel: string;
  blank: () => Omit<T, 'id'>;
  validate: (row: Row<T>) => string | undefined;
  validateAll?: (rows: Row<T>[]) => string | undefined;
  rowLabel: (row: Row<T>, index: number) => string;
  renderRow: (row: Row<T>, update: (patch: Partial<Omit<T, 'id'>>) => void, error: string | undefined) => ReactNode;
  toolbar?: (tools: PanelTools<T>) => ReactNode;
  onDirty: (dirty: boolean) => void;
  /** Nach dem Speichern; die Rückgabe (z. B. „aus 2 Druckteilen entfernt“) wird an die Erfolgsmeldung angehängt. */
  onSaved?: (removed: Row<T>[]) => string | undefined;
  layout?: 'cards' | 'compact';
}) {
  const { reload } = useConfig();
  const toast = useToast();
  const [base, setBase] = useState<Row<T>[]>(() => toRows(source));
  const [rows, setRows] = useState<Row<T>[]>(base);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState<{ title: string; message: string }>();
  // Vom Server abgelehnte Zeilen (z. B. „Zeile 8: Name fehlt“) – markiert, bis die Zeile geändert wird.
  const [serverErrors, setServerErrors] = useState<Map<string, string>>(() => new Map());
  const focusKey = useRef<string | undefined>(undefined);
  const addRef = useRef<HTMLDivElement>(null);

  const dirty = !same(rows, base);

  // Stammdaten neu geladen und keine lokalen Änderungen → übernehmen.
  useEffect(() => {
    const fresh = toRows(source);
    if (same(fresh, base)) return;
    if (!dirty) {
      setBase(fresh);
      setRows(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  useEffect(() => {
    if (!focusKey.current) return;
    const el =
      focusKey.current === ADD_BUTTON
        ? addRef.current?.querySelector<HTMLElement>('button')
        : document.querySelector<HTMLElement>(`[data-row="${focusKey.current}"] input, [data-row="${focusKey.current}"] select`);
    el?.focus();
    focusKey.current = undefined;
  });

  const update = (key: string, patch: Partial<Omit<T, 'id'>>) => {
    setRows((rs) => rs.map((r) => (r._key === key ? ({ ...r, ...patch } as Row<T>) : r)));
    setServerErrors((m) => {
      if (!m.has(key)) return m;
      const next = new Map(m);
      next.delete(key);
      return next;
    });
  };
  const remove = (key: string) => {
    // Fokus auf die nächste Zeile (sonst die vorige, sonst „Hinzufügen“) statt ins Leere.
    const i = rows.findIndex((r) => r._key === key);
    focusKey.current = (rows[i + 1] ?? rows[i - 1])?._key ?? ADD_BUTTON;
    setRows((rs) => rs.filter((r) => r._key !== key));
  };
  const move = (index: number, delta: number) =>
    setRows((rs) => {
      const j = index + delta;
      if (j < 0 || j >= rs.length) return rs;
      const copy = [...rs];
      [copy[index], copy[j]] = [copy[j], copy[index]];
      return copy;
    });
  const add = () => {
    const row = { ...blank(), _key: newKey() } as Row<T>;
    focusKey.current = row._key;
    // Neue Zeile oben, direkt unter dem Knopf im Kopf – sichtbar ohne Scrollen; gespeichert wird die Reihenfolge wie angezeigt.
    setRows((rs) => [row, ...rs]);
  };

  const errors = useMemo(() => new Map(rows.map((r) => [r._key, validate(r)])), [rows, validate]);
  const listError = validateAll?.(rows);
  const invalidCount = [...errors.values()].filter(Boolean).length;

  const applySaved = async (next: MasterData) => {
    const fresh = toRows(next[list] as unknown as T[]);
    setBase(fresh);
    setRows(fresh);
    setShowErrors(false);
    setSaveError(undefined);
    setServerErrors(new Map());
    await reload();
  };

  const save = async () => {
    setShowErrors(true);
    setSaveError(undefined);
    if (invalidCount > 0 || listError) return;
    setSaving(true);
    try {
      const res = await api<MasterData>(`/admin/settings/masterdata/${list}`, {
        method: 'PUT',
        body: { entries: strip(rows) },
      });
      const removed = base.filter((b) => b.id && !rows.some((r) => r.id === b.id));
      await applySaved(res);
      const extra = onSaved?.(removed);
      toast('success', `${title} gespeichert.${extra ? ` ${extra}` : ''}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSaveError({
          title: 'Ein entfernter Eintrag wird noch verwendet',
          message: `${err.message} Ändern Sie zuerst die betroffenen Druckteile bzw. Anfragen oder verwerfen Sie das Entfernen.`,
        });
      } else {
        if (err instanceof ApiError) setServerErrors(serverRowErrors(rows, err.fields));
        setSaveError({
          title: 'Speichern fehlgeschlagen',
          message: fehlerText(err, 'Unbekannter Fehler.'),
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setRows(base);
    setShowErrors(false);
    setSaveError(undefined);
    setServerErrors(new Map());
  };

  return (
    <Card as="section" className="p-4 sm:p-7">
      <div className="mb-4 sm:mb-5">
        {/* Kopf: Überschrift links, Aktionen rechts daneben (Handy: darunter, volle Breite); Erklärung darunter über die ganze Breite */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <h2 className="flex min-h-11 min-w-0 flex-wrap items-center gap-2 text-abschnitt font-bold text-stone-900 sm:text-xl">
            {title}
            {dirty && <Badge className="bg-amber-50 text-amber-900 ring-amber-300">Ungespeicherte Änderungen</Badge>}
          </h2>
          <div ref={addRef} className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end" data-testid={`${list}-aktionen`}>
            <Button icon={Plus} onClick={add} className="w-full sm:w-auto" data-testid={`${list}-hinzufuegen`}>
              {addLabel}
            </Button>
            {toolbar?.({ dirty, applySaved, rows })}
          </div>
        </div>
        {intro && (
          <>
            {/* Handy: lange Erklärung zum Aufklappen, ab sm immer sichtbar */}
            <details className="group mt-1 sm:hidden">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-bold text-brand-800 [&::-webkit-details-marker]:hidden">
                Erklärung
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="text-hinweis text-stone-600">{intro}</div>
            </details>
            <div className="mt-2 hidden max-w-4xl text-base text-stone-600 sm:block">{intro}</div>
          </>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-stone-200 px-5 py-8 text-center text-stone-600">
          Noch keine Einträge. Legen Sie den ersten Eintrag an.
        </p>
      ) : (
        <ol className={layout === 'cards' ? 'space-y-3' : 'space-y-2'}>
          {rows.map((row, i) => {
            const err = showErrors ? (errors.get(row._key) ?? serverErrors.get(row._key)) : undefined;
            const label = rowLabel(row, i);
            return (
              <li
                key={row._key}
                data-row={row._key}
                className={cx(
                  // Handy: Pfeile und Löschen in einer Zeile oben, Inhalt darunter in voller Breite (vorher blieben neben
                  // den beiden Knopfspalten nur ~140 px – Symbolnamen und die Plakette „Bambu-Katalog“ zerfielen in
                  // einzelne Buchstaben). Ab sm wie gehabt nebeneinander.
                  'flex flex-wrap gap-2 rounded-2xl ring-1 ring-inset sm:flex-nowrap sm:gap-3',
                  layout === 'cards' ? 'p-2.5 sm:p-5' : 'items-start p-2.5 sm:p-3',
                  err ? 'bg-rose-50/40 ring-rose-300' : !row.id ? 'bg-brand-50/40 ring-brand-200' : 'bg-stone-50/60 ring-stone-200',
                )}
              >
                <div className="flex shrink-0 gap-1 sm:flex-col">
                  <IconButton icon={ArrowUp} label={`${label} nach oben`} disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton icon={ArrowDown} label={`${label} nach unten`} disabled={i === rows.length - 1} onClick={() => move(i, 1)} />
                </div>
                <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
                  {!row.id && (
                    <p className="mb-2 text-hinweis font-bold uppercase tracking-wide text-brand-700">Neu – noch nicht gespeichert</p>
                  )}
                  {renderRow(row, (patch) => update(row._key, patch), err)}
                </div>
                <div className="ml-auto shrink-0 sm:ml-0">
                  <IconButton icon={Trash2} label={`${label} entfernen`} tone="danger" onClick={() => remove(row._key)} />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {showErrors && (invalidCount > 0 || listError) && (
        <Alert kind="error" className="mt-5" title="Bitte prüfen Sie die Eingaben">
          {listError ?? `${invalidCount} ${invalidCount === 1 ? `${noun} ist` : 'Einträge sind'} unvollständig.`}
        </Alert>
      )}
      {saveError && (
        <Alert kind="error" className="mt-5" title={saveError.title}>
          {saveError.message}
        </Alert>
      )}

      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-stone-100 pt-5 sm:flex-row sm:items-center sm:justify-end">
        {dirty && (
          <Button variant="ghost" icon={RotateCcw} onClick={discard} disabled={saving}>
            Änderungen verwerfen
          </Button>
        )}
        <Button icon={Save} onClick={save} loading={saving} disabled={!dirty}>
          {title} speichern
        </Button>
      </div>
    </Card>
  );
}

function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cx(
        'grid size-11 place-items-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-35',
        tone === 'danger' ? 'text-rose-700 hover:bg-rose-50' : 'text-stone-600 hover:bg-white hover:text-stone-900',
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
