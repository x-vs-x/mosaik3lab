// Skripte der App für den Server-Manager: db:backup (konsistente Kopie) und erstes Admin-Konto.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createAdminAccount } from '../src/module/konten/konten.service';
import { listMigrations, openDb } from '../src/kern/db';
import { storageAt, tmp } from './helfer';

test('db:backup: konsistente Kopie im laufenden Betrieb, eine Zeile, Exit 0/1', async () => {
  const dir = await tmp('dbbackup');
  const config = loadConfig({ storageDir: dir, rootDir: dir, logRequests: false, seedDemoData: true, clientDistDir: path.join(dir, 'none') });
  const instance = await createApp(config);
  try {
    // Health liefert den DB-Zustand für den Server-Manager.
    const server = instance.app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const health = (await (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/health`)).json()) as { db: { vorhanden: boolean; schemaVersion: number; groesseBytes: number } };
    await new Promise((r) => server.close(r));
    assert.equal(health.db.vorhanden, true);
    assert.equal(health.db.schemaVersion, listMigrations().at(-1)!.version);
    assert.ok(health.db.groesseBytes > 0);

    const ziel = path.join(dir, 'sicherung', 'kopie.db');
    const run = (...args: string[]) =>
      spawnSync(process.execPath, ['--import', 'tsx', 'scripts/db-backup.ts', ...args], { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8' });
    const ok = run('--ziel', ziel, '--quelle', config.dbFile);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.equal(ok.stdout.trim().split(/\r?\n/).length, 1);
    assert.match(ok.stdout, /^OK .*kopie\.db \(\d+ Bytes, Schema \d+\)/);
    const copy = openDb(ziel, { readOnly: true });
    assert.equal((copy.prepare('SELECT COUNT(*) AS n FROM artikel').get() as { n: number }).n, await instance.storage.items.count(), 'auch Daten aus dem WAL enthalten');
    copy.close();
    const again = run('--ziel', ziel, '--quelle', config.dbFile);
    assert.equal(again.status, 1);
    assert.match(again.stdout.trim(), /^FEHLER: Zieldatei existiert bereits/);
    const missing = run('--ziel', path.join(dir, 'x.db'), '--quelle', path.join(dir, 'gibt-es-nicht.db'));
    assert.equal(missing.status, 1);
    assert.match(missing.stdout.trim(), /^FEHLER: Datenbank nicht gefunden/);
  } finally {
    await instance.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('Erstes Admin-Konto: Skript legt es an, Passwort nur über Umgebung/stdin', async () => {
  const dir = await tmp('admin');
  try {
    const run = (args: string[], env: Record<string, string>, input?: string) =>
      spawnSync(process.execPath, ['--import', 'tsx', 'scripts/create-admin.ts', ...args], {
        cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8', input, env: { ...process.env, STORAGE_DIR: dir, ...env },
      });
    const lastLine = (r: ReturnType<typeof run>) => r.stdout.trim().split(/\r?\n/).pop() ?? '';
    const kurz = run(['--email', 'erste@schule.test', '--name', 'Erste Person'], { M3L_ADMIN_PASSWORD: 'kurz' });
    assert.equal(kurz.status, 1);
    assert.match(lastLine(kurz), /^FEHLER: Mindestens 8 Zeichen/);
    const ohne = run(['--email', 'erste@schule.test', '--name', 'Erste Person'], {}, '');
    assert.match(lastLine(ohne), /^FEHLER: Passwort fehlt/);
    const ok = run(['--email', 'Erste@Schule.test', '--name', 'Erste Person'], {}, 'Langes-Passwort-1\n');
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(lastLine(ok), /^OK /);
    assert.ok(!ok.stdout.includes('Langes-Passwort-1') && !ok.stderr.includes('Langes-Passwort-1'), 'Passwort wird nie ausgegeben');
    const doppelt = run(['--email', 'erste@schule.test', '--name', 'Doppelt'], { M3L_ADMIN_PASSWORD: 'Langes-Passwort-1' });
    assert.match(lastLine(doppelt), /^FEHLER: Es gibt bereits ein Konto/);
    const { storage } = await storageAt(dir);
    try {
      const u = await storage.users.findByEmail('erste@schule.test');
      assert.ok(u && u.role === 'admin' && u.active && !u.isDemo);
      const zweiter = await createAdminAccount(storage, { email: 'erste.zwei@schule.test', name: 'Zweite Person', password: 'Langes-Passwort-2' });
      assert.equal(zweiter.username, 'erste.zwei');
    } finally {
      await storage.close();
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
