import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ItemImage } from '../../components/ItemImage';
import { cx } from '../../components/ui';
import { blaettern, wischRichtung } from './galerie';

type Bilder = { name: string; images: string[]; category?: string; categories?: string[] };

/**
 * Bilder eines Druckteils: großes Bild, bei mehreren Bildern Wischen (Touch, Stift, Maus), Pfeil-Knöpfe,
 * Pfeiltasten und Vorschaubilder. Senkrechtes Scrollen der Seite bleibt möglich (`touch-action: pan-y`).
 */
export function BildGalerie({ item }: { item: Bilder }) {
  const [aktiv, setAktiv] = useState(0);
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const anzahl = item.images.length;
  const mehrere = anzahl > 1;
  const index = Math.min(aktiv, Math.max(0, anzahl - 1));

  const gehe = (richtung: -1 | 1) => setAktiv((i) => blaettern(i, anzahl, richtung));

  const onPointerDown = (e: PointerEvent) => {
    if (!mehrere || (e.pointerType === 'mouse' && e.button !== 0)) return;
    start.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || s.id !== e.pointerId) return;
    const richtung = wischRichtung(e.clientX - s.x, e.clientY - s.y);
    if (richtung) gehe(richtung);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!mehrere) return;
    if (e.key === 'ArrowLeft') gehe(-1);
    else if (e.key === 'ArrowRight') gehe(1);
    else return;
    e.preventDefault();
  };

  const pfeil = 'absolute top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-stone-900 shadow-md ring-1 ring-stone-300 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600';

  return (
    <div>
      <div
        className="relative aspect-[2/1] touch-pan-y select-none overflow-hidden rounded-2xl border border-stone-200/80 bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600 sm:aspect-[4/3] sm:rounded-3xl"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (start.current = null)}
        onDragStart={(e) => e.preventDefault()}
        {...(mehrere && {
          role: 'group',
          'aria-roledescription': 'Bildergalerie',
          'aria-label': `Bild ${index + 1} von ${anzahl}. Wischen oder Pfeiltasten wechseln das Bild.`,
          tabIndex: 0,
          onKeyDown,
        })}
      >
        <ItemImage item={item} index={index} groesse="original" iconSize="size-16 sm:size-24" vorrang={index === 0} />
        {mehrere && (
          <>
            <button type="button" onClick={() => gehe(-1)} aria-label="Vorheriges Bild" className={cx(pfeil, 'left-2 sm:left-3')}>
              <ChevronLeft className="size-7" aria-hidden />
            </button>
            <button type="button" onClick={() => gehe(1)} aria-label="Nächstes Bild" className={cx(pfeil, 'right-2 sm:right-3')}>
              <ChevronRight className="size-7" aria-hidden />
            </button>
            <p className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-stone-900/75 px-3 py-0.5 text-hinweis font-bold text-white" aria-live="polite">
              {index + 1} / {anzahl}
            </p>
          </>
        )}
      </div>
      {mehrere && (
        <ul className="mt-3 flex flex-wrap gap-3" aria-label="Weitere Bilder">
          {item.images.map((img, i) => (
            <li key={img}>
              <button
                type="button"
                onClick={() => setAktiv(i)}
                aria-label={`Bild ${i + 1} von ${anzahl} anzeigen`}
                aria-pressed={i === index}
                className={cx(
                  'block size-20 overflow-hidden rounded-2xl ring-2 ring-offset-2 transition',
                  i === index ? 'ring-brand-600' : 'ring-transparent hover:ring-stone-300',
                )}
              >
                <ItemImage item={item} index={i} groesse="mini" sizes="80px" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
