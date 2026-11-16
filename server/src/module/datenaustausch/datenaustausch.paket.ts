import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { z } from 'zod';
import { MIME_BY_EXT } from '../../domain/objekttypen';
import { ITEM_KINDS } from '../../domain/types';
import { badRequest } from '../../kern/errors';
import { detectImage, detectModel, detectVideo, MAX_IMAGE_BYTES, MAX_MODEL_BYTES, MAX_VIDEO_BYTES } from '../../kern/uploads';
import { KOPF_ENDE, PAKET_FORMAT, PAKET_ROLLEN, PAKET_VERSION, PAKET_ENDE, type Paket, type PaketArtikel } from './datenaustausch.export';
import { masterDataSchemas } from '@mosaik3lab/shared/stammdaten';

// Import, Teil 1: Paketdatei lesen (Kopf, Stammdaten, Artikel) und jede enthaltene Datei einzeln prüfen
// (SHA-256, Größe, Magic Bytes). Format siehe datenaustausch.export.ts, Ablauf siehe datenaustausch.service.ts.

const MAX_ARTIKEL = 5000;
const MAX_DATEIEN_JE_ARTIKEL = 40;
export const ID = /^[A-Za-z0-9_-]{1,64}$/;

// --- Lesen -------------------------------------------------------------------------------------------------
export const dateiS = z.object({
  id: z.string().regex(ID),
  rolle: z.enum(PAKET_ROLLEN),
  originalname: z.string().max(300).default(''),
  mime: z.string().max(100).default(''),
  groesse: z.number().int().min(0),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  sortierung: z.number().int().default(0),
  erstelltAm: z.string().max(40).default(''),
});

const artikelS = z.object({
  id: z.string().regex(ID),
  number: z.string().max(40).optional(),
  name: z.string().max(300),
  shortDescription: z.string().max(1000).default(''),
  description: z.string().max(10000).default(''),
  category: z.string().max(200),
  kind: z.enum(ITEM_KINDS).default('hilfsmittel'),
  useAreas: z.array(z.string().max(200)).max(100).default([]),
  sizes: z.array(z.string().max(200)).max(100).default([]),
  colorAreas: z.array(z.object({ id: z.string().max(64).default(''), name: z.string().max(200), alleFarben: z.boolean().optional(), colors: z.array(z.string().max(64)).max(300) })).max(20),
  price: z.string().max(200).default(''),
  customFields: z.array(z.any()).max(30).default([]),
  material: z.string().max(200),
  materialInfo: z.string().max(5000).default(''),
  printTimeMinutes: z.number().default(1),
  safetyNotes: z.array(z.string().max(1000)).max(100).default([]),
  published: z.boolean().default(false),
  isDemo: z.boolean().default(false),
  createdAt: z.string().max(40).default(''),
  updatedAt: z.string().max(40).default(''),
  dateien: z.array(dateiS).max(MAX_DATEIEN_JE_ARTIKEL).default([]),
  videos: z
    .array(z.object({ id: z.string().max(64), title: z.string().max(300).default(''), url: z.string().max(2000).refine((u) => u === '' || /^https?:\/\//i.test(u), 'Nur Links mit http:// oder https://').default(''), dateiId: z.string().max(64).default(''), uploadedAt: z.string().max(40).default('') }))
    .max(20)
    .default([]),
});

const kopfS = z.object({
  format: z.string(),
  version: z.number().int(),
  exportiertAm: z.string().max(40).default(''),
  appVersion: z.string().max(40).default(''),
  schemaVersion: z.number().int().default(0),
  mitDateien: z.boolean().default(false),
  auswahl: z.boolean().default(false),
  hinweise: z.array(z.string().max(500)).max(1000).default([]),
  stammdaten: z.object({
    kategorien: masterDataSchemas.categories,
    einsatzbereiche: masterDataSchemas.useAreas,
    materialien: masterDataSchemas.materials,
    // Katalog-ID (Bambu-Lab-Katalog) seit Schema 012; ältere Dateien haben sie nicht.
    filamente: z.array(masterDataSchemas.filaments.element.extend({ katalogId: z.string().trim().max(64).nullish() })),
    statusarten: z.array(z.object({ id: z.string().max(64), aktiv: z.boolean() })).max(50),
  }),
  artikel: z.array(artikelS).max(MAX_ARTIKEL),
});

/** Liest alle Zeilen der Paketdatei nacheinander (auch sehr lange Zeilen, immer nur eine im Speicher). */
async function* zeilen(file: string): AsyncGenerator<string> {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 }), crlfDelay: Infinity });
  try {
    for await (const line of rl) yield line;
  } finally {
    rl.close();
  }
}

export async function leseKopf(file: string): Promise<Paket> {
  let first: string | undefined;
  for await (const line of zeilen(file)) {
    // Byte-Order-Mark entfernen: entsteht z. B., wenn die Datei im Windows-Editor geöffnet und gespeichert wurde
    first = line.replace(/^\uFEFF/, '');
    break;
  }
  if (first && !first.endsWith(KOPF_ENDE) && first.startsWith(`{"format":"${PAKET_FORMAT}"`)) {
    throw badRequest('Die Datei ist unvollständig – vermutlich wurde der Download abgebrochen. Bitte erneut exportieren.');
  }
  if (!first || !first.endsWith(KOPF_ENDE)) throw badRequest('Das ist keine Export-Datei von Mosaik³LAB. Bitte die Datei wählen, die beim Exportieren heruntergeladen wurde.');
  let raw: unknown;
  try {
    raw = JSON.parse(first.slice(0, -KOPF_ENDE.length) + '}');
  } catch {
    throw badRequest('Die Datei ist beschädigt (kein gültiges JSON).');
  }
  const format = (raw as { format?: unknown } | null)?.format;
  if (format !== PAKET_FORMAT) throw badRequest('Das ist keine Export-Datei von Mosaik³LAB (Format unbekannt).');
  const version = (raw as { version?: unknown }).version;
  if (typeof version !== 'number' || version > PAKET_VERSION) {
    throw badRequest(`Die Datei stammt aus einer neueren Mosaik³LAB-Version (Format ${String(version)}). Bitte zuerst Mosaik³LAB aktualisieren.`);
  }
  if (version < 1) throw badRequest('Die Datei hat eine ungültige Version.');
  const parsed = kopfS.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw badRequest(`Die Datei ist unvollständig oder fehlerhaft: ${i.path.join('.') || 'Aufbau'} – ${i.message}`);
  }
  return { ...parsed.data, format: PAKET_FORMAT } as unknown as Paket;
}

const PREFIX = /^\{"id":"([A-Za-z0-9_-]{1,64})","daten":"/;

/** Eine Dateizeile: { id, daten (Base64) }. Schneller Weg ohne JSON.parse der großen Zeichenkette. */
function parseDateizeile(line: string): { id: string; daten: string } | undefined {
  const text = line.endsWith(',') ? line.slice(0, -1) : line;
  const m = PREFIX.exec(text);
  if (m && text.endsWith('"}')) return { id: m[1], daten: text.slice(m[0].length, -2) };
  try {
    const o = JSON.parse(text) as { id?: unknown; daten?: unknown };
    if (typeof o.id === 'string' && ID.test(o.id) && typeof o.daten === 'string') return { id: o.id, daten: o.daten };
  } catch {
    /* ungültig */
  }
  return undefined;
}

/** Läuft über alle Dateizeilen. Zeilen davor (Kopf) und der Abschluss „]}“ werden übersprungen. */
async function* dateiZeilen(file: string): AsyncGenerator<{ id: string; daten: string }> {
  let nr = 0;
  let ende = false;
  for await (const line of zeilen(file)) {
    nr++;
    if (nr === 1) continue;
    if (line === PAKET_ENDE) {
      ende = true;
      continue;
    }
    if (ende) {
      if (line.trim()) throw badRequest('Die Datei enthält nach dem Ende weitere Zeilen.');
      continue;
    }
    if (!line.trim()) continue;
    const d = parseDateizeile(line);
    if (!d) throw badRequest(`Die Datei ist beschädigt (Zeile ${nr}).`);
    yield d;
  }
  if (!ende) throw badRequest('Die Datei ist unvollständig (Ende fehlt) – vermutlich wurde der Download abgebrochen. Bitte erneut exportieren.');
}

// --- Dateien prüfen ----------------------------------------------------------------------------------------
const EXT_NACH_MIME: Record<string, string> = Object.fromEntries(Object.entries(MIME_BY_EXT).map(([e, m]) => [m, e]));

export interface DateiInfo {
  ext: string;
  groesse: number;
}

const GRENZE: Record<(typeof PAKET_ROLLEN)[number], number> = { bild: MAX_IMAGE_BYTES, druckdatei: MAX_MODEL_BYTES, video: MAX_VIDEO_BYTES };

/** Gleiche Regeln wie beim Hochladen: Größe, erlaubter Typ, Inhalt per Magic Bytes. Gibt die Endung zurück. */
function pruefeInhalt(meta: { rolle: keyof typeof GRENZE; originalname: string; mime: string }, buffer: Buffer): string {
  if (buffer.length > GRENZE[meta.rolle]) throw new Error(`zu groß (max. ${GRENZE[meta.rolle] / 1024 / 1024} MB)`);
  const given = path.extname(meta.originalname).slice(1).toLowerCase();
  const ext = given || EXT_NACH_MIME[meta.mime] || '';
  const file = { buffer, originalname: `datei.${ext}` } as Express.Multer.File;
  try {
    if (meta.rolle === 'bild') return detectImage(file);
    if (meta.rolle === 'druckdatei') return detectModel(file);
    return detectVideo(file);
  } catch (err) {
    throw new Error((err as Error).message.replace(/„datei\.[^“]*“/, 'Inhalt'));
  }
}

async function sha256Hex(buffer: Buffer) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Geht alle Dateien des Pakets durch (jeweils eine im Speicher) und prüft sie. Optional wird jede geprüfte Datei
 * in `tmpDir` geschrieben (Ausführung). Wirft bei der ersten Abweichung – manipulierte Pakete werden nie teilweise eingespielt.
 */
export async function pruefeDateien(file: string, paket: Paket, tmpDir?: string): Promise<Map<string, DateiInfo>> {
  const metas = new Map<string, PaketArtikel['dateien'][number]>();
  if (paket.mitDateien) {
    for (const a of paket.artikel) {
      for (const d of a.dateien) {
        if (metas.has(d.id)) throw badRequest(`Die Datei-ID ${d.id} kommt mehrfach vor.`);
        metas.set(d.id, d);
      }
    }
  }
  const infos = new Map<string, DateiInfo>();
  if (tmpDir) await fsp.mkdir(tmpDir, { recursive: true });
  for await (const z of dateiZeilen(file)) {
    const meta = metas.get(z.id);
    if (!meta) {
      if (paket.mitDateien) throw badRequest(`Das Paket enthält Daten ohne Beschreibung (${z.id}).`);
      continue;
    }
    if (infos.has(z.id)) throw badRequest(`Der Inhalt der Datei ${z.id} kommt mehrfach vor.`);
    const name = meta.originalname || z.id;
    const buffer = Buffer.from(z.daten, 'base64');
    if (buffer.length !== meta.groesse) throw badRequest(`„${name}“: Größe stimmt nicht (${buffer.length} statt ${meta.groesse} Bytes) – Datei beschädigt.`);
    if ((await sha256Hex(buffer)) !== meta.sha256) throw badRequest(`„${name}“: Prüfsumme (SHA-256) stimmt nicht – die Datei wurde verändert oder ist beschädigt.`);
    let ext: string;
    try {
      ext = pruefeInhalt(meta, buffer);
    } catch (err) {
      throw badRequest(`„${name}“: ${(err as Error).message}`);
    }
    if (tmpDir) await fsp.writeFile(path.join(tmpDir, z.id), buffer, { flag: 'w' });
    infos.set(z.id, { ext, groesse: buffer.length });
  }
  for (const id of metas.keys()) if (!infos.has(id)) throw badRequest(`Der Inhalt der Datei ${metas.get(id)!.originalname || id} fehlt im Paket.`);
  return infos;
}

