import { EGAL_FARBE, EGAL_FARBE_NAME } from '@mosaik3lab/shared/werte/anfragen';
import { Check, ChevronLeft, ChevronRight, Search, Shuffle, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BlattDialog } from '../../components/BlattDialog';
import { ColorSwatch } from '../../components/ColorSwatch';
import { cx, inputClass } from '../../components/ui';
import { nachFarbfamilie } from '../../lib/farbfamilie';
import type { Filament } from '../../lib/types';
import { farbePasst, gewaehlteFarbe } from './teileFarbwahl';

/** Was das Fenster gerade zeigt: ein Teil (mit Nummer) oder „Eine Farbe für alle Teile“. */
export type FensterZiel = { art: 'teil'; nr: number; name: string; farben: Filament[]; gewaehlt?: string } | { art: 'alle'; farben: Filament[] };

const iconKnopf =
  'grid size-[48px] shrink-0 place-items-center rounded-xl ring-1 ring-inset ring-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:hover:bg-transparent';

/**
 * Farbwahl-Fenster für Lehrkräfte: Suche, „Farbe egal“, „Schon in dieser Anfrage“ und alle Farben nach Farbfamilie.
 * Ein Tipp wählt (`onWaehle`); was danach passiert (nächstes Teil, schließen), entscheidet der Aufrufer.
 * Wiederverwendbar (Anfrage-Fenster, später direkt auf der Druckteil-Seite).
 */
export function FarbwahlFenster({
  open,
  ziel,
  anzahl,
  schonGewaehlt,
  onWaehle,
  onVoriges,
  onNaechstes,
  onClose,
  ansage,
}: {
  open: boolean;
  ziel: FensterZiel;
  /** Anzahl aller Teile („Teil 3 von 20“). */
  anzahl: number;
  /** Bisher gewählte Farben dieser Anfrage (für einheitliche Sets). */
  schonGewaehlt: Filament[];
  onWaehle: (farbId: string) => void;
  onVoriges?: () => void;
  onNaechstes?: () => void;
  onClose: () => void;
  /** Kurze Meldung für Bildschirmleser, z. B. „Rot gewählt, weiter mit Teil 4“. */
  ansage?: string;
}) {
  const uid = useId();
  const titelId = `${uid}-titel`;
  const titelRef = useRef<HTMLHeadingElement>(null);
  const inhaltRef = useRef<HTMLDivElement>(null);
  const teil = ziel.art === 'teil' ? ziel : undefined;
  const gewaehlt = teil?.gewaehlt;
  const jetzt = gewaehlteFarbe(ziel.farben, gewaehlt);
  const schluessel = teil ? `${teil.nr}` : 'alle';
  // Suche gilt nur für das gerade gezeigte Teil – beim nächsten Teil wieder alle Farben.
  const [suche, setSuche] = useState({ fuer: '', q: '' });
  const q = suche.fuer === schluessel ? suche.q : '';
  const setQ = (text: string) => setSuche({ fuer: schluessel, q: text });
  const schliessen = () => {
    setSuche({ fuer: '', q: '' });
    onClose();
  };

  // Neues Teil: nach oben scrollen, Fokus auf die gewählte Farbe bzw. den Teilnamen (öffnet keine Bildschirmtastatur).
  useEffect(() => {
    if (!open) return;
    const box = inhaltRef.current;
    if (box?.parentElement) box.parentElement.scrollTop = 0;
    const an = box?.querySelector<HTMLElement>('[data-farbe][aria-pressed="true"]');
    (an ?? titelRef.current)?.focus();
  }, [open, schluessel]);

  const passend = useMemo(() => ziel.farben.filter((f) => farbePasst(f, q)), [ziel.farben, q]);
  const familien = useMemo(() => nachFarbfamilie(passend), [passend]);
  const schon = teil && !q ? schonGewaehlt.filter((f) => ziel.farben.some((x) => x.id === f.id)) : [];

  const kachel = (f: Filament, gruppe: string) => {
    const an = f.id === gewaehlt;
    return (
      <button
        key={`${gruppe}-${f.id}`}
        type="button"
        data-farbe
        aria-pressed={an}
        onClick={() => onWaehle(f.id)}
        className={cx(
          'flex min-h-[48px] items-center gap-[10px] rounded-xl px-[10px] py-[8px] text-left font-bold',
          an ? 'bg-brand-50 text-brand-900 ring-2 ring-inset ring-brand-700' : 'bg-white text-stone-900 ring-1 ring-inset ring-stone-300 hover:bg-stone-50',
        )}
      >
        <ColorSwatch hex={f.hex} className="size-7" />
        <span className="min-w-0 flex-1 leading-snug hyphens-auto wrap-break-word">{f.colorName}</span>
        {an && <Check className="size-5 shrink-0 text-brand-700" aria-hidden />}
      </button>
    );
  };
  // Handy: 2 Spalten (bei großer Schrift 1), ab Tablet höchstens 3 breite Spalten, damit lange Namen ganz hineinpassen.
  const raster = 'grid gap-[8px] grid-cols-[repeat(auto-fill,minmax(min(100%,9.5rem),1fr))] sm:grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))]';
  const gruppe = (titel: string, farben: Filament[]) => {
    const id = `${uid}-${titel}`;
    return (
      <div key={titel} role="group" aria-labelledby={id} className="mb-4">
        <h3 id={id} className="mb-1.5 text-hinweis font-bold uppercase tracking-wide text-stone-600">
          {titel}
        </h3>
        <div className={raster}>{farben.map((f) => kachel(f, titel))}</div>
      </div>
    );
  };

  return createPortal(
    <BlattDialog
      open={open}
      onClose={schliessen}
      labelledBy={titelId}
      kopf={
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-[8px] gap-y-[4px]">
            <p className="text-hinweis font-bold text-stone-600" aria-live="polite">
              {teil ? `Teil ${teil.nr} von ${anzahl}` : `Alle ${anzahl} Teile`}
            </p>
            <div className="ml-auto flex shrink-0 gap-[8px]">
              {teil && (
                <>
                  <button type="button" className={iconKnopf} onClick={onVoriges} disabled={!onVoriges} aria-label="Voriges Teil">
                    <ChevronLeft className="size-5" aria-hidden />
                  </button>
                  <button type="button" className={iconKnopf} onClick={onNaechstes} disabled={!onNaechstes} aria-label="Nächstes Teil">
                    <ChevronRight className="size-5" aria-hidden />
                  </button>
                </>
              )}
              <button
                type="button"
                className="grid size-[48px] shrink-0 place-items-center rounded-xl text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                onClick={schliessen}
                aria-label="Fenster schließen"
              >
                <X className="size-6" aria-hidden />
              </button>
            </div>
          </div>
          <h2 id={titelId} ref={titelRef} tabIndex={-1} className="text-abschnitt font-bold leading-snug text-stone-900 hyphens-auto wrap-break-word focus:outline-none sm:text-xl">
            {teil ? teil.name : 'Eine Farbe für alle Teile'}
          </h2>
        </>
      }
      fuss={
        <div className="flex justify-end">
          <button type="button" onClick={schliessen} className="min-h-[48px] w-full rounded-xl bg-stone-900 px-6 font-bold text-white hover:bg-stone-800 sm:w-auto">
            Fertig
          </button>
        </div>
      }
    >
      <div ref={inhaltRef}>
        <p className="sr-only" aria-live="polite">
          {ansage}
        </p>
        <p className="mb-[12px] flex flex-wrap items-center gap-x-[8px] gap-y-[4px] text-hinweis text-stone-700">
          {!teil ? (
            'Gilt für alle Teile, auch die schon gewählten. Danach können Sie einzelne Teile ändern.'
          ) : (
            <>
              {jetzt === 'egal' ? (
                <b>Jetzt: {EGAL_FARBE_NAME}</b>
              ) : jetzt ? (
                <>
                  <span>Jetzt:</span>
                  <ColorSwatch hex={jetzt.hex} />
                  <b className="hyphens-auto wrap-break-word">{jetzt.colorName}</b>
                </>
              ) : (
                <b>Noch keine Farbe gewählt.</b>
              )}
              <span className="basis-full">Ein Tipp wählt und geht weiter zum nächsten Teil ohne Farbe.</span>
            </>
          )}
        </p>
        <div className="relative mb-3">
          <label htmlFor={`${uid}-suche`} className="sr-only">
            Farbe suchen
          </label>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-500" aria-hidden />
          <input
            id={`${uid}-suche`}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="z. B. grün"
            autoComplete="off"
            className={`${inputClass()} min-h-[48px] pl-12`}
          />
        </div>
        <button
          type="button"
          data-farbe
          aria-pressed={gewaehlt === EGAL_FARBE}
          onClick={() => onWaehle(EGAL_FARBE)}
          className={cx(
            'mb-4 flex min-h-[48px] w-full items-center gap-[10px] rounded-xl px-[12px] py-[8px] text-left font-bold sm:w-auto',
            gewaehlt === EGAL_FARBE ? 'bg-brand-50 text-brand-900 ring-2 ring-inset ring-brand-700' : 'bg-white text-stone-900 ring-1 ring-inset ring-stone-300 hover:bg-stone-50',
          )}
        >
          <Shuffle className="size-5 shrink-0 text-stone-600" aria-hidden />
          <span className="min-w-0">{EGAL_FARBE_NAME} – das Druck-Team wählt</span>
          {gewaehlt === EGAL_FARBE && <Check className="size-5 shrink-0 text-brand-700" aria-hidden />}
        </button>
        {schon.length > 0 && gruppe('Schon in dieser Anfrage', schon)}
        {familien.map(([familie, farben]) => gruppe(familie, farben))}
        {passend.length === 0 && <p className="text-stone-700">Keine Farbe passt zu „{q}“.</p>}
      </div>
    </BlattDialog>,
    document.body,
  );
}
