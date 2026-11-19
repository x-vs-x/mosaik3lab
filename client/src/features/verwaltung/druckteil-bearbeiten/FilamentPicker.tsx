import { Check, Palette, Search } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ColorSwatch } from '../../../components/ColorSwatch';
import { Alert, cx, inputClass } from '../../../components/ui';
import { filamentLabel } from '../../../lib/colors';
import type { Filament } from '../../../lib/types';
import { filamentRolle } from '@mosaik3lab/shared/werte/stammdaten';
import { passtZurSuche } from '@mosaik3lab/shared/suche';
import { gruppeArt, gruppeLinie, inGruppen, linieVon, materialartVon } from '@mosaik3lab/shared/werte/katalog';

/**
 * Farbwahl eines Farbbereichs: oben „Alle Farben“ (auch später angelegte) oder „Nur bestimmte Farben“;
 * bei „bestimmte“ ganze Materialarten (z. B. alle PLA) oder ganze Linien – beides auch mit später angelegten Rollen –
 * und einzelne Farbrollen mit Farbtupfer, gruppiert nach Linie, mit Suche.
 */
export function FilamentPicker({
  legend,
  filaments,
  alleFarben,
  onAlleFarben,
  selected,
  onChange,
  error,
  manageLink,
  gruppen,
  onGruppen,
}: {
  legend: string;
  filaments: Filament[];
  alleFarben: boolean;
  onAlleFarben: (on: boolean) => void;
  selected: string[];
  onChange: (ids: string[]) => void;
  error?: string;
  manageLink: boolean;
  /** Ganze Linien/Materialarten (`linie:…`, `art:…`), inkl. später angelegter Rollen. */
  gruppen: string[];
  onGruppen: (gruppen: string[]) => void;
}) {
  const uid = useId();
  const [q, setQ] = useState('');
  const known = new Set(filaments.map((f) => f.id));
  const missing = selected.filter((id) => !known.has(id));
  const abgedeckt = (f: Filament) => inGruppen(f, gruppen);
  const schalteGruppe = (g: string) => onGruppen(gruppen.includes(g) ? gruppen.filter((x) => x !== g) : [...gruppen, g]);
  // Materialarten (erstes Wort der Linie, z. B. „PLA“) in der Reihenfolge der Stammdaten.
  const arten = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of filaments) {
      const art = materialartVon(f);
      if (art) map.set(art, (map.get(art) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [filaments]);

  const groups = useMemo(() => {
    const map = new Map<string, Filament[]>();
    for (const f of filaments) {
      // Wie alle Listen: mehrere Wörter, ohne Umlaute/Akzente („gruen“ findet „Grün“, „PLA rot“ die rote PLA-Rolle).
      if (!passtZurSuche([f.colorName, f.brand, f.line, f.hex, f.herstellerNummer, f.herstellerName], q)) continue;
      const key = linieVon(f) || 'Ohne Marke';
      map.set(key, [...(map.get(key) ?? []), f]);
    }
    return [...map.entries()];
  }, [filaments, q]);

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  // Einzeln gewählt = nicht schon über eine Gruppe abgedeckt (die zeigt der Server in selected mit an).
  const selectedFilaments = selected.map((id) => filaments.find((f) => f.id === id)).filter((f): f is Filament => !!f && !abgedeckt(f));
  const ausGruppen = filaments.filter(abgedeckt).length;
  const gruppenNamen = gruppen.map((g) => g.startsWith('art:') ? `alle ${g.slice(4)}` : g.slice(6));

  return (
    <fieldset className="min-w-0" aria-describedby={error ? `${uid}-error` : undefined}>
      <legend className="mb-1.5 font-bold text-stone-800">{legend}{' '}<span className="text-rose-700" aria-hidden>*</span></legend>
      <div className="mb-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={legend}>
        {(
          [
            [true, 'Alle Farben', 'Jede vorrätige Farbe – auch Farben, die später dazukommen.'],
            [false, 'Bestimmte Farben oder Linien', 'Einzelne Farben, ganze Linien oder z. B. alle PLA-Farben.'],
          ] as const
        ).map(([wert, titel, text]) => (
          <label
            key={titel}
            className={cx(
              'flex min-h-12 cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ring-1 sm:min-h-14 sm:rounded-2xl sm:px-4 sm:py-3 ring-inset has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600',
              alleFarben === wert ? 'bg-brand-50 ring-brand-400' : 'bg-white ring-stone-300 hover:bg-stone-50',
            )}
          >
            <input
              type="radio"
              name={`${uid}-art`}
              checked={alleFarben === wert}
              onChange={() => onAlleFarben(wert)}
              className="mt-1 size-5 shrink-0 accent-brand-700"
            />
            <span>
              <span className="block font-bold text-stone-900">{titel}</span>
              <span className="block text-hinweis text-stone-600">{text}</span>
            </span>
          </label>
        ))}
      </div>

      {alleFarben ? (
        <AlleFarbenVorschau filaments={filaments} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-hinweis text-stone-600">
              <span className="font-bold text-stone-800">
                {gruppen.length > 0
                  ? `${gruppenNamen.join(', ')} (${ausGruppen} Farben)${selectedFilaments.length ? ` + ${selectedFilaments.length} einzeln` : ''}.`
                  : `${selectedFilaments.length} ausgewählt.`}
              </span>{' '}
              Leere Rollen sind markiert und werden Lehrkräften erst angeboten,
              wenn sie wieder vorrätig sind.
            </p>
            {manageLink && (
              <Link
                to="/verwaltung/stammdaten?liste=filaments"
                className="inline-flex min-h-tipp items-center gap-1.5 rounded-xl px-2 font-bold text-brand-700 hover:text-brand-900"
              >
                <Palette className="size-4" aria-hidden />
                Farbrollen verwalten
              </Link>
            )}
          </div>

          {selectedFilaments.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2" aria-label="Ausgewählte Farben">
              {selectedFilaments.map((f) => (
                <li
                  key={f.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 py-1 pl-2 pr-3 text-hinweis font-bold text-stone-800 ring-1 ring-stone-200"
                >
                  <ColorSwatch hex={f.hex} className="size-4" />
                  {f.colorName}
                  {!f.available && <span className="font-normal text-rose-700">{' '}(nicht vorrätig)</span>}
                </li>
              ))}
            </ul>
          )}

          {missing.length > 0 && (
            <Alert kind="warning" className="mb-3">
              {missing.length === 1 ? 'Eine gespeicherte Farbe gibt' : `${missing.length} gespeicherte Farben gibt`}{' '}
              es nicht mehr in den Farbrollen.{' '}
              <button type="button" className="font-bold underline" onClick={() => onChange(selected.filter((id) => known.has(id)))}>
                Jetzt entfernen
              </button>
            </Alert>
          )}

          {filaments.length === 0 ? (
            <Alert kind="warning">Es sind noch keine Farbrollen in den Stammdaten angelegt.</Alert>
          ) : (
            <>
              {arten.length > 0 && (
                <div className="mb-3 rounded-2xl bg-white p-3 ring-1 ring-stone-200">
                  <p className="mb-2 text-hinweis text-stone-600">
                    <span className="font-bold text-stone-800">Ganzes Material:</span>{' '}
                    alle Farben dieses Materials, auch später angelegte.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {arten.map(([art, n]) => {
                      const an = gruppen.includes(gruppeArt(art));
                      return (
                        <button
                          key={art}
                          type="button"
                          aria-pressed={an}
                          onClick={() => schalteGruppe(gruppeArt(art))}
                          className={cx(
                            'inline-flex min-h-tipp items-center gap-1.5 rounded-xl px-3 font-bold ring-1 ring-inset',
                            an ? 'bg-brand-50 text-brand-900 ring-brand-400' : 'bg-white text-stone-800 ring-stone-300 hover:bg-stone-50',
                          )}
                        >
                          {an && <Check className="size-4" aria-hidden />}
                          Alle {art}
                          <span className="font-normal text-stone-600">({n})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="relative mb-3">
                <label htmlFor={`${uid}-filter`} className="sr-only">Farbrollen filtern ({legend})</label>
                <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-500" aria-hidden />
                <input
                  id={`${uid}-filter`}
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Farbe, Linie oder Nummer suchen"
                  className={`${inputClass()} pl-12`}
                />
              </div>
              <div className="max-h-[28rem] space-y-4 overflow-y-auto rounded-2xl bg-stone-50/60 p-2 ring-1 sm:p-3 ring-stone-200">
                {groups.length === 0 && <p className="p-2 text-stone-600">Keine Farbrolle passt zu „{q}“.</p>}
                {groups.map(([group, list]) => {
                  const allOn = list.every((f) => selected.includes(f.id));
                  const linie = group === 'Ohne Marke' ? '' : gruppeLinie(list[0]);
                  const linieAn = !!linie && gruppen.includes(linie);
                  const ueberArt = !!linie && !linieAn && list.every(abgedeckt);
                  return (
                    <div key={group} role="group" aria-label={group}>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 px-1">
                        <p className="text-hinweis font-bold uppercase tracking-wide text-stone-500">{group}</p>
                        {linie ? (
                          ueberArt ? (
                            <span className="inline-flex min-h-tipp items-center gap-1 px-2 text-hinweis font-bold text-brand-800">
                              <Check className="size-4" aria-hidden />
                              Über „Alle {materialartVon(list[0])}“ gewählt
                            </span>
                          ) : (
                            <button
                              type="button"
                              aria-pressed={linieAn}
                              onClick={() => schalteGruppe(linie)}
                              className={cx(
                                'inline-flex min-h-tipp items-center gap-1 rounded-xl px-2 text-hinweis font-bold',
                                linieAn ? 'text-brand-900' : 'text-brand-700 hover:text-brand-900',
                              )}
                            >
                              {linieAn && <Check className="size-4" aria-hidden />}
                              {linieAn ? 'Ganze Linie gewählt (auch neue)' : 'Ganze Linie wählen (auch neue)'}
                              <span className="sr-only"> ({group})</span>
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              onChange(
                                allOn
                                  ? selected.filter((id) => !list.some((f) => f.id === id))
                                  : [...selected, ...list.filter((f) => !selected.includes(f.id)).map((f) => f.id)],
                              )
                            }
                            className="min-h-tipp rounded-xl px-2 text-hinweis font-bold text-brand-700 hover:text-brand-900"
                          >
                            {allOn ? 'Alle dieser Liste abwählen' : 'Alle dieser Liste wählen'}
                            <span className="sr-only"> ({group})</span>
                          </button>
                        )}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {list.map((f) => {
                          const inGruppe = abgedeckt(f);
                          const checked = inGruppe || selected.includes(f.id);
                          return (
                            <label
                              key={f.id}
                              className={cx(
                                'flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-inset transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600',
                                inGruppe ? 'cursor-default' : 'cursor-pointer',
                                checked ? 'bg-brand-50 ring-brand-400' : 'bg-white ring-stone-300 hover:bg-stone-50',
                              )}
                              title={filamentLabel(f)}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={inGruppe}
                                onChange={() => toggle(f.id)}
                                className="size-5 shrink-0 accent-brand-700"
                              />
                              <ColorSwatch hex={f.hex} className="size-7" />
                              <span className="min-w-0 flex-1">
                                <span className="block wrap-anywhere font-bold text-stone-900">
                                  {f.colorName}
                                  {!f.available && <span className="font-normal text-rose-700">{' '}(nicht vorrätig)</span>}
                                </span>
                                <span className="block wrap-anywhere text-hinweis text-stone-600">{filamentRolle(f)}</span>
                              </span>
                              {checked && <Check className="size-4 shrink-0 text-brand-700" aria-hidden />}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
      {manageLink && alleFarben && (
        <Link
          to="/verwaltung/stammdaten?liste=filaments"
          className="mt-2 inline-flex min-h-tipp items-center gap-1.5 rounded-xl px-2 font-bold text-brand-700 hover:text-brand-900"
        >
          <Palette className="size-4" aria-hidden />
          Farbrollen verwalten
        </Link>
      )}
      {error && <p id={`${uid}-error`} className="mt-1.5 text-hinweis font-bold text-rose-700">{error}</p>}
    </fieldset>
  );
}

/** Vorschau bei „Alle Farben“: was Lehrkräfte gerade angeboten bekommen. */
function AlleFarbenVorschau({ filaments }: { filaments: Filament[] }) {
  const vorraetig = filaments.filter((f) => f.available);
  const zeigen = vorraetig.slice(0, 24);
  return (
    <div className="rounded-2xl bg-stone-50/60 p-3 ring-1 ring-stone-200">
      <p className="mb-2 text-hinweis text-stone-700">
        Lehrkräfte können gerade aus{' '}
        <span className="font-bold">{vorraetig.length} vorrätigen Farben</span>{' '}
        wählen. Neue Farbrollen kommen automatisch dazu, leere werden nicht
        angeboten.
      </p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Gerade angebotene Farben">
        {zeigen.map((f) => (
          <li key={f.id} title={filamentLabel(f)}>
            <ColorSwatch hex={f.hex} className="size-6" />
            <span className="sr-only">{f.colorName}</span>
          </li>
        ))}
        {vorraetig.length > zeigen.length && (
          <li className="self-center text-hinweis text-stone-600">+ {vorraetig.length - zeigen.length} weitere</li>
        )}
      </ul>
    </div>
  );
}
