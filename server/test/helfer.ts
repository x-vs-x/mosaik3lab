// Gemeinsame Helfer für die automatischen Tests (`npm test` → node --test).
// Jede Testdatei startet ihre App mit einem eigenen Temp-Datenordner, echte Daten bleiben unberührt.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { createApp } from '../src/app';
import { loadConfig, ROOT_DIR } from '../src/config';
import { DEMO_USERS } from '../src/seed/demoData';
import { setTransportFactory } from '../src/kern/mail/mailer';
import { writeMailConfig } from '../src/kern/mail/mailConfig';
import { createSqliteStorage } from '../src/storage';
import { openDb } from '../src/kern/db';

// Niemals echte Mails versenden: jsonTransport erzeugt die Nachricht nur im Speicher.
// Versendete Nachrichten landen in `sentMails`; `setFailMail(true)` simuliert einen nicht erreichbaren SMTP-Server.
export const sentMails: any[] = [];
let failMail = false;
export const setFailMail = (on: boolean) => {
  failMail = on;
};
setTransportFactory(() => {
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const send = transport.sendMail.bind(transport);
  transport.sendMail = (async (mail: any) => {
    if (failMail) throw new Error('Verbindung zum SMTP-Server fehlgeschlagen (Test)');
    const info: any = await send(mail);
    sentMails.push(JSON.parse(info.message));
    return info;
  }) as any;
  return transport;
});

export const SCHOOL = 'schule.example';
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const tmp = (name: string) => fs.mkdtemp(path.join(os.tmpdir(), `mosaik3lab-${name}-`));
export const sha = async (file: string) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');

/** Startet die App auf einem freien Port mit eigenem Temp-Datenordner; `stop()` räumt alles weg. */
export async function startServer(overrides: Parameters<typeof loadConfig>[0]) {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-test-'));
  // rootDir = Temp-Ordner (Projektwurzel der App, z. B. für CHANGELOG.md) – nichts landet im echten Projektordner.
  const config = loadConfig({
    storageDir,
    rootDir: storageDir,
    logRequests: false,
    clientDistDir: path.join(storageDir, 'none'),
    ...overrides,
  });
  const instance = await createApp(config);
  // Wie eine eingerichtete Schule: nur Adressen der Schul-Domain (neue Installationen erlauben sonst jede Adresse).
  await instance.storage.settings.update((s) => ({ ...s, orderForm: { allowedEmailDomains: [SCHOOL] } }));
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    storageDir,
    storage: instance.storage,
    async stop() {
      await new Promise((r) => server.close(r));
      await instance.close();
      await fs.rm(storageDir, { recursive: true, force: true });
    },
  };
}

/** Nur die Speicherschicht (ohne HTTP) in einem Ordner öffnen. */
export async function storageAt(dir: string) {
  const config = loadConfig({ storageDir: dir, rootDir: dir, logRequests: false, seedDemoData: false, clientDistDir: path.join(dir, 'none') });
  return { config, storage: await createSqliteStorage(config) };
}

/** Kleiner HTTP-Client mit Cookie-Speicher – simuliert einen Browser. */
export class Client {
  private cookie = '';
  constructor(private base: string) {}

  async req(method: string, url: string, body?: unknown, opts: { csrf?: boolean; form?: FormData } = {}) {
    const headers: Record<string, string> = {};
    if (opts.csrf !== false) headers['X-Requested-With'] = 'mosaik3lab';
    if (this.cookie) headers.Cookie = this.cookie;
    let payload: FormData | string | undefined;
    if (opts.form) payload = opts.form;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(this.base + url, { method, headers, body: payload });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const text = await res.text();
    let json: any = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    return { status: res.status, json, headers: res.headers };
  }

  /** Rohe Antwort (z. B. Binärdaten, Ströme) mit der Anmeldung dieses Clients. */
  roh(url: string, headers: Record<string, string> = {}) {
    return fetch(this.base + url, { headers: { 'X-Requested-With': 'mosaik3lab', ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers } });
  }

  /** Schritt 1 der Anmeldung: E-Mail prüfen (Lehrkräfte sind danach direkt angemeldet). */
  async identify(email: string) {
    return this.req('POST', '/api/auth/identify', { email });
  }

  /** Schritt 2 der Anmeldung: Passwort für Konten von Admin und Druck-Team. */
  async login(email: string, password: string) {
    return this.req('POST', '/api/auth/login', { email, password });
  }
}

const demo = (username: string) => DEMO_USERS.find((u) => u.username === username)!;
export const pw = (username: string) => demo(username).password;
export const mail = (username: string) => demo(username).email;
/** Lehrkraft aus den Beispiel-Anfragen – bekannt, aber ohne Konto. */
export const TEACHER = `frau.beispiel@${SCHOOL}`;

/** Clients für Gast, bekannte Lehrkraft, Druck-Team und Admin – alle (außer Gast) angemeldet. */
export async function anmelden(base: string) {
  const anon = new Client(base);
  const teacher = new Client(base);
  const team = new Client(base);
  const admin = new Client(base);
  await teacher.identify(TEACHER);
  await team.login(mail('druckteam'), pw('druckteam'));
  await admin.login(mail('admin'), pw('admin'));
  return { anon, teacher, team, admin };
}

/** Standard-Häkchen fürs Druck-Team (alle Team-Bereiche außer „Stammdaten“) plus die beiden Lehrkraft-Häkchen. */
export const TEAM_STANDARD = ['anfragen', 'vorschlaege', 'team-anfragen', 'team-druckteile', 'team-vorschlaege', 'team-farbrollen'];
export const TEST_PASSWORT = 'Test-Pass';

/**
 * Wie in der Oberfläche: Admin gibt einer Person Rechte („Rechte ändern“); die Person legt über den Link ihr Passwort
 * fest und ist danach angemeldet. Ohne Mailversand liefert die Antwort das Token zum Weitergeben.
 */
export async function personMitRechten(admin: Client, base: string, email: string, bereiche = TEAM_STANDARD, role = 'druckteam') {
  const r = await admin.req('PUT', '/api/personen', { email, role, bereiche, name: email.split('@')[0] });
  if (r.status !== 200) throw new Error(`Rechte setzen: ${r.status} ${JSON.stringify(r.json)}`);
  const c = new Client(base);
  const token = r.json.passwortLink?.token;
  const s = token ? await c.req('POST', '/api/auth/passwort-setzen', { token, password: TEST_PASSWORT }) : await c.login(email, TEST_PASSWORT);
  if (s.status !== 200) throw new Error(`Passwort festlegen: ${s.status} ${JSON.stringify(s.json)}`);
  return { c, person: r.json.person, saved: r.json };
}

/** Erstes veröffentlichtes und das unveröffentlichte Demo-Druckteil (wie im Katalog sichtbar). */
export async function demoTeile(teacher: Client, team: Client) {
  const publishedItem = (await teacher.req('GET', '/api/items?all=1')).json[0];
  const hiddenItem = (await team.req('GET', '/api/items?all=1')).json.find((i: any) => !i.published);
  return { publishedItem, hiddenItem };
}

export const orderBodyFor = (publishedItem: any) => () => ({
  itemId: publishedItem.id, quantity: 1, color: publishedItem.colors[0], size: publishedItem.sizes[0],
  requesterEmail: `test.lehrkraft@${SCHOOL}`, classOrTeam: 'Klasse 1a',
});

export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
export const ASCII_STL = 'solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid test\n';

export function form(name: string, content: Buffer | string, type = 'application/octet-stream') {
  const fd = new FormData();
  fd.append('files', new Blob([content], { type }), name);
  return fd;
}

// Mail-Konfiguration liegt in der Datenbank (Bereich „mail“, gepflegt vom Server-Manager) – die App liest sie nur.
const MIGRATION_006 = await fs.readFile(path.join(ROOT_DIR, 'server', 'src', 'storage', 'sqlite', 'migrations', '006_betrieb_einstellung.sql'), 'utf8');
export const mailConfig = {
  enabled: true,
  smtp: { host: 'smtp.example.test', port: 587, secure: false, user: 'druck', pass: 'Geheim-Passwort-123' },
  from: 'Mosaik³LAB <mosaik3lab@example.test>',
  recipients: ['team@example.test', 'leitung@example.test', 'TEAM@example.test'],
  appBaseUrl: 'http://localhost:5173/',
};
/** Schreibt wie der Server-Manager direkt in die Datenbank (zweite Verbindung, WAL). */
export const writeMailFile = async (content: Record<string, unknown>, dbFile: string) => {
  const db = openDb(dbFile);
  try {
    db.exec(MIGRATION_006);
    db.exec("DELETE FROM betrieb_einstellung WHERE bereich = 'mail'");
    writeMailConfig(db, content);
  } finally {
    db.close();
  }
};

// Für Tests der Speicherschicht: minimale Dateien und ein vollständiger Artikel.
export const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
export const STL = Buffer.from('solid test\nendsolid test\n');
export const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(12)]);
export const now = () => new Date().toISOString();
export const baseItem = (id: string) => ({
  id,
  name: 'Testteil',
  shortDescription: '',
  kind: 'hilfsmittel' as const,
  description: '',
  categories: ['Sonstiges'],
  useAreas: ['Unterricht'],
  sizes: ['S'],
  colors: [],
  colorAreas: [{ id: 'farbe', name: 'Farbe', colors: [] }],
  price: '',
  customFields: [],
  videos: [],
  material: 'PLA',
  materialInfo: '',
  printTimeMinutes: 5,
  safetyNotes: [],
  links: [],
  images: [],
  modelFiles: [],
  published: true,
  isDemo: false,
  createdAt: now(),
  updatedAt: now(),
});
