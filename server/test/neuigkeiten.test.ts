// „Was ist neu“: Administratoren sehen nach einem Update einmal die Neuerungen aus CHANGELOG.md.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { getBetrieb } from '../src/kern/betrieb';
import { openDb } from '../src/kern/db';
import { leseChangelog } from '../src/module/neuigkeiten/neuigkeiten.service';
import { anmelden, mail, personMitRechten, pw, Client, tmp } from './helfer';

const CHANGELOG = `# Änderungen

## [Unveröffentlicht]

- **Noch nicht fertig:** erscheint nie.

## [1.10.0] – 2026-12-20

- **Zweistellig:** 1.10.0 ist neuer als 1.9.0.

## [1.3.0] – 2026-12-01

Mehrere Neuerungen.

- **Farben:** neu sortiert.

## [1.2.0] – 2026-11-25

- **Suche:** schneller.

## [1.1.0] – 2026-11-20

- **Was ist neu:** dieses Fenster.

## [1.0.0] – 2026-11-15

Erste Version.
`;

/** App in einem festen Ordner starten (Neustart = Update auf `appVersion`); CHANGELOG.md liegt im selben Ordner. */
async function starte(dir: string, appVersion: string) {
  const config = loadConfig({ storageDir: dir, rootDir: dir, logRequests: false, clientDistDir: path.join(dir, 'none'), appVersion });
  const instance = await createApp(config);
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    async stop() {
      await new Promise((r) => server.close(r));
      await instance.close();
    },
  };
}

async function adminNeuigkeiten(base: string) {
  const admin = new Client(base);
  await admin.login(mail('admin'), pw('admin'));
  return { admin, r: await admin.req('GET', '/api/neuigkeiten') };
}

test('Changelog: Versionen und Datum werden gelesen, „Unveröffentlicht“ fällt weg', () => {
  const a = leseChangelog(CHANGELOG);
  assert.deepEqual(a.map((x) => x.version), ['1.10.0', '1.3.0', '1.2.0', '1.1.0', '1.0.0']);
  assert.equal(a[1].datum, '2026-12-01');
  assert.equal(a[1].text, 'Mehrere Neuerungen.\n\n- **Farben:** neu sortiert.');
});

test('Neuinstallation: nichts anzeigen', async () => {
  const dir = await tmp('neu-install');
  await fs.writeFile(path.join(dir, 'CHANGELOG.md'), CHANGELOG);
  const s = await starte(dir, '1.1.0');
  try {
    const { r } = await adminNeuigkeiten(s.base);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { anzeigen: false, version: '1.1.0', abschnitte: [] });
  } finally {
    await s.stop();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Update 1.0.0 → 1.1.0 (alte Datenbank ohne gespeicherte Version), gelesen, nächstes Update', async () => {
  const dir = await tmp('neu-update');
  await fs.writeFile(path.join(dir, 'CHANGELOG.md'), CHANGELOG);
  try {
    // Stand 1.0.0: Daten vorhanden, aber noch keine Version gespeichert.
    let s = await starte(dir, '1.0.0');
    await s.stop();
    const db = openDb(path.join(dir, 'mosaik3lab.db'));
    db.exec("DELETE FROM betrieb_einstellung WHERE schluessel LIKE 'version.%'");
    db.close();

    s = await starte(dir, '1.1.0');
    let { admin, r } = await adminNeuigkeiten(s.base);
    assert.equal(r.json.anzeigen, true);
    assert.equal(r.json.version, '1.1.0');
    assert.deepEqual(r.json.abschnitte, [{ version: '1.1.0', datum: '2026-11-20', text: '- **Was ist neu:** dieses Fenster.' }]);

    // Druck-Team und Lehrkräfte: nie.
    const { team, teacher, anon } = await anmelden(s.base);
    assert.equal((await team.req('GET', '/api/neuigkeiten')).status, 403);
    assert.equal((await teacher.req('GET', '/api/neuigkeiten')).status, 403);
    assert.equal((await team.req('POST', '/api/neuigkeiten/gelesen')).status, 403);
    assert.equal((await anon.req('GET', '/api/neuigkeiten')).status, 401);
    // Ohne Schutzheader (CSRF) kein „gelesen“.
    assert.equal((await admin.req('POST', '/api/neuigkeiten/gelesen', undefined, { csrf: false })).status, 403);

    assert.deepEqual((await admin.req('POST', '/api/neuigkeiten/gelesen')).json, { ok: true });
    assert.equal((await admin.req('GET', '/api/neuigkeiten')).json.anzeigen, false);
    await s.stop();

    // Neustart ohne neue Version: bleibt gelesen.
    s = await starte(dir, '1.1.0');
    ({ admin, r } = await adminNeuigkeiten(s.base));
    assert.equal(r.json.anzeigen, false);
    await s.stop();

    // Nächstes Update: nur das Neue seit der gelesenen Version.
    s = await starte(dir, '1.2.0');
    ({ admin, r } = await adminNeuigkeiten(s.base));
    assert.deepEqual(r.json.abschnitte.map((a: { version: string }) => a.version), ['1.2.0']);
    await s.stop();
    const db2 = openDb(path.join(dir, 'mosaik3lab.db'));
    assert.equal(getBetrieb(db2, 'betrieb', 'version.vorherige'), '1.1.0');
    assert.equal(getBetrieb(db2, 'betrieb', 'version.aktuell'), '1.2.0');
    db2.close();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Mehrere Versionen übersprungen: alle Abschnitte, neueste zuerst; numerischer Vergleich', async () => {
  const dir = await tmp('neu-sprung');
  await fs.writeFile(path.join(dir, 'CHANGELOG.md'), CHANGELOG);
  try {
    let s = await starte(dir, '1.0.0');
    await s.stop();
    s = await starte(dir, '1.3.0');
    const { admin, r } = await adminNeuigkeiten(s.base);
    assert.deepEqual(r.json.abschnitte.map((a: { version: string }) => a.version), ['1.3.0', '1.2.0', '1.1.0']);
    // Ein zweiter Administrator, der noch nichts gelesen hat, sieht dasselbe – unabhängig vom ersten.
    const zweiter = await personMitRechten(admin, s.base, 'zweite.admin@mosaikschule-lu.de', [], 'admin');
    await admin.req('POST', '/api/neuigkeiten/gelesen');
    assert.equal((await zweiter.c.req('GET', '/api/neuigkeiten')).json.abschnitte.length, 3);
    await s.stop();

    s = await starte(dir, '1.10.0');
    const n = await adminNeuigkeiten(s.base);
    assert.deepEqual(n.r.json.abschnitte.map((a: { version: string }) => a.version), ['1.10.0']);
    await s.stop();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Fehlende CHANGELOG.md: nichts anzeigen, kein Fehler', async () => {
  const dir = await tmp('neu-ohne');
  try {
    let s = await starte(dir, '1.0.0');
    await s.stop();
    s = await starte(dir, '1.1.0');
    const { r } = await adminNeuigkeiten(s.base);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { anzeigen: false, version: '1.1.0', abschnitte: [] });
    await s.stop();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
