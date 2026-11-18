// Zwischenstand eines Suchfelds (reine Logik, ohne Browser testbar: client/test/suchEntwurf.test.ts).
// Steht der Suchtext in der Adresse (?q=…), kommt jede Änderung erst nach einem Navigationsschritt zurück. Wer schnell
// tippt, überholt diesen Weg – das Feld zeigte dann einen alten Stand und Zeichen gingen verloren. Deshalb zeigt das Feld
// immer den eigenen Entwurf und schreibt ihn erst nach einer kurzen Pause nach außen (Suchfeld in Listenwerkzeug.tsx).

export interface SuchEntwurf {
  /** Was im Feld steht. */
  entwurf: string;
  /** Getippt, aber noch nicht nach außen geschrieben (null = nichts offen). */
  ausstehend: string | null;
  /** Zuletzt gesehener Wert von außen (Adresse bzw. Zustand der Seite). */
  aussen: string;
}

export type SuchAktion =
  | { typ: 'tippen'; text: string }
  | { typ: 'geschrieben' }
  /** Wert von außen: eigenes Schreiben kommt an, Zurück/Vor, Link mit ?q=, „Filter zurücksetzen“ … */
  | { typ: 'aussen'; wert: string };

export const suchEntwurfStart = (wert: string): SuchEntwurf => ({ entwurf: wert, ausstehend: null, aussen: wert });

export function suchEntwurf(stand: SuchEntwurf, aktion: SuchAktion): SuchEntwurf {
  switch (aktion.typ) {
    case 'tippen':
      return { ...stand, entwurf: aktion.text, ausstehend: aktion.text };
    case 'geschrieben':
      return stand.ausstehend === null ? stand : { ...stand, ausstehend: null };
    case 'aussen':
      if (aktion.wert === stand.aussen) return stand;
      // Solange noch Getipptes offen ist, gewinnt der Entwurf (sonst springt ein verspäteter alter Stand ins Feld).
      return { ...stand, aussen: aktion.wert, entwurf: stand.ausstehend === null ? aktion.wert : stand.entwurf };
  }
}
