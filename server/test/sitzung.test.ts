// Sitzungen robust: Folgeanfragen direkt nach dem Login (auch parallel), Neustart mit bestehender Sitzung,
// alte Cookies mit anderem Pfad (Path=/ aus Versionen ohne Basis-Pfad), Abmelden, Demo-Zugänge.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { mail, pw, TEACHER } from './helfer';

const BASE = '/mosaik3lab';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mosaik3lab-sitzung-'));
after(() => fs.rm(dir, { recursive: true, force: true }));

/** Startet eine App-Instanz auf dem gemeinsamen Datenordner (wie ein Neustart des Servers). */
async function start(allowDemoAccounts = true) {
  const config = loadConfig({
    storageDir: dir,
    rootDir: dir,
    logRequests: false,
    clientDistDir: path.join(dir, 'none'),
    basePath: BASE,
    allowDemoAccounts,
    seedDemoData: true,
  });
  const instance = await createApp(config);
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${BASE}`;
  return {
    async req(method: string, p: string, opts: { cookie?: string; body?: unknown } = {}) {
      const headers: Record<string, string> = { 'X-Requested-With': 'mosaik3lab' };
      if (opts.cookie) headers.Cookie = opts.cookie;
      if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(url + p, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : undefined, setCookies: res.headers.getSetCookie() };
    },
    async stop() {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await instance.close();
    },
  };
}

const sid = (setCookies: string[]) => setCookies.find((c) => c.startsWith('m3l.sid=s'))!.split(';')[0];

test('Login speichert die Sitzung vor der Antwort: sofortige Folgeanfragen (auch parallel) sind angemeldet', async () => {
  const app = await start();
  try {
    for (const [user, perm] of [['admin', '/api/dashboard'], ['druckteam', '/api/orders']] as const) {
      const login = await app.req('POST', '/api/auth/login', { body: { email: mail(user), password: pw(user) } });
      assert.equal(login.status, 200);
      const setCookie = login.setCookies.find((c) => c.startsWith('m3l.sid='))!;
      assert.match(setCookie, /Path=\/mosaik3lab/);
      assert.match(setCookie, /HttpOnly/i);
      assert.doesNotMatch(setCookie, /Secure/i, 'über http://<IP> kein Secure-Cookie');
      const cookie = sid(login.setCookies);
      const results = await Promise.all(Array.from({ length: 12 }, (_, i) => app.req('GET', i % 2 ? perm : '/api/auth/me', { cookie })));
      assert.deepEqual(results.map((r) => r.status), Array(12).fill(200));
      assert.ok(results.filter((_, i) => i % 2 === 0).every((r) => r.json.user?.role), 'me liefert jedes Mal das Konto');
    }
    // Lehrkraft: Anmeldung nur per E-Mail
    const teacher = await app.req('POST', '/api/auth/identify', { body: { email: TEACHER } });
    assert.equal(teacher.json.result, 'signed-in');
    const cookie = sid(teacher.setCookies);
    const results = await Promise.all([app.req('GET', '/api/auth/me', { cookie }), app.req('GET', '/api/orders/mine', { cookie })]);
    assert.equal(results[0].json.user.role, 'lehrkraft');
    assert.notEqual(results[1].status, 401);
  } finally {
    await app.stop();
  }
});

test('Neustart des Servers (neue Instanz, gleiche Datenbank): bestehende Sitzung bleibt gültig', async () => {
  let app = await start();
  const login = await app.req('POST', '/api/auth/login', { body: { email: mail('admin'), password: pw('admin') } });
  const cookie = sid(login.setCookies);
  await app.stop();
  app = await start();
  try {
    assert.equal((await app.req('GET', '/api/auth/me', { cookie })).json.user.role, 'admin');
    assert.equal((await app.req('GET', '/api/dashboard', { cookie })).status, 200);
  } finally {
    await app.stop();
  }
});

test('Altes Cookie mit Path=/ (gleicher Name) stört nicht – egal in welcher Reihenfolge – und wird entfernt', async () => {
  const app = await start();
  try {
    const login = await app.req('POST', '/api/auth/login', { body: { email: mail('admin'), password: pw('admin') } });
    const cookie = sid(login.setCookies);
    // Altes, mit anderem Geheimnis signiertes Cookie und ein unsigniertes Überbleibsel
    for (const old of ['m3l.sid=s%3Aalt-sitzung.ungueltigeSignatur', 'm3l.sid=kaputt']) {
      for (const header of [`${old}; ${cookie}`, `${cookie}; ${old}`]) {
        const me = await app.req('GET', '/api/auth/me', { cookie: header });
        assert.equal(me.json.user?.role, 'admin', `angemeldet trotz altem Cookie (${header.slice(0, 30)} …)`);
        assert.equal((await app.req('GET', '/api/dashboard', { cookie: header })).status, 200);
        assert.ok(
          me.setCookies.some((c) => /^m3l\.sid=;/.test(c) && /Path=\/(;|$)/.test(c) && /Expires=Thu, 01 Jan 1970/.test(c)),
          'altes Cookie unter Path=/ wird gelöscht',
        );
      }
    }
    // Ohne Duplikat: kein Löschen
    assert.ok(!(await app.req('GET', '/api/auth/me', { cookie })).setCookies.some((c) => /^m3l\.sid=;/.test(c)));
  } finally {
    await app.stop();
  }
});

test('Abmelden löscht das Cookie unter dem Basis-Pfad; die alte Sitzung gilt nicht mehr', async () => {
  const app = await start();
  try {
    const login = await app.req('POST', '/api/auth/login', { body: { email: mail('admin'), password: pw('admin') } });
    const cookie = sid(login.setCookies);
    const out = await app.req('POST', '/api/auth/logout', { cookie });
    assert.equal(out.status, 200);
    assert.ok(out.setCookies.some((c) => /^m3l\.sid=;/.test(c) && /Path=\/mosaik3lab/.test(c)), 'Cookie unter /mosaik3lab gelöscht');
    assert.equal((await app.req('GET', '/api/auth/me', { cookie })).json.user, null);
    assert.equal((await app.req('GET', '/api/dashboard', { cookie })).status, 401);
  } finally {
    await app.stop();
  }
});

test('Demo-Zugänge abgeschaltet: bestehende Demo-Sitzung → abgemeldet (me ohne 401), neuer Login klar abgelehnt', async () => {
  let app = await start(true);
  const login = await app.req('POST', '/api/auth/login', { body: { email: mail('admin'), password: pw('admin') } });
  const cookie = sid(login.setCookies);
  await app.stop();
  app = await start(false);
  try {
    const me = await app.req('GET', '/api/auth/me', { cookie });
    assert.equal(me.status, 200);
    assert.equal(me.json.user, null);
    assert.equal((await app.req('GET', '/api/dashboard', { cookie })).status, 401);
    const again = await app.req('POST', '/api/auth/login', { body: { email: mail('admin'), password: pw('admin') } });
    assert.equal(again.status, 403);
    assert.match(again.json.error, /Demo-Zugänge/);
  } finally {
    await app.stop();
  }
});
