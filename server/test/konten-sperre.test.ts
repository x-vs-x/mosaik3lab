// Konten: E-Mail-Schreibweise und Kontosperre bei gleichzeitigen Fehlversuchen (eigene Datei: eigener Server, damit die Login-Bremse je IP aus
// konten.test.ts hier nicht mitzählt).
import assert from 'node:assert/strict';
import path from 'node:path';
import { after, test } from 'node:test';
import { newId } from '../src/kern/ids';
import { hashPassword } from '../src/kern/auth/password';
import { openDb } from '../src/kern/db';
import { Client, mail, mailConfig, personMitRechten, pw, SCHOOL, sentMails, startServer, TEST_PASSWORT, writeMailFile } from './helfer';

const srv = await startServer({ allowDemoAccounts: true, seedDemoData: true });
after(() => srv.stop());
const admin = new Client(srv.base);
await admin.login(mail('admin'), pw('admin'));
// Alle Konten vorab anlegen: Ist Mailversand eingerichtet, kommt der Link zum Festlegen nur per Mail.
const KONTEN = { parallel: `parallel@${SCHOOL}`, grenze: `parallel.grenze@${SCHOOL}`, abgelaufen: `parallel.abgelaufen@${SCHOOL}` };
for (const email of Object.values(KONTEN)) await personMitRechten(admin, srv.base, email);

const dbFile = path.join(srv.storageDir, 'mosaik3lab.db');
const stand = (email: string) => {
  const db = openDb(dbFile);
  try {
    return db.prepare('SELECT fehlversuche, gesperrt_seit FROM benutzer WHERE email = ?').get(email) as { fehlversuche: number; gesperrt_seit: string | null };
  } finally {
    db.close();
  }
};
const setzeFehlversuche = (email: string, n: number) => {
  const db = openDb(dbFile);
  db.prepare('UPDATE benutzer SET fehlversuche = ?, gesperrt_seit = NULL WHERE email = ?').run(n, email);
  db.close();
};
const parallel = (email: string, n: number) => Promise.all(Array.from({ length: n }, () => new Client(srv.base).login(email, 'falsch-falsch')));

test('Gleichzeitige Fehlversuche zählen alle (nicht nur einmal)', async () => {
  const email = KONTEN.parallel;
  const antworten = await parallel(email, 3);
  assert.deepEqual(antworten.map((a) => a.status), [401, 401, 401]);
  assert.equal(stand(email).fehlversuche, 3);
  assert.equal(stand(email).gesperrt_seit, null);
  // Danach zählt ein einzelner Versuch weiter, das richtige Passwort setzt zurück.
  assert.equal((await new Client(srv.base).login(email, 'falsch-falsch')).status, 401);
  assert.equal(stand(email).fehlversuche, 4);
  assert.equal((await new Client(srv.base).login(email, TEST_PASSWORT)).status, 200);
  assert.equal(stand(email).fehlversuche, 0);
});

test('Gleichzeitige Fehlversuche an der Grenze: genau eine Sperre, genau eine Mail, Sperre bleibt', async () => {
  const email = KONTEN.grenze;
  await writeMailFile(mailConfig, dbFile);
  setzeFehlversuche(email, 8);
  const vorher = sentMails.length;
  const antworten = await parallel(email, 3);
  const status = antworten.map((a) => a.status).sort();
  // Versuch 9 → 401 („Noch 1 Versuch“), Versuch 10 → Sperre (403), der dritte trifft das schon gesperrte Konto (403).
  assert.deepEqual(status, [401, 403, 403]);
  assert.match(antworten.find((a) => a.status === 401)!.json.error, /Noch 1 Versuch/);
  for (const a of antworten.filter((x) => x.status === 403)) assert.match(a.json.error, /gesperrt/);
  // Nur der Versuch, der sperrt (und die Mail verschickt), behauptet „Wir haben eine E-Mail … geschickt“.
  assert.equal(antworten.filter((a) => /Wir haben eine E-Mail/.test(a.json.error ?? '')).length, 1);
  const s = stand(email);
  assert.equal(s.fehlversuche, 10, 'Sperre wird von einem späteren Fehlversuch nicht zurückgesetzt');
  assert.ok(s.gesperrt_seit);
  // Die Sperr-Mail geht noch innerhalb der Anmelde-Anfrage raus – sie ist also schon gezählt.
  assert.equal(sentMails.length - vorher, 1, 'genau eine Mail zum Zurücksetzen');
  const spaeter = await new Client(srv.base).login(email, TEST_PASSWORT);
  assert.equal(spaeter.status, 403, 'auch das richtige Passwort hilft nicht');
  // Spätere Versuche wissen nicht, ob eine Mail ging: neutraler Hinweis, keine Behauptung (F4).
  assert.doesNotMatch(spaeter.json.error, /Wir haben eine E-Mail/);
  assert.match(spaeter.json.error, /Falls Sie eine E-Mail/);
  assert.equal(sentMails.length - vorher, 1, 'spätere Versuche verschicken keine weitere Mail');
});

test('Abgelaufene Sperre: gleichzeitige Fehlversuche beginnen bei 1 und zählen weiter', async () => {
  const email = KONTEN.abgelaufen;
  const db = openDb(dbFile);
  db.prepare('UPDATE benutzer SET fehlversuche = 10, gesperrt_seit = ? WHERE email = ?').run(new Date(Date.now() - 61 * 60_000).toISOString(), email);
  db.close();
  const antworten = await parallel(email, 2);
  assert.deepEqual(antworten.map((a) => a.status), [401, 401]);
  assert.equal(stand(email).fehlversuche, 2);
  assert.equal(stand(email).gesperrt_seit, null);
});

test('Konto mit Großbuchstaben in der E-Mail wird klein gespeichert und kann sich anmelden', async () => {
  const id = newId();
  await srv.storage.users.create({
    id, username: 'gross.schreibung', email: '  Gross.Schreibung@Schule.Example ', displayName: 'Groß', role: 'druckteam',
    passwordHash: await hashPassword('Gross-Passwort-1'), active: true, isDemo: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastLoginAt: null, teamBereiche: [], fehlversuche: 0,
  });
  assert.equal((await srv.storage.users.findById(id))?.email, `gross.schreibung@${SCHOOL}`);
  assert.equal((await srv.storage.users.findByEmail('GROSS.schreibung@schule.example'))?.id, id);
  // Doppelte Adresse in anderer Schreibweise wird erkannt.
  await assert.rejects(
    srv.storage.users.create({ ...(await srv.storage.users.findById(id))!, id: newId(), username: 'gross.zwei', email: 'GROSS.SCHREIBUNG@schule.example' }),
    /bereits zu einem anderen Konto/,
  );
  assert.equal((await new Client(srv.base).login('Gross.Schreibung@schule.example', 'Gross-Passwort-1')).status, 200);
});
