// Zurückgestellte Originale (Endprobe vor 1.8.1, Funde F1 und F2): Ein Bild, dessen Vorschaubild in der Schonfrist nach
// einer Migration oder während Import/Sicherung entstand, holt die Bildpflege danach nach – auch wenn es nur „zu schwer“
// ist (≤ 2000 px, aber über 1,5 MB, z. B. ein PNG-Foto). Schon geprüfte Bilder werden dabei nicht noch einmal dekodiert,
// und ein Start-Lauf, der einen Wimpernschlag vor dem Ende der Schonfrist beginnt, lässt kein Bild aus.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { austauschLaeuft, BildDienst, Bildpflege, SICHERUNG_MARKER, vorschauRel } from '../src/kern/bilder';
import { ORIGINAL_ZU_GROSS_BYTES } from '../src/kern/bilder/groessen';
import type { Datei } from '../src/kern/files';
import { lockContent } from '../src/kern/lock';
import { sha, sleep, storageAt, tmp } from './helfer';

/** Rauschen wie bei einem Foto (fest, ohne Zufall): als PNG groß, als JPG deutlich kleiner. */
function foto(breite: number, hoehe: number, hub = 80) {
  const d = Buffer.alloc(breite * hoehe * 4, 255);
  let z = 12345;
  for (let i = 0; i < d.length; i++) {
    if (i % 4 === 3) continue;
    z = (z * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (255 - hub) / 2 + ((z >> 16) % hub);
  }
  return d;
}
/** PNG-Foto 1000 × 800: rund 2 MB, also „zu schwer“, aber nicht größer als 2000 px. */
function schweresPng() {
  const p = new PNG({ width: 1000, height: 800 });
  p.data = foto(1000, 800);
  return PNG.sync.write(p);
}
/** JPG 2000 × 1600 in schlechter Qualität: über 1,5 MB, neu gespeichert (Qualität 85) wäre es größer → bleibt („keine 20 %“). */
const schweresJpg = () => Buffer.from(jpeg.encode({ data: foto(2000, 1600, 250), width: 2000, height: 1600 }, 60).data);
/** JPG 2600 × 1300 (größer als 2000 px), klein in Bytes. */
function grossesJpg() {
  const [b, h] = [2600, 1300];
  const d = Buffer.alloc(b * h * 4, 255);
  for (let i = 0; i < d.length; i += 4) d[i] = (i / 4) % b < b / 2 ? 230 : 20;
  return Buffer.from(jpeg.encode({ data: d, width: b, height: h }, 90).data);
}

const FRISTENDE = Date.parse('2026-11-19T10:15:00Z');

/** Speicher ohne HTTP mit einem Druckteil „a1“; Bild-Dienst mit gestellter Uhr (`uhr.jetzt`), Schonfrist bis FRISTENDE. */
async function speicher(name: string, start = FRISTENDE - 10 * 60_000) {
  const dir = await tmp(name);
  const { storage } = await storageAt(dir);
  storage.sqlite.db.prepare("INSERT INTO artikel (id, nummer, name, erstellt_am, geaendert_am) VALUES ('a1', 'T-1', 'Test', '2026-01-01', '2026-01-01')").run();
  const uhr = { jetzt: start };
  const dienst = new BildDienst(storage.files, storage.bilder.rechner, { originaleAb: FRISTENDE, jetzt: () => uhr.jetzt });
  const warnungen: string[] = [];
  const pflege = new Bildpflege(storage.files, dienst, { pauseMs: 0, warteMs: 20, nachSchonfristMs: 10, log: () => undefined, warn: (t) => warnungen.push(t) });
  // Zählt, wie oft ein Bild wirklich in den Rechen-Thread geht (also dekodiert wird)
  const rechner = storage.bilder.rechner;
  const echt = rechner.rechne.bind(rechner);
  const gerechnet: { original: boolean }[] = [];
  let nachAuftrag: (() => void) | undefined;
  rechner.rechne = (auftrag, prio) => {
    gerechnet.push({ original: auftrag.original });
    const p = echt(auftrag, prio);
    nachAuftrag?.();
    return p;
  };
  return {
    storage,
    uhr,
    dienst,
    pflege,
    warnungen,
    gerechnet,
    /** Läuft einmal, nachdem der nächste Auftrag an den Rechen-Thread gegangen ist. */
    nachDemNaechstenAuftrag(f: () => void) {
      nachAuftrag = () => {
        nachAuftrag = undefined;
        f();
      };
    },
    speichern: (buffer: Buffer, ext: string) => storage.files.save({ objekttyp: 'artikel', objektId: 'a1', rolle: 'bild', buffer, ext, originalname: `foto.${ext}` }),
    vorschau: (id: string, g: 'karte' | 'mini') => path.join(storage.files.root, ...vorschauRel(g, id).split('/')),
    zeile: (id: string) => ({ ...(storage.sqlite.db.prepare('SELECT pfad, mime, groesse, sha256 FROM datei WHERE id = ?').get(id) as { pfad: string; mime: string; groesse: number; sha256: string }) }),
    async weg() {
      await pflege.beenden();
      await storage.close();
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
type Speicher = Awaited<ReturnType<typeof speicher>>;

/** Als JPG neu gespeichert: Datei-Zeile, Datei und Prüfsumme passen zusammen, das PNG ist weg, keine Zwischendatei bleibt. */
async function pruefeNeuGespeichert(s: Speicher, vorher: Datei) {
  const z = s.zeile(vorher.id);
  assert.match(z.pfad, /\.jpg$/, 'PNG → JPG');
  assert.equal(z.mime, 'image/jpeg');
  const datei = path.join(s.storage.files.root, ...z.pfad.split('/'));
  assert.ok(existsSync(datei), 'neue Datei liegt in der Ablage');
  assert.equal((await fs.stat(datei)).size, z.groesse, 'Größe der Zeile = Größe der Datei');
  assert.equal(await sha(datei), z.sha256, 'Prüfsumme der Zeile = Prüfsumme der Datei');
  assert.ok(z.groesse <= vorher.groesse * 0.8, `mindestens 20 % kleiner (${vorher.groesse} → ${z.groesse})`);
  assert.ok(!existsSync(s.storage.files.absPath(vorher)), 'altes PNG entfernt');
  const alle = await fs.readdir(s.storage.files.root, { recursive: true });
  assert.deepEqual(alle.filter((f) => f.endsWith('.neu')), [], 'keine Zwischendatei');
  assert.equal(await s.dienst.erledigt(s.storage.files.find(vorher.id)!), true, 'danach erledigt');
}

test('F1: Schweres PNG (≤ 2000 px), Vorschaubild in der Schonfrist erzeugt → nach der Frist speichert die Bildpflege es als JPG', async () => {
  const s = await speicher('f1-schonfrist');
  try {
    const d = await s.speichern(schweresPng(), 'png');
    assert.ok(d.groesse > ORIGINAL_ZU_GROSS_BYTES, `Testbild ist zu schwer (${d.groesse})`);

    // In der Schonfrist öffnet jemand den Katalog: Vorschaubild sofort, Original bleibt Byte für Byte
    const karte = await s.dienst.vorschau(d, 'karte', 30_000);
    assert.ok(karte && existsSync(karte) && existsSync(s.vorschau(d.id, 'mini')), 'Vorschaubilder sofort');
    assert.equal(await sha(s.storage.files.absPath(d)), d.sha256, 'Original unverändert');
    assert.deepEqual(s.zeile(d.id), { pfad: d.pfad, mime: 'image/png', groesse: d.groesse, sha256: d.sha256 });
    assert.equal(await s.dienst.erledigt(d), false, 'zurückgestellt ist nicht erledigt');

    // Bildpflege noch in der Schonfrist (nachgereichtes Bild): ersetzt nichts
    await s.pflege.alle();
    assert.equal(s.pflege.letzterBericht?.verkleinert, 0);
    assert.equal(s.zeile(d.id).sha256, d.sha256);

    // Nach der Schonfrist: der Start-Lauf holt es nach
    s.uhr.jetzt = FRISTENDE;
    await s.pflege.alle();
    assert.deepEqual([s.pflege.letzterBericht?.geprueft, s.pflege.letzterBericht?.verkleinert], [1, 1], 'nach der Schonfrist neu gespeichert');
    await pruefeNeuGespeichert(s, d);

    // Nächster Lauf (z. B. nach einem Neustart): nichts mehr zu rechnen
    const bisher = s.gerechnet.length;
    await s.pflege.alle();
    assert.equal(s.gerechnet.length, bisher, 'kein weiterer Auftrag an den Rechen-Thread');
    assert.deepEqual(s.warnungen, []);
  } finally {
    await s.weg();
  }
});

test('Schon geprüftes Bild („keine 20 %“) wird nicht bei jedem Lauf erneut dekodiert – auch ein schweres mit ≤ 2000 px', async () => {
  const s = await speicher('geprueft', FRISTENDE);
  try {
    const schwer = await s.speichern(schweresJpg(), 'jpg');
    assert.ok(schwer.groesse > ORIGINAL_ZU_GROSS_BYTES, `Testbild ist zu schwer (${schwer.groesse})`);
    const leicht = await s.speichern(Buffer.from(jpeg.encode({ data: foto(300, 200), width: 300, height: 200 }, 80).data), 'jpg');

    await s.pflege.alle();
    assert.deepEqual([s.pflege.letzterBericht?.geprueft, s.pflege.letzterBericht?.verkleinert, s.pflege.letzterBericht?.vorschau], [2, 0, 4]);
    assert.deepEqual(s.gerechnet, [{ original: true }, { original: true }], 'beide einmal gerechnet, Verkleinern versucht');
    assert.equal(await sha(s.storage.files.absPath(schwer)), schwer.sha256, 'bringt keine 20 % → Original bleibt');
    assert.equal(await s.dienst.erledigt(schwer), true);
    assert.equal(await s.dienst.erledigt(leicht), true);

    for (let lauf = 2; lauf <= 4; lauf++) {
      await s.pflege.alle();
      assert.equal(s.pflege.letzterBericht?.geprueft, 2);
      assert.equal(s.gerechnet.length, 2, `Lauf ${lauf}: nichts erneut dekodiert`);
    }
    assert.deepEqual(s.warnungen, []);
  } finally {
    await s.weg();
  }
});

test('F1 bei Import und Sicherung: schweres PNG wird während der Sperre zurückgestellt und danach von der Bildpflege neu gespeichert', async () => {
  const s = await speicher('f1-sperre', FRISTENDE);
  const marker = path.join(s.storage.files.root, SICHERUNG_MARKER);
  try {
    // Import bzw. Export läuft, ein Bild wird hochgeladen (Verarbeitung „sofort“)
    const beimImport = await s.speichern(schweresPng(), 'png');
    const importFertig = austauschLaeuft();
    let r = await s.dienst.verarbeite(beimImport, 'sofort');
    importFertig();
    assert.deepEqual([r.verkleinert, r.vorschauNeu], [undefined, 2], 'nur Vorschaubilder');
    assert.equal(s.zeile(beimImport.id).sha256, beimImport.sha256);
    assert.equal(await s.dienst.erledigt(beimImport), false, 'steht noch aus');
    assert.equal(r.zurueckgestellt, true);

    // Sicherung des Server-Managers läuft, ein Vorschaubild wird abgerufen
    const beiSicherung = await s.speichern(anderesPng(), 'png');
    await fs.writeFile(marker, lockContent(process.ppid));
    assert.ok(await s.dienst.vorschau(beiSicherung, 'mini', 30_000));
    await fs.rm(marker);
    assert.equal(s.zeile(beiSicherung.id).sha256, beiSicherung.sha256);
    assert.equal(await s.dienst.erledigt(beiSicherung), false, 'steht noch aus');

    // Danach: Start-Lauf bzw. nachgereichte Bilder
    await s.pflege.nachholen([beimImport.id]);
    assert.equal(s.pflege.letzterBericht?.verkleinert, 1, 'nach dem Import neu gespeichert');
    await pruefeNeuGespeichert(s, beimImport);
    await s.pflege.alle();
    assert.deepEqual([s.pflege.letzterBericht?.geprueft, s.pflege.letzterBericht?.verkleinert], [2, 1], 'nach der Sicherung neu gespeichert');
    await pruefeNeuGespeichert(s, beiSicherung);
    r = await s.dienst.verarbeite(s.storage.files.find(beiSicherung.id)!, 'sofort');
    assert.equal(r.zurueckgestellt, false);
    assert.deepEqual(s.warnungen, []);
  } finally {
    await fs.rm(marker, { force: true });
    await s.weg();
  }
});

/** Zweites schweres PNG mit anderem Inhalt (andere Maße). */
function anderesPng() {
  const p = new PNG({ width: 900, height: 900 });
  p.data = foto(900, 900);
  return PNG.sync.write(p);
}

test('F2: Feuert der Timer des Start-Laufs kurz vor dem Ende der Schonfrist, wartet der Lauf den Rest ab – kein Bild wird zurückgestellt', async () => {
  const s = await speicher('f2-timer', FRISTENDE - 5); // 5 ms vor dem Ende, die gestellte Uhr bleibt stehen
  try {
    const d = await s.speichern(grossesJpg(), 'jpg');
    assert.equal(await s.pflege.planeStart(0), 5, 'geplant auf das Ende der Schonfrist');
    await sleep(120); // der Timer hat längst gefeuert – nach der (stehenden) Uhr läuft die Schonfrist aber noch
    assert.deepEqual(s.gerechnet, [], 'Lauf hat noch nicht begonnen');
    const bericht = () => s.pflege.letzterBericht; // als Funktion: ändert sich im Hintergrund
    assert.equal(bericht(), undefined);

    s.uhr.jetzt = FRISTENDE; // jetzt ist sie vorbei: der verschobene Lauf beginnt von selbst
    for (let i = 0; i < 300 && !bericht(); i++) await sleep(50);
    assert.deepEqual([bericht()?.geprueft, bericht()?.verkleinert], [1, 1], 'gleich im ersten Lauf verkleinert');
    assert.deepEqual(s.gerechnet, [{ original: true }], 'genau einmal gerechnet');
    assert.notEqual(s.zeile(d.id).sha256, d.sha256);
    assert.deepEqual(s.warnungen, []);
  } finally {
    await s.weg();
  }
});

test('F2: Endet die Schonfrist, während das erste Bild gerechnet wird, kommt es im selben Lauf noch einmal dran', async () => {
  const s = await speicher('f2-bild', FRISTENDE - 5);
  try {
    const erstes = await s.speichern(grossesJpg(), 'jpg');
    const zweites = await s.speichern(schweresPng(), 'png');
    s.nachDemNaechstenAuftrag(() => (s.uhr.jetzt = FRISTENDE)); // der erste Auftrag ging noch „ohne Original“ hinaus
    await s.pflege.alle();
    assert.deepEqual(s.gerechnet, [{ original: false }, { original: true }, { original: true }], 'erstes Bild zweimal, zweites einmal');
    assert.deepEqual([s.pflege.letzterBericht?.geprueft, s.pflege.letzterBericht?.verkleinert], [2, 2], 'kein Bild ausgelassen');
    assert.notEqual(s.zeile(erstes.id).sha256, erstes.sha256);
    await pruefeNeuGespeichert(s, zweites);

    // Solange die Schonfrist läuft, wird nichts wiederholt (keine Schleife)
    const spaet = await s.speichern(anderesPng(), 'png');
    s.uhr.jetzt = FRISTENDE - 60_000;
    const bisher = s.gerechnet.length;
    await s.pflege.nachholen([spaet.id]);
    assert.equal(s.gerechnet.length, bisher + 1, 'in der Schonfrist genau ein Auftrag');
    assert.equal(s.zeile(spaet.id).sha256, spaet.sha256);
    assert.deepEqual(s.warnungen, []);
  } finally {
    await s.weg();
  }
});
