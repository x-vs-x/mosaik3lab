import { ChevronLeft, ChevronRight, ExternalLink, Play } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ItemImage } from '../../components/ItemImage';
import { cx } from '../../components/ui';
import { videoUrl } from '../../lib/api';
import type { Item, ItemVideo } from '../../lib/types';
import { blaettern, medienListe, seitenName, wischRichtung, type Medium } from './galerie';

const videoTyp = (file: string) => (file.endsWith('.webm') ? 'video/webm' : 'video/mp4');

/**
 * Bilder und Videos eines Druckteils in einer Galerie: erst die Bilder, dann die Videos (Vorschaubild mit Play-Symbol).
 * Wischen (Touch, Stift, Maus), Pfeil-Knöpfe, Pfeiltasten und Vorschaubilder gehen über alle Einträge; senkrechtes Scrollen
 * bleibt möglich (`touch-action: pan-y`). Hochgeladene Videos spielen direkt hier (ohne Autoplay; auf dem Video wird nicht
 * geblättert, damit Spulen geht). Video-Links (YouTube, Vimeo …) werden nie eingebettet – nur eine Kachel mit Link in einem
 * neuen Tab. So lädt nichts von fremden Servern (Datenschutz), die Content-Security-Policy bleibt unverändert.
 */
export function MedienGalerie({ item }: { item: Item }) {
  const medien = medienListe<ItemVideo>(item.images.length, item.videos);
  const [aktiv, setAktiv] = useState(0);
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const anzahl = medien.length;
  const mehrere = anzahl > 1;
  const index = Math.min(aktiv, anzahl - 1);
  const m = medien[index];
  const link = m.art === 'video' && !m.video.file;
  const gehe = (r: -1 | 1) => setAktiv((i) => blaettern(i, anzahl, r));
  const beschriftung = (x: Medium<ItemVideo>, i: number) =>
    x.art === 'bild' ? `Bild ${i + 1} von ${anzahl}` : `Video ${i + 1} von ${anzahl}: ${x.video.title || 'ohne Titel'}`;
  const aufVideo = (e: { target: EventTarget }) => (e.target as HTMLElement).tagName === 'VIDEO';

  const onPointerDown = (e: PointerEvent) => {
    if (!mehrere || (e.pointerType === 'mouse' && e.button !== 0) || aufVideo(e)) return;
    start.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || s.id !== e.pointerId) return;
    const r = wischRichtung(e.clientX - s.x, e.clientY - s.y);
    if (r) gehe(r);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!mehrere || aufVideo(e)) return;
    if (e.key === 'ArrowLeft') gehe(-1);
    else if (e.key === 'ArrowRight') gehe(1);
    else return;
    e.preventDefault();
  };
  const pfeil =
    'absolute top-1/2 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-stone-900 shadow-md ring-1 ring-stone-300 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600';

  // Video-Link auf dem Handy: Pfeile unten, damit sie Titel und Knopf nicht verdecken
  const pfeilUnten = 'top-auto bottom-2 translate-y-0 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2';

  return (
    <div>
      <div
        className={cx(
          'relative touch-pan-y select-none rounded-2xl border border-stone-200/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600 sm:aspect-[4/3] sm:rounded-3xl',
          // Video-Link auf dem Handy ohne festes Seitenverhältnis: Die Kachel wächst mit Titel und Knopf (große Schrift).
          link ? 'bg-stone-800' : 'aspect-[2/1] overflow-hidden bg-white',
        )}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (start.current = null)}
        onDragStart={(e) => e.preventDefault()}
        {...(mehrere && {
          role: 'group',
          'aria-roledescription': 'Galerie',
          'aria-label': `${beschriftung(m, index)}. Wischen oder Pfeiltasten wechseln.`,
          tabIndex: 0,
          onKeyDown,
        })}
      >
        {m.art === 'bild' ? (
          <ItemImage item={item} index={m.index} groesse="original" iconSize="size-16 sm:size-24" vorrang={index === 0} />
        ) : m.video.file ? (
          // Kein Autoplay; die Steuerleiste des Browsers ist per Tastatur bedienbar.
          <video key={m.video.id} controls preload="metadata" playsInline className="size-full bg-stone-900 object-contain">
            <source src={videoUrl(m.video.file)} type={videoTyp(m.video.file)} />
            Ihr Browser kann dieses Video nicht abspielen.
          </video>
        ) : (
          <div className="grid min-h-40 place-items-center px-4 pb-16 pt-12 text-center text-white sm:h-full sm:px-14 sm:py-4">
            <div className="min-w-0 max-w-sm">
              <Play className="mx-auto size-10 rounded-full bg-white/15 p-2.5 sm:size-12 sm:p-3" aria-hidden />
              <p className="mt-2 font-bold wrap-break-word">{m.video.title || 'Video'}</p>
              <a
                href={m.video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-4 py-2 font-bold text-stone-900 wrap-anywhere hover:bg-stone-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <ExternalLink className="size-5 shrink-0" aria-hidden />
                Bei {seitenName(m.video.url)} ansehen
                <span className="sr-only"> (öffnet in neuem Tab)</span>
              </a>
            </div>
          </div>
        )}
        {mehrere && (
          <>
            <button type="button" onClick={() => gehe(-1)} aria-label="Vorheriges Bild oder Video" className={cx(pfeil, 'left-2 sm:left-3', link && pfeilUnten)}>
              <ChevronLeft className="size-7" aria-hidden />
            </button>
            <button type="button" onClick={() => gehe(1)} aria-label="Nächstes Bild oder Video" className={cx(pfeil, 'right-2 sm:right-3', link && pfeilUnten)}>
              <ChevronRight className="size-7" aria-hidden />
            </button>
            {/* Beim Video oben, damit die Steuerleiste frei bleibt */}
            <p
              className={cx(
                'absolute left-1/2 -translate-x-1/2 rounded-full bg-stone-900/75 px-3 py-0.5 text-hinweis font-bold text-white',
                m.art === 'video' ? 'top-2' : 'bottom-2',
              )}
              aria-live="polite"
            >
              {index + 1} / {anzahl}
            </p>
          </>
        )}
      </div>
      {m.art === 'video' && m.video.file && m.video.title && <p className="mt-2 font-bold text-stone-800 wrap-break-word">{m.video.title}</p>}
      {mehrere && (
        <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2" aria-label="Alle Bilder und Videos">
          {medien.map((x, i) => (
            <li key={x.art === 'bild' ? `b${x.index}` : x.video.id}>
              <button
                type="button"
                onClick={() => setAktiv(i)}
                aria-label={`${beschriftung(x, i)} anzeigen`}
                aria-pressed={i === index}
                className={cx(
                  'relative block aspect-square w-full overflow-hidden rounded-xl ring-2 ring-offset-2 transition sm:rounded-2xl',
                  i === index ? 'ring-brand-600' : 'ring-transparent hover:ring-stone-300',
                )}
              >
                {x.art === 'bild' ? (
                  <ItemImage item={item} index={x.index} groesse="mini" sizes="80px" />
                ) : x.video.file ? (
                  // Vorschaubild = ein Bild am Anfang des Videos (es werden nur die Metadaten geladen)
                  <video muted preload="metadata" playsInline tabIndex={-1} aria-hidden className="pointer-events-none size-full bg-stone-800 object-cover">
                    <source src={`${videoUrl(x.video.file)}#t=0.5`} type={videoTyp(x.video.file)} />
                  </video>
                ) : (
                  <span className="block size-full bg-stone-700" aria-hidden>
                    <ExternalLink className="absolute right-1 top-1 size-4 text-white" />
                  </span>
                )}
                {x.art === 'video' && (
                  <span className="absolute inset-0 grid place-items-center" aria-hidden>
                    <Play className="size-8 rounded-full bg-stone-900/70 p-1.5 text-white" fill="currentColor" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
