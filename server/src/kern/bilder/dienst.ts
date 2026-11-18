// Bilder der Druckteile verarbeiten: Original ggf. verkleinern (≥ 20 % Ersparnis, sicher über Zwischendatei wie
// FileStore.replace) und die Vorschaubilder „karte“ und „mini“ ablegen. Gerechnet wird im Rechen-Thread (rechner.ts).
// Benutzt vom Hochladen (sofort), vom Abruf eines fehlenden Vorschaubilds (sofort) und von der Bildpflege (Hintergrund).
import fs from 'node:fs/promises';
import path from 'node:path';
import { newId } from '../../domain/ids';
import type { Datei, FileStore } from '../files';
import { leseKopf } from './format';
import { MINDEST_ERSPARNIS, ORIGINAL_MAX_KANTE, VORSCHAU, VORSCHAU_GROESSEN, vorschauRel, type VorschauGroesse } from './groessen';
import { BildFehler, BildRechner, type Prioritaet } from './rechner';

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
  /** Gescheitert (id → sha256): bis sich der Inhalt ändert bzw. bis zum Neustart nicht erneut versuchen. */
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

  async hatVorschau(id: string) {
    for (const g of VORSCHAU_GROESSEN) if (!(await existiert(this.vorschauPfad(id, g)))) return false;
    return true;
  }

  /** Nichts mehr zu tun: alle Vorschaubilder da, Original nicht größer als 2000 px (nur der Dateikopf wird gelesen). */
  async erledigt(d: Datei): Promise<boolean> {
    if (!(await this.hatVorschau(d.id))) return false;
    const kopf = await leseDateikopf(this.files.absPath(d));
    return !kopf || Math.max(kopf.breite, kopf.hoehe) <= ORIGINAL_MAX_KANTE;
  }

  istGescheitert(d: Datei) {
    return this.gescheitert.get(d.id) === d.sha256;
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
   * undefined → Original ausliefern (nicht unterstützt, gescheitert oder noch nicht fertig).
   */
  async vorschau(d: Datei, groesse: VorschauGroesse, wartenMs: number): Promise<string | undefined> {
    const p = this.vorschauPfad(d.id, groesse);
    if (await existiert(p)) return p;
    if (!istDruckteilBild(d) || !verarbeitbar(d) || this.istGescheitert(d)) return undefined;
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
    try {
      const buf = await fs.readFile(this.files.absPath(d));
      const e = await this.rechner.rechne({ daten: buf, original: true, vorschau: VORSCHAU_GROESSEN.map((g) => ({ name: g, breite: VORSCHAU[g].breite })) }, prio);
      // Inzwischen gelöscht oder ersetzt? Dann nichts schreiben (sonst verwaiste oder veraltete Vorschaubilder).
      let aktuell = this.files.find(d.id);
      if (!aktuell || aktuell.sha256 !== d.sha256) throw new BildFehler('Bild wurde während der Verarbeitung geändert oder gelöscht.');
      let verkleinert: Verarbeitet['verkleinert'];
      if (e.original && e.original.daten.length <= buf.length * (1 - MINDEST_ERSPARNIS)) {
        const ext = e.original.ext;
        const name = `${(aktuell.originalname || 'bild').replace(/\.[^.]*$/, '') || 'bild'}.${ext}`;
        aktuell = await this.files.replace(d.id, Buffer.from(e.original.daten.buffer, e.original.daten.byteOffset, e.original.daten.byteLength), ext, name);
        verkleinert = { vorher: buf.length, nachher: aktuell.groesse };
      }
      let vorschauNeu = 0;
      for (const v of e.vorschau) {
        await schreibeSicher(this.vorschauPfad(d.id, v.name as VorschauGroesse), v.daten);
        vorschauNeu++;
      }
      this.gescheitert.delete(d.id);
      return { datei: aktuell, verkleinert, vorschauNeu };
    } catch (err) {
      const f = err instanceof BildFehler ? err : new BildFehler((err as Error).message);
      this.gescheitert.set(d.id, d.sha256);
      throw f;
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
