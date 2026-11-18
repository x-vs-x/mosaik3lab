// Migration: ältere Daten (JSON-Zeit, alte Mail-/Status-/Konto-Formate) werden beim Start verlustfrei ergänzt.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { ORDERFORM_VORGABE_BIS_1_6 } from '../src/domain/settings';
import { readMailConfig } from '../src/kern/mail/mailConfig';
import { getBereich, getBetrieb } from '../src/kern/betrieb';
import { openDb } from '../src/kern/db';
import { mail, mailConfig, SCHOOL, writeMailFile } from './helfer';
test('Alte Anfragen (ohne E-Mail/Filament, alter Status) werden beim Start ergänzt', async () => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-migration-'));
  const dataDir = path.join(storageDir, 'data');
  await fs.mkdir(dataDir, { recursive: true });
  const legacy = {
    id: 'alt-1', number: 'M3L-2025-0001', itemId: 'x', itemName: 'Altes Druckteil', quantity: 1, color: 'Türkis',
    size: 'S', classOrTeam: '3b', customization: '', status: 'fertig',
    history: [{ status: 'eingegangen', at: '2025-01-01T00:00:00.000Z', byUserId: '', byName: 'Frau Alt', comment: '' }],
    requesterId: null, requesterName: 'Frau Alt', trackingCode: 'ABCDEFGH', isDemo: false,
    createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
  };
  await fs.writeFile(path.join(dataDir, 'orders.json'), JSON.stringify([legacy]));
  const config = loadConfig({ storageDir, rootDir: storageDir, logRequests: false, seedDemoData: false, clientDistDir: path.join(storageDir, 'none') });
  const instance = await createApp(config);
  try {
    const [o] = await instance.storage.orders.list();
    assert.equal(o.status, 'gedruckt');
    assert.equal(o.history[0].status, 'offen');
    assert.equal(o.requesterEmail, '');
    assert.equal(o.colorId, '');
    assert.equal(o.colorHex, '');
    assert.equal(o.color, 'Türkis');
    assert.deepEqual(o.colorChoices, [], 'ohne Filament-ID keine Bereichsfarbe');
    assert.deepEqual(o.personalization, []);
  } finally {
    await instance.close();
    await fs.rm(storageDir, { recursive: true, force: true });
  }
});

test('Alte Druckteile und Anfragen erhalten Farbbereich, Preis, Felder und Videos', async () => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-migration-'));
  const dataDir = path.join(storageDir, 'data');
  await fs.mkdir(dataDir, { recursive: true });
  const oldItem = {
    id: 'item-alt', name: 'Altes Teil', shortDescription: 'Kurzbeschreibung alt', description: '', category: 'Sonstiges',
    useAreas: [], sizes: ['S'], colors: ['bambu-pla-basic-red'], material: 'PLA', materialInfo: '', printTimeMinutes: 10,
    safetyNotes: [], images: [], modelFiles: [], published: true, isDemo: false,
    createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
  };
  const oldOrder = {
    id: 'o-alt', number: 'M3L-2025-0002', itemId: 'item-alt', itemName: 'Altes Teil', quantity: 1,
    color: 'Red · Bambu Lab PLA Basic', colorId: 'bambu-pla-basic-red', colorHex: '#C12E1F', size: 'S', classOrTeam: '1a',
    customization: 'bitte rund', status: 'offen', history: [], requesterId: null, requesterEmail: `a@${SCHOOL}`,
    requesterName: `a@${SCHOOL}`, trackingCode: 'ABCDEFGH', isDemo: false,
    createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
  };
  await fs.writeFile(path.join(dataDir, 'items.json'), JSON.stringify([oldItem]));
  await fs.writeFile(path.join(dataDir, 'orders.json'), JSON.stringify([oldOrder]));
  const config = loadConfig({ storageDir, rootDir: storageDir, logRequests: false, seedDemoData: false, clientDistDir: path.join(storageDir, 'none') });
  const instance = await createApp(config);
  try {
    const [i] = await instance.storage.items.list();
    assert.deepEqual(i.colorAreas, [{ id: 'farbe', name: 'Farbe', alleFarben: false, colors: ['bambu-pla-basic-red'] }]);
    assert.equal(i.price, '');
    assert.deepEqual(i.customFields, []);
    assert.deepEqual(i.videos, []);
    assert.deepEqual(i.colors, oldItem.colors, 'bisherige Farben bleiben');
    const [o] = await instance.storage.orders.list();
    assert.equal(o.colorChoices.length, 1);
    assert.equal(o.colorChoices[0].colorId, 'bambu-pla-basic-red');
    assert.equal(o.customization, 'bitte rund', 'nichts geht verloren');
    assert.deepEqual(o.personalization, []);
  } finally {
    await instance.close();
    await fs.rm(storageDir, { recursive: true, force: true });
  }
});

test('Alte Mail-Einstellungen aus settings.json werden in die Datenbank übernommen (mit Sicherung)', async () => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-migration-'));
  const dataDir = path.join(storageDir, 'data');
  await fs.mkdir(dataDir, { recursive: true });
  const oldMail = {
    enabled: true, host: 'smtp.schule.test', port: 465, secure: true, user: 'druck', password: 'Altes-Passwort-1',
    from: 'Mosaik³LAB <3d@schule.test>', notifyTo: 'team@schule.test; leitung@schule.test', appUrl: 'http://10.0.0.26:5173/',
  };
  const mailStatus = { at: '2026-01-01T00:00:00.000Z', ok: true, message: 'alt' };
  await fs.writeFile(path.join(dataDir, 'settings.json'), JSON.stringify({ mail: oldMail, mailStatus, features: { requesterTracking: true } }));
  const config = loadConfig({ storageDir, rootDir: storageDir, logRequests: false, seedDemoData: false, clientDistDir: path.join(storageDir, 'none') });
  const instance = await createApp(config);
  try {
    const mail = getBereich(instance.storage.sqlite.db, 'mail');
    assert.deepEqual(mail, {
      enabled: true,
      smtp: { host: 'smtp.schule.test', port: 465, secure: true, user: 'druck', pass: 'Altes-Passwort-1' },
      from: 'Mosaik³LAB <3d@schule.test>',
      recipients: ['team@schule.test', 'leitung@schule.test'],
      appBaseUrl: 'http://10.0.0.26:5173',
    });
    const settingsText = await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8');
    assert.ok(!settingsText.includes('Altes-Passwort-1'), 'Passwort aus settings.json entfernt');
    const s = await instance.storage.settings.get();
    assert.equal(s.features.requesterTracking, true, 'übrige Einstellungen bleiben');
    assert.deepEqual(s.mailStatus, mailStatus);
    const backups = (await fs.readdir(dataDir)).filter((f) => f.startsWith('settings.json.vor-mail-umzug-'));
    assert.equal(backups.length, 1);
    assert.ok((await fs.readFile(path.join(dataDir, backups[0]), 'utf8')).includes('Altes-Passwort-1'), 'Sicherung vollständig');
  } finally {
    await instance.close();
  }
  // Zweiter Start: nichts mehr zu tun, keine weitere Sicherung.
  const again = await createApp(config);
  await again.close();
  assert.equal((await fs.readdir(dataDir)).filter((f) => f.startsWith('settings.json.vor-mail-umzug-')).length, 1);
  await fs.rm(storageDir, { recursive: true, force: true });
});
test('Alte Dateien mail.json und .session-secret werden einmalig in die Datenbank übernommen (Dateien als .bak)', async () => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-migration-'));
  await fs.mkdir(path.join(storageDir, 'config'), { recursive: true });
  await fs.mkdir(path.join(storageDir, 'data'), { recursive: true });
  const oldSecret = 'a'.repeat(64);
  await fs.writeFile(path.join(storageDir, 'config', 'mail.json'), JSON.stringify(mailConfig));
  await fs.writeFile(path.join(storageDir, 'data', '.session-secret'), oldSecret);
  const config = loadConfig({ storageDir, rootDir: storageDir, logRequests: false, seedDemoData: false, clientDistDir: path.join(storageDir, 'none') });
  const first = await createApp(config);
  try {
    const db = first.storage.sqlite.db;
    assert.equal(getBetrieb(db, 'betrieb', 'sessionSecret'), oldSecret, 'bisheriges Geheimnis übernommen (Sitzungen bleiben gültig)');
    const mail = getBereich(db, 'mail');
    assert.equal((mail.smtp as any).pass, 'Geheim-Passwort-123');
    const gelesen = readMailConfig(db);
    assert.equal(gelesen.state, 'ok');
    assert.deepEqual(gelesen.state === 'ok' && gelesen.config.recipients, ['team@example.test', 'leitung@example.test'], 'Leser entfernt Dubletten');
    const names = [...(await fs.readdir(path.join(storageDir, 'config'))), ...(await fs.readdir(path.join(storageDir, 'data')))];
    assert.ok(names.some((n) => /^mail\.json\.vor-datenbank-.*\.bak$/.test(n)) && !names.includes('mail.json'));
    assert.ok(names.some((n) => /^\.session-secret\.vor-datenbank-.*\.bak$/.test(n)) && !names.includes('.session-secret'));
  } finally {
    await first.close();
  }
  // Zweiter Start: dasselbe Geheimnis, keine neue Datei
  const second = await createApp(config);
  try {
    assert.equal(getBetrieb(second.storage.sqlite.db, 'betrieb', 'sessionSecret'), oldSecret);
  } finally {
    await second.close();
    await fs.rm(storageDir, { recursive: true, force: true });
  }
});
test('Ohne alte Datei erzeugt die App ein zufälliges Session-Geheimnis in der Datenbank (nicht als Datei)', async () => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-migration-'));
  const config = loadConfig({ storageDir, rootDir: storageDir, logRequests: false, seedDemoData: false, clientDistDir: path.join(storageDir, 'none') });
  const inst = await createApp(config);
  try {
    const secret = getBetrieb(inst.storage.sqlite.db, 'betrieb', 'sessionSecret');
    assert.ok(typeof secret === 'string' && secret.length >= 64);
    assert.ok(!existsSync(path.join(storageDir, 'data', '.session-secret')));
  } finally {
    await inst.close();
    await fs.rm(storageDir, { recursive: true, force: true });
  }
});
test('Vorhandene Mail-Einstellungen in der Datenbank werden bei der Übernahme nicht überschrieben', async () => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-migration-'));
  const dataDir = path.join(storageDir, 'data');
  await fs.mkdir(path.join(storageDir, 'config'), { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  const existing = { enabled: false, smtp: { host: 'neu', port: 587, secure: false }, from: '', recipients: [], appBaseUrl: '' };
  await writeMailFile(existing, path.join(storageDir, 'mosaik3lab.db'));
  await fs.writeFile(path.join(dataDir, 'settings.json'), JSON.stringify({ mail: { host: 'alt', password: 'x-alt' } }));
  const config = loadConfig({ storageDir, rootDir: storageDir, logRequests: false, seedDemoData: false, clientDistDir: path.join(storageDir, 'none') });
  const instance = await createApp(config);
  try {
    assert.deepEqual(getBereich(instance.storage.sqlite.db, 'mail'), existing);
    assert.ok(!(await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8')).includes('x-alt'));
  } finally {
    await instance.close();
    await fs.rm(storageDir, { recursive: true, force: true });
  }
});
test('Ältere Konten ohne E-Mail erhalten eine Adresse, Lehrkraft-Konten werden bekannte Lehrkraft', async () => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-migration-'));
  const dataDir = path.join(storageDir, 'data');
  await fs.mkdir(dataDir, { recursive: true });
  const old = (id: string, username: string, role: string, isDemo: boolean) => ({
    id, username, displayName: username, role, passwordHash: 'x', active: true, isDemo,
    createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', lastLoginAt: null,
  });
  const users = [old('u1', 'admin', 'admin', true), old('u2', 'lehrkraft', 'lehrkraft', true), old('u3', 'frau.mueller', 'druckteam', false)];
  await fs.writeFile(path.join(dataDir, 'users.json'), JSON.stringify(users));
  const config = loadConfig({ storageDir, rootDir: storageDir, logRequests: false, seedDemoData: true, clientDistDir: path.join(storageDir, 'none') });
  const instance = await createApp(config);
  try {
    const list = await instance.storage.users.list();
    assert.equal(list.length, 3, 'kein Konto geht verloren');
    const byName = Object.fromEntries(list.map((u) => [u.username, u]));
    assert.equal(byName.admin.email, mail('admin'));
    assert.equal(byName.lehrkraft.email, `demo.lehrkraft@${SCHOOL}`);
    // Alter JSON-Stand ohne settings.json: es gilt die damalige Vorgabe der erlaubten Domain (Update-Sicherheit)
    assert.equal(byName['frau.mueller'].email, `frau.mueller@${ORDERFORM_VORGABE_BIS_1_6.allowedEmailDomains[0]}`);
    assert.equal(byName.admin.passwordHash, 'x', 'übrige Felder bleiben');
    assert.ok(await instance.storage.requesters.findByEmail(`demo.lehrkraft@${SCHOOL}`), 'Lehrkraft ist bekannt');
  } finally {
    await instance.close();
    await fs.rm(storageDir, { recursive: true, force: true });
  }
});

test('Frei angelegte Status werden auf feste Status abgebildet, Anfragen behalten ihren Stand', async () => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-migration-'));
  const dataDir = path.join(storageDir, 'data');
  await fs.mkdir(dataDir, { recursive: true });
  const settings = {
    masterData: {
      orderStatuses: [
        { id: 'offen', name: 'Offen', phase: 'open', color: 'orange' },
        { id: 'wird_gedruckt', name: 'Wird gedruckt', phase: 'active', color: 'blau' },
        { id: 'abholbereit_2', name: 'Abholbereit', phase: 'done', color: 'lila' },
        { id: 'gedruckt', name: 'Gedruckt', phase: 'done', color: 'gruen' },
      ],
      filaments: [{ id: 'f1', brand: 'X', line: 'PLA', colorName: 'Rot', hex: '#FF0000' }],
    },
  };
  const order = (id: string, status: string) => ({
    id, number: `M3L-2025-000${id}`, itemId: 'x', itemName: 'Alt', quantity: 1, color: 'Rot', colorId: 'f1', colorHex: '#FF0000',
    size: 'S', classOrTeam: '3b', customization: '', status,
    history: [{ status: 'offen', at: '2025-01-01T00:00:00.000Z', byUserId: '', byName: 'x', comment: '' }, { status, at: '2025-01-02T00:00:00.000Z', byUserId: '', byName: 'x', comment: '' }],
    requesterId: null, requesterEmail: '', requesterName: 'x', trackingCode: 'ABCDEFGH', isDemo: false,
    createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-02T00:00:00.000Z',
  });
  await fs.writeFile(path.join(dataDir, 'settings.json'), JSON.stringify(settings));
  await fs.writeFile(path.join(dataDir, 'orders.json'), JSON.stringify([order('1', 'wird_gedruckt'), order('2', 'abholbereit_2'), order('3', 'gedruckt')]));
  const config = loadConfig({ storageDir, rootDir: storageDir, logRequests: false, seedDemoData: false, clientDistDir: path.join(storageDir, 'none') });
  const instance = await createApp(config);
  try {
    const list = await instance.storage.orders.list();
    assert.deepEqual(list.map((o) => o.status).sort(), ['abholbereit', 'gedruckt', 'in_druck']);
    assert.ok(list.every((o) => o.history.length === 2), 'Verlauf bleibt vollständig');
    const s = await instance.storage.settings.get();
    const active = s.masterData.orderStatuses.filter((x) => x.active).map((x) => x.id);
    assert.deepEqual(active, ['offen', 'in_druck', 'gedruckt', 'abholbereit']);
    assert.equal(s.masterData.filaments[0].available, true, 'ältere Farbrollen gelten als verfügbar');
    const db = openDb(config.dbFile, { readOnly: true });
    const saved = db.prepare('SELECT id FROM statusart WHERE aktiv = 1 ORDER BY sortierung').all().map((r) => r.id);
    db.close();
    assert.deepEqual(saved, active, 'Schalter sind in der Datenbank gespeichert');
    assert.ok((await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8')).includes('wird_gedruckt'), 'settings.json bleibt unverändert als Sicherung');
  } finally {
    await instance.close();
    await fs.rm(storageDir, { recursive: true, force: true });
  }
});

test('Datenbank aus einer neueren Version (z. B. zurückgespielte Sicherung): App startet nicht, klare Meldung', async () => {
  const { migrate } = await import('../src/kern/db');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-neuer-'));
  const db = openDb(path.join(dir, 'test.db'));
  try {
    const eins = [{ version: 1, name: '001_a', sql: 'CREATE TABLE a (x INTEGER)' }];
    const zwei = [...eins, { version: 2, name: '002_b', sql: 'CREATE TABLE b (x INTEGER)' }];
    migrate(db, { migrations: zwei, log: () => {} }); // „neuere Version“ hat Stand 2 eingespielt
    assert.throws(() => migrate(db, { migrations: eins, log: () => {} }), /neueren Version von Mosaik³LAB \(Datenbank-Stand 2, dieses Programm kennt 1\)/);
    assert.deepEqual(migrate(db, { migrations: zwei, log: () => {} }), { from: 2, to: 2 }, 'gleiche Version startet normal');
  } finally {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
