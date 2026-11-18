import { inGruppen } from '@mosaik3lab/shared/werte/katalog';
import { Pencil } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BlattDialog } from '../../../components/BlattDialog';
import { TupferReihe } from '../../../components/TupferReihe';
import { Button } from '../../../components/ui';
import type { Filament } from '../../../lib/types';
import { FilamentPicker } from './FilamentPicker';
import { auswahlBeschreibung, type Auswahl } from './teileRegeln';
import { ohneGruppen } from './itemForm';

/**
 * Die bewährte Farbauswahl (Alle Farben / ganze Linie / Material / einzelne) in einem Fenster – für „Schritt 1“ (alle
 * Teile) und für eigene Farben eines Teils. Änderungen gelten sofort, „Fertig“ schließt nur.
 */
export function FarbauswahlDialog({
  open,
  titel,
  hinweis,
  auswahl,
  filaments,
  manageLink,
  onChange,
  onClose,
  zusatzKnopf,
}: {
  open: boolean;
  titel: string;
  hinweis?: string;
  auswahl: Auswahl;
  filaments: Filament[];
  manageLink: boolean;
  onChange: (a: Auswahl) => void;
  onClose: () => void;
  /** z. B. „Farben aus Schritt 1 verwenden“ im Fuß. */
  zusatzKnopf?: { text: string; onClick: () => void };
}) {
  const titelId = useId();
  const gruppen = auswahl.gruppen ?? [];
  return createPortal(
    <BlattDialog
      open={open}
      onClose={onClose}
      labelledBy={titelId}
      breite="md"
      kopf={
        <h2 id={titelId} className="pt-2 text-abschnitt font-bold leading-snug text-stone-900 hyphens-auto wrap-break-word sm:text-xl">
          {titel}
        </h2>
      }
      fuss={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {zusatzKnopf && (
            <Button variant="secondary" onClick={zusatzKnopf.onClick}>
              {zusatzKnopf.text}
            </Button>
          )}
          <button type="button" onClick={onClose} className="min-h-[48px] rounded-xl bg-stone-900 px-6 font-bold text-white hover:bg-stone-800">
            Fertig
          </button>
        </div>
      }
    >
      {hinweis && <p className="mb-3 text-hinweis text-stone-600">{hinweis}</p>}
      <FilamentPicker
        legend="Welche Farben kann man wählen?"
        filaments={filaments}
        alleFarben={!!auswahl.alleFarben}
        onAlleFarben={(on) => onChange({ alleFarben: on, colors: [], gruppen: [] })}
        selected={auswahl.colors}
        onChange={(colors) => onChange({ ...auswahl, colors })}
        gruppen={gruppen}
        onGruppen={(g) => onChange({ ...auswahl, gruppen: g, colors: ohneGruppen(auswahl.colors, [...gruppen, ...g], filaments) })}
        manageLink={manageLink}
      />
    </BlattDialog>,
    document.body,
  );
}

/** Schritt 1: „Welche Farben stehen zur Wahl?“ – einmal für alle Teile, als kurze Zusammenfassung mit „Ändern“. */
export function GemeinsameFarben({
  auswahl,
  filaments,
  manageLink,
  onChange,
}: {
  auswahl: Auswahl;
  filaments: Filament[];
  manageLink: boolean;
  onChange: (a: Auswahl) => void;
}) {
  const [offen, setOffen] = useState(false);
  const knopf = useRef<HTMLButtonElement>(null);
  const { titel, text } = auswahlBeschreibung(auswahl, filaments);
  const ids = new Set(auswahl.colors);
  const farben = filaments.filter((f) => f.available && (auswahl.alleFarben || ids.has(f.id) || inGruppen(f, auswahl.gruppen)));
  return (
    <div className="flex flex-wrap items-center gap-[12px] rounded-2xl bg-stone-50 p-[12px] ring-1 ring-inset ring-stone-200">
      <div className="min-w-[min(100%,14rem)] flex-1">
        <p className="font-bold text-stone-900 hyphens-auto wrap-break-word">{titel}</p>
        <p className="text-hinweis text-stone-600">{text}</p>
        <TupferReihe farben={farben.map((f) => f.hex)} max={16} tupfer="size-5" className="mt-1.5" />
      </div>
      <button
        ref={knopf}
        type="button"
        onClick={() => setOffen(true)}
        className="inline-flex min-h-[48px] items-center gap-[8px] rounded-xl bg-white px-[16px] font-bold text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-50"
        aria-label="Farben für alle Teile ändern"
      >
        <Pencil className="size-5" aria-hidden />
        Ändern
      </button>
      <FarbauswahlDialog
        open={offen}
        titel="Farben für alle Teile"
        hinweis="Gilt für jedes Teil ohne eigene Auswahl. Lehrkräfte sehen nur vorrätige Farben."
        auswahl={auswahl}
        filaments={filaments}
        manageLink={manageLink}
        onChange={onChange}
        onClose={() => {
          setOffen(false);
          requestAnimationFrame(() => knopf.current?.focus());
        }}
      />
    </div>
  );
}
