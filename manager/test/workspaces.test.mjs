// Workspace-Verweise nach dem Umbenennen von „<id>.unfertig“ in „<id>“ (Update aus Git): npm ci legt sie mit absolutem
// Pfad an – danach müssen sie auf den neuen Ordner zeigen, sonst findet die Web-App @mosaik3lab/shared nicht.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import { platform } from '../platform/index.mjs';
import { linkWorkspaces, removeTree } from '../lib/setup.mjs';

test('linkWorkspaces ersetzt Verweise, die nach dem Umbenennen ins Leere zeigen', () => {
  const root = fs.mkdtempSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp-ws-')); // nicht unter %TEMP%: Kurz- bzw. Umlautpfade verfälschen Junctions
  try {
    const tmp = path.join(root, '1.0-abc.unfertig');
    const dest = path.join(root, '1.0-abc');
    fs.mkdirSync(path.join(tmp, 'shared'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'node_modules', '@x'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ workspaces: ['shared'] }));
    fs.writeFileSync(path.join(tmp, 'shared', 'package.json'), JSON.stringify({ name: '@x/shared' }));
    fs.writeFileSync(path.join(tmp, 'shared', 'marker.txt'), 'ok');
    platform.linkDir(path.join(tmp, 'shared'), path.join(tmp, 'node_modules', '@x', 'shared')); // wie npm ci
    fs.renameSync(tmp, dest);
    const link = path.join(dest, 'node_modules', '@x', 'shared');
    assert.ok(!fs.existsSync(path.join(link, 'marker.txt')), 'Verweis zeigt nach dem Umbenennen ins Leere');
    linkWorkspaces(dest);
    assert.equal(fs.readFileSync(path.join(link, 'marker.txt'), 'utf8'), 'ok');
    assert.equal(fs.realpathSync(link), fs.realpathSync(path.join(dest, 'shared')));
    linkWorkspaces(dest); // zweimal aufrufen ändert nichts
    assert.equal(fs.realpathSync(link), fs.realpathSync(path.join(dest, 'shared')));
  } finally {
    removeTree(root); // löscht Verweise, ohne ihnen zu folgen
  }
});
