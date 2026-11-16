import { Link2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ColorSwatch } from "../../../components/ColorSwatch";
import { Dialog } from "../../../components/Dialog";
import { useToast } from "../../../components/Toast";
import { Alert, Button, cx, inputClass } from "../../../components/ui";
import { api, ApiError } from "../../../lib/api";
import type { Filament, Item } from "../../../lib/types";
import { passtZurSuche } from "@mosaik3lab/shared/suche";

/** Bereiche eines Druckteils, denen man die Farbe hinzufügen kann (nicht „Alle Farben“, Farbe noch nicht dabei). */
const offeneBereiche = (item: Item, farbe: string) =>
  item.colorAreas.filter((a) => !a.alleFarben && !a.colors.includes(farbe));

/**
 * „Zu welchen Druckteilen soll ‚Gelb (PLA Basic)‘ dazu?“ – eine Farbrolle vielen Druckteilen auf einmal hinzufügen.
 * Schnellwahl: alle Druckteile, die schon Farben derselben Linie haben. Bei mehrfarbigen Teilen ist der Bereich wählbar.
 */
export function FarbeZuordnenDialog({
  farbe,
  items,
  filaments,
  onClose,
  onDone,
}: {
  farbe: Filament | undefined;
  items: Item[];
  filaments: Filament[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [wahl, setWahl] = useState<Map<string, Set<string>>>(new Map());
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string>();

  const gleicheLinie = useMemo(() => {
    if (!farbe) return new Set<string>();
    return new Set(
      filaments
        .filter(
          (f) =>
            f.id !== farbe.id &&
            f.brand === farbe.brand &&
            f.line === farbe.line,
        )
        .map((f) => f.id),
    );
  }, [farbe, filaments]);
  const kandidaten = useMemo(
    () =>
      farbe ? items.filter((i) => offeneBereiche(i, farbe.id).length > 0) : [],
    [items, farbe],
  );
  const mitAlle = farbe
    ? items.filter((i) => i.colorAreas.some((a) => a.alleFarben)).length
    : 0;
  const schonDabei = farbe
    ? items.filter((i) =>
        i.colorAreas.some((a) => !a.alleFarben && a.colors.includes(farbe.id)),
      ).length
    : 0;

  /** Standard-Bereiche: wo schon Farben derselben Linie sind, sonst alle offenen. */
  const standardBereiche = (item: Item) => {
    const offen = offeneBereiche(item, farbe!.id);
    const passend = offen.filter((a) =>
      a.colors.some((c) => gleicheLinie.has(c)),
    );
    return new Set((passend.length ? passend : offen).map((a) => a.id));
  };
  const hatLinie = (item: Item) =>
    offeneBereiche(item, farbe!.id).some((a) =>
      a.colors.some((c) => gleicheLinie.has(c)),
    );

  useEffect(() => {
    setWahl(new Map());
    setQ("");
    setFehler(undefined);
  }, [farbe?.id]);

  const sichtbar = kandidaten.filter((i) => passtZurSuche([i.name, i.number], q));
  const setze = (list: Item[], an: boolean) =>
    setWahl((w) => {
      const n = new Map(w);
      for (const i of list) {
        if (an) n.set(i.id, n.get(i.id) ?? standardBereiche(i));
        else n.delete(i.id);
      }
      return n;
    });
  const bereichUmschalten = (item: Item, bereich: string) =>
    setWahl((w) => {
      const n = new Map(w);
      const s = new Set(n.get(item.id) ?? []);
      if (s.has(bereich)) s.delete(bereich);
      else s.add(bereich);
      if (s.size) n.set(item.id, s);
      else n.delete(item.id);
      return n;
    });

  const zuordnen = async () => {
    if (!farbe) return;
    setBusy(true);
    setFehler(undefined);
    try {
      const ziele = [...wahl.entries()].map(([itemId, b]) => ({
        itemId,
        bereiche: [...b],
      }));
      const r = await api<{ druckteile: number }>("/items/farbe-zuordnen", {
        method: "POST",
        body: { filamentId: farbe.id, ziele },
      });
      toast(
        "success",
        r.druckteile === 1
          ? `„${farbe.colorName}“ bei 1 Druckteil ergänzt.`
          : `„${farbe.colorName}“ bei ${r.druckteile} Druckteilen ergänzt.`,
      );
      onDone();
      onClose();
    } catch (err) {
      setFehler(
        err instanceof ApiError
          ? err.message
          : "Zuordnen fehlgeschlagen. Es wurde nichts geändert.",
      );
    } finally {
      setBusy(false);
    }
  };

  const titel = farbe
    ? `„${farbe.colorName}${farbe.line ? ` (${farbe.line})` : ""}“ zu Druckteilen hinzufügen`
    : "";
  const linienTeile = farbe ? kandidaten.filter(hatLinie) : [];

  return (
    <Dialog
      open={!!farbe}
      onClose={onClose}
      size="lg"
      title={titel}
      description="Wählen Sie die Druckteile, bei denen man diese Farbe künftig wählen kann."
    >
      {farbe && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <ColorSwatch hex={farbe.hex} className="size-10" />
            <p className="text-hinweis text-stone-700">
              {mitAlle > 0 && (
                <>
                  <span className="font-bold">
                    {mitAlle === 1
                      ? "1 Druckteil hat"
                      : `${mitAlle} Druckteile haben`}{" "}
                    „Alle Farben“
                  </span>{" "}
                  und bekommt die Farbe automatisch.{" "}
                </>
              )}
              {schonDabei > 0 && (
                <>
                  Bei{" "}
                  {schonDabei === 1
                    ? "1 Druckteil"
                    : `${schonDabei} Druckteilen`}{" "}
                  ist sie schon ausgewählt.
                </>
              )}
            </p>
          </div>
          {fehler && <Alert kind="error">{fehler}</Alert>}
          {kandidaten.length === 0 ? (
            <p className="text-stone-600">
              Kein weiteres Druckteil hat „Nur bestimmte Farben“ – es gibt
              nichts zuzuordnen.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {linienTeile.length > 0 && (
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => setze(linienTeile, true)}
                  >
                    Alle mit {farbe.line || farbe.brand}-Farben (
                    {linienTeile.length})
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setze(sichtbar, true)}
                >
                  Alle angezeigten wählen
                </Button>
                {wahl.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setWahl(new Map())}
                  >
                    Auswahl aufheben
                  </Button>
                )}
              </div>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-500"
                  aria-hidden
                />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Druckteil suchen"
                  aria-label="Druckteil suchen"
                  className={`${inputClass()} pl-12`}
                />
              </div>
              <ul className="max-h-[24rem] space-y-2 overflow-y-auto">
                {sichtbar.map((item) => {
                  const offen = offeneBereiche(item, farbe.id);
                  const gewaehlt = wahl.get(item.id);
                  const mehrere = item.colorAreas.length > 1;
                  return (
                    <li
                      key={item.id}
                      className={cx(
                        "rounded-xl px-3 py-2 ring-1 ring-inset",
                        gewaehlt
                          ? "bg-brand-50 ring-brand-400"
                          : "bg-white ring-stone-300",
                      )}
                    >
                      <label className="flex min-h-11 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={!!gewaehlt}
                          onChange={() => setze([item], !gewaehlt)}
                          className="size-5 shrink-0 accent-brand-700"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block wrap-anywhere font-bold text-stone-900">
                            {item.name}
                          </span>
                          <span className="block wrap-anywhere text-hinweis text-stone-600">
                            {item.number} · {item.material}
                            {hatLinie(item) &&
                              ` · hat schon ${farbe.line}-Farben`}
                          </span>
                        </span>
                      </label>
                      {mehrere && gewaehlt && (
                        <div
                          className="mb-1 ml-8 flex flex-wrap gap-x-4 gap-y-1"
                          role="group"
                          aria-label={`Farbbereiche von ${item.name}`}
                        >
                          {offen.map((a) => (
                            <label
                              key={a.id}
                              className="inline-flex min-h-10 items-center gap-2 text-hinweis"
                            >
                              <input
                                type="checkbox"
                                checked={gewaehlt.has(a.id)}
                                onChange={() => bereichUmschalten(item, a.id)}
                                className="size-4 accent-brand-700"
                              />
                              {a.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
                {sichtbar.length === 0 && (
                  <li className="p-2 text-stone-600">
                    Kein Druckteil passt zu „{q}“.
                  </li>
                )}
              </ul>
            </>
          )}
          <div className="sticky -bottom-4 -mx-4 -mb-4 grid grid-cols-2 gap-2 border-t border-stone-100 bg-white px-4 py-3 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:flex sm:gap-3 sm:px-6 sm:py-4 sm:flex-row sm:items-center sm:justify-end">
            <p
              className="col-span-2 text-hinweis text-stone-600 sm:mr-auto"
              aria-live="polite"
            >
              {wahl.size === 1
                ? "1 Druckteil ausgewählt"
                : `${wahl.size} Druckteile ausgewählt`}
            </p>
            <Button variant="secondary" onClick={onClose}>
              Später
            </Button>
            <Button
              icon={Link2}
              loading={busy}
              disabled={wahl.size === 0}
              onClick={zuordnen}
            >
              Zuordnen
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
