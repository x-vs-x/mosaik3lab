// Testmail für den Server-Manager – verwendet die Mail-Einstellungen aus der angegebenen Datenbankdatei (auch wenn `enabled` aus ist).
//   npm run mail:test -w server -- --db <pfad zu mosaik3lab.db> [--to <adresse>]
// Ausgabe: eine Zeile. Exit-Code 0 = versendet, 1 = Fehler (Meldung in der Zeile), 2 = falscher Aufruf.
import path from 'node:path';
import { z } from 'zod';
import { sendTestMail } from '../src/module/anfragen/anfragen.mail';

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const config = arg('db');
const to = arg('to')?.trim();
if (!config) {
  console.log('FEHLER: Aufruf: npm run mail:test -w server -- --db <pfad> [--to <adresse>]');
  process.exit(2);
}
if (to && !z.string().email().safeParse(to).success) {
  console.log(`FEHLER: Ungültige Empfängeradresse: ${to}`);
  process.exit(1);
}

try {
  console.log(`OK: ${await sendTestMail(path.resolve(config), to)}`);
  process.exit(0);
} catch (err) {
  console.log(`FEHLER: ${(err as Error).message.replace(/\s+/g, ' ')}`);
  process.exit(1);
}
