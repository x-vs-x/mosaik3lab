import { BAMBU_KATALOG, katalogFelder } from '../../domain/bambuKatalog';
import type { Filament } from '../../domain/settings';
import { transaction } from '../../kern/db';
import type { Storage } from '../../storage';
import type { BambuAbgleichHinweis, BambuKatalogEintrag } from '@mosaik3lab/shared/stammdaten';

// Abgleich der Bambu-Farbrollen mit dem mitgelieferten Katalog – läuft bei jedem Start (nach einem Update wirkt er).
// Übernimmt Name, Nummer und Farbe, wenn Bambu Lab sie geändert hat; „vorrätig“, Reihenfolge und eigene Farbrollen
// bleiben unberührt. Neue Katalogfarben werden nicht angelegt, nur im Import als „neu“ angeboten. Weggefallene Farben
// werden gekennzeichnet, nie gelöscht (Druckteile verweisen darauf).

/** Einstellungs-Schlüssel (Tabelle einstellung): Hinweis für den Admin und die beim letzten Abgleich bekannten Katalog-IDs. */
export const HINWEIS_KEY = 'bambuAbgleichHinweis';
const BEKANNT_KEY = 'bambuKatalogBekannt';

type Katalog = { stand: string; eintraege: BambuKatalogEintrag[] };

/** Reiner Abgleich (ohne Datenbank): neue Farbrollen-Liste und lesbare Änderungen. */
export function gleicheAb(filaments: Filament[], katalog: Katalog) {
  const nachId = new Map(katalog.eintraege.map((e) => [e.id, e]));
  const aenderungen: string[] = [];
  let nummernErgaenzt = 0;
  let geaendert = false;
  const liste = filaments.map((f) => {
    if (!f.katalogId) return f; // eigene Farbrolle
    const e = nachId.get(f.katalogId);
    const wer = `${f.colorName} (${f.line}${f.herstellerNummer ? `, Nr. ${f.herstellerNummer}` : ''})`;
    if (!e) {
      if (f.weggefallen) return f;
      aenderungen.push(`${wer}: nicht mehr im Bambu-Katalog – bleibt erhalten`);
      geaendert = true;
      return { ...f, weggefallen: true };
    }
    const soll = katalogFelder(e);
    const teile: string[] = [];
    if (f.colorName !== soll.colorName) teile.push(`Name „${f.colorName}“ → „${soll.colorName}“`);
    if (f.herstellerNummer && f.herstellerNummer !== soll.herstellerNummer) teile.push(`Nr. ${f.herstellerNummer} → ${soll.herstellerNummer}`);
    if (f.herstellerName && f.herstellerName !== soll.herstellerName) teile.push(`Originalname „${f.herstellerName}“ → „${soll.herstellerName}“`);
    if (f.hex.toUpperCase() !== soll.hex) teile.push(`Farbe ${f.hex} → ${soll.hex}`);
    if (f.line !== soll.line || f.brand !== soll.brand) teile.push(`Linie „${f.brand} ${f.line}“ → „${soll.brand} ${soll.line}“`);
    if (!f.weggefallen && soll.weggefallen) teile.push('von Bambu Lab nicht mehr geführt – bleibt erhalten');
    if (f.weggefallen && !soll.weggefallen) teile.push('wieder im Bambu-Katalog');
    if (teile.length) aenderungen.push(`${wer}: ${teile.join('; ')}`);
    else if (f.herstellerNummer === soll.herstellerNummer && f.herstellerName === soll.herstellerName) return f;
    else nummernErgaenzt++; // bisher ohne Nummer/Originalname (vor dem Katalog importiert)
    geaendert = true;
    return { ...f, ...soll };
  });
  if (nummernErgaenzt) aenderungen.push(`Bambu-Nummer und Originalname bei ${nummernErgaenzt} Farbrolle(n) ergänzt`);
  return { liste, aenderungen, geaendert };
}

/** Abgleich beim Start: schreibt nur, wenn sich etwas geändert hat, und hinterlegt dann einen Hinweis für den Admin. */
export function bambuAbgleichBeimStart(storage: Storage, katalog: Katalog = BAMBU_KATALOG) {
  const repo = storage.settings;
  return transaction(storage.sqlite.db, () => {
    const settings = repo.read();
    const { liste, aenderungen, geaendert } = gleicheAb(settings.masterData.filaments, katalog);
    if (geaendert) repo.write({ ...settings, masterData: { ...settings.masterData, filaments: liste } });

    // Neue Katalogfarben seit dem letzten Abgleich (beim allerersten Abgleich gilt nichts als neu).
    const bekannt = repo.getSetting(BEKANNT_KEY) as string[] | undefined;
    const ids = katalog.eintraege.filter((e) => !e.weggefallen).map((e) => e.id);
    const neu = bekannt ? ids.filter((id) => !bekannt.includes(id)) : [];
    if (!bekannt || neu.length) repo.setSetting(BEKANNT_KEY, [...new Set([...(bekannt ?? []), ...ids])]);

    if (aenderungen.length || neu.length) {
      // Ein noch nicht gelesener Hinweis wird ergänzt, nicht ersetzt.
      const alt = repo.getSetting(HINWEIS_KEY) as BambuAbgleichHinweis | null | undefined;
      const hinweis: BambuAbgleichHinweis = {
        datum: new Date().toISOString(),
        stand: katalog.stand,
        aenderungen: [...(alt?.aenderungen ?? []), ...aenderungen],
        neu: [...new Set([...(alt?.neu ?? []), ...neu])],
      };
      repo.setSetting(HINWEIS_KEY, hinweis);
    }
    return { aenderungen, neu };
  });
}

export const leseHinweis = (storage: Storage) => (storage.settings.getSetting(HINWEIS_KEY) as BambuAbgleichHinweis | null | undefined) ?? null;
export const loescheHinweis = (storage: Storage) => storage.settings.setSetting(HINWEIS_KEY, null);

/** Übernommene Farben sind nicht mehr „neu“; ein leerer Hinweis verschwindet. */
export function ohneNeue(storage: Storage, ids: string[]) {
  const h = leseHinweis(storage);
  if (!h?.neu.some((id) => ids.includes(id))) return;
  const neu = h.neu.filter((id) => !ids.includes(id));
  storage.settings.setSetting(HINWEIS_KEY, neu.length || h.aenderungen.length ? { ...h, neu } : null);
}
