// Bilder der Druckteile verarbeiten: Original ggf. verkleinern (≥ 20 % Ersparnis, sicher über Zwischendatei wie
// FileStore.replace) und die Vorschaubilder „karte“ und „mini“ ablegen. Gerechnet wird im Rechen-Thread (rechner.ts),
// der auch erst die Datei liest – in der Warteschlange liegen nur Pfade, keine Bilddaten.
// Benutzt vom Hochladen (sofort), vom Abruf eines fehlenden Vorschaubilds (sofort) und von der Bildpflege (Hintergrund).
// Während Import/Export/Sicherung (sperre.ts) werden keine Originale ersetzt, nur Vorschaubilder erzeugt.
import fs from 'node:fs/promises';
import path from 'node:path';
import { newId } from '../../domain/ids';
import type { Datei, FileStore } from '../files';
import { leseKopf } from './format';
import { gescheitertRel, MINDEST_ERSPARNIS, ORIGINAL_MAX_KANTE, VORSCHAU, VORSCHAU_GROESSEN, vorschauRel, type VorschauGroesse } from './groessen';
import { BildFehler, BildRechner, type Prioritaet } from './rechner';
import { bildpflegeWartetAuf } from './sperre';

export interface Verarbeitet {
  /** Datensatz nach der Verarbeitung (Endung kann sich geändert haben: PNG → JPG). */
  datei: Datei;
  /** Original ersetzt: Bytes vorher/nachher. */
  verkleinert?: { vorher: number; nachher: number };
  vorschauNeu: number;
}

export const istDruckteilBild = (d: Pick<Datei, 'objekttyp' | 'rolle'>) => d.objekttyp === 'artikel' && d.rolle === 'bild';
const verarbeitbar = (d: Datei) => /\.(jpg|png)$/.test(d.pfad);

export class BildDienst {
  readonly rechner: BildRechner;
  private laufend = new Map<string, Promise<Verarbeitet>>();
  /** Gescheitert (id → sha256) – Zwischenspeicher; dauerhaft steht es in vorschau/.gescheitert/<id> (groessen.ts). */
  private gescheitert = new Map<string, string>();

  constructor(
    private readonly files: FileStore,
    rechner?: BildRechner,
  ) {
    this.rechner = rechner ?? new BildRechner();
  }

  vorschauPfad(id: string, groesse: VorschauGroesse) {
    return path.join(this.files.root, ...vorschauRel(groesse, id).split('/'));
  }

  private gescheitertPfad(id: string) {
    return path.join(this.files.root, ...gescheitertRel(id).split('/'));
  }

  async hatVorschau(id: string) {
    for (const g of VORSCHAU_GROESSEN) if (!(await existiert(this.vorschauPfad(id, g)))) return false;
    return true;
  }

  /**
   * Nichts mehr zu tun: alle Vorschaubilder da und das Original nicht größer als 2000 px (nur der Dateikopf wird gelesen) –
   * oder schon geprüft: Vorschaubilder nicht älter als das Original (Verkleinern brachte keine 20 %, Original blieb).
   */
  async erledigt(d: Datei): Promise<boolean> {
    if (!(await this.hatVorschau(d.id))) return false;
    const original = this.files.absPath(d);
    const kopf = await leseDateikopf(original);
    if (!kopf || Math.max(kopf.breite, kopf.hoehe) <= ORIGINAL_MAX_KANTE) return true;
    const [o, v] = await Promise.all([fs.stat(original).catch(() => undefined), fs.stat(this.vorschauPfad(d.id, 'karte')).catch(() => undefined)]);
    return !!o && !!v && v.mtimeMs >= o.mtimeMs;
  }

  /** Bild ist schon einmal gescheitert (gleicher Inhalt) – auch über Neustarts hinweg. */
  async istGescheitert(d: Datei): Promise<boolean> {
    if (this.gescheitert.get(d.id) === d.sha256) return true;
    const sha = await fs.readFile(this.gescheitertPfad(d.id), 'utf8').catch(() => '');
    if (sha.trim() !== d.sha256) return false;
    this.gescheitert.set(d.id, d.sha256);
    return true;
  }

  /** Verarbeitet ein Bild; gleichzeitige Aufrufe für dasselbe Bild teilen sich die Arbeit. Fehler → BildFehler. */
  verarbeite(d: Datei, prio: Prioritaet): Promise<Verarbeitet> {
    const laeuft = this.laufend.get(d.id);
    if (laeuft) return laeuft;
    const p = this.rechne(d, prio).finally(() => this.laufend.delete(d.id));
    this.laufend.set(d.id, p);
    return p;
  }

  /**
   * Pfad des Vorschaubilds; fehlt es, wird es sofort berechnet (höchstens `wartenMs` warten, die Arbeit läuft weiter).
   * Ist der Rechen-Thread schon belegt (z. B. viele fehlende Vorschaubilder nach Update oder Wiederherstellen), wird nicht
   * gewartet: `vormerken(id)` reicht das Bild an die Bildpflege weiter.
   * undefined → Original ausliefern (nicht unterstützt, gescheitert, belegt oder noch nicht fertig).
   */
  async vorschau(d: Datei, groesse: VorschauGroesse, wartenMs: number, vormerken?: (id: string) => void): Promise<string | undefined> {
    const p = this.vorschauPfad(d.id, groesse);
    if (await existiert(p)) return p;
    if (!istDruckteilBild(d) || !verarbeitbar(d) || (await this.istGescheitert(d))) return undefined;
    if (!this.laufend.has(d.id) && this.rechner.last > 0) {
      vormerken?.(d.id);
      return undefined;
    }
    let timer: NodeJS.Timeout | undefined;
    const arbeit = this.verarbeite(d, 'sofort').then(
      () => true,
      () => false,
    );
    const fertig = await Promise.race([arbeit, new Promise<false>((r) => (timer = setTimeout(() => r(false), wartenMs)))]);
    clearTimeout(timer);
    return fertig && (await existiert(p)) ? p : undefined;
  }

  async beenden() {
    await this.rechner.beenden();
  }

  private async rechne(d: Datei, prio: Prioritaet): Promise<Verarbeitet> {
    if (!verarbeitbar(d)) throw new BildFehler('Format wird nicht unterstützt (nur JPG und PNG).', true);
    const gesperrt = () => bildpflegeWartetAuf(this.files.root) !== null;
    try {
      const original = this.files.absPath(d);
      const vorschau = VORSCHAU_GROESSEN.map((g) => ({ name: g, breite: VORSCHAU[g].breite }));
      const e = await this.rechner.rechne({ datei: original, original: !gesperrt(), vorschau }, prio);
      // Inzwischen gelöscht oder ersetzt? Dann nichts schreiben (sonst verwaiste oder veraltete Vorschaubilder).
      let aktuell = this.files.find(d.id);
      if (!aktuell || aktuell.sha256 !== d.sha256) throw new BildFehler('Bild wurde während der Verarbeitung geändert oder gelöscht.', false, true);
      let verkleinert: Verarbeitet['verkleinert'];
      const nurVorschau = !e.original || gesperrt();
      if (e.original && !nurVorschau && e.original.daten.length <= e.bytes * (1 - MINDEST_ERSPARNIS)) {
        const ext = e.original.ext;
        const name = `${(aktuell.originalname || 'bild').replace(/\.[^.]*$/, '') || 'bild'}.${ext}`;
        aktuell = await this.files.replace(d.id, Buffer.from(e.original.daten.buffer, e.original.daten.byteOffset, e.original.daten.byteLength), ext, name);
        verkleinert = { vorher: e.bytes, nachher: aktuell.groesse };
      }
      let vorschauNeu = 0;
      for (const v of e.vorschau) {
        const ziel = this.vorschauPfad(d.id, v.name as VorschauGroesse);
        await schreibeSicher(ziel, v.daten);
        // Original durfte gerade nicht ersetzt werden, ist aber zu groß: Vorschaubilder älter als das Original stempeln,
        // dann gilt das Bild nicht als erledigt und die Bildpflege verkleinert es später.
        if (nurVorschau && e.originalZuGross) await zurueckdatieren(ziel, original);
        vorschauNeu++;
      }
      this.gescheitert.delete(d.id);
      await fs.rm(this.gescheitertPfad(d.id), { force: true }).catch(() => undefined);
      return { datei: aktuell, verkleinert, vorschauNeu };
    } catch (err) {
      // Fehler außerhalb des Rechen-Threads (Platte, Datenbank) liegen nicht am Bild → vorübergehend.
      const f = err instanceof BildFehler ? err : new BildFehler((err as Error).message, false, true);
      if (!f.voruebergehend) {
        this.gescheitert.set(d.id, d.sha256);
        await this.merkeGescheitert(d);
      }
      throw f;
    }
  }

  private async merkeGescheitert(d: Datei) {
    const datei = this.gescheitertPfad(d.id);
    try {
      await fs.mkdir(path.dirname(datei), { recursive: true });
      await fs.writeFile(datei, d.sha256);
    } catch {
      /* dann eben nur bis zum Neustart gemerkt */
    }
  }
}

/** Erst Zwischendatei, dann umbenennen: nie ein halb geschriebenes Vorschaubild. */
async function schreibeSicher(ziel: string, daten: Uint8Array) {
  await fs.mkdir(path.dirname(ziel), { recursive: true });
  const temp = `${ziel}.${newId()}.neu`;
  await fs.writeFile(temp, daten, { flag: 'wx' });
  try {
    await fs.rename(temp, ziel);
  } catch (err) {
    await fs.rm(temp, { force: true });
    throw err;
  }
}

async function zurueckdatieren(datei: string, original: string) {
  const o = await fs.stat(original).catch(() => undefined);
  if (o) await fs.utimes(datei, new Date(o.mtimeMs - 2000), new Date(o.mtimeMs - 2000)).catch(() => undefined);
}

const existiert = (p: string) =>
  fs.stat(p).then(
    (s) => s.isFile(),
    () => false,
  );

/** Nur die ersten 256 KB (JPEG-Kopf steht nach EXIF-Daten mit Vorschaubild, meist < 64 KB). */
async function leseDateikopf(datei: string) {
  let fh: fs.FileHandle | undefined;
  try {
    fh = await fs.open(datei, 'r');
    const buf = Buffer.alloc(256 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return leseKopf(buf.subarray(0, bytesRead));
  } catch {
    return null;
  } finally {
    await fh?.close();
  }
}
