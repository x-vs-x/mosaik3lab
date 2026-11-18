import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useMasterData } from '../../lib/config';
import type { Item, RequestTemplate } from '../../lib/types';
import { ergaenzeEinzelfarben, farbbereiche, startAuswahl, type AnfrageAuswahl } from './anfrageAuswahl';

/** Gemeinsamer Zustand der Auswahl: [Auswahl, setzen] – die Druckteil-Seite reicht ihn an das Anfrage-Fenster weiter. */
export type AuswahlZustand = [AnfrageAuswahl, Dispatch<SetStateAction<AnfrageAuswahl>>];

export function useAnfrageAuswahl(item: Item, template?: RequestTemplate): AuswahlZustand {
  const md = useMasterData();
  const { areas } = farbbereiche(item, md);
  const zustand = useState(() => startAuswahl(areas, item.sizes, md, template));
  const setzen = zustand[1];
  // Farbrollen kommen evtl. erst nach dem Druckteil an: Bereiche mit nur einer Farbe dann noch vorwählen.
  const einzelfarben = areas.map((a) => `${a.area.id}:${a.filaments.length === 1 ? a.filaments[0].id : ''}`).join('|');
  useEffect(() => {
    setzen((a) => ergaenzeEinzelfarben(a, areas));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur neu, wenn sich die einzelnen Farben ändern
  }, [einzelfarben, setzen]);
  return zustand;
}
