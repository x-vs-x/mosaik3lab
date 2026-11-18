import { ChevronDown, LoaderCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '../../components/ui';
import { KATALOG_SEITE } from './katalogScroll';

/**
 * Fuß unter der Katalogliste: Ein unsichtbarer Wächter lädt kurz vor dem Ende (600 px) die nächsten Druckteile,
 * der Knopf macht dasselbe für Tastatur, Screenreader und Browser ohne IntersectionObserver.
 * Suche und Filter wirken immer auf alle Druckteile – begrenzt ist nur die Anzeige.
 */
export function NachladenFuss({
  angezeigt,
  gesamt,
  laedt,
  onMehr,
}: {
  angezeigt: number;
  gesamt: number;
  laedt: boolean;
  onMehr: () => void;
}) {
  const waechter = useRef<HTMLDivElement>(null);
  const rest = gesamt - angezeigt;

  useEffect(() => {
    const el = waechter.current;
    if (!el || rest <= 0 || typeof IntersectionObserver === 'undefined') return;
    // Nach jedem Nachladen neu beobachten: Steht der Wächter dann immer noch im Bereich (großer Bildschirm),
    // meldet der neue Beobachter das sofort und es geht weiter.
    const beobachter = new IntersectionObserver((eintraege) => {
      if (eintraege.some((e) => e.isIntersecting)) onMehr();
    }, { rootMargin: '0px 0px 600px 0px' });
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, [angezeigt, rest, onMehr]);

  if (gesamt <= KATALOG_SEITE) return null;
  return (
    <div className="mt-6 flex flex-col items-center gap-3 text-center sm:mt-8">
      <div ref={waechter} aria-hidden />
      <p className="text-hinweis font-bold text-stone-600" aria-live="polite" aria-atomic="true">
        {angezeigt} von {gesamt} Druckteilen
      </p>
      {laedt && (
        <p role="status" className="flex items-center gap-2 text-stone-600">
          <LoaderCircle className="size-5 animate-spin text-brand-700" aria-hidden />
          Weitere Druckteile werden geladen …
        </p>
      )}
      {rest > 0 && (
        <Button variant="secondary" icon={ChevronDown} onClick={onMehr} className="max-w-full">
          {/* Auf 320 px bricht „(noch N)“ als Ganzes um, nicht mitten in der Klammer. */}
          <span>
            Weitere Druckteile laden <span className="whitespace-nowrap">(noch {rest})</span>
          </span>
        </Button>
      )}
    </div>
  );
}
