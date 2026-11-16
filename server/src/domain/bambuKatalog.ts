import type { BambuKatalogEintrag, Filament } from '@mosaik3lab/shared/stammdaten';
import katalog from './bambuKatalog.json';

// Mitgelieferter Katalog der Bambu-Lab-Filamente: Bambu-Nummer, Originalname (englisch), deutscher Name, Linie, Farbe.
// Quelle: Farbliste von Bambu Studio (bambulab/BambuStudio, resources/profiles/BBL/filament/filaments_color_codes.json),
// Stand und Link stehen in bambuKatalog.json. Erzeugt mit `node scripts/bambu-katalog.mjs` – nicht von Hand ändern.
// Beim Start gleicht module/stammdaten/bambuAbgleich.ts die Bambu-Farbrollen mit diesem Katalog ab.

export const BAMBU_MARKE = 'Bambu Lab';
export const BAMBU_KATALOG = katalog as { quelle: string; stand: string; linien: string[]; eintraege: BambuKatalogEintrag[] };

const nachId = new Map(BAMBU_KATALOG.eintraege.map((e) => [e.id, e]));
const nachNummer = new Map(BAMBU_KATALOG.eintraege.filter((e) => e.nummer).map((e) => [e.nummer, e]));

export const katalogEintrag = (id: string | null | undefined) => (id ? nachId.get(id) : undefined);
export const katalogNachNummer = (nummer: string | undefined) => (nummer ? nachNummer.get(nummer.trim()) : undefined);

/** Felder einer Farbrolle aus dem Katalog (ohne „vorrätig“ – das entscheidet die Schule). */
export function katalogFelder(e: BambuKatalogEintrag) {
  return {
    brand: BAMBU_MARKE,
    line: e.linie,
    colorName: e.farbname,
    hex: e.hex,
    herstellerNummer: e.nummer,
    herstellerName: e.name,
    katalogId: e.id,
    weggefallen: !!e.weggefallen,
  } satisfies Omit<Filament, 'id' | 'available'>;
}

/** Neue Farbrolle aus dem Katalog; die Katalog-ID ist zugleich die ID der Farbrolle. */
export const filamentAusKatalog = (e: BambuKatalogEintrag): Filament => ({ id: e.id, ...katalogFelder(e), available: true });

/** Standard-Farbrollen bei der Erstinstallation – übliche Farben, alles Weitere über „Bambu-Lab-Farben importieren“. */
export const DEFAULT_FILAMENT_IDS = [
  'bambu-pla-basic-jade-white',
  'bambu-pla-basic-black',
  'bambu-pla-basic-gray',
  'bambu-pla-basic-yellow',
  'bambu-pla-basic-orange',
  'bambu-pla-basic-red',
  'bambu-pla-basic-cyan',
  'bambu-pla-basic-turquoise',
  'bambu-pla-basic-purple',
  'bambu-pla-basic-bambu-green',
  'bambu-petg-hf-white',
  'bambu-petg-hf-black',
  'bambu-petg-hf-blue',
  'bambu-tpu-95a-hf-black',
  'bambu-tpu-95a-hf-gray',
  'bambu-tpu-95a-hf-blue',
];
