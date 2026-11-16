// Sicherungen über Versionen hinweg: ältere Sicherungen dürfen in eine neuere Version zurück (die App bringt die Datenbank
// beim Start auf den neuen Stand), neuere nicht in eine ältere – und ein unbekanntes, neueres Sicherungsformat wird klar
// abgelehnt, bevor etwas verändert wird. Testdaten unter C:\Entwicklung\_testdaten\server-manager\ (werden gelöscht).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const TESTROOT = path.resolve(ROOT, '..', '_testdaten', 'server-manager');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'bkver-')));
fs.writeFileSync(path.join(tmp, 'mosaik3lab.json'), JSON.stringify({ dataDir: path.join(tmp, 'daten'), managerPort: 5198 }));
process.env.MANAGER_CONFIG = path.join(tmp, 'mosaik3lab.json');
process.env.MOSAIK3LAB_QUIET = '1';
const bk = await import('../lib/backup.mjs');
const { releaseSchemaVersion } = await import('../lib/schema.mjs');

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('Neuere Sicherung in älterer Version wird abgelehnt, ältere und gleiche sind erlaubt', () => {
  const mine = releaseSchemaVersion(ROOT);
  assert.ok(mine > 0, 'Schema der Arbeitskopie bekannt');
  assert.doesNotThrow(() => bk.refuseNewerBackup({ schemaVersion: mine, app: { version: '1.0.0' } }, ROOT), 'gleicher Stand');
  assert.doesNotThrow(() => bk.refuseNewerBackup({ schemaVersion: mine - 3, app: { version: '0.1.0' } }, ROOT), 'ältere Sicherung');
  assert.doesNotThrow(() => bk.refuseNewerBackup({}, ROOT), 'sehr alte Sicherung ohne Angaben');
  assert.throws(() => bk.refuseNewerBackup({ schemaVersion: mine + 1, app: { version: '9.9.0' } }, ROOT), /Diese Sicherung stammt von Version 9\.9\.0 und ist neuer als die installierte Version .*Es wurde nichts verändert/);
});

test('Sicherungsdatei mit neuerem Format: klare Meldung statt falsch lesen', async () => {
  const file = path.join(tmp, 'neu.m3lbackup');
  const header = Buffer.from(JSON.stringify({ format: 2, kind: 'komplett', app: { version: '3.0.0' } }), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(header.length);
  fs.writeFileSync(file, Buffer.concat([Buffer.from('M3LBAK1\n', 'latin1'), len, header, Buffer.from('irgendwas')]));
  await assert.rejects(() => bk.openBackup(file, { stagingBase: tmp }), /neueren Version von Mosaik³LAB \(3\.0\.0\).*Es wurde nichts verändert/);
});
