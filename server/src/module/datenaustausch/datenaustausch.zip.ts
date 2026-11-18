import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { Readable } from 'node:stream';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { badRequest, HttpError } from '../../kern/errors';

// ZIP-Hülle der Export-Datei (Format 2): yazl schreibt, yauzl liest – beide reines JavaScript, ohne native Teile.
//   paket.json                    Kopf, Stammdaten, Druckteile, Datei-Metadaten (Rolle, Name, MIME, Größe, SHA-256, Pfad)
//   bilder/<id>.<endung>          Bilder        ┐
//   druckdateien/<id>.<endung>    Druckdateien  ├ echte Binärdateien, z. B. im Explorer/Finder direkt ansehbar
//   videos/<id>.<endung>          Videos        ┘
// Bereits komprimierte Formate (JPG, PNG, WebP, MP4, WebM, 3MF) werden unkomprimiert („stored“) abgelegt, alles andere
// (paket.json, STL, PDF) mit Deflate. Schreiben im Strom (immer nur ein Block im Speicher), Lesen aus der Datei auf der Platte.
//
// Sicherheit beim Lesen: nur die oben genannten Namen (kein „..“, keine absoluten Pfade, keine Unterordner), keine
// doppelten Einträge, keine verschlüsselten Einträge, Anzahl- und Größengrenzen (Angaben im Verzeichnis werden vor dem
// Entpacken geprüft; yauzl prüft beim Entpacken, dass die tatsächliche Größe der Angabe entspricht – Schutz vor Zip-Bomben).

export const PAKET_JSON = 'paket.json';
export const ORDNER = { bild: 'bilder', druckdatei: 'druckdateien', video: 'videos' } as const;
/** Erlaubte Namen der Dateien im ZIP (genau ein Ordner, Name = Datei-ID + kleine Endung). */
export const ZIP_PFAD = /^(bilder|druckdateien|videos)\/[A-Za-z0-9_-]{1,64}\.[a-z0-9]{1,8}$/;
const ORDNER_EINTRAG = /^(bilder|druckdateien|videos)\/$/;

const UNKOMPRIMIERT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov', '3mf', 'zip']);
/** Höchstgröße von paket.json (entpackt). */
export const MAX_PAKET_JSON = 64 * 1024 * 1024;
/** Höchstzahl Einträge im ZIP. */
export const MAX_EINTRAEGE = 20_000;
/** Höchstsumme aller entpackten Größen (ZIP64 wird nicht gebraucht – einzelne Dateien sind höchstens 50 MB). */
export const MAX_ENTPACKT = 4 * 1024 * 1024 * 1024 - 1;

const ZIP_ANFANG = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // „PK\x03\x04“

/** Ist die Datei ein ZIP? (erste vier Bytes) – sonst ältere JSON-Export-Datei. */
export async function istZip(file: string): Promise<boolean> {
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(4);
    const { bytesRead } = await fh.read(buf, 0, 4, 0);
    return bytesRead === 4 && buf.equals(ZIP_ANFANG);
  } finally {
    await fh.close();
  }
}

// --- Schreiben ---------------------------------------------------------------------------------------------
export interface ZipDatei {
  /** Name im ZIP (ZIP_PFAD). */
  pfad: string;
  /** Datei auf der Platte. */
  quelle: string;
  groesse: number;
  mtime?: string;
}

const datum = (s?: string) => {
  const d = s ? new Date(s) : new Date();
  return Number.isNaN(d.getTime()) || d.getFullYear() < 1980 ? new Date() : d;
};

/** ZIP als Strom: paket.json zuerst, danach die Dateien nacheinander von der Platte. */
export function zipStrom(paketJson: string, dateien: ZipDatei[]): Readable {
  const zip = new yazl.ZipFile();
  const out = zip.outputStream as Readable;
  // Fehler (z. B. Datei während des Exports gelöscht oder geändert) brechen den Download ab, statt still eine kaputte Datei zu liefern.
  zip.on('error', (err: Error) => out.destroy(err));
  zip.addBuffer(Buffer.from(paketJson, 'utf8'), PAKET_JSON, { compress: true, mtime: new Date() });
  for (const d of dateien) {
    const endung = d.pfad.slice(d.pfad.lastIndexOf('.') + 1);
    zip.addReadStreamLazy(d.pfad, { size: d.groesse, compress: !UNKOMPRIMIERT.has(endung), mtime: datum(d.mtime) }, (cb) => cb(null, fs.createReadStream(d.quelle)));
  }
  zip.end();
  return out;
}

// --- Lesen -------------------------------------------------------------------------------------------------
export interface ZipInhalt {
  zip: yauzl.ZipFile;
  /** Einträge nach Name (ohne Ordner-Einträge). */
  eintraege: Map<string, yauzl.Entry>;
  close(): void;
}

const kaputt = () => badRequest('Die Datei ist beschädigt (kein gültiges ZIP) – vermutlich wurde der Download abgebrochen. Bitte erneut exportieren.');

/** Öffnet das ZIP und prüft das Inhaltsverzeichnis (Namen, Anzahl, Größen) – noch ohne etwas zu entpacken. */
export async function oeffneZip(file: string): Promise<ZipInhalt> {
  let zip: yauzl.ZipFile;
  try {
    zip = await yauzl.openPromise(file, { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true, decodeStrings: true });
  } catch {
    throw kaputt();
  }
  const close = () => {
    try {
      zip.close();
    } catch {
      /* schon zu */
    }
  };
  try {
    if (zip.entryCount > MAX_EINTRAEGE) throw badRequest(`Die Datei enthält zu viele Einträge (höchstens ${MAX_EINTRAEGE}).`);
    const eintraege = new Map<string, yauzl.Entry>();
    let summe = 0;
    try {
      for await (const e of zip.eachEntry()) {
        const name = e.fileName;
        if (ORDNER_EINTRAG.test(name)) continue;
        if (name !== PAKET_JSON && !ZIP_PFAD.test(name)) throw badRequest(`Die Datei enthält einen unerwarteten Eintrag („${name.slice(0, 120)}“) und wird aus Sicherheitsgründen nicht eingespielt.`);
        if (eintraege.has(name)) throw badRequest(`Der Eintrag „${name}“ kommt in der Datei mehrfach vor.`);
        if (e.generalPurposeBitFlag & 0x1) throw badRequest('Die Datei enthält verschlüsselte Einträge und kann nicht eingespielt werden.');
        if (e.compressionMethod !== 0 && e.compressionMethod !== 8) throw badRequest(`„${name}“ ist mit einem unbekannten Verfahren gepackt.`);
        summe += e.uncompressedSize;
        if (summe > MAX_ENTPACKT) throw badRequest('Die Datei ist entpackt zu groß.');
        eintraege.set(name, e);
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      // yauzl lehnt u. a. absolute Pfade, „..“ und Backslashes ab (Zip-Slip) oder meldet ein kaputtes Verzeichnis.
      const msg = (err as Error).message ?? '';
      if (/absolute path|relative path|invalid characters|file name/i.test(msg)) throw badRequest('Die Datei enthält einen unzulässigen Pfad (z. B. „..“ oder absolut) und wird aus Sicherheitsgründen nicht eingespielt.');
      throw kaputt();
    }
    return { zip, eintraege, close };
  } catch (err) {
    close();
    throw err;
  }
}

/** Entpackt einen Eintrag in den Speicher (Größe vorher geprüft; höchstens `max` Bytes). */
export async function leseEintrag(z: ZipInhalt, e: yauzl.Entry, max: number): Promise<Buffer> {
  if (e.uncompressedSize > max) throw badRequest(`„${e.fileName}“ ist zu groß (höchstens ${Math.round(max / 1024 / 1024)} MB).`);
  const teile: Buffer[] = [];
  let laenge = 0;
  try {
    const strom = await z.zip.openReadStreamPromise(e);
    for await (const chunk of strom as AsyncIterable<Buffer>) {
      laenge += chunk.length;
      if (laenge > max) throw new Error('zu groß');
      teile.push(chunk);
    }
  } catch {
    throw badRequest(`„${e.fileName}“ ist beschädigt oder größer als angegeben – die Datei wird nicht eingespielt.`);
  }
  return Buffer.concat(teile, laenge);
}
