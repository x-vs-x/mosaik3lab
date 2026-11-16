// Legt das erste Administrator-Konto an (frische Installation ohne Demo-Konten).
//   npm run --silent user:create-admin -w server -- --email <adresse> --name <name>
// Das Passwort kommt NIE als Argument: Umgebungsvariable M3L_ADMIN_PASSWORD oder eine Zeile über stdin.
// Datenordner wie bei der App (STORAGE_DIR); die App darf dabei nicht laufen. Ausgabe: eine Zeile „OK …“ bzw. „FEHLER: …“.
import fs from 'node:fs';
import { loadConfig } from '../src/config';
import { createAdminAccount } from '../src/module/konten/konten.service';
import { createSqliteStorage } from '../src/storage';
import { ZodError } from 'zod';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

try {
  const email = arg('--email');
  const name = arg('--name');
  if (!email || !name) throw new Error('Bitte --email <adresse> und --name <anzeigename> angeben.');
  const password = process.env.M3L_ADMIN_PASSWORD ?? (process.stdin.isTTY ? '' : fs.readFileSync(0, 'utf8').split(/\r?\n/)[0] ?? '');
  if (!password) throw new Error('Passwort fehlt: Umgebungsvariable M3L_ADMIN_PASSWORD setzen oder es über stdin übergeben.');
  const storage = await createSqliteStorage(loadConfig());
  try {
    const user = await createAdminAccount(storage, { email, name, password });
    console.log(`OK Administrator ${user.email} angelegt`);
  } finally {
    await storage.close();
  }
} catch (err) {
  const msg = err instanceof ZodError ? err.issues.map((i) => i.message).join('; ') : (err as Error).message;
  console.log(`FEHLER: ${msg}`);
  process.exit(1);
}
