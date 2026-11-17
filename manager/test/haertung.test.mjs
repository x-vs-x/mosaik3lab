// Zeitlimits beim Update und Härtung der Admin-Schritte – reine Logik, startet keine Dienste und keinen Server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as z from '../lib/zeitlimits.mjs';
import { manifestPruefen } from '../lib/manifestpruefung.mjs';
import { linux, rootWrite } from '../platform/linux.mjs';
import { windows } from '../platform/windows.mjs';
import { SERVICE_IDS } from '../platform/common.mjs';

const T0 = Date.parse('2026-11-17T10:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

test('Zeitlimits: jedes äußere Limit ist größer als alles darin', () => {
  assert.ok(z.SETUP_MAX_MS > z.SICHERUNG_MAX_MS + z.ADMIN_MAX_MS, 'Wächter des Helfers > Sicherung + Admin-Schritt');
  assert.ok(z.HELFER_MAX_MS > z.SETUP_MAX_MS + 10 * z.MIN, 'Gesamtlimit des Helfers > Wächter + Entpacken');
  assert.ok(z.SICHERUNG_MAX_MS >= 120 * z.MIN, 'Sicherung auf dem Pi mit großer Ablage: mindestens 2 Stunden');
  const def = { key: 'updater', id: 'mosaik3lab-updater', title: 'U', node: '/opt/mosaik3lab/current/node/node', args: ['a.mjs'], workDir: '/opt/mosaik3lab/current', serviceDir: '/var/lib/mosaik3lab/manager/dienste', env: {} };
  const unit = linux.services.files(def)[0].content;
  assert.equal(Number(/TimeoutStartSec=(\d+)/.exec(unit)[1]) * 1000, z.HELFER_MAX_MS, 'systemd-Limit = Gesamtlimit des Helfers');
});

test('Anzeige: wartet, bis sich der Helfer meldet – danach dessen Status', () => {
  const download = { version: '1.4.0', fertig: true, startedAt: iso(T0), fertigAt: iso(T0 + z.MIN) };
  assert.equal(z.laufAnzeige(null, download, T0 + 2 * z.MIN, '1.3.1').lauf.phase, 'wartet');
  const r = z.laufAnzeige(null, download, T0 + z.MIN + z.WARTEN_MAX_MS + 1);
  assert.match(r.fehler.error, /nicht reagiert/);
  // Helfer hat sich gemeldet: kein „nicht reagiert“, auch wenn es lange dauert
  const h = { phase: 'läuft', version: '1.4.0', started: iso(T0 + 2 * z.MIN), at: iso(T0 + 3 * z.MIN), meldung: 'Update wird installiert …' };
  const spaeter = z.laufAnzeige(h, download, T0 + 90 * z.MIN);
  assert.equal(spaeter.fehler, undefined);
  assert.equal(spaeter.lauf.phase, 'läuft');
  assert.match(spaeter.lauf.meldung, /läuft noch/);
});

test('Anzeige: frischer Status bleibt unverändert, ein längst beendeter Lauf wird klar gemeldet', () => {
  const h = { phase: 'läuft', version: '1.4.0', started: iso(T0), at: iso(T0 + 30_000), meldung: 'Update wird geprüft …' };
  assert.deepEqual(z.laufAnzeige(h, null, T0 + 60_000).lauf, h);
  const alt = z.laufAnzeige(h, null, T0 + z.HELFER_MAX_MS + z.MIN).lauf;
  assert.equal(alt.phase, 'fehler');
  assert.ok(alt.haengt);
  assert.match(alt.hint, /neu starten/);
  const fertig = { phase: 'fertig', version: '1.4.0', at: iso(T0) };
  assert.deepEqual(z.laufAnzeige(fertig, null, T0 + 10 * z.HELFER_MAX_MS).lauf, fertig);
});

test('Linux: Unit-Dateien und polkit-Regel schreibt root direkt nach /etc – nie aus dem Datenordner', () => {
  const dienste = '/var/lib/mosaik3lab/manager/dienste';
  const def = { key: 'manager', id: 'mosaik3lab-manager', title: 'Mosaik³LAB Server-Manager', node: '/opt/mosaik3lab/current/node/node', args: ['/opt/mosaik3lab/current/manager/server.mjs'], workDir: '/opt/mosaik3lab/current', serviceDir: dienste, env: { NODE_ENV: 'production' } };
  assert.ok(linux.services.filesInInstallScript);
  const files = linux.services.files(def);
  assert.deepEqual(files.map((f) => f.path), ['/etc/systemd/system/mosaik3lab-manager.service', '/etc/polkit-1/rules.d/50-mosaik3lab.rules']);
  const script = linux.services.installScript(def);
  assert.doesNotMatch(script, /install -m/, 'kein Kopieren aus einer Zwischendatei');
  const lines = script.split('\n');
  assert.match(lines[0], /^rm -f '\/var\/lib\/mosaik3lab\/manager\/dienste\/mosaik3lab-manager\.service'/, 'Reste im Datenordner zuerst entfernen');
  for (const l of lines.slice(1)) assert.ok(!l.includes(dienste), `danach nichts mehr aus dem Datenordner: ${l}`);
  assert.ok(script.includes("polkit.addRule"), 'Inhalt steht im Skript');
  const w = rootWrite('/etc/x/y.rules', "a'b");
  assert.match(w, /chown root:root "\$t" && chmod 644 "\$t" && mv -f "\$t" '\/etc\/x\/y\.rules'$/);
  assert.ok(w.includes(`'a'\\''b'`), 'Inhalt sicher in Anführungszeichen');
});

test('Windows: Programmordner außerhalb von „Programme“ bekommt ausdrücklich nur Admin/System-Schreibrechte', () => {
  const pf = path.dirname(windows.defaults().programRoot);
  assert.match(windows.protectProgramScript(path.join(pf, 'Mosaik3LAB')), /\/reset \/T/);
  const s = windows.protectProgramScript('D:\\Mosaik3LAB\\programm');
  assert.match(s, /\/inheritance:r \/grant:r '\*S-1-5-32-544:\(OI\)\(CI\)F' '\*S-1-5-18:\(OI\)\(CI\)F' '\*S-1-5-32-545:\(OI\)\(CI\)RX' '\*S-1-5-19:\(OI\)\(CI\)RX'/);
  assert.match(s, /\/setowner '\*S-1-5-32-544'/);
});

test('Deinstallieren: untergeschobene Einträge im Manifest werden übersprungen', () => {
  const root = process.platform === 'win32' ? 'C:\\Program Files\\Mosaik3LAB' : '/opt/mosaik3lab';
  const entries = [
    { type: 'service', name: 'mosaik3lab-webapp' },
    { type: 'service', name: 'mosaik3lab-webapp; rm -rf /' },
    { type: 'firewall', name: 'x', port: '80' },
    { type: 'firewall', name: 'y', port: '80; reboot' },
    { type: 'shortcut', path: path.resolve('/usr/share/applications/mosaik3lab/Server-Manager.desktop') },
    { type: 'shortcut', path: path.resolve('/etc/shadow') },
    { type: 'folder', role: 'program', path: root },
    { type: 'folder', role: 'program', path: path.resolve('/etc') },
    { type: 'folder', role: 'data', path: path.parse(path.resolve('/')).root },
    { type: 'acl', path: root },
  ];
  const r = manifestPruefen(entries, { serviceIds: Object.values(SERVICE_IDS), programRoot: root });
  assert.deepEqual(r.entries.map((e) => `${e.type}:${e.name ?? e.path}`), [
    'service:mosaik3lab-webapp',
    'firewall:x',
    `shortcut:${path.resolve('/usr/share/applications/mosaik3lab/Server-Manager.desktop')}`,
    `folder:${root}`,
    `acl:${root}`,
  ]);
  assert.equal(r.entries.find((e) => e.type === 'firewall').port, 80);
  assert.equal(r.verworfen.length, 5);
  // ohne bekannte Installation (Deinstallieren mit --data-root): Programmordner wird nicht verglichen
  assert.equal(manifestPruefen([{ type: 'folder', role: 'program', path: root }], { serviceIds: [] }).entries.length, 1);
});
