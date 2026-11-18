import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { newId, UUID_PATTERN } from '../../kern/ids';
import { MIME_BY_EXT } from '../../kern/objekttypen';
import { isCatalogStatus, LEGACY_STATUS_MAP } from '../../module/stammdaten/orderStatuses';
import { ANFANGSSTATUS } from '../../module/einstellungen/einstellungen.vorgaben';
import { productDefaults, type Item } from '../../domain/types';
import { type Order } from '@mosaik3lab/shared/anfragen';
import { STANDARD_BEREICHE, TEAM_BEREICHE } from '@mosaik3lab/shared/konten';
import { dateiName, SAFE_ID, sha256, type Datei, type FileStore } from '../../kern/files';
import { hasLegacyData, readLegacyData } from '../json/legacyJson';
import { transaction, type Db } from '../../kern/db';
import { nextNumber } from '../../kern/db';
import type { Storage } from '../repositories';

// Einmalige Übernahme der bisherigen JSON-Daten und Upload-Ordner in Datenbank und neue Ablagestruktur.
// Idempotent: das Ergebnis steht in einstellung „json_uebernahme“ – danach läuft sie nie wieder.
// Die JSON-Dateien und die alten Upload-Ordner bleiben unverändert als Sicherung liegen.

export const IMPORT_KEY = 'json_uebernahme';

export interface LegacyPaths {
  dataDir: string;
  imagesDir: string;
  modelsDir: string;
  videosDir: string;
}

export interface ImportReport {
  am: string;
  ergebnis: 'uebernommen' | 'keine-daten' | 'uebersprungen';
  quelle: LegacyPaths;
  gelesen: string[];
  /** Je Bereich: Einträge in JSON → Datensätze in der Datenbank. */
  anzahl: Record<string, { json: number; db: number }>;
  dateien: { erwartet: number; uebernommen: number; fehlend: number; sha256Geprueft: number; bytes: number };
  hinweise: string[];
}

type Repos = Pick<Storage, 'users' | 'items' | 'orders' | 'requesters' | 'sessions' | 'settings'>;

const count = (db: Db, table: string) => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);

/** Datei aus der alten Ablage in die neue kopieren (oder vorhandene, identische Kopie verwenden) und prüfen. */
async function copyChecked(src: string, files: FileStore, d: Omit<Datei, 'groesse' | 'sha256' | 'mime'> & { mime: string }) {
  const buf = await fs.readFile(src);
  const hash = sha256(buf);
  const dest = files.absPath(d);
  let written = false;
  if (!existsSync(dest) || sha256(await fs.readFile(dest)) !== hash) {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buf);
    written = true;
  }
  if (sha256(await fs.readFile(dest)) !== hash) throw new Error(`Prüfsumme der Kopie stimmt nicht: ${d.pfad}`);
  return { datei: { ...d, groesse: buf.length, sha256: hash } as Datei, dest, written };
}

export async function importLegacyJson(
  db: Db,
  files: FileStore,
  repos: Repos,
  legacy: LegacyPaths,
  log: (msg: string) => void = (m) => console.log(m),
): Promise<ImportReport | undefined> {
  if (repos.settings.getSetting(IMPORT_KEY)) return undefined;

  const report: ImportReport = {
    am: new Date().toISOString(),
    ergebnis: 'keine-daten',
    quelle: legacy,
    gelesen: [],
    anzahl: {},
    dateien: { erwartet: 0, uebernommen: 0, fehlend: 0, sha256Geprueft: 0, bytes: 0 },
    hinweise: [],
  };
  const finish = (r: ImportReport) => {
    transaction(db, () => repos.settings.setSetting(IMPORT_KEY, r));
    return r;
  };

  if (!hasLegacyData(legacy.dataDir)) return finish(report);
  const existing = count(db, 'benutzer') + count(db, 'artikel') + count(db, 'anfrage') + count(db, 'lehrkraft');
  if (existing > 0) {
    report.ergebnis = 'uebersprungen';
    report.hinweise.push('Die Datenbank enthält bereits Daten – JSON-Dateien wurden nicht übernommen.');
    log('[Übernahme] Datenbank enthält bereits Daten – JSON-Dateien werden nicht übernommen.');
    return finish(report);
  }

  log(`[Übernahme] Bisherige JSON-Daten aus ${legacy.dataDir} werden in die Datenbank übernommen …`);
  const data = readLegacyData(legacy.dataDir);
  report.gelesen = data.gelesen;
  const hint = (t: string) => report.hinweise.push(t);

  // 1) Ältere Datenstände vereinheitlichen (Status auf die feste Liste, fehlende Produktdaten ergänzen),
  //    damit Fremdschlüssel (z. B. Status) passen.
  const fallback = ANFANGSSTATUS;
  const fixStatus = (s: string) => (isCatalogStatus(s) ? s : (data.settings.statusAliases[s] ?? LEGACY_STATUS_MAP[s] ?? fallback));
  const items: Item[] = data.items.map((i) => {
    const d = productDefaults(i.colors ?? []);
    return {
      ...i,
      colorAreas: Array.isArray(i.colorAreas) && i.colorAreas.length ? i.colorAreas : d.colorAreas,
      price: typeof i.price === 'string' ? i.price : d.price,
      customFields: Array.isArray(i.customFields) ? i.customFields : d.customFields,
      videos: Array.isArray(i.videos) ? i.videos : d.videos,
      images: Array.isArray(i.images) ? i.images : [],
      modelFiles: Array.isArray(i.modelFiles) ? i.modelFiles : [],
    };
  });
  const orders: Order[] = data.orders.map((o) => ({
    ...o,
    status: fixStatus(o.status),
    history: (o.history ?? []).map((h) => ({ ...h, status: fixStatus(h.status) })),
    colorChoices: Array.isArray(o.colorChoices)
      ? o.colorChoices
      : o.colorId
        ? [{ areaId: 'farbe', area: 'Farbe', colorId: o.colorId, color: o.color, colorHex: o.colorHex ?? '' }]
        : [],
    personalization: Array.isArray(o.personalization) ? o.personalization : [],
    colorVariants: Array.isArray(o.colorVariants) ? o.colorVariants : [],
  }));

  // 2) Dateien in die neue Ablagestruktur kopieren (vor der Transaktion; bei Fehler wieder entfernen).
  const dateien: Datei[] = [];
  const written: string[] = [];
  const usedIds = new Set<string>();
  const takeId = (wanted: string | undefined) => {
    const id = wanted && SAFE_ID.test(wanted) && !usedIds.has(wanted) ? wanted : newId();
    usedIds.add(id);
    return id;
  };
  const addFile = async (item: Item, rolle: Datei['rolle'], dir: string, name: string, wantedId: string | undefined, extra: Partial<Datei>) => {
    report.dateien.erwartet++;
    const src = path.join(dir, path.basename(name));
    const ext = path.extname(name).slice(1).toLowerCase();
    if (path.basename(name) !== name || !ext || !existsSync(src)) {
      report.dateien.fehlend++;
      hint(`Datei fehlt in der alten Ablage: ${name} (${item.name})`);
      return undefined;
    }
    const id = takeId(wantedId);
    const pfad = files.relPath('artikel', item.id, rolle, id, ext);
    const { datei, dest, written: w } = await copyChecked(src, files, {
      id,
      objekttyp: 'artikel',
      objektId: item.id,
      rolle,
      originalname: extra.originalname ?? name,
      mime: MIME_BY_EXT[ext] ?? 'application/octet-stream',
      pfad,
      sortierung: extra.sortierung ?? 0,
      erstelltAm: extra.erstelltAm || item.createdAt,
      erstelltVon: '',
    });
    if (w) written.push(dest);
    dateien.push(datei);
    report.dateien.uebernommen++;
    report.dateien.sha256Geprueft++;
    report.dateien.bytes += datei.groesse;
    return datei;
  };

  try {
    for (const item of items) {
      const images: string[] = [];
      for (const [i, name] of item.images.entries()) {
        const uuid = name.replace(/\.[^.]+$/, '');
        const d = await addFile(item, 'bild', legacy.imagesDir, name, UUID_PATTERN.test(uuid) ? uuid : undefined, { sortierung: i, erstelltAm: item.createdAt });
        if (d) images.push(dateiName(d));
      }
      item.images = images;
      const models = [];
      for (const [i, m] of item.modelFiles.entries()) {
        const d = await addFile(item, 'druckdatei', legacy.modelsDir, m.storedName, m.id, { sortierung: i, originalname: m.originalName, erstelltAm: m.uploadedAt });
        if (d) models.push({ ...m, id: d.id, storedName: dateiName(d) });
      }
      item.modelFiles = models;
      const videos = [];
      for (const [i, v] of item.videos.entries()) {
        if (!v.file) {
          videos.push(v);
          continue;
        }
        const uuid = v.file.replace(/\.[^.]+$/, '');
        const d = await addFile(item, 'video', legacy.videosDir, v.file, UUID_PATTERN.test(uuid) ? uuid : undefined, { sortierung: i, originalname: v.title, erstelltAm: v.uploadedAt });
        if (d) videos.push({ ...v, file: dateiName(d) });
      }
      item.videos = videos;
    }

    // 3) Alles in einer Transaktion eintragen und die Anzahlen prüfen.
    transaction(db, () => {
      repos.settings.write(data.settings);
      repos.settings.setSetting('angelegt', report.am);

      // Alte Konten: Druck-Team bekommt die Standard-Bereiche (wie Migration 011 ohne abweichende Einzelrechte).
      const teamStandard = STANDARD_BEREICHE.filter((b) => TEAM_BEREICHE.includes(b));
      for (const u of data.users) {
        const email = (u.email ?? '').trim().toLowerCase();
        repos.users.save({ ...u, email, lastLoginAt: u.lastLoginAt ?? null, teamBereiche: u.role === 'druckteam' ? teamStandard : [], fehlversuche: 0 });
      }
      let lehrkraefte = 0;
      for (const r of data.requesters) {
        try {
          repos.requesters.save({ ...r, lastOrderAt: r.lastOrderAt ?? '' });
          lehrkraefte++;
        } catch {
          hint(`Lehrkraft doppelt, übersprungen: ${r.email}`);
        }
      }
      for (const d of dateien) files.insert(d);

      const sorted = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const artikelNr = new Set<string>();
      for (const item of sorted) {
        const number = nextNumber(db, 'artikel', new Date(item.createdAt), (n) => artikelNr.has(n));
        artikelNr.add(number);
        repos.items.save({ ...item, number });
        for (const w of repos.items.lastWarnings) hint(`${item.name}: ${w}`);
      }

      const nummern = new Set<string>();
      let ohneArtikel = 0;
      let ohneLehrkraft = 0;
      const itemIds = new Set(items.map((i) => i.id));
      const requesterIds = new Set(data.requesters.map((r) => r.id));
      for (const o of orders) {
        let number = o.number;
        if (!number || nummern.has(number)) {
          number = nextNumber(db, 'anfrage', new Date(o.createdAt), (n) => nummern.has(n));
          hint(`Anfrage ohne bzw. mit doppelter Nummer erhielt ${number}`);
        }
        nummern.add(number);
        if (o.itemId && !itemIds.has(o.itemId)) ohneArtikel++;
        if (o.requesterId && !requesterIds.has(o.requesterId)) ohneLehrkraft++;
        repos.orders.save({ ...o, number });
      }
      if (ohneArtikel) hint(`${ohneArtikel} Anfrage(n) verweisen auf gelöschte Druckteile (Name bleibt als Schnappschuss).`);
      if (ohneLehrkraft) hint(`${ohneLehrkraft} Anfrage(n) ohne bekannte Lehrkraft (E-Mail bleibt erhalten).`);

      let sitzungen = 0;
      for (const [sid, s] of Object.entries(data.sessions)) {
        if (!s || typeof s.expiresAt !== 'number' || s.expiresAt < Date.now()) continue;
        void repos.sessions.set(sid, s);
        sitzungen++;
      }

      report.anzahl = {
        benutzer: { json: data.users.length, db: count(db, 'benutzer') },
        lehrkraefte: { json: lehrkraefte, db: count(db, 'lehrkraft') },
        artikel: { json: items.length, db: count(db, 'artikel') },
        anfragen: { json: orders.length, db: count(db, 'anfrage') },
        statusverlauf: { json: orders.reduce((n, o) => n + o.history.length, 0), db: count(db, 'anfrage_statusverlauf') },
        dateien: { json: dateien.length, db: count(db, 'datei') },
        kategorien: { json: data.settings.masterData.categories.length, db: count(db, 'kategorie') },
        einsatzbereiche: { json: data.settings.masterData.useAreas.length, db: count(db, 'einsatzbereich') },
        materialien: { json: data.settings.masterData.materials.length, db: count(db, 'material') },
        filamente: { json: data.settings.masterData.filaments.length, db: count(db, 'filament') },
        sitzungen: { json: sitzungen, db: count(db, 'sitzung') },
      };
      const wrong = Object.entries(report.anzahl).filter(([, v]) => v.json !== v.db);
      if (wrong.length) {
        throw new Error(`Anzahl stimmt nicht: ${wrong.map(([k, v]) => `${k} ${v.json} → ${v.db}`).join(', ')}`);
      }
      report.ergebnis = 'uebernommen';
      repos.settings.setSetting(IMPORT_KEY, report);
    });
  } catch (err) {
    for (const f of written) await fs.rm(f, { force: true }).catch(() => undefined);
    throw new Error(
      `Die Übernahme der JSON-Daten ist fehlgeschlagen – es wurde nichts verändert, die JSON-Dateien sind unberührt. ` +
        `Ursache: ${(err as Error).message}`,
    );
  }

  log(
    `[Übernahme] Fertig: ${Object.entries(report.anzahl)
      .map(([k, v]) => `${k} ${v.db}`)
      .join(', ')}; Dateien ${report.dateien.uebernommen}/${report.dateien.erwartet} kopiert und per SHA-256 geprüft` +
      `${report.dateien.fehlend ? `, ${report.dateien.fehlend} fehlten schon vorher` : ''}. JSON-Dateien und alte Ablage bleiben als Sicherung liegen.`,
  );
  for (const h of report.hinweise) log(`[Übernahme] Hinweis: ${h}`);
  return report;
}
