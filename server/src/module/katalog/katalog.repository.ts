import { allAreaColors, type ColorArea, type CustomField, type Item, type ItemVideo, type ModelFile } from '../../domain/types';
import { all, b, bool, count, json, marks, nextNumber, one, run, str, syncRows, transaction, type Db, type Row } from '../../kern/db';
import { conflict } from '../../kern/errors';
import { dateiFromRow, dateiName, type Datei, type FileStore } from '../../kern/files';
import { inGruppen, type ItemLink } from '@mosaik3lab/shared/katalog';

// Druckteile (Tabelle artikel mit Einsatzbereichen, Farbbereichen, Feldern, Videos; Dateien in Tabelle datei).

export class ItemRepository {
  /** Hinweise aus dem letzten Speichern (z. B. unbekannte Stammdaten bei der Übernahme alter Daten). */
  lastWarnings: string[] = [];

  constructor(
    private readonly db: Db,
    private readonly files: FileStore,
  ) {}

  /**
   * Lädt Artikel mit allen Kindzeilen in wenigen Abfragen (where = optionaler Filter auf artikel).
   * Mit Filter werden auch die Kindzeilen nur für die gefundenen Artikel gelesen (Index auf artikel_id).
   */
  load(where = '', ...params: unknown[]): Item[] {
    const rows = all(this.db, `SELECT * FROM artikel ${where} ORDER BY erstellt_am, id`, ...params);
    if (rows.length === 0) return [];
    const idList = rows.map((r) => str(r.id));
    const nur = (col: string) => (where ? `WHERE ${col} IN (${marks(idList.length)})` : '');
    const p = where ? idList : [];
    const group = (list: Row[], col = 'artikel_id') => {
      const m = new Map<string, Row[]>();
      for (const x of list) m.set(str(x[col]), [...(m.get(str(x[col])) ?? []), x]);
      return m;
    };

    const kategorien = new Map(all(this.db, 'SELECT id, name FROM kategorie').map((r) => [str(r.id), str(r.name)]));
    const materialien = new Map(all(this.db, 'SELECT id, name FROM material').map((r) => [str(r.id), str(r.name)]));
    const bereiche = group(
      all(this.db, `SELECT ae.artikel_id, e.name FROM artikel_einsatzbereich ae JOIN einsatzbereich e ON e.id = ae.einsatzbereich_id ${nur('ae.artikel_id')} ORDER BY ae.sortierung`, ...p),
    );
    const farbbereiche = group(all(this.db, `SELECT * FROM artikel_farbbereich ${nur('artikel_id')} ORDER BY sortierung`, ...p));
    const farben = group(
      all(
        this.db,
        `SELECT ff.farbbereich_id, ff.filament_id FROM artikel_farbbereich_filament ff JOIN artikel_farbbereich fb ON fb.id = ff.farbbereich_id
         ${nur('fb.artikel_id')} ORDER BY ff.sortierung`,
        ...p,
      ),
      'farbbereich_id',
    );
    // „Alle Farben“ und ganze Gruppen (Linie/Materialart): Farbrollen in der Reihenfolge der Stammdaten.
    const rollen = all(this.db, 'SELECT id, marke, linie FROM filament ORDER BY sortierung').map((r) => ({ id: str(r.id), brand: str(r.marke), line: str(r.linie) }));
    const alleFarbrollen = rollen.map((r) => r.id);
    const felder = group(all(this.db, `SELECT * FROM artikel_feld ${nur('artikel_id')} ORDER BY sortierung`, ...p));
    const videos = group(all(this.db, `SELECT * FROM artikel_video ${nur('artikel_id')} ORDER BY sortierung`, ...p));
    const dateien = new Map<string, Datei[]>();
    const dateiRows = all(this.db, `SELECT * FROM datei WHERE objekttyp = 'artikel' ${where ? `AND objekt_id IN (${marks(idList.length)})` : ''} ORDER BY sortierung, erstellt_am`, ...p);
    for (const d of dateiRows.map(dateiFromRow)) dateien.set(d.objektId, [...(dateien.get(d.objektId) ?? []), d]);

    return rows.map((r) => {
      const id = str(r.id);
      const files = dateien.get(id) ?? [];
      const byId = new Map(files.map((d) => [d.id, d]));
      const colorAreas: ColorArea[] = (farbbereiche.get(id) ?? []).map((a) => {
        const gruppen = json<string[]>(a.gruppen, []);
        const fest = (farben.get(str(a.id)) ?? []).map((f) => str(f.filament_id));
        const ausGruppen = gruppen.length ? rollen.filter((r) => inGruppen(r, gruppen)).map((r) => r.id) : [];
        return {
          id: str(a.schluessel),
          name: str(a.name),
          alleFarben: bool(a.alle_farben),
          ...(gruppen.length ? { gruppen } : {}),
          // Gruppen: feste Auswahl plus alle Rollen der Gruppe (auch später angelegte).
          colors: bool(a.alle_farben) ? [...alleFarbrollen] : [...new Set([...fest, ...ausGruppen])],
        };
      });
      const customFields: CustomField[] = (felder.get(id) ?? []).map((f) => ({
        id: str(f.schluessel),
        label: str(f.bezeichnung),
        type: str(f.typ) as CustomField['type'],
        required: bool(f.pflicht),
        maxLength: Number(f.max_laenge),
        hint: str(f.hinweis),
        options: json<string[]>(f.optionen, []),
      }));
      const itemVideos: ItemVideo[] = (videos.get(id) ?? []).map((v) => {
        const d = v.datei_id ? byId.get(str(v.datei_id)) : undefined;
        return {
          id: str(v.id),
          title: str(v.titel),
          file: d ? dateiName(d) : '',
          url: str(v.url),
          sizeBytes: d?.groesse ?? 0,
          uploadedAt: str(v.erstellt_am),
        };
      });
      const modelFiles: ModelFile[] = files
        .filter((d) => d.rolle === 'druckdatei')
        .map((d) => ({
          id: d.id,
          storedName: dateiName(d),
          originalName: d.originalname,
          format: dateiName(d).split('.').pop() as ModelFile['format'],
          sizeBytes: d.groesse,
          uploadedAt: d.erstelltAm,
        }));
      return {
        id,
        number: str(r.nummer),
        name: str(r.name),
        shortDescription: str(r.kurzbeschreibung),
        kind: (['hilfsmittel', 'lehrmittel', 'beides'].includes(str(r.art)) ? str(r.art) : 'hilfsmittel') as Item['kind'],
        description: str(r.beschreibung),
        category: kategorien.get(str(r.kategorie_id)) ?? '',
        useAreas: (bereiche.get(id) ?? []).map((x) => str(x.name)),
        sizes: json<string[]>(r.groessen, []),
        colors: allAreaColors(colorAreas),
        colorAreas,
        price: str(r.preis),
        customFields,
        videos: itemVideos,
        material: materialien.get(str(r.material_id)) ?? '',
        materialInfo: str(r.material_info),
        printTimeMinutes: Number(r.druckzeit_minuten),
        safetyNotes: json<string[]>(r.sicherheitshinweise, []),
        links: json<ItemLink[]>(r.links, []),
        images: files.filter((d) => d.rolle === 'bild').map(dateiName),
        modelFiles,
        published: bool(r.veroeffentlicht),
        isDemo: bool(r.ist_demo),
        createdAt: str(r.erstellt_am),
        updatedAt: str(r.geaendert_am),
      } satisfies Item;
    });
  }

  async list() {
    return this.load();
  }
  async findById(id: string) {
    return this.load('WHERE id = ?', id)[0];
  }
  async count() {
    return count(this.db, 'SELECT COUNT(*) AS n FROM artikel');
  }
  countPublished() {
    return count(this.db, 'SELECT COUNT(*) AS n FROM artikel WHERE veroeffentlicht = 1');
  }
  /** Nur veröffentlichte Druckteile (Katalog ohne Verwaltungsrecht). */
  listPublished() {
    return this.load('WHERE veroeffentlicht = 1');
  }
  /** Gezielt mehrere Druckteile (z. B. Bilder zu den eigenen Anfragen). */
  listByIds(ids: string[]) {
    const unique = [...new Set(ids)];
    return unique.length ? this.load(`WHERE id IN (${marks(unique.length)})`, ...unique) : [];
  }

  private idByName(table: string, name: string): string | null {
    const r = one(this.db, `SELECT id FROM ${table} WHERE name = ? ORDER BY sortierung LIMIT 1`, name);
    return r ? str(r.id) : null;
  }

  /**
   * Schreibt einen Artikel mit allen Kindzeilen (innerhalb einer Transaktion aufrufen).
   * Dateien: Bilder/Druckdateien/Videos, die nicht mehr im Artikel stehen, werden als Datensatz entfernt und
   * zurückgegeben – die Dateien löscht der Aufrufer nach dem Commit (erst DB, dann Datei).
   */
  save(item: Item): Datei[] {
    const warn: string[] = [];
    const kategorieId = item.category ? this.idByName('kategorie', item.category) : null;
    if (item.category && !kategorieId) warn.push(`Kategorie „${item.category}“ unbekannt`);
    const materialId = item.material ? this.idByName('material', item.material) : null;
    if (item.material && !materialId) warn.push(`Material „${item.material}“ unbekannt`);
    run(
      this.db,
      `INSERT INTO artikel (id, nummer, name, kurzbeschreibung, beschreibung, art, kategorie_id, material_id, material_info, preis,
         druckzeit_minuten, groessen, sicherheitshinweise, links, veroeffentlicht, ist_demo, erstellt_am, geaendert_am)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, kurzbeschreibung = excluded.kurzbeschreibung,
         beschreibung = excluded.beschreibung, art = excluded.art, kategorie_id = excluded.kategorie_id, material_id = excluded.material_id,
         material_info = excluded.material_info, preis = excluded.preis, druckzeit_minuten = excluded.druckzeit_minuten,
         groessen = excluded.groessen, sicherheitshinweise = excluded.sicherheitshinweise, links = excluded.links,
         veroeffentlicht = excluded.veroeffentlicht, ist_demo = excluded.ist_demo, geaendert_am = excluded.geaendert_am`,
      item.id,
      item.number ?? '',
      item.name,
      item.shortDescription ?? '',
      item.description ?? '',
      item.kind ?? 'hilfsmittel',
      kategorieId,
      materialId,
      item.materialInfo ?? '',
      item.price ?? '',
      Math.round(Number(item.printTimeMinutes) || 0),
      JSON.stringify(item.sizes ?? []),
      JSON.stringify(item.safetyNotes ?? []),
      JSON.stringify(item.links ?? []),
      b(!!item.published),
      b(!!item.isDemo),
      item.createdAt,
      item.updatedAt,
    );

    const areaIds: { einsatzbereich_id: string; sortierung: number }[] = [];
    for (const name of [...new Set(item.useAreas ?? [])]) {
      const id = this.idByName('einsatzbereich', name);
      if (id) areaIds.push({ einsatzbereich_id: id, sortierung: areaIds.length });
      else warn.push(`Einsatzbereich „${name}“ unbekannt`);
    }
    syncRows(this.db, 'artikel_einsatzbereich', 'artikel_id', item.id, 'einsatzbereich_id', areaIds);

    const rollen = all(this.db, 'SELECT id, marke, linie FROM filament').map((r) => ({ id: str(r.id), brand: str(r.marke), line: str(r.linie) }));
    const filaments = new Map(rollen.map((r) => [r.id, r]));
    const areas = item.colorAreas ?? [];
    const areaRowIds = syncRows(
      this.db,
      'artikel_farbbereich',
      'artikel_id',
      item.id,
      'schluessel',
      areas.map((a, i) => ({ schluessel: a.id, name: a.name, sortierung: i, alle_farben: b(!!a.alleFarben), gruppen: JSON.stringify(a.alleFarben ? [] : (a.gruppen ?? [])) })),
    );
    for (const a of areas) {
      const known = [...new Set(a.alleFarben ? [] : a.colors)]
        .filter((c) => filaments.has(c) || (warn.push(`Farbrolle „${c}“ unbekannt`), false))
        // Von einer Gruppe abgedeckte Rollen nicht einzeln speichern – sonst blieben sie beim Abwählen der Gruppe hängen.
        .filter((c) => !inGruppen(filaments.get(c)!, a.gruppen));
      syncRows(this.db, 'artikel_farbbereich_filament', 'farbbereich_id', areaRowIds.get(a.id)!, 'filament_id', known.map((filament_id, i) => ({ filament_id, sortierung: i })));
    }

    syncRows(
      this.db,
      'artikel_feld',
      'artikel_id',
      item.id,
      'schluessel',
      (item.customFields ?? []).map((f, i) => ({
        schluessel: f.id,
        bezeichnung: f.label,
        typ: f.type,
        pflicht: b(!!f.required),
        max_laenge: f.maxLength,
        hinweis: f.hint ?? '',
        optionen: JSON.stringify(f.options ?? []),
        sortierung: i,
      })),
    );

    // Dateien abgleichen: Reihenfolge der Bilder übernehmen, entfernte Dateien austragen.
    const files = this.files.list('artikel', item.id);
    const byName = new Map(files.map((d) => [dateiName(d), d]));
    const keep = new Set<string>();
    [...new Set(item.images ?? [])].forEach((name, i) => {
      const d = byName.get(name);
      if (d?.rolle !== 'bild') return void warn.push(`Bild ${name} nicht in der Ablage`);
      keep.add(d.id);
      run(this.db, 'UPDATE datei SET sortierung = ? WHERE id = ?', i, d.id);
    });
    for (const m of item.modelFiles ?? []) {
      const d = files.find((x) => x.id === m.id && x.rolle === 'druckdatei');
      if (d) keep.add(d.id);
      else warn.push(`Druckdatei ${m.originalName || m.id} nicht in der Ablage`);
    }
    const videoIds = new Set<string>();
    (item.videos ?? []).forEach((v, i) => {
      const d = v.file ? byName.get(v.file) : undefined;
      if (v.file && d?.rolle !== 'video') warn.push(`Video ${v.file} nicht in der Ablage`);
      if (d) keep.add(d.id);
      videoIds.add(v.id);
      run(
        this.db,
        `INSERT INTO artikel_video (id, artikel_id, titel, url, datei_id, sortierung, erstellt_am) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET titel = excluded.titel, url = excluded.url, datei_id = excluded.datei_id, sortierung = excluded.sortierung`,
        v.id,
        item.id,
        v.title ?? '',
        v.url ?? '',
        d?.id ?? null,
        i,
        v.uploadedAt || item.updatedAt,
      );
    });
    for (const r of all(this.db, 'SELECT id FROM artikel_video WHERE artikel_id = ?', item.id)) {
      if (!videoIds.has(str(r.id))) run(this.db, 'DELETE FROM artikel_video WHERE id = ?', r.id);
    }
    this.lastWarnings = warn;
    return this.files.removeRows(files.filter((d) => ['bild', 'druckdatei', 'video'].includes(d.rolle) && !keep.has(d.id)).map((d) => d.id));
  }

  numberExists = (nummer: string) => !!one(this.db, 'SELECT 1 FROM artikel WHERE nummer = ?', nummer);

  /** Video-IDs aller anderen Druckteile (IDs sind global eindeutig; für den Import). */
  videoIdsOfOtherItems(itemId: string) {
    return new Set(all(this.db, 'SELECT id FROM artikel_video WHERE artikel_id <> ?', itemId).map((r) => str(r.id)));
  }

  /** Nur die Zeile löschen (innerhalb einer Transaktion; Dateien räumt der Aufrufer ab). */
  deleteRow(id: string) {
    run(this.db, 'DELETE FROM artikel WHERE id = ?', id);
  }

  async create(entity: Item) {
    const removed = transaction(this.db, () => {
      if (one(this.db, 'SELECT 1 FROM artikel WHERE id = ?', entity.id)) throw conflict('ID bereits vergeben.');
      const number = entity.number || nextNumber(this.db, 'artikel', new Date(entity.createdAt), this.numberExists);
      return this.save({ ...entity, number });
    });
    await this.files.unlink(removed);
    return (await this.findById(entity.id))!;
  }

  async update(id: string, change: (current: Item) => Item) {
    const result = transaction(this.db, () => {
      const current = this.load('WHERE id = ?', id)[0];
      if (!current) return undefined;
      const next = change(structuredClone(current));
      return this.save({ ...next, id, number: current.number, createdAt: next.createdAt || current.createdAt });
    });
    if (!result) return undefined;
    await this.files.unlink(result);
    return this.findById(id);
  }

  /**
   * Mehrere Druckteile in einer Transaktion ändern; `change` liefert `undefined` = nichts zu tun. `danach` läuft im selben
   * Schritt (z. B. Stammdaten schreiben) – wirft etwas, bleibt alles, wie es war. Fehlt ein Druckteil, wirft `fehlt` (sonst
   * wird es übersprungen). Liefert die IDs der geänderten Druckteile.
   */
  async updateMany<T = void>(
    ids: string[],
    change: (current: Item) => Item | undefined,
    opts: { danach?: () => T; fehlt?: (id: string) => Error } = {},
  ): Promise<{ geaendert: string[]; ergebnis: T | undefined }> {
    const { removed, geaendert, ergebnis } = transaction(this.db, () => {
      const removed: Datei[] = [];
      const geaendert: string[] = [];
      for (const id of ids) {
        const current = this.load('WHERE id = ?', id)[0];
        if (!current) {
          if (opts.fehlt) throw opts.fehlt(id);
          continue;
        }
        const next = change(structuredClone(current));
        if (!next) continue;
        removed.push(...this.save({ ...next, id, number: current.number, createdAt: next.createdAt || current.createdAt }));
        geaendert.push(id);
      }
      return { removed, geaendert, ergebnis: opts.danach?.() };
    });
    await this.files.unlink(removed);
    return { geaendert, ergebnis };
  }

  /** Löscht den Artikel samt Farbbereichen, Feldern, Videos und allen Dateien. Anfragen behalten ihren Schnappschuss. */
  async delete(id: string) {
    const item = await this.findById(id);
    if (!item) return undefined;
    const removed = transaction(this.db, () => {
      const files = this.files.removeRowsFor('artikel', id);
      run(this.db, 'DELETE FROM artikel WHERE id = ?', id);
      return files;
    });
    await this.files.unlink(removed);
    return item;
  }
}

