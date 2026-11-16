// Sitzungsprüfung im Client: Verbindungsprobleme ≠ abgemeldet, Wiederholung, Zeitüberschreitung, eine Prüfung für viele 401.
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

const { api, ApiError, isConnectionProblem, onUnauthorized } = await import('../src/lib/api.ts');
const { einmalig, pruefeSitzung } = await import('../src/auth/sitzungPruefen.ts');

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
const antwort = (status: number, body: string) => Promise.resolve(new Response(body, { status }));
const keinePause = { pause: () => Promise.resolve() };
const ANGEMELDET = { user: { role: 'admin' } as never, permissions: [] };

test('Proxy-Fehler (5xx ohne JSON) und fehlende Antwort gelten als Verbindungsproblem, 401/403/500 mit JSON nicht', async () => {
  for (const [status, body, erwartet] of [
    [502, '', true],
    [500, 'Internal Server Error', true],
    [504, '', true],
    [500, '{"error":"Ein unerwarteter Serverfehler ist aufgetreten."}', false],
    [401, '{"error":"Bitte anmelden."}', false],
    [403, '{"error":"Keine Berechtigung."}', false],
  ] as const) {
    globalThis.fetch = () => antwort(status, body);
    const err = await api('/x', { silent401: true }).catch((e) => e);
    assert.ok(err instanceof ApiError);
    assert.equal(isConnectionProblem(err), erwartet, `${status} ${body}`);
  }
  globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  const err = await api('/x').catch((e) => e);
  assert.equal(err.status, 0);
  assert.ok(isConnectionProblem(err));
});

test('Nur 401 ohne silent401 ruft den Abmelde-Handler', async () => {
  let aufrufe = 0;
  onUnauthorized(() => aufrufe++);
  globalThis.fetch = () => antwort(401, '{"error":"Bitte anmelden."}');
  await api('/dashboard').catch(() => {});
  await api('/auth/login', { silent401: true }).catch(() => {});
  globalThis.fetch = () => antwort(502, '');
  await api('/dashboard').catch(() => {});
  assert.equal(aufrufe, 1);
});

test('pruefeSitzung wiederholt bei Verbindungsproblemen und liefert dann die Sitzung', async () => {
  let n = 0;
  const versuche: number[] = [];
  const s = await pruefeSitzung(
    async () => {
      if (++n < 3) throw new ApiError(502, 'weg');
      return ANGEMELDET;
    },
    { ...keinePause, onRetry: (v) => versuche.push(v) },
  );
  assert.equal(s, ANGEMELDET);
  assert.deepEqual(versuche, [2, 3]);
});

test('pruefeSitzung gibt nach drei Versuchen auf, fachliche Fehler sofort', async () => {
  let n = 0;
  const err = await pruefeSitzung(async () => {
    n++;
    throw new ApiError(0, 'weg');
  }, keinePause).catch((e) => e);
  assert.equal(n, 3);
  assert.ok(isConnectionProblem(err));
  n = 0;
  await pruefeSitzung(async () => {
    n++;
    throw new ApiError(400, 'kaputt');
  }, keinePause).catch(() => {});
  assert.equal(n, 1);
});

test('einmalig: viele gleichzeitige 401 → eine Prüfung; danach wieder neu', async () => {
  let n = 0;
  const pruefen = einmalig(async () => {
    n++;
    await new Promise((r) => setTimeout(r, 10));
    return n;
  });
  const r = await Promise.all([pruefen(), pruefen(), pruefen()]);
  assert.deepEqual(r, [1, 1, 1]);
  assert.equal(await pruefen(), 2);
});

test('Jede Anfrage hat eine Zeitgrenze (keine endlose Ladeanzeige) – außer Uploads und ausdrücklich timeoutMs: 0', async () => {
  const signale: (AbortSignal | null | undefined)[] = [];
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    signale.push(init?.signal);
    return antwort(200, '{}');
  }) as typeof fetch;
  await api('/items');
  await api('/items', { method: 'POST', body: { a: 1 } });
  await api('/items/1/images', { method: 'POST', form: new FormData() });
  await api('/admin/daten/import/ausfuehren', { method: 'POST', body: {}, timeoutMs: 0 });
  assert.deepEqual(signale.map((s) => s instanceof AbortSignal), [true, true, false, false]);
});

test('Hängende Verbindung: nach der Zeitgrenze Verbindungsfehler statt ewigem Warten', async () => {
  globalThis.fetch = ((_url: string, init?: RequestInit) =>
    new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))) as typeof fetch;
  const start = Date.now();
  const err = await api('/items', { timeoutMs: 20 }).catch((e) => e);
  assert.ok(isConnectionProblem(err));
  assert.equal(err.status, 0);
  assert.ok(Date.now() - start < 2000, 'bricht nach der Zeitgrenze ab');
});
