import { newId } from '../../kern/ids';
import { BAMBU_MARKE, katalogEintrag, katalogFelder, katalogNachNummer } from '../../domain/bambuKatalog';
import { COLOR_KEYS, ICON_KEYS, type Category, type Filament, type MasterData, type SimpleEntry } from '@mosaik3lab/shared/stammdaten';
import type { Paket, PaketArtikel } from './datenaustausch.export';
import { ergaenze, lc } from './datenaustausch.abgleich';
import type { Detail, Zaehler } from './datenaustausch.service';

// Import, Abschnitt 2: Kategorien, Einsatzbereiche, Materialien und Farbrollen der eingespielten Druckteile zuordnen oder
// ergänzen – nur, was sie wirklich brauchen; vorhandene Stammdaten werden nie geändert oder gelöscht.

type StammdatenZaehler = Record<'kategorien' | 'einsatzbereiche' | 'materialien' | 'filamente', Zaehler>;

export function ergaenzeStammdaten(md: MasterData, paket: Paket, zuImportieren: PaketArtikel[], z: StammdatenZaehler, details: Detail[]) {
  const nachName = <T extends { name: string }>(liste: T[], name: string) => liste.find((e) => lc(e.name) === lc(name));
  const gebraucht = (namen: string[], ausPaket: (SimpleEntry | Category)[], neu: (name: string) => SimpleEntry | Category) =>
    [...new Map(namen.filter((n) => n.trim()).map((n) => [lc(n), n])).values()].map((n) => nachName(ausPaket, n) ?? neu(n));
  const kategorieNeu = (name: string): Category => ({ id: newId(), name, color: COLOR_KEYS[0], icon: ICON_KEYS[0] });
  const einfachNeu = (name: string): SimpleEntry => ({ id: newId(), name });
  const kat = ergaenze<Category>(md.categories, gebraucht(zuImportieren.map((a) => a.category), paket.stammdaten.kategorien, kategorieNeu) as Category[], {
    schluessel: (e) => lc(e.name), z: z.kategorien, bereich: 'Kategorie', name: (e) => e.name, details,
  });
  const einsatz = ergaenze<SimpleEntry>(md.useAreas, gebraucht(zuImportieren.flatMap((a) => a.useAreas), paket.stammdaten.einsatzbereiche, einfachNeu), {
    schluessel: (e) => lc(e.name), z: z.einsatzbereiche, bereich: 'Einsatzbereich', name: (e) => e.name, details,
  });
  const mat = ergaenze<SimpleEntry>(md.materials, gebraucht(zuImportieren.map((a) => a.material), paket.stammdaten.materialien, einfachNeu), {
    schluessel: (e) => lc(e.name), z: z.materialien, bereich: 'Material', name: (e) => e.name, details,
  });
  const farbIds = new Set(zuImportieren.flatMap((a) => a.colorAreas.flatMap((ar) => ar.colors)));
  // Bambu-Farben über Katalog-ID bzw. Bambu-Nummer erkennen (Name und Farbe können sich seit dem Export geändert haben);
  // dann gelten die Daten aus dem eigenen Katalog. Alles andere wird als eigene Farbrolle verglichen bzw. ergänzt.
  const paketFarben = paket.stammdaten.filamente
    .filter((f) => farbIds.has(f.id))
    .map((f): Filament => {
      const k = katalogEintrag(f.katalogId) ?? (lc(f.brand) === lc(BAMBU_MARKE) ? katalogNachNummer(f.herstellerNummer) : undefined);
      if (k) return { id: f.id, ...katalogFelder(k), available: f.available !== false };
      return { ...f, available: f.available !== false, katalogId: null, herstellerName: '', weggefallen: false };
    });
  const fil = ergaenze<Filament>(md.filaments, paketFarben, {
    schluessel: (e) => (e.katalogId ? `katalog|${e.katalogId}` : lc(`${e.brand}|${e.line}|${e.colorName}|${e.hex}`)),
    perId: true,
    z: z.filamente,
    bereich: 'Farbrolle',
    name: (e) => `${e.colorName} (${e.brand} ${e.line})`.replace(/\s+\)/, ')').trim(),
    details,
  });
  return { kat, einsatz, mat, fil };
}
