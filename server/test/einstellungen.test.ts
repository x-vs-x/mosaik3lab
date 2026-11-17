// Einstellungen: Bestellformular, Statusabfrage, Mail-Benachrichtigung (Konfiguration aus der Datenbank), Ablagepfade.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';
import { ROOT_DIR } from '../src/config';
import { sendTestMail } from '../src/module/anfragen/anfragen.mail';
import { merkeDomainGesetzt, ORDERFORM_GESETZT } from '../src/module/einstellungen/einstellungen.service';
import { createAdminAccount } from '../src/module/konten/konten.service';
import {
  anmelden, demoTeile, mailConfig, orderBodyFor, realConfigBefore, realConfigNow, SCHOOL, sentMails, setFailMail, sleep, startServer,
  storageAt, tmp, writeMailFile as schreibeMail,
} from './helfer';

const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());
const { anon, teacher, team, admin } = await anmelden(srv.base);
const { publishedItem } = await demoTeile(teacher, team);
const orderBody = orderBodyFor(publishedItem);
const srvDbFile = path.join(srv.storageDir, 'mosaik3lab.db');
const writeMailFile = (content: Record<string, unknown>, dbFile = srvDbFile) => schreibeMail(content, dbFile);
test('Bestellformular: erlaubte Domains speichern und anwenden', async () => {
  assert.equal((await team.req('PUT', '/api/admin/settings/orderform', { allowedEmailDomains: [] })).status, 403);
  const bad = await admin.req('PUT', '/api/admin/settings/orderform', { allowedEmailDomains: ['keine domain'] });
  assert.equal(bad.status, 400);
  const r = await admin.req('PUT', '/api/admin/settings/orderform', { allowedEmailDomains: ['@Example.org', SCHOOL, SCHOOL] });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.orderForm.allowedEmailDomains, ['example.org', SCHOOL]);
  assert.ok(r.json.masterData && r.json.mail, 'Antwort wie GET /api/admin/settings');
  assert.deepEqual((await anon.req('GET', '/api/config')).json.orderForm.allowedEmailDomains, ['example.org', SCHOOL]);
  assert.equal((await anon.req('POST', '/api/orders', { ...orderBody(), requesterEmail: 'gast@example.org' })).status, 201);
  await admin.req('PUT', '/api/admin/settings/orderform', { allowedEmailDomains: [SCHOOL] });
});
test('Schalter Statusabfrage: eingeschaltet liefert Code und Abruf', async () => {
  const on = await admin.req('PUT', '/api/admin/settings/features', { requesterTracking: true });
  assert.equal(on.status, 200);
  assert.equal(on.json.features.requesterTracking, true);
  const r = await anon.req('POST', '/api/orders', orderBody());
  assert.equal(r.status, 201);
  assert.match(r.json.trackingCode, /^[A-Z2-9]{8}$/);
  const code = r.json.trackingCode.toLowerCase();
  const t = await anon.req('POST', '/api/orders/track', { codes: [`${code.slice(0, 4)}-${code.slice(4)}`] });
  assert.equal(t.status, 200);
  assert.equal(t.json[0].id, r.json.id);
  assert.equal(t.json[0].status, 'offen');
  for (const intern of ['requesterEmail', 'requesterId', 'colorId']) assert.equal(t.json[0][intern], undefined, `${intern} bleibt intern`);
  const mine = await teacher.req('GET', '/api/orders/mine');
  assert.ok(mine.json.length > 0 && mine.json.every((o: any) => typeof o.status === 'string' && Array.isArray(o.history)));
  await admin.req('PUT', '/api/admin/settings/features', { requesterTracking: false });
  assert.equal((await anon.req('POST', '/api/orders/track', { codes: [code] })).status, 404);
});
const mailInfo = async () => (await admin.req('GET', '/api/admin/settings')).json.mail;
test('Ohne Mail-Einstellungen: „nicht eingerichtet“, Anfrage geht ohne Mail ein', async () => {
  assert.deepEqual(await mailInfo(), { state: 'missing', recipients: 0, error: '' });
  const before = sentMails.length;
  assert.equal((await anon.req('POST', '/api/orders', orderBody())).status, 201);
  await sleep(150);
  assert.equal(sentMails.length, before);
});
test('Mail-Einstellungen gibt es in der Verwaltung nicht mehr (nur im Server-Manager)', async () => {
  assert.equal((await admin.req('PUT', '/api/admin/settings/mail', { enabled: true })).status, 404);
  assert.equal((await admin.req('POST', '/api/admin/settings/mail/test', {})).status, 404);
  assert.equal((await team.req('GET', '/api/admin/settings')).status, 403);
});
test('Ungültige Mail-Einstellungen: Versand aus, App läuft weiter, Fehler sichtbar', async () => {
  await writeMailFile({ enabled: 'ja' });
  let info = await mailInfo();
  assert.equal(info.state, 'invalid');
  assert.ok(info.error);
  await writeMailFile({ ...mailConfig, recipients: ['team@example.test', 'kaputt'] });
  info = await mailInfo();
  assert.equal(info.state, 'invalid');
  assert.match(info.error, /recipients\.1/);
  await writeMailFile({ ...mailConfig, recipients: [] });
  assert.match((await mailInfo()).error, /Keine Empfängeradresse/);
  await writeMailFile({ ...mailConfig, appBaseUrl: 'ftp://x' });
  assert.equal((await mailInfo()).state, 'invalid');
  const before = sentMails.length;
  assert.equal((await anon.req('POST', '/api/orders', orderBody())).status, 201);
  await sleep(150);
  assert.equal(sentMails.length, before, 'keine Mail bei ungültigen Einstellungen');
});
test('Gültige Mail-Einstellungen wirken ohne Neustart, Zugangsdaten werden nie ausgeliefert', async () => {
  await writeMailFile({ ...mailConfig, enabled: false });
  assert.equal((await mailInfo()).state, 'disabled');
  await writeMailFile(mailConfig);
  const r = await admin.req('GET', '/api/admin/settings');
  assert.deepEqual(r.json.mail, { state: 'active', recipients: 2, error: '' });
  const body = JSON.stringify(r.json);
  assert.ok(!body.includes('Geheim-Passwort-123') && !body.includes('smtp.example.test'));
});
test('Neue Anfrage löst Mail-Benachrichtigung aus (Test-Transport)', async () => {
  const r = await anon.req('POST', '/api/orders', orderBody());
  assert.equal(r.status, 201);
  let status: any = null;
  for (let i = 0; i < 40 && !status?.message?.includes(r.json.number); i++) {
    await sleep(50);
    status = (await admin.req('GET', '/api/admin/settings')).json.mailStatus;
  }
  assert.ok(status, 'mailStatus gesetzt');
  assert.equal(status.ok, true, status.message);
  assert.ok(status.message.includes(r.json.number));
});
test('Testmail für den Server-Manager verwendet genau die angegebene Datenbank', async () => {
  const other = path.join(srv.storageDir, 'mail-entwurf.db');
  await writeMailFile({ ...mailConfig, enabled: false, recipients: ['entwurf@example.test'] }, other);
  assert.equal(await sendTestMail(other), 'Testmail an entwurf@example.test versendet.');
  const m = sentMails.at(-1);
  assert.deepEqual(m.to.map((t: any) => t.address), ['entwurf@example.test']);
  assert.match(m.subject, /^Testnachricht: Neue Anfrage ANF-\d{4}-0000 – 7 × Beispiel-Druckteil \(Test\)$/);
  assert.ok(!m.replyTo, 'Testmail ohne Reply-To an die Beispieladresse');
  assert.ok(m.html.includes('Beispiel-Druckteil') && m.text.includes('funktioniert'));
  assert.equal(await sendTestMail(other, 'jemand@example.test'), 'Testmail an jemand@example.test versendet.');
  await assert.rejects(sendTestMail(path.join(srv.storageDir, 'fehlt.db')));
  await writeMailFile({ enabled: 'ja' }, other);
  await assert.rejects(sendTestMail(other), /Ungültige Mail-Einstellungen/);
});
test('Testmail-Skript: eine Zeile, Exit-Code 1 bei Fehler', async () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['--import', 'tsx', path.join(ROOT_DIR, 'server', 'scripts', 'mail-test.ts'), ...args], {
      cwd: path.join(ROOT_DIR, 'server'),
      encoding: 'utf8',
    });
  const missing = run('--db', path.join(srv.storageDir, 'fehlt.db'));
  assert.equal(missing.status, 1, missing.stderr);
  assert.match(missing.stdout.trim(), /^FEHLER: /);
  assert.equal(run('--db', path.join(srv.storageDir, 'mail-entwurf.db'), '--to', 'kaputt').status, 1);
  assert.equal(run().status, 2);
});
const waitForMail = async (number: string) => {
  for (let i = 0; i < 40; i++) {
    const found = sentMails.find((m) => m.subject.includes(number));
    if (found) return found;
    await sleep(50);
  }
  assert.fail(`Keine Mail zu ${number}`);
};
test('Bestellmail enthält alle Angaben, HTML-escaped, mit Links und ohne Anhänge', async () => {
  const r = await anon.req('POST', '/api/orders', {
    ...orderBody(), quantity: 2, customization: '<script>alert("x")</script>\nZweite Zeile & mehr',
  });
  assert.equal(r.status, 201);
  const m = await waitForMail(r.json.number);
  assert.deepEqual(m.to.map((t: any) => t.address), ['team@example.test', 'leitung@example.test']);
  assert.equal(m.subject, `Neue Anfrage ${r.json.number} – 2 × ${publishedItem.name}`);
  assert.deepEqual(m.replyTo, [{ address: `test.lehrkraft@${SCHOOL}`, name: '' }], 'Antworten gehen an die Lehrkraft');
  for (const part of [r.json.number, `test.lehrkraft@${SCHOOL}`, 'Klasse 1a', publishedItem.name, publishedItem.sizes[0], 'Zweite Zeile & mehr']) {
    assert.ok(m.text.includes(part), `Text enthält ${part}`);
  }
  assert.ok(m.text.includes(`http://localhost:5173/verwaltung/bestellungen?offen=${r.json.id}`));
  assert.ok(m.html.includes(`http://localhost:5173/verwaltung/bestellungen?offen=${r.json.id}`));
  assert.ok(m.html.includes(`http://localhost:5173/verwaltung/hilfsmittel/${publishedItem.id}`));
  assert.ok(m.html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>Zweite Zeile &amp; mehr'));
  assert.ok(!m.html.includes('<script>'), 'keine ungefilterten Eingaben im HTML');
  assert.ok(!m.attachments?.length, 'keine Anhänge');
});
test('Mailfehler verhindert die Anfrage nicht und wird in den Einstellungen angezeigt', async () => {
  setFailMail(true);
  try {
    const r = await anon.req('POST', '/api/orders', orderBody());
    assert.equal(r.status, 201, 'Anfrage trotz Mailfehler angenommen');
    let status: any = null;
    for (let i = 0; i < 40 && !status?.message?.includes(r.json.number); i++) {
      await sleep(50);
      status = (await admin.req('GET', '/api/admin/settings')).json.mailStatus;
    }
    assert.equal(status.ok, false);
    assert.match(status.message, /fehlgeschlagen: Verbindung zum SMTP-Server/);
  } finally {
    setFailMail(false);
  }
});
test('Pfade stehen nicht in den App-Einstellungen (nur im Server-Manager)', async () => {
  const r = await admin.req('GET', '/api/admin/settings');
  assert.equal(r.json.paths, undefined);
  assert.ok(!JSON.stringify(r.json).includes(srv.storageDir), 'kein Serverpfad im Browser');
  assert.equal((await admin.req('PUT', '/api/admin/settings/paths', { ablageDir: srv.storageDir })).status, 404);
});
type TestStorage = Awaited<ReturnType<typeof storageAt>>['storage'];
test('Erster Administrator: erlaubte Domain = Schul-Domain, nur bei einer neuen Installation', async () => {
  const neu = async (fn: (storage: TestStorage) => Promise<void>) => {
    const dir = await tmp('erstdomain');
    const { storage } = await storageAt(dir);
    try {
      await fn(storage);
    } finally {
      await storage.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  };
  const domains = async (storage: TestStorage) => (await storage.settings.get()).orderForm.allowedEmailDomains;
  const pw = 'Langes-Passwort-1';
  // Neue Installation ohne Angabe: Domain der Admin-Adresse; ein weiterer Admin ändert nichts mehr
  await neu(async (storage) => {
    await createAdminAccount(storage, { email: 'Chefin@Meine-Schule.de', name: 'Chefin', password: pw });
    assert.deepEqual(await domains(storage), ['meine-schule.de']);
    await createAdminAccount(storage, { email: 'zwei@anderswo.example', name: 'Zweite', password: pw, schulDomain: 'anderswo.example' });
    assert.deepEqual(await domains(storage), ['meine-schule.de']);
  });
  // Abweichende Schul-Domain aus dem Willkommen-Dialog („Nein“ → eigenes Feld); ungültig → kein Konto
  await neu(async (storage) => {
    await assert.rejects(() => createAdminAccount(storage, { email: 'a@privat.example', name: 'Ada', password: pw, schulDomain: 'keine domain' }), /Ungültige Domain/);
    assert.equal(await storage.users.findByEmail('a@privat.example'), undefined);
    await createAdminAccount(storage, { email: 'a@privat.example', name: 'Ada', password: pw, schulDomain: '@Schule.Example' });
    assert.deepEqual(await domains(storage), ['schule.example']);
  });
  // Bereits gespeicherte Anfrage-Einstellungen (Verwaltung → Einstellungen) bleiben – auch wenn sie dem Standard gleichen
  await neu(async (storage) => {
    merkeDomainGesetzt(storage);
    const vorher = await domains(storage);
    await createAdminAccount(storage, { email: 'a@neu.example', name: 'Ada', password: pw });
    assert.deepEqual(await domains(storage), vorher);
  });
  // Bestehende Installation mit eigener Domain (älterer Stand ohne Markierung) bleibt ebenfalls unverändert
  await neu(async (storage) => {
    await storage.settings.update((s) => ({ ...s, orderForm: { allowedEmailDomains: ['eigene.example'] } }));
    await createAdminAccount(storage, { email: 'a@neu.example', name: 'Ada', password: pw });
    assert.deepEqual(await domains(storage), ['eigene.example']);
  });
});
test('Speichern der Anfrage-Einstellungen setzt die Markierung (Ersteinrichtung überschreibt danach nichts)', async () => {
  assert.equal((await admin.req('PUT', '/api/admin/settings/orderform', { allowedEmailDomains: [SCHOOL] })).status, 200);
  const db = new DatabaseSync(srvDbFile, { readOnly: true });
  try {
    assert.ok(db.prepare('SELECT 1 FROM einstellung WHERE schluessel = ?').get(ORDERFORM_GESETZT));
  } finally {
    db.close();
  }
});
test('Echte Pfad-Konfiguration der Projektwurzel bleibt unverändert', async () => {
  const now = realConfigNow();
  assert.equal(now, realConfigBefore);
});
