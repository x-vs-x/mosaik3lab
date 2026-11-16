import { Download } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ColorSwatch } from '../../../components/ColorSwatch';
import { Dialog } from '../../../components/Dialog';
import { useToast } from '../../../components/Toast';
import { Alert, Button, cx, Field, Input, Select, Spinner } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import type { BambuKatalogAntwort, BambuKatalogEintrag, Filament, MasterData } from '../../../lib/types';

/** Auswahl aus dem mitgelieferten Bambu-Lab-Katalog (Suche, Linie, Bambu-Nummer); übernimmt die Farben als Farbrollen. */
export function BambuImportDialog({
  open,
  onClose,
  existing,
  neu,
  blocked,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  existing: Filament[];
  /** Katalog-IDs, die seit dem letzten Update neu sind (Hinweis „neu“). */
  neu: string[];
  blocked: boolean;
  onImported: (md: MasterData, ids: string[]) => Promise<void>;
}) {
  const [katalog, setKatalog] = useState<BambuKatalogAntwort>();
  const [loadError, setLoadError] = useState<string>();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [suche, setSuche] = useState('');
  const [linie, setLinie] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setChosen(new Set());
    if (katalog) return;
    setLoadError(undefined);
    api<BambuKatalogAntwort>('/admin/settings/bambu-palette')
      .then(setKatalog)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Farben konnten nicht geladen werden.'));
  }, [open, katalog]);

  const existingIds = useMemo(() => new Set(existing.flatMap((f) => (f.katalogId ? [f.katalogId] : []))), [existing]);
  const angebot = useMemo(() => (katalog?.eintraege ?? []).filter((e) => !e.weggefallen), [katalog]);
  const linien = useMemo(() => [...new Set(angebot.map((e) => e.linie))], [angebot]);

  const groups = useMemo(() => {
    const q = suche.trim().toLocaleLowerCase('de-DE');
    const map = new Map<string, BambuKatalogEintrag[]>();
    for (const e of angebot) {
      if (linie && e.linie !== linie) continue;
      if (q && ![e.farbname, e.name, e.nummer, e.linie].some((s) => s.toLocaleLowerCase('de-DE').includes(q))) continue;
      map.set(e.linie, [...(map.get(e.linie) ?? []), e]);
    }
    return [...map.entries()];
  }, [angebot, suche, linie]);

  const toggle = (id: string) =>
    setChosen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const setGroup = (list: BambuKatalogEintrag[], on: boolean) =>
    setChosen((s) => {
      const n = new Set(s);
      for (const p of list) {
        if (existingIds.has(p.id)) continue;
        if (on) n.add(p.id);
        else n.delete(p.id);
      }
      return n;
    });

  const doImport = async () => {
    setBusy(true);
    try {
      const ids = [...chosen];
      const res = await api<{ masterData: MasterData; added: number }>('/admin/settings/masterdata/filaments/import', {
        method: 'POST',
        body: { ids },
      });
      await onImported(res.masterData, ids);
      toast('success', res.added === 1 ? '1 Farbrolle importiert.' : `${res.added} Farbrollen importiert.`);
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Import fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Bambu-Lab-Farben importieren"
      description="Wählen Sie die Farben, die Sie als Farbrollen übernehmen möchten. Name, Bambu-Nummer und Farbe stammen von Bambu Lab und werden bei Updates automatisch aktualisiert."
    >
      {blocked && (
        <Alert kind="warning" className="mb-4" title="Ungespeicherte Änderungen">
          Bitte speichern oder verwerfen Sie zuerst Ihre Änderungen an den Farbrollen.
        </Alert>
      )}
      {loadError && <Alert kind="error">{loadError}</Alert>}
      {!katalog && !loadError && <Spinner label="Farben werden geladen …" />}
      {katalog && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
            <Field label="Suchen (Name oder Nummer)">
              {({ id }) => <Input id={id} type="search" value={suche} placeholder="z. B. Blau oder 10601" onChange={(e) => setSuche(e.target.value)} />}
            </Field>
            <Field label="Linie">
              {({ id }) => (
                <Select id={id} value={linie} onChange={(e) => setLinie(e.target.value)}>
                  <option value="">Alle Linien</option>
                  {linien.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {groups.length === 0 ? (
            <p className="text-stone-600">Keine Farbe gefunden.</p>
          ) : (
            <Button variant="soft" size="sm" onClick={() => setGroup(groups.flatMap(([, l]) => l), true)}>
              Alle angezeigten Farben wählen
            </Button>
          )}
          {groups.map(([group, list]) => {
            const available = list.filter((p) => !existingIds.has(p.id));
            const allOn = available.length > 0 && available.every((p) => chosen.has(p.id));
            return (
              <fieldset key={group}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <legend className="font-bold text-stone-900">
                    Bambu Lab {group}{' '}
                    <span className="font-normal text-stone-500">
                      ({available.length} von {list.length} noch nicht übernommen)
                    </span>
                  </legend>
                  <Button variant="ghost" size="sm" disabled={available.length === 0} onClick={() => setGroup(available, !allOn)}>
                    {allOn ? 'Auswahl aufheben' : 'Alle angezeigten wählen'}
                    <span className="sr-only"> ({group})</span>
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {list.map((p) => {
                    const exists = existingIds.has(p.id);
                    const checked = exists || chosen.has(p.id);
                    return (
                      <label
                        key={p.id}
                        className={cx(
                          'flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-inset transition-colors',
                          'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600',
                          exists
                            ? 'cursor-not-allowed bg-stone-100 text-stone-500 ring-stone-200'
                            : checked
                              ? 'cursor-pointer bg-brand-50 ring-brand-400'
                              : 'cursor-pointer bg-white ring-stone-300 hover:bg-stone-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={exists}
                          onChange={() => toggle(p.id)}
                          className="size-5 shrink-0 accent-brand-700"
                        />
                        <ColorSwatch hex={p.hex} className={cx('size-7', exists && 'opacity-60')} />
                        <span className="min-w-0 flex-1">
                          <span className={cx('block wrap-anywhere font-bold', exists ? 'text-stone-500' : 'text-stone-900')}>
                            {p.farbname}
                            {p.verlauf && <span className="font-normal"> (Verlauf)</span>}
                          </span>
                          <span className="block wrap-anywhere text-hinweis text-stone-600">
                            Nr. {p.nummer} · {p.name}
                          </span>
                        </span>
                        {exists ? (
                          <span className="shrink-0 text-hinweis font-bold">vorhanden</span>
                        ) : (
                          neu.includes(p.id) && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-hinweis font-bold text-emerald-900">neu</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
          <p className="text-hinweis text-stone-500">
            Quelle: Farbliste von Bambu Studio (Bambu Lab), Stand {katalog.stand}. Farbwerte zeigen den Farbton am Bildschirm ungefähr.
          </p>
        </div>
      )}
      <div className="sticky -bottom-4 -mx-4 -mb-4 mt-6 grid grid-cols-2 gap-2 border-t border-stone-100 bg-white px-4 py-3 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:flex sm:gap-3 sm:px-6 sm:py-4 sm:flex-row sm:items-center sm:justify-end">
        <p className="col-span-2 text-hinweis text-stone-600 sm:mr-auto" aria-live="polite">
          {chosen.size === 1 ? '1 Farbe ausgewählt' : `${chosen.size} Farben ausgewählt`}
        </p>
        <Button variant="secondary" onClick={onClose}>
          Abbrechen
        </Button>
        <Button icon={Download} loading={busy} disabled={chosen.size === 0 || blocked} onClick={doImport}>
          Importieren
        </Button>
      </div>
    </Dialog>
  );
}
