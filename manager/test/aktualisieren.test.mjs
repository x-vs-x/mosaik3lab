// Updates per Knopfdruck: Paketquelle (nur freigegebene Versionen für dieses System), Sperre gegen doppeltes Starten und
// der Update-Helfer mit seinen Sicherheiten (Prüfsumme, keine älteren Versionen, Abbruch nach Zeit, Rückfall, Notfall
// nach unterbrochenem Update). Alles mit Attrappen – nichts wird wirklich installiert.
// Testdaten unter C:\Entwicklung\_testdaten\server-manager\ (werden gelöscht).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TESTROOT = path.resolve(import.meta.dirname, '..', '..', '..', '_testdaten', 'server-manager');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'aktual-')));
fs.writeFileSync(path.join(tmp, 'mosaik3lab.json'), JSON.stringify({ dataDir: path.join(tmp, 'daten'), managerPort: 5197 }));
process.env.MANAGER_CONFIG = path.join(tmp, 'mosaik3lab.json');
process.env.MOSAIK3LAB_QUIET = '1';
const { newerVersions, systemPaket } = await import('../lib/paketquelle.mjs');
const { einrichtungSperren } = await import('../lib/sperre.mjs');
const { durchlauf } = await import('../lib/aktualisieren.mjs');

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const rel = (v, { prerelease = false, draft = false, systeme = ['windows-x64.zip', 'linux-x64.tar.gz', 'linux-arm64.tar.gz'], sums = true } = {}) => ({
  tag_name: `v${v}`, prerelease, draft, published_at: '2026-11-20T10:00:00Z', body: `Neu in ${v}`,
  assets: [...systeme.map((s) => ({ name: `Mosaik3LAB-Installer-${v}-${s}`, browser_download_url: `https://x/${v}/${s}`, size: 100 })), ...(sums ? [{ name: 'SHA256SUMS.txt', browser_download_url: `https://x/${v}/sums` }] : [])],
});

test('Paketquelle: nur freigegebene, neuere Versionen mit Paket für dieses System und Prüfsumme – älteste zuerst', () => {
  assert.equal(systemPaket('win32', 'x64'), 'windows-x64.zip');
  assert.equal(systemPaket('linux', 'arm64'), 'linux-arm64.tar.gz');
  assert.equal(systemPaket('darwin', 'arm64'), null, 'kein Paket → kein Update angeboten');
  const list = [rel('1.3.0'), rel('1.0.0'), rel('1.2.0', { prerelease: true }), rel('1.1.0'), rel('1.4.0', { draft: true }), rel('1.5.0', { systeme: ['windows-x64.zip'] }), rel('1.6.0', { sums: false }), { tag_name: 'installer-pakete', assets: [] }];
  const r = newerVersions(list, '1.0.0', 'linux-arm64.tar.gz');
  assert.deepEqual(r.versions.map((v) => v.version), ['1.1.0', '1.3.0'], 'ohne Vorab, Entwurf, fremdes System, ohne Prüfsumme, ohne ältere/gleiche');
  assert.equal(r.latest.version, '1.3.0');
  assert.equal(r.latest.asset.name, 'Mosaik3LAB-Installer-1.3.0-linux-arm64.tar.gz');
  assert.deepEqual(newerVersions(list, '1.3.0', 'linux-arm64.tar.gz').versions, [], 'aktuell');
  assert.equal(newerVersions(list, '1.0.0', 'windows-x64.zip').latest.version, '1.5.0');
});

test('Sperre: Einrichtung läuft nie doppelt; verwaiste Sperre wird übernommen', () => {
  const root = path.join(tmp, 'programm');
  const frei = einrichtungSperren(root, 'Installation');
  assert.throws(() => einrichtungSperren(root, 'Update-Helfer'), /Die Einrichtung läuft bereits \(Installation, seit .* Uhr\)\. Bitte warten/);
  frei();
  einrichtungSperren(root, 'Update-Helfer')();
  fs.writeFileSync(path.join(root, '.einrichtung.lock'), JSON.stringify({ pid: 999999, wer: 'abgestürzt', seit: new Date().toISOString() }));
  einrichtungSperren(root, 'Installation')(); // Prozess lebt nicht mehr → übernommen
});

/** Attrappe für den Update-Helfer; overrides ersetzen einzelne Bausteine. */
function ctx(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(tmp, 'upd-'));
  let version = '1.1.0';
  const calls = [];
  const c = {
    dir,
    sicherDir: `${dir}-geschuetzt`,
    statusFile: `${dir}-status.json`, // wie im Programmordner: nur der Helfer schreibt
    installed: () => ({ id: `${version}-abc`, version }),
    official: async () => 'a'.repeat(64),
    sha256: async () => 'a'.repeat(64),
    extract: async (file, dest) => (fs.mkdirSync(dest, { recursive: true }), dest),
    runSetup: async (_dir, onLine) => {
      onLine('✔ program: umgeschaltet');
      version = '1.2.0';
      return { code: 0, timedOut: false };
    },
    healthy: async () => true,
    recover: async () => (calls.push('recover'), 'Die bisherige Version 1.1.0 läuft wieder.'),
    schemaNow: async () => 7,
    log: () => {},
    ...overrides,
  };
  return { c, dir, calls, auftrag: (a) => fs.writeFileSync(path.join(dir, 'auftrag.json'), JSON.stringify(a)), paket: (n = 'Mosaik3LAB-Installer-1.2.0-windows-x64.zip') => (fs.writeFileSync(path.join(dir, n), 'x'), n) };
}

test('Update-Helfer: geprüftes Paket wird installiert, Auftrag und Paket danach weg', async () => {
  const t = ctx();
  t.auftrag({ version: '1.2.0', file: t.paket() });
  const s = await durchlauf(t.c);
  assert.equal(s.phase, 'fertig', s.meldung);
  assert.match(s.meldung, /Version 1\.2\.0 ist installiert und läuft/);
  assert.equal(s.von, '1.1.0');
  assert.ok(!fs.existsSync(path.join(t.dir, 'auftrag.json')));
  assert.ok(!fs.readdirSync(t.dir).some((f) => f.startsWith('Mosaik3LAB-Installer-')), 'Paket aufgeräumt');
  assert.equal((await durchlauf(t.c)).phase, 'fertig', 'zweiter Start ohne Auftrag: nichts tun');
});

test('Update-Helfer lehnt ab, ohne etwas zu verändern: falsche Prüfsumme, ältere/gleiche Version, Paket außerhalb', async () => {
  let setup = 0;
  const runSetup = async () => (setup++, { code: 0 });
  const a = ctx({ sha256: async () => 'b'.repeat(64), runSetup });
  a.auftrag({ version: '1.2.0', file: a.paket() });
  assert.match((await durchlauf(a.c)).meldung, /stimmt nicht mit der offiziellen Veröffentlichung überein – es wurde nichts verändert/);
  const b = ctx({ runSetup });
  b.auftrag({ version: '1.0.0', file: b.paket('Mosaik3LAB-Installer-1.0.0-windows-x64.zip') });
  assert.match((await durchlauf(b.c)).meldung, /Älteres Paket abgelehnt/);
  const g = ctx({ runSetup });
  g.auftrag({ version: '1.1.0', file: g.paket('Mosaik3LAB-Installer-1.1.0-windows-x64.zip') });
  assert.match((await durchlauf(g.c)).meldung, /bereits installiert/);
  const c = ctx({ runSetup });
  c.auftrag({ version: '1.2.0', file: '../../geheim.zip' });
  assert.match((await durchlauf(c.c)).meldung, /Update-Paket fehlt/);
  assert.equal(setup, 0, 'nie installiert');
});

test('Update-Helfer: Installation schlägt fehl → bisherige Version läuft wieder (selbst zurückgesetzt, falls nötig)', async () => {
  // Paket-Setup meldet Fehler und hat selbst zurückgeschaltet – App antwortet
  const a = ctx({ runSetup: async () => ({ code: 1, timedOut: false }), healthy: async (ms) => ms !== 120_000 });
  a.auftrag({ version: '1.2.0', file: a.paket() });
  const sa = await durchlauf(a.c);
  assert.equal(sa.phase, 'zurueckgesetzt');
  assert.match(sa.meldung, /hat nicht geklappt\. Die bisherige Version 1\.1\.0 läuft wieder, Ihre Daten sind unverändert/);
  assert.deepEqual(a.calls, [], 'kein eigener Eingriff nötig');
  // App antwortet gar nicht mehr → Helfer setzt selbst zurück
  const b = ctx({ runSetup: async () => ({ code: 1, timedOut: false }), healthy: async () => false });
  b.auftrag({ version: '1.2.0', file: b.paket() });
  assert.equal((await durchlauf(b.c)).phase, 'zurueckgesetzt');
  assert.deepEqual(b.calls, ['recover']);
  // hängt zu lange → abgebrochen und zurückgesetzt
  const c = ctx({ runSetup: async () => ({ code: null, timedOut: true }) });
  c.auftrag({ version: '1.2.0', file: c.paket() });
  const sc = await durchlauf(c.c);
  assert.match(sc.meldung, /zu lange gedauert und wurde abgebrochen/);
  assert.deepEqual(c.calls, ['recover']);
});

test('Notfall beim Hochfahren: unterbrochenes Update erkannt – läuft die App nicht, zurück auf die bisherige Version', async () => {
  const a = ctx({ healthy: async () => false });
  fs.writeFileSync(a.c.statusFile, JSON.stringify({ phase: 'läuft', version: '1.2.0', von: '1.1.0', previous: '1.1.0-abc' }));
  const s = await durchlauf(a.c);
  assert.equal(s.phase, 'zurueckgesetzt');
  assert.match(s.meldung, /Das Update auf Version 1\.2\.0 wurde unterbrochen\. Die bisherige Version 1\.1\.0 läuft wieder/);
  // läuft die App schon mit der neuen Version, wird nur der Status abgeschlossen
  const b = ctx({ installed: () => ({ id: '1.2.0-def', version: '1.2.0' }) });
  fs.writeFileSync(b.c.statusFile, JSON.stringify({ phase: 'läuft', version: '1.2.0', von: '1.1.0', previous: '1.1.0-abc' }));
  assert.equal((await durchlauf(b.c)).phase, 'fertig');
  assert.deepEqual(b.calls, []);
  // läuft die App noch mit der bisherigen Version: nichts tun, ehrlich melden
  const d = ctx();
  fs.writeFileSync(d.c.statusFile, JSON.stringify({ phase: 'läuft', version: '1.2.0', von: '1.1.0', previous: '1.1.0-abc' }));
  const sd = await durchlauf(d.c);
  assert.equal(sd.phase, 'zurueckgesetzt');
  assert.match(sd.meldung, /läuft weiter/);
  assert.deepEqual(d.calls, []);
});

test('Update-Helfer: Paket lässt sich nicht entpacken → verständliche Meldung, keine Reste', async () => {
  const t = ctx({
    extract: async (_file, dest) => {
      fs.mkdirSync(dest, { recursive: true });
      throw Object.assign(new Error('Das Update-Paket ist beschädigt oder unvollständig – es wurde nichts verändert.'), { friendly: true });
    },
  });
  t.auftrag({ version: '1.2.0', file: t.paket() });
  const s = await durchlauf(t.c);
  assert.equal(s.phase, 'fehler');
  assert.match(s.meldung, /^Das Update auf Version 1\.2\.0 ist fehlgeschlagen\. Das Update-Paket ist beschädigt oder unvollständig – es wurde nichts verändert\. Die bisherige Version läuft weiter\.$/);
  assert.deepEqual(fs.readdirSync(t.dir), [], 'Auftrag, Paket und entpackter Ordner weg (Status liegt im geschützten Ordner)');
  // technischer Fehler: kein Technik-Text für Admins
  const u = ctx({ runSetup: async () => { throw new Error('EACCES: permission denied, open /opt/mosaik3lab'); } });
  u.auftrag({ version: '1.2.0', file: u.paket() });
  const su = await durchlauf(u.c);
  assert.ok(!su.meldung.includes('EACCES'), su.meldung);
  assert.match(su.hint, /Protokoll „Update-Helfer“/);
});

test('Sicherheit: geprüft und installiert wird nur die Kopie im geschützten Ordner – Austausch im updates-Ordner wirkt nicht', async () => {
  const gesehen = {};
  const t = ctx({
    sha256: async (f) => ((gesehen.sha = f), 'a'.repeat(64)),
    extract: async (f, dest) => {
      gesehen.extract = f;
      gesehen.dest = dest;
      // Angreifer tauscht nach der Prüfung die Datei im (für den Manager beschreibbaren) updates-Ordner aus
      fs.writeFileSync(path.join(t.dir, 'Mosaik3LAB-Installer-1.2.0-windows-x64.zip'), 'boese');
      fs.mkdirSync(dest, { recursive: true });
      gesehen.inhalt = fs.readFileSync(f, 'utf8');
      return dest;
    },
  });
  t.auftrag({ version: '1.2.0', file: t.paket() });
  const s = await durchlauf(t.c);
  assert.equal(s.phase, 'fertig', s.meldung);
  for (const k of ['sha', 'extract', 'dest']) assert.ok(gesehen[k].startsWith(t.c.sicherDir), `${k} im geschützten Ordner: ${gesehen[k]}`);
  assert.equal(gesehen.inhalt, 'x', 'entpackt wird die geprüfte Kopie, nicht die ausgetauschte Datei');
  assert.ok(!fs.existsSync(t.c.sicherDir), 'geschützter Ordner danach aufgeräumt');
});

test('Sicherheit: Status nur im geschützten Ordner – ein gefälschter Status im updates-Ordner löst keinen Rückfall aus', async () => {
  const t = ctx({ healthy: async () => false });
  // Manager (übernommen) schreibt einen „unterbrochenen“ Lauf mit älterem Rückfall-Ziel in seinen eigenen Ordner
  fs.writeFileSync(path.join(t.dir, 'status.json'), JSON.stringify({ phase: 'läuft', version: '9.9.9', previous: '0.1.0-alt' }));
  const s = await durchlauf(t.c);
  assert.equal(s, null, 'nichts zu tun');
  assert.deepEqual(t.calls, [], 'kein Rückfall');
});

test('Ungültige Versionsnummer im Auftrag wird nirgends ungeprüft verwendet', async () => {
  const geloggt = [];
  const t = ctx({ log: (x) => geloggt.push(x) });
  t.auftrag({ version: '1.2.0\nrm -rf /', file: t.paket() });
  const s = await durchlauf(t.c);
  assert.equal(s.phase, 'fehler');
  assert.equal(s.version, null);
  assert.match(s.meldung, /Ungültiger Update-Auftrag/);
  assert.ok(!JSON.stringify(s).includes('rm -rf'), 'nichts davon im Status');
});

test('Zurücksetzen scheitert → klare Meldung statt Abbruch (Helfer bleibt nie mittendrin stehen)', async () => {
  const t = ctx({ runSetup: async () => ({ code: 1, timedOut: false }), healthy: async () => false, recover: async () => { throw new Error('Platte voll'); } });
  t.auftrag({ version: '1.2.0', file: t.paket() });
  const s = await durchlauf(t.c);
  assert.equal(s.phase, 'zurueckgesetzt');
  assert.match(s.meldung, /nicht vollständig gelungen – bitte die IT benachrichtigen/);
});

test('Setup meldet Fehler, aber die neue Version läuft doch → „fertig“ statt falschem „zurückgesetzt“', async () => {
  let installiert = '1.1.0';
  const t = ctx({
    installed: () => ({ id: `${installiert}-abc`, version: installiert }),
    runSetup: async () => ((installiert = '1.2.0'), { code: 1, timedOut: false }),
    healthy: async (ms) => ms !== 120_000, // erst langsam, dann da
  });
  t.auftrag({ version: '1.2.0', file: t.paket() });
  const s = await durchlauf(t.c);
  assert.equal(s.phase, 'fertig', s.meldung);
});

test('Sperre aus der Zeit vor dem letzten Hochfahren gilt als verwaist (Prozessnummer evtl. neu vergeben)', () => {
  const root = path.join(tmp, 'programm-boot');
  fs.mkdirSync(root, { recursive: true });
  const vorHochfahren = new Date(Date.now() - os.uptime() * 1000 - 60_000).toISOString();
  fs.writeFileSync(path.join(root, '.einrichtung.lock'), JSON.stringify({ pid: process.pid, wer: 'vor Neustart', seit: vorHochfahren }));
  einrichtungSperren(root, 'Update-Helfer')(); // lebende PID (diese hier), aber aus der Zeit vor dem Hochfahren → übernommen
});
