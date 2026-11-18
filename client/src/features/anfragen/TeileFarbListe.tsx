import { EGAL_FARBE, EGAL_FARBE_NAME } from '@mosaik3lab/shared/werte/anfragen';
import { farbenText, teileText } from '@mosaik3lab/shared/werte/farbgruppen';
import { ChevronRight, Palette, Shuffle } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { ColorSwatch } from '../../components/ColorSwatch';
import { TupferReihe } from '../../components/TupferReihe';
import { cx } from '../../components/ui';
import type { AreaColors } from '../../lib/colors';
import { FarbwahlFenster, type FensterZiel } from './FarbwahlFenster';
import { eineFarbeFuerAlle, farbenAllerTeile, gewaehlteFarbe, naechstesTeilOhneFarbe, schonGewaehlt } from './teileFarbwahl';

/**
 * Farbwahl eines mehrfarbigen Druckteils: kurze Liste aller Teile (Nummer, Farbtupfer, Teilname, Farbname) mit
 * Zusammenfassung „10 Teile · 4 Farben“, „Eine Farbe für alle Teile“ und dem Farbwahl-Fenster. Ein Tipp im Fenster wählt
 * und springt zum nächsten Teil ohne Farbe. Wiederverwendbar (Anfrage-Fenster, später direkt auf der Druckteil-Seite).
 * `fehler(areaId)`: Fehlermeldung je Teil (z. B. „Bitte eine Farbe wählen“) – die Zeile ist dann markiert.
 */
export function TeileFarbListe({
  teile,
  colors,
  onChange,
  fehler,
  titel = 'Farben',
}: {
  teile: AreaColors[];
  colors: Record<string, string>;
  onChange: (colors: Record<string, string>) => void;
  fehler?: (areaId: string) => string | undefined;
  titel?: string;
}) {
  const uid = useId();
  const listeRef = useRef<HTMLUListElement>(null);
  const alleRef = useRef<HTMLButtonElement>(null);
  /** Gerade im Fenster: Index des Teils oder „alle“; null = Fenster zu. */
  const [fenster, setFenster] = useState<number | 'alle' | null>(null);
  const [ansage, setAnsage] = useState('');
  const [meldung, setMeldung] = useState('');
  const ids = teile.map((t) => t.area.id);
  const alleFarben = farbenAllerTeile(teile);
  const schon = schonGewaehlt(teile, colors);
  const gewaehlteIds = ids.map((id) => colors[id]).filter(Boolean);
  const offen = ids.length - gewaehlteIds.length;
  const egal = gewaehlteIds.includes(EGAL_FARBE);
  const fehlerzahl = fehler ? ids.filter((id) => fehler(id)).length : 0;

  const zeileFokussieren = (index: number) =>
    requestAnimationFrame(() => listeRef.current?.querySelectorAll<HTMLButtonElement>('[data-teil]')[index]?.focus());
  const schliessen = () => {
    const war = fenster;
    setFenster(null);
    setAnsage('');
    if (war === 'alle') requestAnimationFrame(() => alleRef.current?.focus());
    else if (war !== null) zeileFokussieren(war);
  };
  const oeffne = (index: number | 'alle') => {
    setAnsage('');
    setMeldung('');
    setFenster(index);
  };

  const waehle = (farbId: string) => {
    if (fenster === null) return;
    const name = farbId === EGAL_FARBE ? EGAL_FARBE_NAME : (alleFarben.find((f) => f.id === farbId)?.colorName ?? '');
    if (fenster === 'alle') {
      const { colors: next, fehlt } = eineFarbeFuerAlle(teile, colors, farbId, alleFarben);
      onChange(next);
      setMeldung(
        fehlt.length
          ? `${name} für ${teile.length - fehlt.length} von ${teile.length} Teilen übernommen. Nicht wählbar für: ${fehlt.join(', ')}.`
          : `${name} für alle ${teile.length} Teile übernommen. Einzelne Teile können Sie jetzt noch ändern.`,
      );
      schliessen();
      return;
    }
    const id = ids[fenster];
    const next = { ...colors, [id]: farbId };
    onChange(next);
    // Ein Tipp wählt und springt zum nächsten Teil ohne Farbe – fertig, wenn alle eine Farbe haben.
    const weiter = naechstesTeilOhneFarbe(ids, next, id);
    if (weiter === undefined) {
      setMeldung(`${name} gewählt. Alle Teile haben jetzt eine Farbe.`);
      schliessen();
      return;
    }
    const nr = ids.indexOf(weiter);
    setFenster(nr);
    setAnsage(`${name} gewählt. Weiter mit Teil ${nr + 1}: ${teile[nr].area.name}.`);
  };

  const ziel: FensterZiel =
    fenster === 'alle' || fenster === null
      ? { art: 'alle', farben: alleFarben }
      : { art: 'teil', nr: fenster + 1, name: teile[fenster].area.name, farben: teile[fenster].filaments, gewaehlt: colors[ids[fenster]] };
  const index = typeof fenster === 'number' ? fenster : -1;
  const ersteOffene = naechstesTeilOhneFarbe(ids, colors);

  return (
    <section aria-labelledby={`${uid}-titel`} className="min-w-0 rounded-2xl bg-white ring-1 ring-stone-300">
      <div className="flex flex-wrap items-center justify-between gap-[8px] border-b border-stone-200 px-[12px] py-[12px] sm:px-[16px]">
        <h3 id={`${uid}-titel`} className="text-abschnitt font-bold text-stone-900">
          {titel} <span className="text-rose-700" aria-hidden>*</span>
          <span className="sr-only">(Pflicht)</span>
        </h3>
        <button
          ref={alleRef}
          type="button"
          onClick={() => oeffne('alle')}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-brand-50 px-3 py-1.5 text-left font-bold text-brand-800 ring-1 ring-inset ring-brand-200 hover:bg-brand-100"
        >
          <Palette className="size-5 shrink-0" aria-hidden />
          Eine Farbe für alle Teile
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-stone-200 px-[12px] py-[10px] sm:px-[16px]">
        <span className="font-bold text-stone-900">
          {teileText(ids.length)}
          {schon.length > 0 && ` · ${farbenText(new Set(gewaehlteIds.filter((c) => c !== EGAL_FARBE)).size)}`}
          {egal && ` · ${EGAL_FARBE_NAME}`}
        </span>
        <TupferReihe farben={schon.map((f) => f.hex)} />
        {offen > 0 && ersteOffene !== undefined && (
          <button
            type="button"
            onClick={() => oeffne(ids.indexOf(ersteOffene))}
            className={cx(
              'inline-flex min-h-[48px] items-center gap-1 rounded-xl text-left font-bold underline decoration-2 underline-offset-2 hover:bg-brand-50',
              fehlerzahl ? 'text-rose-700' : 'text-brand-700',
            )}
          >
            {offen} noch ohne Farbe – jetzt wählen
            <ChevronRight className="size-5 shrink-0" aria-hidden />
          </button>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {meldung}
      </p>
      {/* Container-Abfrage: Wird die Spalte schmal (Handy mit großer Schrift), stapelt sich die Zeile – der Name bekommt die volle Breite. */}
      <ul ref={listeRef} className="@container divide-y divide-stone-200" aria-label={`Teile und ${titel}`}>
        {teile.map(({ area, filaments }, i) => {
          const wahl = gewaehlteFarbe(filaments, colors[area.id]);
          const farbname = wahl === 'egal' ? EGAL_FARBE_NAME : wahl?.colorName;
          const err = fehler?.(area.id);
          return (
            <li key={area.id}>
              <button
                type="button"
                data-teil
                onClick={() => oeffne(i)}
                data-fehler={err ? true : undefined}
                aria-label={`Teil ${i + 1}: ${area.name}, ${farbname ? `Farbe ${farbname}, ändern` : 'noch keine Farbe, wählen'}`}
                className={cx(
                  'flex min-h-[56px] w-full items-center gap-x-[12px] gap-y-[4px] px-[12px] py-[10px] text-left hover:bg-stone-50 @max-[15rem]:flex-wrap sm:px-[16px]',
                  err && 'bg-rose-50/60',
                )}
              >
                <span className="w-7 shrink-0 text-right text-hinweis text-stone-500 @max-[15rem]:order-2 @max-[15rem]:w-auto @max-[15rem]:flex-1 @max-[15rem]:text-left">
                  <span className="hidden @max-[15rem]:inline">Teil </span>
                  {i + 1}
                </span>
                <span className="shrink-0 @max-[15rem]:order-1">
                  {wahl === 'egal' ? (
                    <span className="grid size-[32px] place-items-center rounded-full bg-stone-100 text-stone-600 ring-1 ring-inset ring-stone-300">
                      <Shuffle className="size-4" aria-hidden />
                    </span>
                  ) : wahl ? (
                    <ColorSwatch hex={wahl.hex} className="size-[32px]" />
                  ) : (
                    <span className={cx('block size-[32px] rounded-full border-2 border-dashed', err ? 'border-rose-500' : 'border-stone-400')} />
                  )}
                </span>
                <span className="min-w-0 flex-1 @max-[15rem]:order-4 @max-[15rem]:basis-full">
                  <span className="block font-bold leading-snug text-stone-900 hyphens-auto wrap-break-word">{area.name}</span>
                  <span className={cx('block text-hinweis leading-snug hyphens-auto wrap-break-word', farbname ? 'text-stone-600' : err ? 'font-bold text-rose-700' : 'font-bold text-brand-700')}>
                    {farbname ?? (err || 'Farbe wählen')}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-hinweis font-bold text-brand-700 @max-[15rem]:order-3">
                  <span className="hidden sm:inline @max-[15rem]:hidden">{farbname ? 'Ändern' : 'Wählen'}</span>
                  <ChevronRight className="size-5 text-stone-500" aria-hidden />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {fehlerzahl > 0 && (
        <p className="border-t border-stone-200 px-[12px] py-[10px] text-hinweis font-bold text-rose-700 sm:px-[16px]">
          Bitte für {fehlerzahl === 1 ? 'ein Teil' : `${fehlerzahl} Teile`} eine Farbe wählen.
        </p>
      )}
      <FarbwahlFenster
        open={fenster !== null}
        ziel={ziel}
        anzahl={teile.length}
        schonGewaehlt={schon}
        onWaehle={waehle}
        onVoriges={index > 0 ? () => oeffne(index - 1) : undefined}
        onNaechstes={index >= 0 && index < teile.length - 1 ? () => oeffne(index + 1) : undefined}
        onClose={schliessen}
        ansage={ansage}
      />
    </section>
  );
}
