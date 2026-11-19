// Härtung der Anmeldung (lib/auth.mjs) und der Mail-Einstellungen (lib/mail.mjs) – reine Logik im selben Prozess:
// kein Server, keine Dienste, kein Mailversand. Testdaten unter C:\Entwicklung\_testdaten\server-manager\ (werden gelöscht).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { einrichten } from './helpers/einrichtung.mjs';

const MANAGER = path.resolve(import.meta.dirname, '..');
const TESTROOT = path.resolve(MANAGER, '..', '..', '_testdaten', 'server-manager');
const tmp = (fs.mkdirSync(TESTROOT, { recursive: true }), fs.mkdtempSync(path.join(TESTROOT, 'anmeldung-')));
const storage = path.join(tmp, 'storage');
process.env.MANAGER_CONFIG = path.join(tmp, 'mosaik3lab.json');
process.env.MOSAIK3LAB_QUIET = '1';
process.env.DISABLE_DEMO_ACCOUNTS = 'true';
einrichten(process.env.MANAGER_CONFIG, { paths: { dataDir: storage, backupDir: path.join(tmp, 'backups'), logDir: path.join(tmp, 'logs') } });

const PW = 'Admin-Test-2026';
{
  // Benutzer wie in der App (Tabelle „benutzer“, bcrypt) – mit dem bcryptjs der App
  const bcrypt = createRequire(path.join(MANAGER, '..', 'server', 'package.json'))('bcryptjs');
  const db = new DatabaseSync(path.join(storage, 'mosaik3lab.db'));
  db.exec('CREATE TABLE benutzer (id TEXT PRIMARY KEY, email TEXT, passwort_hash TEXT, rolle TEXT, aktiv INTEGER, ist_demo INTEGER)');
  db.prepare('INSERT INTO benutzer VALUES (?, ?, ?, ?, ?, ?)').run('1', 'chef@schule.example', bcrypt.hashSync(PW, 4), 'admin', 1, 0);
  db.close();
}
const auth = await import('../lib/auth.mjs');
const mail = await import('../lib/mail.mjs');

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('Anmeldung: viele Versuche gleichzeitig umgehen die Sperre nicht (höchstens 5 Prüfungen, dann gesperrt)', async () => {
  const res = { setHeader() {} };
  // zweimal gleichzeitig mit richtigem Passwort (Doppelklick) geht
  assert.deepEqual(await Promise.all([auth.login('chef@schule.example', PW, res), auth.login('chef@schule.example', PW, res)]), [{ ok: true }, { ok: true }]);
  // 12 falsche Versuche auf einmal: nur 5 werden überhaupt geprüft (früher alle 12, weil erst nach der Prüfung gezählt wurde)
  const status = await Promise.all(Array.from({ length: 12 }, (_, i) => auth.login('chef@schule.example', `falsch-${i}`, res).then(() => 200, (err) => err.status)));
  assert.equal(status.filter((s) => s === 401).length, 5, status.join(' '));
  assert.equal(status.filter((s) => s === 429).length, 7, status.join(' '));
  // 5 Fehlversuche → 60 s gesperrt, auch mit richtigem Passwort
  await assert.rejects(auth.login('chef@schule.example', PW, res), (err) => err.status === 429 && /warten/.test(err.message));
});

test('Mail: Absender ohne Steuerzeichen, Empfänger als Liste werden geprüft statt einen internen Fehler auszulösen', () => {
  const basis = { host: 'smtp.schule.example', from: 'Mosaik³LAB <lab@schule.example>', recipients: ['werkstatt@schule.example'] };
  assert.equal(mail.saveMail(basis).from, 'Mosaik³LAB <lab@schule.example>');
  // Zeilenumbruch im Namen = zweite Kopfzeile der Mail (z. B. heimliche Kopie) → abgelehnt
  assert.throws(() => mail.saveMail({ ...basis, from: 'Lab\r\nBcc: fremd@example.org <lab@schule.example>' }), /Absender ungültig/);
  assert.throws(() => mail.saveMail({ ...basis, from: 'Lab\u0000 <lab@schule.example>' }), /Absender ungültig/);
  assert.throws(() => mail.saveMail({ ...basis, recipients: [42, null] }), /Empfänger ungültig: 42/);
  assert.throws(() => mail.saveMail({ ...basis, host: 'smtp.schule.example; rm -rf' }), /SMTP-Server/);
  assert.throws(() => mail.saveMail({ ...basis, port: 70000 }), /SMTP-Port/);
});

test('Testmail: technische Meldungen des Mailservers werden verständlich erklärt, das Original bleibt dabei stehen', () => {
  const faelle = [
    ['getaddrinfo ENOTFOUND smtp.falsch.example', /^Der Mailserver wurde nicht gefunden/],
    ['connect ECONNREFUSED 10.0.0.5:587', /nimmt auf diesem Port keine Verbindung an/],
    ['Invalid login: 535-5.7.8 Username and Password not accepted', /lehnt Benutzer oder Passwort ab/],
    ['C0A8:error:0A00010B:SSL routines:ssl3_get_record:wrong version number', /Verschlüsselung passt nicht zum Port/],
    ['Greeting never received', /antwortet nicht/],
    ['Connection timeout', /antwortet nicht/],
    ['self-signed certificate in certificate chain', /Zertifikat des Mailservers/],
    ["Mail command failed: 550 5.7.60 SMTP; Client does not have permissions to send as this sender", /lehnt Absender oder Empfänger ab/],
  ];
  for (const [roh, erwartet] of faelle) {
    const text = mail.erklaereMailFehler(roh);
    assert.match(text, erwartet, roh);
    assert.ok(text.endsWith(`(Meldung: ${roh})`), `Original bleibt für die IT stehen: ${text}`);
  }
  // Meldungen der App (schon deutsch) und Unbekanntes bleiben unverändert
  for (const t of ['Es sind noch keine Mail-Einstellungen gespeichert.', 'Etwas ganz anderes']) assert.equal(mail.erklaereMailFehler(t), t);

  assert.deepEqual(mail.testMailResult(0, 'OK: Testmail an a@schule.example versendet.'), { ok: true, message: 'Testmail an a@schule.example versendet.' });
  const fehler = mail.testMailResult(1, 'FEHLER: connect ECONNREFUSED 10.0.0.5:25');
  assert.equal(fehler.ok, false);
  assert.match(fehler.message, /Port prüfen/);
  // Skript nach einer Minute beendet oder gar nicht gestartet: keine Ergebniszeile → Klartext statt „Kein Ergebnis (Code 1)“
  for (const zeile of ['', 'Error: Cannot find module tsx']) {
    const r = mail.testMailResult(1, zeile);
    assert.equal(r.ok, false);
    assert.match(r.message, /ließ sich nicht verschicken/);
  }
});
