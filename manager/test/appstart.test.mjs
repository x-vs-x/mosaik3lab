// Start der App je Programmform: Arbeitskopie (tsx) oder gebündeltes Installer-Paket (server/dist).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appArgs, appRunnable } from '../lib/appstart.mjs';

test('appstart: tsx in der Arbeitskopie, Bündel im Installer-Paket', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm3l-appstart-'));
  try {
    assert.equal(appRunnable(root), false);
    fs.mkdirSync(path.join(root, 'server', 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'server', 'dist', 'server.mjs'), '');
    fs.writeFileSync(path.join(root, 'server', 'dist', 'db-backup.mjs'), '');
    assert.equal(appRunnable(root), true);
    assert.deepEqual(appArgs(root, 'server', [], ['file:///pre.mjs']), ['--import', 'file:///pre.mjs', path.join(root, 'server', 'dist', 'server.mjs')]);
    assert.deepEqual(appArgs(root, 'db-backup', ['--ziel', 'x']), [path.join(root, 'server', 'dist', 'db-backup.mjs'), '--ziel', 'x']);
    // tsx vorhanden (Entwicklung, Arbeitskopie) → immer TypeScript, nie ein evtl. veraltetes Bündel
    fs.mkdirSync(path.join(root, 'node_modules', 'tsx'), { recursive: true });
    assert.deepEqual(appArgs(root, 'server'), ['--import', 'tsx', path.join('src', 'index.ts')]);
    assert.deepEqual(appArgs(root, 'mail-test', ['--db', 'a']), ['--import', 'tsx', path.join('scripts', 'mail-test.ts'), '--db', 'a']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
