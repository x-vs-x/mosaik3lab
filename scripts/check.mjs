// Kompakte Gesamtprüfung für Menschen und Claude: typecheck, lint, Tests, optional Health der laufenden API.
// Aufruf: npm run check            → typecheck + lint + test
//         npm run check -- 3011    → zusätzlich GET http://127.0.0.1:3011/api/health
// Ausgabe: eine Zeile ✔/✘ je Schritt, bei Fehlern nur die letzten Zeilen. Exit-Code 1 bei Fehler.
import { spawnSync } from 'node:child_process';

const apiPort = process.argv[2];
const steps = [
  ['typecheck', 'npm run typecheck'],
  ['lint', 'npm run lint'],
  ['test', 'npm test'],
];

let failed = false;
for (const [name, cmd] of steps) {
  const started = Date.now();
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status === 0) {
    console.log(`✔ ${name} (${secs}s)`);
  } else {
    failed = true;
    const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().split('\n');
    console.log(`✘ ${name} (${secs}s)\n  ${out.slice(-15).join('\n  ')}`);
  }
}

if (apiPort) {
  try {
    // Mit Basis-Pfad (BASE_PATH, Hauptstand: /mosaik3lab) und ohne – je nachdem, wie die Instanz läuft.
    const bases = [...new Set([process.env.BASE_PATH ?? '', '/mosaik3lab', ''])];
    let ok = false;
    for (const base of bases) {
      const res = await fetch(`http://127.0.0.1:${apiPort}${base}/api/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
      if (res?.ok) ok = true;
      if (ok) break;
    }
    if (!ok) throw new Error('keine Antwort auf /api/health');
    console.log(`✔ health :${apiPort}`);
  } catch (err) {
    failed = true;
    console.log(`✘ health :${apiPort} – ${err.message}`);
  }
}

process.exit(failed ? 1 : 0);
