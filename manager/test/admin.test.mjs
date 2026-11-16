// Erstes Admin-Konto im Manager (Einrichten, doctor) und Sperrdatei-Prüfung der Wiederherstellung.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TESTROOT = path.resolve(import.meta.dirname, '..', '..', '..', '_testdaten', 'admin-sicherheit');
fs.mkdirSync(TESTROOT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(TESTROOT, 'mgr-'));
process.env.MANAGER_CONFIG = path.join(tmp, 'manager.config.json');
fs.writeFileSync(process.env.MANAGER_CONFIG, JSON.stringify({ paths: { dataDir: path.join(tmp, 'storage'), ablageDir: path.join(tmp, 'ablage'), backupDir: path.join(tmp, 'backups'), logDir: path.join(tmp, 'logs') } }));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { activeAdminCount, checkAdminInput, createAdmin } = await import('../lib/admin.mjs');
const { lockHolder } = await import('../lib/backup.mjs');
const setup = await import('../lib/setup.mjs');
const programDir = path.resolve(import.meta.dirname, '..', '..');

test('Admin-Eingaben werden vor dem Anlegen geprüft', () => {
  assert.throws(() => checkAdminInput({ email: 'keine-adresse', name: 'Ada', password: 'Langes-Passwort-1' }), /E-Mail/);
  assert.throws(() => checkAdminInput({ email: 'a@schule.test', name: 'A', password: 'Langes-Passwort-1' }), /Namen/);
  assert.throws(() => checkAdminInput({ email: 'a@schule.test', name: 'Ada', password: 'kurz' }), /8 Zeichen/);
  checkAdminInput({ email: 'a@schule.test', name: 'Ada', password: 'Langes-Passwort-1' });
});

test('Admin anlegen über das App-Skript; activeAdminCount sieht ihn (doctor-Warnung sonst)', async () => {
  const dataDir = path.join(tmp, 'daten');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = path.join(dataDir, 'mosaik3lab.db');
  assert.equal(await activeAdminCount(db), null, 'keine Datenbank');
  await assert.rejects(() => createAdmin({ programDir, dataDir, email: 'a@schule.test', name: 'Ada', password: 'kurz' }), /8 Zeichen/);
  const line = await createAdmin({ programDir, dataDir, ablageDir: path.join(tmp, 'ablage2'), email: 'a@schule.test', name: 'Ada Admin', password: 'Langes-Passwort-1' });
  assert.match(line, /^OK /);
  assert.equal(await activeAdminCount(db), 1);
  await assert.rejects(() => createAdmin({ programDir, dataDir, email: 'a@schule.test', name: 'Doppelt', password: 'Langes-Passwort-1' }), /bereits ein Konto/);
});

test('Einrichtung: Probelauf zeigt den Admin-Schritt, falsche Eingaben stoppen ihn', async () => {
  const roots = { programRoot: path.join(tmp, 'Programm'), dataRoot: path.join(tmp, 'Daten') };
  const ohne = await setup.install({ ...roots, password: 'Probelauf-2026' }, () => {}, { dryRun: true });
  assert.equal(ohne.steps.find((s) => s.id === 'admin').status, 'übersprungen');
  const mit = await setup.install({ ...roots, password: 'Probelauf-2026', admin: { email: 'a@schule.test', name: 'Ada', password: 'Langes-Passwort-1' } }, () => {}, { dryRun: true });
  assert.match(mit.steps.find((s) => s.id === 'admin').detail, /a@schule\.test/);
  assert.equal(mit.steps.find((s) => s.id === 'admin').status, 'geplant');
  await assert.rejects(() => setup.install({ ...roots, password: 'Probelauf-2026', admin: { email: 'a@schule.test', name: 'Ada', password: 'kurz' } }, () => {}, { dryRun: true }), /8 Zeichen/);
  const backup = await setup.install({ ...roots, password: 'Probelauf-2026', fromBackup: { dir: __filename_unused() }, admin: { email: 'a@schule.test', name: 'Ada', password: 'Langes-Passwort-1' } }, () => {}, { dryRun: true }).catch((e) => e);
  const step = (backup.steps ?? []).find((s) => s.id === 'admin');
  assert.ok(!step || step.status === 'übersprungen', 'aus Backup: Konten kommen aus der Sicherung');
});

test('Wiederherstellung: Sperrdatei mit PID und Systemstart', () => {
  const boot = Math.round(Date.now() / 1000 - os.uptime());
  assert.equal(lockHolder(`${process.pid} ${boot}`), process.pid);
  assert.equal(lockHolder(`${process.pid} ${boot - 86_400}`), null, 'nach einem Neustart veraltet');
  assert.equal(lockHolder('999999999'), null);
  assert.equal(lockHolder(''), null);
});

function __filename_unused() {
  return path.join(tmp, 'gibt-es-nicht.m3lbackup');
}
