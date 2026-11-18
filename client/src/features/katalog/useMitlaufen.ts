import { useEffect, useState, type RefObject } from 'react';

/** Abstand oben/unten der mitlaufenden Spalte: Tablet hoch mit Kopfleiste und unterer Leiste, ab 1024 px ohne beide. */
export const MITLAUF_RAND = { tablet: 80 + 96, gross: 24 + 24 };

/** Läuft die Spalte mit? Nur, wenn sie samt Abständen ganz ins Fenster passt – sonst wäre ihr Ende nicht erreichbar. */
export function passtInsFenster(hoehe: number, fensterHoehe: number, gross: boolean) {
  return hoehe + (gross ? MITLAUF_RAND.gross : MITLAUF_RAND.tablet) <= fensterHoehe;
}

/**
 * Rechte Spalte der Druckteil-Seite „mitlaufen“ lassen (sticky), wenn sie ganz ins Fenster passt. Misst neu, wenn sich
 * ihre Höhe (Auswahl, Fehler, Schriftgröße) oder das Fenster ändert. Das Element muss `align-self: start` haben.
 */
export function useMitlaufen(ref: RefObject<HTMLElement | null>) {
  const [passt, setPasst] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const gross = window.matchMedia('(min-width: 64rem)');
    const pruefe = () => setPasst(passtInsFenster(el.offsetHeight, window.innerHeight, gross.matches));
    const ro = new ResizeObserver(pruefe);
    ro.observe(el);
    window.addEventListener('resize', pruefe);
    pruefe();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', pruefe);
    };
  }, [ref]);
  return passt;
}
