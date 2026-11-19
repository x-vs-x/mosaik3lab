import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useMasterData } from '../../lib/config';
import type { Item, RequestTemplate } from '../../lib/types';
import { ergaenzeEinzelfarben, farbbereiche, ohneFehlendeFarben, startAuswahl, type AnfrageAuswahl } from './anfrageAuswahl';

/** Gemeinsamer Zustand der Auswahl: [Auswahl, setzen] – die Druckteil-Seite reicht ihn an das Anfrage-Fenster weiter. */
export type AuswahlZustand = [AnfrageAuswahl, Dispatch<SetStateAction<AnfrageAuswahl>>];

export function useAnfrageAuswahl(item: Item, template?: RequestTemplate): AuswahlZustand {
  const md = useMasterData();
  const { areas } = farbbereiche(item, md);
  const zustand = useState(() => startAuswahl(areas, item.sizes, md, template));
  const [{ rows }, setzen] = zustand;
  // Farbrollen kommen evtl. erst nach dem Druckteil an oder ändern sich (Rolle leer, neu geladen), und ein Entwurf kann alte
  // Farben enthalten: Farben, die es nicht mehr gibt, abwählen und Bereiche mit nur einer Farbe vorwählen. Beide Regeln
  // geben bei „nichts zu tun“ dieselbe Auswahl zurück – dann zeichnet React nicht neu.
  const angebot = areas.map((a) => `${a.area.id}:${a.filaments.map((f) => f.id).join(',')}`).join('|');
  useEffect(() => {
    setzen((a) => ergaenzeEinzelfarben(ohneFehlendeFarben(a, areas, md), areas));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur neu, wenn sich das Angebot oder die gewählten Farben ändern
  }, [angebot, rows, setzen]);
  return zustand;
}
