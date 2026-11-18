// Hinweis „Link nur im Schulnetz“: Erkennung aus der App-Adresse, Einstellung im Server-Manager, Wirkung in allen Mails.
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { ROOT_DIR } from '../src/config';
import { openDb } from '../src/kern/db';
import { erkenneErreichbarkeit, linksNurImSchulnetz, pruefeLinks, type Erreichbarkeit } from '../src/kern/mail/erreichbarkeit';
import { HTTPS_EMPFOHLEN, waehleNetzAdresse } from '../../manager/lib/erreichbarkeit.mjs';
import { readMailConfig, writeMailConfig } from '../src/kern/mail/mailConfig';
import { SCHULNETZ_HINWEIS } from '../src/kern/mail/layout';
import { buildOrderMail, sampleOrder } from '../src/module/anfragen/anfragen.mail';
import { buildProposalMail } from '../src/module/vorschlaege/vorschlaege.mail';
import { buildPasswortMail } from '../src/module/konten/passwortlink';
import type { Proposal } from '@mosaik3lab/shared/vorschlaege';
import type { User } from '../src/domain/types';

const SCHULNETZ = [
  'http://192.168.1.26/mosaik3lab',
  'http://192.168.001.026/mosaik3lab',
  'https://10.0.0.5:8443/mosaik3lab',
  'http://172.16.0.1',
  'http://172.31.255.254/',
  'http://169.254.10.20',
  'http://127.0.0.1:3001',
  'http://0.0.0.0',
  'http://[::1]/mosaik3lab',
  'http://[fd12:3456::1]:8080/mosaik3lab',
  'http://[fc00::1]',
  'http://[fe80::1]/',
  'http://[::ffff:192.168.1.5]/',
  'http://localhost/mosaik3lab',
  'http://LOCALHOST:5180',
  'http://server/mosaik3lab',
  'http://mosaik3lab.local/mosaik3lab',
  'http://drucker.werkstatt.lan',
  'https://app.intern',
  'https://app.schule.internal/x',
  'http://pc.home',
  'http://pc.home.arpa',
  'http://srv.firma.corp',
];
const OEFFENTLICH = [
  'https://mosaik3lab.schule.example/mosaik3lab',
  'http://mosaik3lab.schule.example:8080',
  'https://example.org',
  'http://8.8.8.8/mosaik3lab',
  'http://172.32.0.1',
  'http://172.15.0.1',
  'http://192.169.1.1',
  'http://[2001:db8::1]/',
  'http://[::ffff:8.8.8.8]/',
  'https://localhost.example.com',
  'https://local.schule.example',
];

test('Erkennung: private/lokale Adressen, Namen ohne Punkt und interne Endungen = nur Schulnetz', () => {
  for (const url of SCHULNETZ) assert.equal(erkenneErreichbarkeit(url).schulnetz, true, url);
  for (const url of OEFFENTLICH) assert.equal(erkenneErreichbarkeit(url).schulnetz, false, url);
  assert.deepEqual(erkenneErreichbarkeit('http://192.168.1.26/mosaik3lab'), { schulnetz: true, grund: '192.168.1.26 ist eine Adresse im lokalen Netz.' });
  assert.deepEqual(erkenneErreichbarkeit('https://mosaik3lab.schule.example/mosaik3lab'), { schulnetz: false, grund: 'mosaik3lab.schule.example ist ein öffentlicher Name.' });
  assert.match(erkenneErreichbarkeit('http://server').grund, /ohne Domain/);
  assert.match(erkenneErreichbarkeit('http://x.local').grund, /„\.local“/);
  for (const bad of ['', 'kein link', 'http://']) assert.equal(erkenneErreichbarkeit(bad).schulnetz, false, bad);
});

test('Entscheidungstabelle: Einstellung × Erkennung → Hinweis in der Mail, Warnung im Server-Manager', () => {
  const lokal = 'http://192.168.1.26/mosaik3lab';
  const oeffentlich = 'https://mosaik3lab.schule.example';
  const fall = (appBaseUrl: string, erreichbarkeit?: string) => {
    const r = pruefeLinks({ appBaseUrl, erreichbarkeit });
    return [r.hinweis, !!r.warnung];
  };
  // [Hinweis, Warnung]
  assert.deepEqual(fall(lokal), [true, false], 'alte Einstellung ohne Feld = auto');
  assert.deepEqual(fall(lokal, 'auto'), [true, false]);
  assert.deepEqual(fall(lokal, 'schulnetz'), [true, false]);
  assert.deepEqual(fall(lokal, 'oeffentlich'), [true, true], 'Widerspruch: Hinweis bleibt sicherheitshalber, Warnung');
  assert.deepEqual(fall(oeffentlich), [false, false]);
  assert.deepEqual(fall(oeffentlich, 'auto'), [false, false]);
  assert.deepEqual(fall(oeffentlich, 'schulnetz'), [true, false], 'interner DNS-Name');
  assert.deepEqual(fall(oeffentlich, 'oeffentlich'), [false, false]);
  assert.deepEqual(fall(lokal, 'quatsch'), [true, false], 'unbekannter Wert = auto');
  for (const e of ['auto', 'schulnetz', 'oeffentlich']) assert.deepEqual(fall('', e), [false, false], `ohne Adresse (${e})`);
  const w = pruefeLinks({ appBaseUrl: lokal, erreichbarkeit: 'oeffentlich' }).warnung;
  assert.match(w, /„Auch von außerhalb“ gewählt.*192.168.1.26 ist eine Adresse im lokalen Netz.*„Adresse in den Mails“/);
  // HTTPS-Empfehlung nur bei „Auch von außerhalb“ mit http://
  assert.equal(pruefeLinks({ appBaseUrl: 'http://mosaik3lab.schule.example', erreichbarkeit: 'oeffentlich' }).httpsHinweis, HTTPS_EMPFOHLEN);
  assert.equal(pruefeLinks({ appBaseUrl: oeffentlich, erreichbarkeit: 'oeffentlich' }).httpsHinweis, '');
  assert.equal(pruefeLinks({ appBaseUrl: 'http://mosaik3lab.schule.example', erreichbarkeit: 'auto' }).httpsHinweis, '');
  assert.equal(linksNurImSchulnetz({ appBaseUrl: lokal, erreichbarkeit: 'oeffentlich' }), true);
});

// Typische Listen wie os.networkInterfaces() – die Auswahl hängt nur von dieser Liste ab, nicht vom System.
const v4 = (address: string, internal = false) => ({ address, family: 'IPv4', internal });
const v6 = (address: string, internal = false) => ({ address, family: 'IPv6', internal });
test('Automatische Link-Adresse: Windows, Ubuntu, Raspberry Pi OS – keine virtuellen, Loopback- oder Link-Local-Adressen', () => {
  const windows = {
    'vEthernet (WSL (Hyper-V firewall))': [v6('fe80::1'), v4('172.29.240.1')],
    'vEthernet (Default Switch)': [v4('172.20.16.1')],
    WLAN: [v6('fe80::abcd'), v4('192.168.1.26')],
    Ethernet: [v4('169.254.12.3')],
    'VirtualBox Host-Only Network': [v4('192.168.56.1')],
    'Loopback Pseudo-Interface 1': [v6('::1', true), v4('127.0.0.1', true)],
  };
  assert.equal(waehleNetzAdresse(windows), '192.168.1.26');
  const ubuntu = {
    lo: [v4('127.0.0.1', true), v6('::1', true)],
    enp3s0: [v4('10.0.4.20'), v6('fe80::5054:ff:fe12:3456')],
    docker0: [v4('172.17.0.1')],
    'br-1a2b3c4d5e6f': [v4('172.18.0.1')],
    virbr0: [v4('192.168.122.1')],
    tailscale0: [v4('100.101.102.103'), v6('fd7a:115c:a1e0::1')],
    'veth1234abc': [v6('fe80::1')],
  };
  assert.equal(waehleNetzAdresse(ubuntu), '10.0.4.20');
  const pi = {
    lo: [v4('127.0.0.1', true)],
    eth0: [v4('192.168.178.40'), v6('2003:e5:1234::40'), v6('fe80::40')],
    wlan0: [v4('192.168.178.41')],
  };
  assert.equal(waehleNetzAdresse(pi), '192.168.178.40', 'Kabel vor WLAN');
  assert.equal(waehleNetzAdresse({ wlan0: [v4('192.168.0.9')], docker0: [v4('172.17.0.1')] }), '192.168.0.9');
  assert.equal(waehleNetzAdresse({ eth0: [{ address: '10.1.1.1', family: 4, internal: false }] }), '10.1.1.1', 'ältere Node-Versionen: family als Zahl');
  assert.equal(waehleNetzAdresse({ lo: [v4('127.0.0.1', true)], docker0: [v4('172.17.0.1')] }), null);
  assert.equal(waehleNetzAdresse({}), null);
});

test('Hinweis in HTML und Text aller Mails mit Link – nur bei „Schulnetz“', () => {
  const user = { displayName: 'Test', email: 't@schule.test' } as User;
  const proposal = { id: 'p', number: 'VOR-1', title: 'Titel', description: 'Beschreibung lang genug', usage: '', links: [], quantity: 1, urgency: 'normal', requesterEmail: '', photos: [], createdAt: '' } as unknown as Proposal;
  const mails = (s: { appBaseUrl: string; erreichbarkeit?: Erreichbarkeit }) => [
    buildOrderMail(sampleOrder(), null, s),
    buildOrderMail(sampleOrder(), null, s, [], { previous: sampleOrder() }),
    buildProposalMail(proposal, s),
    buildPasswortMail(user, 'einrichten', `${s.appBaseUrl}/passwort#x`, false, 'angefordert', linksNurImSchulnetz(s)),
  ];
  for (const m of mails({ appBaseUrl: 'http://192.168.1.26/mosaik3lab' })) {
    assert.ok(m.html.includes(SCHULNETZ_HINWEIS) && m.text.includes(SCHULNETZ_HINWEIS), m.subject);
  }
  for (const s of [{ appBaseUrl: 'https://mosaik3lab.schule.example', erreichbarkeit: 'oeffentlich' as const }, { appBaseUrl: 'https://mosaik3lab.schule.example' }, { appBaseUrl: '', erreichbarkeit: 'schulnetz' as const }]) {
    for (const m of mails(s)) assert.ok(!m.html.includes(SCHULNETZ_HINWEIS) && !m.text.includes(SCHULNETZ_HINWEIS), `${m.subject} (${JSON.stringify(s)})`);
  }
  for (const m of mails({ appBaseUrl: 'https://mosaik3lab.schule.example', erreichbarkeit: 'schulnetz' })) assert.ok(m.html.includes(SCHULNETZ_HINWEIS), m.subject);
  for (const m of mails({ appBaseUrl: 'http://192.168.1.26/mosaik3lab', erreichbarkeit: 'oeffentlich' })) assert.ok(m.html.includes(SCHULNETZ_HINWEIS), `Widerspruch: ${m.subject}`);
});

test('Alte Mail-Einstellungen ohne Feld (und unbekannte Werte) = automatisch – der Versand bleibt an', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-erreichbarkeit-'));
  try {
    const db = openDb(path.join(dir, 'mosaik3lab.db'));
    db.exec(await fs.readFile(path.join(ROOT_DIR, 'server', 'src', 'storage', 'sqlite', 'migrations', '006_betrieb_einstellung.sql'), 'utf8'));
    const alt = { enabled: true, smtp: { host: 'smtp.example.test', port: 587, secure: false, user: '', pass: '' }, from: 'a@example.test', recipients: ['b@example.test'], appBaseUrl: 'http://192.168.1.26/mosaik3lab' };
    writeMailConfig(db, alt);
    let r = readMailConfig(db);
    assert.equal(r.state, 'ok');
    assert.equal(r.state === 'ok' && r.config.erreichbarkeit, 'auto');
    writeMailConfig(db, { erreichbarkeit: 'quatsch' });
    r = readMailConfig(db);
    assert.equal(r.state === 'ok' && r.config.erreichbarkeit, 'auto', 'unbekannter Wert schaltet den Versand nicht ab');
    writeMailConfig(db, { erreichbarkeit: 'oeffentlich' });
    r = readMailConfig(db);
    assert.equal(r.state === 'ok' && r.config.erreichbarkeit, 'oeffentlich');
    db.close();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
