// Gemeinsame Helfer des Server-Managers: DOM, API, Meldungen, Dialog, Icons. Geteilter Zustand in ctx.
export const ctx = { system: null, status: null, remote: false, appBase: '', managerPort: 5190, refresh: () => {}, showLogin: () => {} };
const TOKEN = document.querySelector('meta[name="csrf-token"]').content;
const $ = (s) => document.querySelector(s);

// ---------- Helfer ----------
async function api(path, body) {
  // relativ zu <base href> – direkt „/api/…“, über die App-Adresse „/<pfad>/manager/api/…“
  // Abfragen enden nach 20 s (hängende Verbindung → Meldung statt ewig „wird geladen“); Aktionen (POST) dürfen dauern.
  const opts = body === undefined ? { signal: AbortSignal.timeout(20_000) } : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Manager-Token': TOKEN }, body: JSON.stringify(body) };
  const res = await fetch(`api/${path}`, opts).catch(() => {
    throw new Error('Der Server-Manager antwortet nicht');
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 502 || res.status === 504) throw new Error('Der Server-Manager antwortet nicht'); // Portal/Proxy ohne Manager dahinter
  if (res.status === 401 && !path.startsWith('auth')) return ctx.showLogin();
  if (res.status === 403 && data.code === 'app-admin') return location.reload(); // App-Sitzung abgelaufen
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Fehler ${res.status}`), data);
  return data;
}
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'testid') e.dataset.testid = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.flat().filter((x) => x !== null && x !== undefined && x !== false));
  return e;
}
const light = (state, text, testid) => el('span', { class: `light ${state}`, 'data-state': state, testid }, text);
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
function since(iso) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'weniger als 1 Min';
  return s < 3600 ? `${Math.floor(s / 60)} Min` : s < 86400 ? `${Math.floor(s / 3600)} Std` : (Math.floor(s / 86400) === 1 ? '1 Tag' : `${Math.floor(s / 86400)} Tagen`);
}
function toast(text, error = false, hint) {
  const t = el('div', { class: `toast${error ? ' error' : ''}`, role: error ? 'alert' : 'status' }, el('strong', {}, text), hint ? el('div', {}, `Was tun? ${hint}`) : null);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), error ? 10000 : 4500);
}
const emergency = () => `Notzugang: Startet die App einmal gar nicht, kommen Sie direkt am Server unter 127.0.0.1:${ctx.managerPort} hinein – mit demselben Admin-Login.`;
/** Vor Änderungen, die den Zugang über die App-Adresse kappen können (Port, Pfad, Netz, Stoppen): klar nachfragen. */
const confirmAccess = (title, what) => confirmBox(title, `${what} Mosaik³LAB und dieser Manager sind danach womöglich unter einer anderen Adresse oder kurz gar nicht erreichbar. ${emergency()}`, 'Trotzdem ändern');
const showError = (err) => toast(err.message, true, err.hint ?? (err.command ? 'Befehl als Administrator ausführen (siehe Protokoll).' : undefined));
const askPassword = () => window.prompt('Diese Sicherung ist mit einem Passwort geschützt. Bitte das Passwort der Sicherung eingeben:');
const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`).replace('.', ',');
/** Anlass einer Sicherung in Klartext. */
const reasonText = (r = '') => (/^Zeitplan/.test(r) ? 'automatisch' : /^manuell/.test(r) ? 'von Hand' : r.replace(/ mosaik3lab-.*/, ''));

/** Versionen vergleichen („1.2.3“): -1 / 0 / 1; fehlt eine, gilt sie als 0.0.0. */
function cmpVer(a, b) {
  const p = (v) => String(v ?? '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? 1 : -1;
  return 0;
}
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

// ---------- Icons (inline, ohne externe Dateien – CSP erlaubt nur 'self') ----------
const ICONS = {
  update: ['M21 12a9 9 0 1 1-2.64-6.36L21 8', 'M21 3v5h-5'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
  check: ['M20 6 9 17l-5-5'],
  ok: ['M22 11.1V12a10 10 0 1 1-5.9-9.1', 'M22 4 12 14l-3-3'],
  warn: ['M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01'],
  error: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M15 9l-6 6', 'M9 9l6 6'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
  backup: ['M3 4h18v4H3z', 'M5 8v12h14V8', 'M10 12h4'],
  star: ['M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z'],
  server: ['M4 3h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M4 13h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z', 'M6 7h.01', 'M6 17h.01'],
  link: ['M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7', 'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  mail: ['M3 5h18v14H3z', 'M3 7l9 6 9-6'],
  folder: ['M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  move: ['M5 12h14', 'M13 6l6 6-6 6'],
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
};
/** Kleines Icon (rein schmückend, aria-hidden) – die Bedeutung steht immer auch als Text daneben. */
function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', class: `ico ico-${name}`, 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
  for (const d of ICONS[name] ?? []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
for (const ph of document.querySelectorAll('[data-icon]')) ph.replaceWith(icon(ph.dataset.icon));


function confirmBox(title, text, yes = 'Ausführen') {
  const d = $('#dlg-confirm');
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  $('#confirm-yes').textContent = yes;
  d.showModal();
  // Direkt auf die Knöpfe hören (nicht auf „close“ – das feuert nicht in jeder Umgebung zuverlässig).
  return new Promise((resolve) => {
    const done = (ok) => (e) => {
      e?.preventDefault();
      d.querySelectorAll('button').forEach((b) => (b.onclick = null));
      d.oncancel = null;
      d.close();
      resolve(ok);
    };
    $('#confirm-yes').onclick = done(true);
    d.querySelector('button[value="no"]').onclick = done(false);
    d.oncancel = done(false);
  });
}

/** Knopf mit Ladezustand: führt fn aus, meldet Ergebnis/Fehler, aktualisiert danach die Seite. */
async function busy(btn, fn, done) {
  btn.disabled = true;
  btn.classList.add('busy');
  btn.setAttribute('aria-busy', 'true');
  try {
    const r = await fn();
    if (r !== false && done) toast(typeof done === 'function' ? done(r) : done);
    return r;
  } catch (err) {
    showError(err);
  } finally {
    btn.disabled = false;
    btn.classList.remove('busy');
    btn.removeAttribute('aria-busy');
    ctx.refresh();
  }
}
const action = (btn, fn, done) => (btn.addEventListener('click', () => busy(btn, fn, done)), btn);
const drawn = {};
/** true, wenn sich der Inhalt eines Bereichs seit dem letzten Zeichnen geändert hat. */
function changed(key, data) {
  const sig = JSON.stringify(data);
  if (drawn[key] === sig) return false;
  drawn[key] = sig;
  return true;
}

export { $, api, el, light, fmt, since, toast, emergency, confirmAccess, showError, askPassword, fmtBytes, reasonText, cmpVer, fmtDay, icon, confirmBox, busy, action, changed };
