// Sicherung von einem anderen Betriebssystem einspielen: Ordner aus der Datenbank, die dort nicht gelten
// (Windows-Pfade unter Linux, Linux-Pfade unter Windows), werden nicht benutzt – es gelten die Standardordner dieses Rechners.
// Läuft lokal unter Windows und auf GitHub unter Linux, prüft also beide Richtungen.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fremderPfad, configFromDb, checkDir } from '../lib/config.mjs';
import { writeBereich, dbFileOf } from '../lib/settingsdb.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mosaik3lab-fremde-pfade-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('Pfade erkennen: was auf diesem System gilt und was von einem anderen stammt', () => {
  for (const p of ['C:\\Mosaik3LAB\\ablage', 'D:/Daten/ablage', '\\\\server\\freigabe\\ablage']) {
    assert.equal(fremderPfad(p, 'win32'), false, `${p} gilt unter Windows`);
    assert.equal(fremderPfad(p, 'linux'), true, `${p} stammt unter Linux von Windows`);
  }
  for (const p of ['/var/lib/mosaik3lab/ablage', '/srv/mosaik3lab']) {
    assert.equal(fremderPfad(p, 'linux'), false, `${p} gilt unter Linux`);
    assert.equal(fremderPfad(p, 'win32'), true, `${p} stammt unter Windows von Linux`);
  }
  assert.equal(fremderPfad('', 'linux'), false, 'leer = Standard');
});

test('Datenbank aus einer Sicherung des anderen Systems: fremde Ordner fallen auf die Standardordner zurück', () => {
  const dataDir = path.join(tmp, 'daten');
  fs.mkdirSync(dataDir, { recursive: true });
  const fremd = process.platform === 'win32'
    ? { ablage: '/var/lib/mosaik3lab/ablage', backup: '/var/backups/mosaik3lab', log: '/var/log/mosaik3lab' }
    : { ablage: 'C:\\Mosaik3LAB\\ablage', backup: 'C:\\Mosaik3LAB\\backups', log: 'C:\\Mosaik3LAB\\logs' };
  writeBereich(dbFileOf(dataDir), 'betrieb', { 'paths.ablageDir': fremd.ablage, 'paths.backupDir': fremd.backup, 'paths.logDir': fremd.log, 'app.port': 3001 });
  const cfg = configFromDb(dataDir);
  assert.deepEqual([cfg.paths.ablageDir, cfg.paths.backupDir, cfg.paths.logDir], ['', '', ''], 'Standardordner statt fremder Pfade');
  // eigene Pfade dieses Systems bleiben
  const eigen = path.join(tmp, 'eigene-ablage');
  writeBereich(dbFileOf(dataDir), 'betrieb', { 'paths.ablageDir': eigen });
  assert.equal(configFromDb(dataDir).paths.ablageDir, eigen);
});

test('Eingabe eines Ordners vom anderen System wird mit klarer Meldung abgelehnt', () => {
  const fremd = process.platform === 'win32' ? '/var/backups/mosaik3lab' : 'C:\\Mosaik3LAB\\backups';
  assert.throws(() => checkDir(fremd, 'Backup-Ziel'), /vollständigen Pfad/);
});
