// „Bildpflege“: Hintergrund-Aufgabe der Web-App (kein eigener Dienst, nicht im Installer/Update-Schritt).
// Läuft einmal einige Minuten nach dem Start (fehlen viele Vorschaubilder, z. B. nach Wiederherstellen: nach einer Minute;
// nach einer Datenbank-Migration frühestens nach der Schonfrist, sperre.ts) und für nachgereichte Bilder (Import, Abruf
// bei belegtem Rechen-Thread). Geht alle Druckteil-Bilder durch:
// erledigte werden schnell übersprungen (Vorschaubilder da, Original ≤ 2000 px oder schon geprüft), sonst verarbeitet (dienst.ts).
// Ein Bild zur Zeit mit kurzer Pause, pausiert bei Import/Export/Sicherung, bricht beim Beenden sauber ab und macht beim nächsten
// Lauf weiter. Fehler bei einem Bild → überspringen und ins Log, die App läuft immer weiter.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileStore } from '../files';
import { BildDienst, istDruckteilBild } from './dienst';
import { GESCHEITERT_ORDNER, VORSCHAU, VORSCHAU_ORDNER } from './groessen';
import { BildFehler } from './rechner';
import { bildpflegeWartetAuf } from './sperre';

export interface BildpflegeBericht {
  geprueft: number;
  verkleinert: number;
  vorher: number;
  nachher: number;
  vorschau: number;
  fehler: number;
  aufgeraeumt: number;
}

/** Ab so vielen fehlenden Vorschaubildern startet die Bildpflege früher. */
const VIELE_FEHLEN = 10;

/**
 * Wartezeit bis zum Start-Lauf: `nachMs`, bei vielen fehlenden Vorschaubildern schon `baldMs` – nach einer Migration aber
 * nie vor dem Ende der Schonfrist (`schonfristMs` = Rest, 0 = keine): vorher dürfte der Lauf ohnehin kein Original ersetzen.
 */
export function startWartezeit(nachMs: number, baldMs: number, vieleFehlen: boolean, schonfristMs: number): number {
  return Math.max(vieleFehlen ? Math.min(nachMs, baldMs) : nachMs, schonfristMs);
}

const leer = (): BildpflegeBericht => ({ geprueft: 0, verkleinert: 0, vorher: 0, nachher: 0, vorschau: 0, fehler: 0, aufgeraeumt: 0 });
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

export function berichtText(b: BildpflegeBericht, dauerMs?: number) {
  const teile = [`${b.geprueft} ${b.geprueft === 1 ? 'Bild' : 'Bilder'} geprüft`];
  teile.push(`${b.verkleinert} verkleinert${b.verkleinert ? ` (${mb(b.vorher)} → ${mb(b.nachher)})` : ''}`);
  teile.push(`${b.vorschau} Vorschaubilder erzeugt`);
  if (b.fehler) teile.push(`${b.fehler} übersprungen (siehe oben)`);
  if (b.aufgeraeumt) teile.push(`${b.aufgeraeumt} veraltete Vorschaubilder entfernt`);
  return `Bildpflege: ${teile.join(', ')}${dauerMs === undefined ? '' : ` (${Math.round(dauerMs / 1000)} s)`}`;
}

export class Bildpflege {
  private schlange: string[] = [];
  private lauf?: Promise<void>;
  private abbruch = new AbortController();
  private startTimer?: NodeJS.Timeout;
  private bericht = leer();
  /** Bericht des letzten abgeschlossenen Laufs (für Tests und Diagnose). */
  letzterBericht?: BildpflegeBericht;

  constructor(
    private readonly files: FileStore,
    private readonly dienst: BildDienst,
    private readonly opts: { pauseMs?: number; warteMs?: number; log?: (text: string) => void; warn?: (text: string) => void } = {},
  ) {}

  /**
   * Start-Lauf nach `nachMs` (negativ = nie); fehlen viele Vorschaubilder, schon nach `baldMs`; nach einer Migration erst
   * nach der Schonfrist (startWartezeit). Der Timer hält den Prozess nicht am Leben. → geplante Wartezeit in ms.
   */
  async planeStart(nachMs: number, baldMs = 60_000): Promise<number | undefined> {
    if (nachMs < 0) return undefined;
    const warte = startWartezeit(nachMs, baldMs, (await this.fehlendeVorschau()) >= VIELE_FEHLEN, this.dienst.schonfristMs());
    if (this.abbruch.signal.aborted) return undefined;
    this.startTimer = setTimeout(() => void this.alle(), warte);
    this.startTimer.unref();
    return warte;
  }

  /** Grobe Zahl fehlender Vorschaubilder (Bilder minus Dateien im Ordner „karte“) – ein Verzeichnis lesen, kein stat je Bild. */
  async fehlendeVorschau(): Promise<number> {
    const bilder = this.files.listByTyp('artikel').filter(istDruckteilBild).length;
    const da = (await fs.readdir(path.join(this.files.root, VORSCHAU_ORDNER, VORSCHAU.karte.ordner)).catch(() => [])).length;
    return Math.max(0, bilder - da);
  }

  /** Alle Druckteil-Bilder prüfen (Start-Lauf). Erst aufräumen, dann der Reihe nach. Ergebnis: Ende des Laufs. */
  async alle(): Promise<void> {
    if (this.abbruch.signal.aborted) return;
    try {
      const bilder = this.files.listByTyp('artikel').filter(istDruckteilBild);
      this.bericht.aufgeraeumt += await this.raeumeAuf(new Set(bilder.map((d) => d.id)));
      return await this.nachholen(bilder.map((d) => d.id));
    } catch (err) {
      this.warn(`Bildpflege: Lauf fehlgeschlagen – ${(err as Error).message}`);
    }
  }

  /** Bilder nachreichen (z. B. nach einem Import); laufen im Hintergrund nach. Ergebnis: Ende des Laufs. */
  nachholen(ids: string[]): Promise<void> {
    for (const id of ids) if (!this.schlange.includes(id)) this.schlange.push(id);
    this.lauf ??= this.arbeite().finally(() => (this.lauf = undefined));
    return this.lauf;
  }

  /**
   * Beenden ohne Warten aufs laufende Bild: erst den Lauf abbrechen, dann den Rechen-Thread sofort beenden (das laufende
   * Bild scheitert vorübergehend und kommt beim nächsten Start dran), zuletzt auf das Ende des Laufs warten.
   */
  async beenden() {
    clearTimeout(this.startTimer);
    this.abbruch.abort();
    this.schlange = [];
    await this.dienst.beenden();
    await this.lauf?.catch(() => undefined);
  }

  private log(text: string) {
    (this.opts.log ?? console.log)(text);
  }
  private warn(text: string) {
    (this.opts.warn ?? console.warn)(text);
  }

  private async arbeite() {
    const signal = this.abbruch.signal;
    const t0 = Date.now();
    while (this.schlange.length && !signal.aborted) {
      await this.warteBisFrei();
      if (signal.aborted) break;
      const id = this.schlange.shift()!;
      const d = this.files.find(id);
      if (!d || !istDruckteilBild(d)) continue;
      this.bericht.geprueft++;
      try {
        if ((await this.dienst.istGescheitert(d)) || (await this.dienst.erledigt(d))) continue;
        const r = await this.dienst.verarbeite(d, 'hintergrund');
        this.bericht.vorschau += r.vorschauNeu;
        if (r.verkleinert) {
          this.bericht.verkleinert++;
          this.bericht.vorher += r.verkleinert.vorher;
          this.bericht.nachher += r.verkleinert.nachher;
        }
      } catch (err) {
        if (signal.aborted) break;
        this.bericht.fehler++;
        this.warn(`Bildpflege: ${d.pfad} übersprungen, Original bleibt – ${grundText(err)}`);
      }
      await pause(this.opts.pauseMs ?? 200, signal);
    }
    const b = this.bericht;
    this.bericht = leer();
    this.letzterBericht = b;
    if (signal.aborted) this.log(`${berichtText(b, Date.now() - t0)} – unterbrochen (Server wird beendet), geht beim nächsten Start weiter.`);
    else if (b.geprueft || b.aufgeraeumt) this.log(berichtText(b, Date.now() - t0));
  }

  /** Während Import/Export/Sicherung warten (abfragen alle 30 s), beim Beenden sofort zurück. */
  private async warteBisFrei() {
    let gemeldet = false;
    for (let grund = bildpflegeWartetAuf(this.files.root); grund && !this.abbruch.signal.aborted; grund = bildpflegeWartetAuf(this.files.root)) {
      if (!gemeldet) this.log(`Bildpflege: wartet, bis ${grund === 'Austausch' ? 'Import bzw. Export' : 'die Sicherung'} fertig ist.`);
      gemeldet = true;
      await pause(this.opts.warteMs ?? 30_000, this.abbruch.signal);
    }
  }

  /** Veraltete Größen-Ordner, Vorschaubilder gelöschter Bilder und Reste von Zwischendateien entfernen. */
  private async raeumeAuf(bekannt: Set<string>): Promise<number> {
    const wurzel = path.join(this.files.root, VORSCHAU_ORDNER);
    const aktuell = new Set(Object.values(VORSCHAU).map((v) => v.ordner));
    let n = 0;
    let ordner: string[];
    try {
      ordner = await fs.readdir(wurzel);
    } catch {
      return 0; // noch keine Vorschaubilder
    }
    for (const o of ordner) {
      const p = path.join(wurzel, o);
      if (o === GESCHEITERT_ORDNER) {
        // Merker gelöschter Bilder entfernen
        for (const f of await fs.readdir(p).catch(() => [] as string[])) if (!bekannt.has(f)) await fs.rm(path.join(p, f), { force: true });
        continue;
      }
      if (!aktuell.has(o)) {
        n += (await fs.readdir(p).catch(() => [])).length;
        await fs.rm(p, { recursive: true, force: true, maxRetries: 3 });
        continue;
      }
      for (const f of await fs.readdir(p).catch(() => [] as string[])) {
        const id = /^([A-Za-z0-9_-]{1,64})\.jpg$/.exec(f)?.[1];
        if (id && bekannt.has(id)) continue;
        if (!id) {
          // Zwischendatei: nur alte Reste (Absturz) – eine gerade entstehende nicht anfassen
          const s = await fs.stat(path.join(p, f)).catch(() => undefined);
          if (!s || Date.now() - s.mtimeMs < 3600_000) continue;
        }
        await fs.rm(path.join(p, f), { force: true });
        if (id) n++;
      }
    }
    return n;
  }
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((r) => {
    if (signal.aborted) return r();
    const t = setTimeout(done, ms);
    t.unref();
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      r();
    }
  });
}

/**
 * Verständlicher Grund für das Protokoll. Eigene Meldungen (nicht unterstütztes Format, Rechen-Thread) sind schon deutsch;
 * Meldungen der Bild-Bibliotheken (z. B. jpeg-js „marker was not found“) bekommen einen deutschen Satz davor.
 */
export function grundText(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (err instanceof BildFehler && err.nichtUnterstuetzt) return text;
  if (err instanceof BildFehler && err.voruebergehend) return `gerade nicht möglich, wird später erneut versucht (${text})`;
  if (/^Rechen-Thread/.test(text)) return text;
  return `Bild konnte nicht gelesen werden (beschädigt oder unbekanntes Format) (${text})`;
}
