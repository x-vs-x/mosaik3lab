// Hilfen für Tests rund um die Export-Datei: ZIP (Format 2) zerlegen und wieder bauen, ältere JSON-Datei (Format 1) erzeugen.
import yauzl from 'yauzl';
import yazl from 'yazl';

export interface Zerlegt {
  kopf: any;
  /** Einträge außer paket.json, nach Pfad im ZIP. */
  dateien: Map<string, Buffer>;
}

/** ZIP-Export → paket.json (als Objekt) und Dateien. */
export async function entpacke(zip: Buffer): Promise<Zerlegt> {
  const z = await yauzl.fromBufferPromise(zip, { lazyEntries: true });
  const dateien = new Map<string, Buffer>();
  let kopf: any;
  for await (const e of z.eachEntry()) {
    if (e.fileName.endsWith('/')) continue;
    const teile: Buffer[] = [];
    for await (const c of (await z.openReadStreamPromise(e)) as AsyncIterable<Buffer>) teile.push(c);
    const buf = Buffer.concat(teile);
    if (e.fileName === 'paket.json') kopf = JSON.parse(buf.toString('utf8'));
    else dateien.set(e.fileName, buf);
  }
  z.close();
  return { kopf, dateien };
}

/** Baut ein ZIP aus Kopf und Dateien (Rohnamen erlaubt – für Sicherheitstests auch unzulässige). */
export async function packe(kopf: unknown, dateien: Map<string, Buffer> = new Map(), roh: { name: string; daten: Buffer }[] = []): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify(kopf)), 'paket.json');
  for (const [pfad, buf] of dateien) zip.addBuffer(buf, pfad);
  for (const r of roh) zip.addBuffer(r.daten, r.name);
  zip.end();
  const teile: Buffer[] = [];
  for await (const c of zip.outputStream as AsyncIterable<Buffer>) teile.push(c);
  return Buffer.concat(teile);
}

/** Dieselben Druckteile als ältere JSON-Export-Datei (Format 1, Dateien als Base64-Zeilen) – so sahen Exporte bis 1.6.x aus. */
export function alsJson(kopf: any, dateien: Map<string, Buffer>): string {
  const k = structuredClone(kopf);
  k.version = 1;
  const zeilen: string[] = [];
  for (const a of k.artikel ?? []) {
    delete a.aehnliche;
    for (const d of a.dateien ?? []) {
      const buf = dateien.get(d.pfad);
      if (buf) zeilen.push(`{"id":${JSON.stringify(d.id)},"daten":"${buf.toString('base64')}"}`);
      delete d.pfad;
    }
  }
  return JSON.stringify(k).slice(0, -1) + ',"dateiinhalte":[\n' + zeilen.join(',\n') + (zeilen.length ? '\n' : '') + ']}\n';
}
