import { Check, Palette, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ColorSwatch } from "../../../components/ColorSwatch";
import { Alert, cx, inputClass } from "../../../components/ui";
import { filamentLabel } from "../../../lib/constants";
import type { Filament } from "../../../lib/types";
import { filamentRolle } from "@mosaik3lab/shared/stammdaten";

/**
 * Farbwahl eines Farbbereichs: oben „Alle Farben“ (auch später angelegte) oder „Nur bestimmte Farben“;
 * bei „bestimmte“ die Farbrollen mit Farbtupfer, gruppiert nach Linie, mit Suche und „alle dieser Linie“.
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
}: {
  legend: string;
  filaments: Filament[];
  alleFarben: boolean;
  onAlleFarben: (on: boolean) => void;
  selected: string[];
  onChange: (ids: string[]) => void;
  error?: string;
  manageLink: boolean;
}) {
  const uid = useId();
  const [q, setQ] = useState("");
  const known = new Set(filaments.map((f) => f.id));
  const missing = selected.filter((id) => !known.has(id));

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = new Map<string, Filament[]>();
    for (const f of filaments) {
      if (
        needle &&
        !`${f.colorName} ${f.brand} ${f.line} ${f.hex} ${f.herstellerNummer} ${f.herstellerName}`
          .toLowerCase()
          .includes(needle)
      )
        continue;
      const key = [f.brand, f.line].filter(Boolean).join(" ") || "Ohne Marke";
      map.set(key, [...(map.get(key) ?? []), f]);
    }
    return [...map.entries()];
  }, [filaments, q]);

  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  const selectedFilaments = selected
    .map((id) => filaments.find((f) => f.id === id))
    .filter((f): f is Filament => !!f);

  return (
    <fieldset className="min-w-0" aria-describedby={error ? `${uid}-error` : undefined}>
      <legend className="mb-1.5 font-bold text-stone-800">
        {legend}{" "}
        <span className="text-rose-700" aria-hidden>
          *
        </span>
      </legend>
      <div
        className="mb-3 grid gap-2 sm:grid-cols-2"
        role="radiogroup"
        aria-label={legend}
      >
        {(
          [
            [
              true,
              "Alle Farben",
              "Jede vorrätige Farbe – auch Farben, die später dazukommen.",
            ],
            [
              false,
              "Nur bestimmte Farben",
              "Sie wählen die Farben unten selbst aus.",
            ],
          ] as const
        ).map(([wert, titel, text]) => (
          <label
            key={titel}
            className={cx(
              "flex min-h-12 cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ring-1 sm:min-h-14 sm:rounded-2xl sm:px-4 sm:py-3 ring-inset has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600",
              alleFarben === wert
                ? "bg-brand-50 ring-brand-400"
                : "bg-white ring-stone-300 hover:bg-stone-50",
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
              <span className="block text-[0.85rem] text-stone-600">
                {text}
              </span>
            </span>
          </label>
        ))}
      </div>

      {alleFarben ? (
        <AlleFarbenVorschau filaments={filaments} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.9rem] text-stone-600">
              <span className="font-bold text-stone-800">
                {selected.length} ausgewählt.
              </span>{" "}
              Leere Rollen sind markiert und werden Lehrkräften erst angeboten,
              wenn sie wieder vorrätig sind.
            </p>
            {manageLink && (
              <Link
                to="/verwaltung/stammdaten?liste=filaments"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-bold text-brand-700 hover:text-brand-900"
              >
                <Palette className="size-4" aria-hidden />
                Farbrollen verwalten
              </Link>
            )}
          </div>

          {selectedFilaments.length > 0 && (
            <ul
              className="mb-3 flex flex-wrap gap-2"
              aria-label="Ausgewählte Farben"
            >
              {selectedFilaments.map((f) => (
                <li
                  key={f.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 py-1 pl-2 pr-3 text-[0.85rem] font-bold text-stone-800 ring-1 ring-stone-200"
                >
                  <ColorSwatch hex={f.hex} className="size-4" />
                  {f.colorName}
                  {!f.available && (
                    <span className="font-normal text-rose-700">
                      {" "}
                      (nicht vorrätig)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {missing.length > 0 && (
            <Alert kind="warning" className="mb-3">
              {missing.length === 1
                ? "Eine gespeicherte Farbe gibt"
                : `${missing.length} gespeicherte Farben gibt`}{" "}
              es nicht mehr in den Farbrollen.{" "}
              <button
                type="button"
                className="font-bold underline"
                onClick={() => onChange(selected.filter((id) => known.has(id)))}
              >
                Jetzt entfernen
              </button>
            </Alert>
          )}

          {filaments.length === 0 ? (
            <Alert kind="warning">
              Es sind noch keine Farbrollen in den Stammdaten angelegt.
            </Alert>
          ) : (
            <>
              <div className="relative mb-3">
                <label htmlFor={`${uid}-filter`} className="sr-only">
                  Farbrollen filtern ({legend})
                </label>
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-500"
                  aria-hidden
                />
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
                {groups.length === 0 && (
                  <p className="p-2 text-stone-600">
                    Keine Farbrolle passt zu „{q}“.
                  </p>
                )}
                {groups.map(([group, list]) => {
                  const allOn = list.every((f) => selected.includes(f.id));
                  return (
                    <div key={group} role="group" aria-label={group}>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 px-1">
                        <p className="text-[0.85rem] font-bold uppercase tracking-wide text-stone-500">
                          {group}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            onChange(
                              allOn
                                ? selected.filter(
                                    (id) => !list.some((f) => f.id === id),
                                  )
                                : [
                                    ...selected,
                                    ...list
                                      .filter((f) => !selected.includes(f.id))
                                      .map((f) => f.id),
                                  ],
                            )
                          }
                          className="min-h-11 rounded-xl px-2 text-[0.85rem] font-bold text-brand-700 hover:text-brand-900"
                        >
                          {allOn
                            ? "Alle dieser Linie abwählen"
                            : "Alle dieser Linie wählen"}
                          <span className="sr-only"> ({group})</span>
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {list.map((f) => {
                          const checked = selected.includes(f.id);
                          return (
                            <label
                              key={f.id}
                              className={cx(
                                "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-inset transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600",
                                checked
                                  ? "bg-brand-50 ring-brand-400"
                                  : "bg-white ring-stone-300 hover:bg-stone-50",
                              )}
                              title={filamentLabel(f)}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggle(f.id)}
                                className="size-5 shrink-0 accent-brand-700"
                              />
                              <ColorSwatch hex={f.hex} className="size-7" />
                              <span className="min-w-0 flex-1">
                                <span className="block break-words font-bold text-stone-900">
                                  {f.colorName}
                                  {!f.available && (
                                    <span className="font-normal text-rose-700">
                                      {" "}
                                      (nicht vorrätig)
                                    </span>
                                  )}
                                </span>
                                <span className="block break-words text-[0.85rem] text-stone-600">
                                  {filamentRolle(f)}
                                </span>
                              </span>
                              {checked && (
                                <Check
                                  className="size-4 shrink-0 text-brand-700"
                                  aria-hidden
                                />
                              )}
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
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-bold text-brand-700 hover:text-brand-900"
        >
          <Palette className="size-4" aria-hidden />
          Farbrollen verwalten
        </Link>
      )}
      {error && (
        <p
          id={`${uid}-error`}
          className="mt-1.5 text-[0.9rem] font-bold text-rose-700"
        >
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Vorschau bei „Alle Farben“: was Lehrkräfte gerade angeboten bekommen. */
function AlleFarbenVorschau({ filaments }: { filaments: Filament[] }) {
  const vorraetig = filaments.filter((f) => f.available);
  const zeigen = vorraetig.slice(0, 24);
  return (
    <div className="rounded-2xl bg-stone-50/60 p-3 ring-1 ring-stone-200">
      <p className="mb-2 text-[0.9rem] text-stone-700">
        Lehrkräfte können gerade aus{" "}
        <span className="font-bold">{vorraetig.length} vorrätigen Farben</span>{" "}
        wählen. Neue Farbrollen kommen automatisch dazu, leere werden nicht
        angeboten.
      </p>
      <ul
        className="flex flex-wrap gap-1.5"
        aria-label="Gerade angebotene Farben"
      >
        {zeigen.map((f) => (
          <li key={f.id} title={filamentLabel(f)}>
            <ColorSwatch hex={f.hex} className="size-6" />
            <span className="sr-only">{f.colorName}</span>
          </li>
        ))}
        {vorraetig.length > zeigen.length && (
          <li className="self-center text-[0.85rem] text-stone-600">
            + {vorraetig.length - zeigen.length} weitere
          </li>
        )}
      </ul>
    </div>
  );
}
