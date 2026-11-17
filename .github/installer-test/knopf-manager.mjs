// Installer-Test: „Jetzt aktualisieren“ genau so, wie der Server-Manager es macht – mit seinem eigenen Code aus der
// Installation (manager/lib/updates.mjs): nach Updates suchen, herunterladen, gegen SHA256SUMS prüfen, Auftrag schreiben,
// Update-Helfer über die Dienststeuerung starten. Linux: läuft als Dienstbenutzer mosaik3lab (wie der Manager-Dienst).
// Vorher fehlte dieser Weg im Test (knopfdruck.mjs legte Paket und Auftrag selbst ab) – ein hängender Download fiel nicht auf.
//   MOSAIK3LAB_PAKETQUELLE=<Test-Quelle> node knopf-manager.mjs <Programmordner> <erwartete Version>
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [programm, erwartet] = process.argv.slice(2);
const fail = (t) => {
  console.log(`FEHLER ${t}`);
  process.exit(1);
};
const lib = path.join(programm, 'current', 'manager', 'lib', 'updates.mjs');
const upd = await import(pathToFileURL(lib).href);
if (!upd.istPaketInstallation()) fail('Manager erkennt die Paket-Installation nicht');
const z = await upd.pruefen();
if (z.latest?.version !== erwartet) fail(`Suche findet ${z.latest?.version ?? 'nichts'}${z.error ? ` (${z.error})` : ''}, erwartet ${erwartet}`);
console.log(`Manager: Version ${erwartet} gefunden – „Jetzt aktualisieren“`);
await upd.starten();
const ende = Date.now() + 5 * 60_000;
for (;;) {
  await new Promise((r) => setTimeout(r, 1000));
  const d = upd.zustand().download;
  if (d?.error) fail(`Manager: ${d.error}`);
  if (d?.fertig) break;
  if (Date.now() > ende) fail(`Manager: Download nach 5 Minuten nicht fertig (${d?.done ?? 0} Bytes)`);
}
console.log('OK   Manager: Paket heruntergeladen und geprüft, Update-Helfer gestartet');
process.exit(0);
