// Server-Manager – eine ruhige Seite: Gesamtstatus (ein Satz + Knopf), Adresse, Dienste, Backup, Update (nur wenn
// verfügbar), wenige Einstellungen. Alles Weitere unter „Erweitert“ (standardmäßig zu). Nutzt nur die JSON-API.
const TOKEN = document.querySelector('meta[name="csrf-token"]').content;
const $ = (s) => document.querySelector(s);
let status = null;
let timer = null;
let remote = false; // über die App-Adresse (<pfad>/manager) geöffnet → angemeldet über die App
let managerPort = 5190; // Notzugang direkt am Server (wird aus den Einstellungen gelesen)

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
  if (res.status === 401 && !path.startsWith('auth')) return showLogin();
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
  return s < 3600 ? `${Math.floor(s / 60)} Min` : s < 86400 ? `${Math.floor(s / 3600)} Std` : `${Math.floor(s / 86400)} Tage`;
}
function toast(text, error = false, hint) {
  const t = el('div', { class: `toast${error ? ' error' : ''}`, role: error ? 'alert' : 'status' }, el('strong', {}, text), hint ? el('div', {}, `Was tun? ${hint}`) : null);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), error ? 10000 : 4500);
}
const emergency = () => `Notzugang: Startet die App einmal gar nicht, kommst du direkt am Server unter 127.0.0.1:${managerPort} rein, mit demselben Admin-Login.`;
/** Vor Änderungen, die den Zugang über die App-Adresse kappen können (Port, Pfad, Netz, Stoppen): klar nachfragen. */
const confirmAccess = (title, what) => confirmBox(title, `${what} Mosaik³LAB und dieser Manager sind danach womöglich unter einer anderen Adresse oder kurz gar nicht erreichbar. ${emergency()}`, 'Trotzdem ändern');
const showError = (err) => toast(err.message, true, err.hint ?? (err.command ? 'Befehl als Administrator ausführen (siehe Protokoll).' : undefined));
const askPassword = () => window.prompt('Diese Sicherung ist mit einem Passwort geschützt. Bitte das Passwort der Sicherung eingeben:');
const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`).replace('.', ',');
/** Anlass einer Sicherung in Klartext. */
const reasonText = (r = '') => (/^Zeitplan/.test(r) ? 'automatisch' : /^manuell/.test(r) ? 'von Hand' : r.replace(/ mosaik3lab-.*/, ''));

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
    refresh();
  }
}
const action = (btn, fn, done) => (btn.addEventListener('click', () => busy(btn, fn, done)), btn);

// ---------- Anmeldung, Ersteinrichtung ----------
function showLogin() {
  clearInterval(timer);
  $('#main').hidden = true;
  $('#tools').hidden = true;
  $('#login-note').textContent = emergency();
  if (!$('#dlg-login').open) $('#dlg-login').showModal();
  $('#login-email').focus();
}
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('auth/login', { email: $('#login-email').value, password: $('#login-pw').value });
    $('#login-pw').value = '';
    $('#login-error').hidden = true;
    $('#dlg-login').close();
    start();
  } catch (err) {
    $('#login-error').textContent = err.message;
    $('#login-error').hidden = false;
  }
});
$('#form-first').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#first-error');
  try {
    await api('auth/first', { email: $('#first-email').value.trim(), name: $('#first-name').value.trim(), password: $('#first-pw').value });
    $('#first-pw').value = '';
    $('#dlg-first').close();
    start();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});
for (const d of ['#dlg-login', '#dlg-first']) $(d).addEventListener('cancel', (e) => e.preventDefault());
$('#btn-logout').addEventListener('click', async () => {
  await api('auth/logout', {});
  showLogin();
});

// ---------- Gesamtstatus: ein Satz + Knopf zur Lösung ----------
const FIX = {
  'start:webapp': ['Web-App starten', () => api('services/webapp/start', {})],
  'start:backup': ['Backup-Dienst starten', () => api('services/backup/start', {})],
  'start:portal': ['Portal starten', () => api('services/portal/start', {})],
  backup: ['Jetzt sichern', () => api('backup', {})],
  reconcile: ['Abgleichen', () => api('reconcile', {}).then(showReconcile)],
  'backup-password': ['Passwortschutz einrichten', () => makeBackupPassword()],
  https: ['HTTPS-Einstellungen öffnen', () => openSection('#https')],
  advanced: ['Erweitert öffnen', () => openSection('#advanced')],
};
/** Knopf zu einem Hinweis; „portal-port:8080“ = Portal auf einen freien Ausweich-Port legen (Port 80 belegt). */
const fixFor = (k) => FIX[k] ?? (/^portal-port:\d+$/.test(k ?? '') ? [`Port ${k.slice(12)} verwenden`, () => api('portal', { httpPort: Number(k.slice(12)) })] : null);
function openSection(sel) {
  const d = $(sel);
  if (sel !== '#advanced') $('#h-settings').scrollIntoView({ behavior: 'smooth' });
  d.open = true;
  d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  d.querySelector('summary')?.focus();
  return false;
}
$('#btn-fix').addEventListener('click', (e) => {
  const fix = fixFor(e.currentTarget.dataset.fix);
  if (fix) busy(e.currentTarget, fix[1], (r) => (r === false ? '' : 'Erledigt.'));
});

function renderSummary(s) {
  $('#summary').dataset.state = s.summary.light;
  $('#overall').replaceChildren(light(s.summary.light, { ok: 'in Ordnung', warn: 'Hinweis', error: 'Handlungsbedarf' }[s.summary.light] ?? ''));
  $('#summary-text').textContent = s.summary.text;
  const fix = fixFor(s.summary.fix);
  $('#btn-fix').hidden = !fix;
  if (fix) Object.assign($('#btn-fix'), { textContent: fix[0] }).dataset.fix = s.summary.fix;
  const more = s.notes.filter((n) => n.light === 'warn' || n.light === 'error').slice(1);
  if (changed('notes', [more, s.summary.fix])) $('#notes').replaceChildren(...more.map((n) => el('li', { class: n.light }, n.text, fixFor(n.fix) && n.fix !== s.summary.fix ? el('button', { type: 'button', class: 'link', onclick: (e) => busy(e.currentTarget, fixFor(n.fix)[1], 'Erledigt.') }, fixFor(n.fix)[0]) : null)));
  $('#checked').textContent = `aktualisiert ${new Date(s.checkedAt).toLocaleTimeString('de-DE')}`;
}

// ---------- Seite ----------
const drawn = {};
/** true, wenn sich der Inhalt eines Bereichs seit dem letzten Zeichnen geändert hat. */
function changed(key, data) {
  const sig = JSON.stringify(data);
  if (drawn[key] === sig) return false;
  drawn[key] = sig;
  return true;
}
let loading = null;
let again = false;
/** Status holen und zeichnen; läuft schon eine Abfrage, folgt danach genau eine weitere. Fehler zeigt der Statussatz. */
function refresh() {
  if (loading) {
    again = true;
    return loading;
  }
  loading = (async () => {
    try {
      const s = await api('status');
      if (!s) return;
      status = s;
      render(s);
    } catch (err) {
      $('#summary').dataset.state = 'error';
      $('#overall').replaceChildren(light('error', 'Fehler'));
      $('#summary-text').textContent = `Der Status konnte nicht geladen werden (${err.message}). Neuer Versuch in wenigen Sekunden.`;
      $('#btn-fix').hidden = true;
    } finally {
      $('#summary').removeAttribute('aria-busy');
      loading = null;
      if (again) {
        again = false;
        refresh();
      }
    }
  })();
  return loading;
}
function render(s) {
  renderSummary(s);

  // Adresse der App
  if (!remote) $('#back-app').href = s.addresses.local; // über die App-Adresse: „../“ = <pfad>/
  const main = s.addresses.network[0] ?? s.addresses.local;
  Object.assign($('#app-link'), { href: main, textContent: main.replace(/\/$/, '') }); // z. B. http://server/mosaik3lab
  $('#address-more').textContent = s.addresses.network.length
    ? `Auf diesem Rechner: ${s.addresses.local}${s.addresses.network.length > 1 ? ` · weitere Adressen: ${s.addresses.network.slice(1, 3).join(' · ')}` : ''}`
    : 'Nur auf diesem Rechner erreichbar. Für Geräte im Schulnetz: Einstellungen → „Im Schulnetz erreichbar“.';

  // Dienste: läuft / gestoppt, Neustart. Nur bei echter Änderung neu zeichnen – sonst ginge alle 5 s der Tastaturfokus verloren.
  const shown = s.services.filter((v) => v.key !== 'portal' || s.portal?.enabled);
  const detailOf = (v) => [v.since && `läuft seit ${since(v.since)}`, v.nextRun && `nächste Sicherung ${fmt(v.nextRun)}`, v.installed && 'als Dienst eingerichtet'].filter(Boolean).join(' · ');
  if (changed('services', shown.map((v) => [v.key, v.light, v.label, v.running, v.external, v.lastError, v.installed, v.nextRun]))) $('#services').replaceChildren(...shown.map((v) => {
    const detail = detailOf(v);
    const btn = (label, verb, cls) => action(el('button', { type: 'button', class: cls, testid: `${v.key}-${verb}` }, label), async () => {
      if (verb === 'stop' && !(await confirmBox(`${v.title} stoppen?`, v.key === 'backup' ? 'Geplante Sicherungen finden dann nicht statt.' : `Mosaik³LAB ist danach nicht erreichbar – über die App-Adresse auch dieser Manager nicht. ${emergency()}`, 'Stoppen'))) return false;
      return api(`services/${v.key}/${verb}`, {});
    }, `${v.title}: ${label} – erledigt.`);
    return el('div', { class: 'svc', testid: `svc-${v.key}` },
      el('div', { class: 'svc-head' }, el('strong', {}, v.title.replace('Mosaik³LAB ', '')), light(v.light, v.label, `${v.key}-light`)),
      el('div', { class: 'muted small detail' }, detail),
      v.lastError && v.light !== 'ok' ? el('div', { class: 'error small' }, v.lastError) : null,
      v.external ? el('div', { class: 'muted small', testid: `${v.key}-external` }, 'Starten und Stoppen dort, wo sie gestartet wurde – hier nichts zu tun.')
        : el('div', { class: 'row' }, ...(v.running ? [btn('Neu starten', 'restart'), btn('Stoppen', 'stop', 'danger')] : [btn('Starten', 'start', 'primary')])));
  }));
  else for (const v of shown) { const d = document.querySelector(`[data-testid="svc-${v.key}"] .detail`); if (d) d.textContent = detailOf(v); }

  // Sicherung
  const last = s.lastBackup;
  $('#backup-last').replaceChildren(last ? el('span', {}, 'Letzte Sicherung: ', el('strong', {}, fmt(last.created)), ` (vor ${since(last.created)})`) : el('strong', {}, 'Noch keine Sicherung.'));
  $('#backup-next').textContent = !s.backupAuto ? 'Die automatische Sicherung ist ausgeschaltet.' : s.nextBackup ? `Nächste automatische Sicherung: ${fmt(s.nextBackup)}` : 'Automatische Sicherung: der Backup-Dienst läuft nicht (siehe „Dienste“).';
  $('#backup-crypto-state').textContent = s.backupEncrypted ? '– eingeschaltet' : '– aus';
  $('#backup-crypto').textContent = s.backupEncrypted ? 'Neue Sicherungen sind mit Passwort geschützt.' : 'Sicherungen sind noch nicht geschützt. Empfehlung: Passwort erzeugen.';
  $('#btn-bk-password').hidden = s.backupEncrypted;
  $('#btn-bk-new').hidden = !s.backupEncrypted;
  $('#btn-bk-off').hidden = !s.backupEncrypted;
  $('#backup-dir-show').textContent = s.backupDir ?? '';
  if (changed('backups', s.backups.map((b) => [b.id, b.encrypted]).concat(s.backupEncrypted))) renderBackupTable(s);

  // Update: nur wenn etwas verfügbar ist
  const app = s.updates.app?.available ? s.updates.app : null;
  const rt = s.updates.runtime ?? [];
  $('#card-update').hidden = !app && !rt.length;
  if (changed('updates', [app, rt.map((r) => [r.id, r.label])])) $('#updates').replaceChildren(
    app ? el('div', { class: 'svc' }, el('div', { class: 'svc-head' }, el('strong', {}, `Mosaik³LAB ${app.id}`), action(el('button', { type: 'button', class: 'primary', testid: 'update-install' }, 'Installieren'), installUpdate)), app.changes?.length ? el('ul', { class: 'small' }, app.changes.map((c) => el('li', {}, c))) : null) : null,
    ...rt.map((row) => el('div', { class: 'svc', testid: `runtime-update-${row.id}` }, el('div', { class: 'svc-head' }, el('strong', {}, row.title), el('button', { type: 'button', onclick: (e) => updateRuntime(row, e.currentTarget) }, row.action === 'install' ? 'Installieren' : 'Aktualisieren')), el('div', { class: 'muted small' }, row.label))));

  // Erweitert: Version, Fakten
  $('#version').textContent = s.version?.version ? `${s.version.version}${s.version.id && s.version.id !== 'Arbeitskopie' ? ` (${s.version.id})` : ' (Arbeitskopie)'}` : s.version?.id ?? '–';
  $('#node').textContent = `· Node.js ${s.node}`;
  $('#facts').textContent = [`Mailversand eingerichtet: ${s.mail.label}`, `Datenbank: ${s.database.label}`, ...s.notes.filter((n) => n.light === 'info').map((n) => n.text)].join(' · ');
}

function renderBackupTable(s) {
  $('#backups').replaceChildren(s.backups.length
    ? el('div', { class: 'table-wrap' }, el('table', { testid: 'backup-table' }, el('thead', {}, el('tr', {}, el('th', {}, 'Zeitpunkt'), el('th', {}, 'Anlass'), el('th', {}, 'Größe'), el('th', {}, el('span', { class: 'sr-only' }, 'Aktion')))),
      el('tbody', {}, s.backups.map((b) => el('tr', {},
        el('td', {}, fmt(b.created), b.encrypted ? el('span', { title: 'mit Passwort geschützt', 'aria-label': 'mit Passwort geschützt' }, ' 🔒') : null),
        el('td', {}, reasonText(b.reason), b.kind === 'daten' ? el('div', { class: 'muted small' }, 'ältere Art, ohne Bilder') : null),
        el('td', {}, fmtBytes(b.bytes ?? 0)),
        el('td', {}, action(el('button', { type: 'button', testid: `restore-${b.id}`, 'aria-label': `Sicherung vom ${fmt(b.created)} wiederherstellen` }, 'Wiederherstellen'), () => restore(b), 'Wiederhergestellt und geprüft – alles läuft wieder mit dem Stand der Sicherung.')))))))
    : el('p', { class: 'empty' }, 'Noch keine Sicherung.'));
}

// ---------- Sicherung ----------
action($('#btn-backup'), () => api('backup', {}), () => 'Gesichert und geprüft.');
async function restore(b) {
  const ohneBilder = b.kind === 'daten' ? ' Diese ältere Sicherung enthält keine Bilder und Druckdateien – die vorhandenen bleiben.' : '';
  if (!(await confirmBox('Diese Sicherung wiederherstellen?', `Alles wird auf den Stand vom ${fmt(b.created)} zurückgesetzt: Einstellungen, Konten, Anfragen und Druckteile.${ohneBilder} Was seitdem dazugekommen ist, ist danach weg. Der jetzige Stand wird vorher automatisch gesichert. Mosaik³LAB ist dafür kurz nicht erreichbar.`, 'Ja, wiederherstellen'))) return false;
  // Geschützte Sicherung ohne Passwort auf diesem Rechner (z. B. von einem anderen Rechner): Passwort abfragen.
  const password = b.encrypted && !status?.backupEncrypted ? askPassword() : undefined;
  if (b.encrypted && !status?.backupEncrypted && !password) return false;
  const r = await api('backup/restore', { id: b.id, confirm: b.id, password, autoStop: true });
  showReconcile(r.reconcile);
  await askPaths(r.reconcile);
  return r;
}

async function makeBackupPassword() {
  if (!(await confirmBox('Passwort für Sicherungen erzeugen?', 'Neue Sicherungen werden ab jetzt mit diesem Passwort verschlüsselt. Es wird nur einmal angezeigt. Ohne dieses Passwort lässt sich eine Sicherung nicht zurückspielen – bitte aufschreiben und sicher aufbewahren.', 'Erzeugen'))) return false;
  const r = await api('backup/password', { generate: true });
  $('#backup-protect').open = true;
  $('#backup-secret').replaceChildren(el('p', { class: 'error', role: 'alert' }, 'Passwort der Sicherungen (jetzt aufschreiben – wird nicht erneut angezeigt): ', el('code', { testid: 'backup-secret-value' }, r.password)));
  $('#backup-secret').scrollIntoView({ behavior: 'smooth', block: 'center' });
  return r;
}
action($('#btn-bk-password'), makeBackupPassword, false);
action($('#btn-bk-new'), makeBackupPassword, false);
action($('#btn-bk-off'), async () => {
  if (!(await confirmBox('Passwortschutz ausschalten?', 'Neue Sicherungen enthalten dann Passwörter und Daten der Schule lesbar.', 'Ausschalten'))) return false;
  return api('backup/password', { disable: true });
}, 'Passwortschutz ausgeschaltet.');

// ---------- Update, Laufzeit ----------
const stepList = (u) => [el('ol', { class: 'steps' }, u.steps.map((st) => el('li', {}, light(st.status === 'fertig' ? 'ok' : st.status === 'fehler' ? 'error' : 'warn', st.status), el('span', { class: 'detail' }, `${st.id}${st.detail ? ` – ${st.detail}` : ''}`)))), u.result ? el('p', { class: u.result.ok ? '' : 'error' }, u.result.message) : null, u.result && !u.result.ok && u.result.hint ? el('p', { class: 'small' }, `Was tun? ${u.result.hint}`) : null];
async function installUpdate() {
  if (!(await confirmBox('Update installieren?', 'Vorher wird gesichert. Die Web-App ist kurz nicht erreichbar. Startet die neue Version nicht, wird automatisch zur bisherigen zurückgekehrt.', 'Installieren'))) return false;
  await api('update/install', {});
  for (let i = 0; i < 400; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const u = await api('update').catch(() => null);
    if (!u) continue;
    $('#updates').replaceChildren(...stepList(u));
    if (u.phase !== 'running') return u.result?.ok ? (setTimeout(() => location.reload(), 4000), true) : false;
  }
  return false;
}
action($('#btn-check'), async () => {
  const u = await api('update/check', {});
  $('#update-info').replaceChildren(el('p', {}, u.available ? `Neue Version verfügbar: ${u.id} – siehe Karte „Update verfügbar“.` : `Aktuell (${u.id}).`));
  return false;
});
const LIGHT_TEXT = { ok: 'aktuell', warn: 'Update', error: 'Handlungsbedarf', info: 'Info' };
async function loadRuntime() {
  const r = await api('runtime');
  $('#runtime-rows').replaceChildren(...r.rows.map((row) => el('li', { testid: `runtime-${row.id}` },
    light(row.light, LIGHT_TEXT[row.light] ?? row.light),
    el('span', { class: 'detail' }, `${row.title}: ${row.label}`),
    row.action && row.light !== 'ok' ? el('button', { type: 'button', class: row.light === 'warn' || row.light === 'error' ? 'primary' : null, 'aria-label': `${row.title} ${row.action === 'install' ? 'installieren' : 'aktualisieren'}`, onclick: (e) => updateRuntime(row, e.currentTarget) }, row.action === 'install' ? 'Installieren' : 'Aktualisieren') : el('span'),
    row.hint && row.light !== 'ok' ? el('div', { class: 'muted small' }, `Was tun? ${row.hint}`) : null)));
}
async function updateRuntime(row, btn) {
  const what = row.action === 'install' ? 'installieren' : 'aktualisieren';
  if (!(await confirmBox(`${row.title} ${what}?`, 'Vorher wird gesichert. Die Web-App ist kurz nicht erreichbar. Windows fragt ggf. nach einer Bestätigung. Scheitert etwas, bleiben die Daten unverändert und Sie sehen, wie Sie zurückgehen.', row.action === 'install' ? 'Installieren' : 'Aktualisieren'))) return;
  btn.disabled = true;
  try {
    await api('runtime/update', { what: row.id });
    for (let i = 0; i < 400; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const u = await api('runtime/progress').catch(() => null); // der Manager startet nach Node-/Wrapper-Updates kurz neu
      if (!u) continue;
      $('#runtime-info').replaceChildren(...stepList(u));
      if (u.phase !== 'running') break;
    }
  } catch (err) {
    showError(err);
  } finally {
    btn.disabled = false;
    refresh();
  }
}
action($('#btn-runtime-check'), loadRuntime, false);
action($('#btn-audit'), async () => {
  const r = await api('runtime/audit', {});
  $('#audit-info').replaceChildren(light(r.light, LIGHT_TEXT[r.light] ?? r.light), ` ${r.label}`);
}, false);

// ---------- Abgleichen ----------
function showReconcile(r) {
  if (!r) return r;
  $('#reconcile-info').replaceChildren(el('ol', { class: 'steps' }, r.steps.map((st) => el('li', {}, light({ ok: 'ok', fertig: 'ok', geplant: 'warn', fehler: 'error', warnung: 'warn', rueckfrage: 'warn' }[st.status] ?? 'info', st.status), el('span', { class: 'detail' }, st.detail)))));
  return r;
}
/** Ordner, die auf diesem Rechner nicht passen (z. B. anderes Laufwerk): nachfragen und erneut abgleichen. */
async function askPaths(r) {
  if (!r?.needsInput?.length) return;
  const paths = {};
  for (const n of r.needsInput) {
    const answer = window.prompt(`${n.label}: ${n.path}\n${n.reason}\nBitte einen anderen Ordner (vollständiger Pfad) angeben:`, n.path);
    if (answer) paths[n.key] = answer;
  }
  if (Object.keys(paths).length) showReconcile(await api('reconcile', { paths }));
}
action($('#btn-reconcile'), async () => {
  const r = showReconcile(await api('reconcile', {}));
  await askPaths(r);
  return r;
}, 'Abgleich erledigt.');

// ---------- Protokoll (unter „Erweitert“) ----------
async function showLog() {
  const lines = await api(`logs?which=${$('#log-which').value}`);
  $('#log-text').replaceChildren(...(lines.length ? lines.map((l) => el('span', { class: l.error ? 'err' : null }, `${l.text}\n`)) : ['(leer)']));
  $('#log-text').scrollTop = $('#log-text').scrollHeight;
}
$('#log-which').addEventListener('change', () => showLog().catch(showError));

// ---------- Einstellungen (wenige) ----------
const form = $('#form-settings');
const adv = $('#form-advanced');
let loaded = {}; // Stand beim Laden – gespeichert wird nur, was sich geändert hat
const certText = (c) => (!c?.present ? 'Es ist noch kein Zertifikat hinterlegt.' : c.valid ? `Zertifikat: ${c.subject}, gültig bis ${c.notAfter.slice(0, 10)} (noch ${c.daysLeft} Tage)${c.warnings.length ? ` – Hinweis: ${c.warnings.join(' ')}` : ''}` : `Zertifikat nicht verwendbar: ${c.problems.join(' ')}`);
const mailBody = (f) => ({ enabled: f.mailEnabled.checked, host: f.mailHost.value.trim(), port: Number(f.mailPort.value) || 587, secure: f.mailSecure.value === 'true', user: f.mailUser.value.trim(), from: f.mailFrom.value.trim(), recipients: f.mailRecipients.value, appBaseUrl: f.mailBaseUrl.value.trim() });
const portalBody = (f) => ({ basePath: f.portalPath.value.trim(), https: f.portalHttps.checked });
const advBody = (f) => ({ appPort: Number(f.appPort.value), dataDir: f.dataDir.value.trim(), ablageDir: f.ablageDir.value.trim(), moveAblage: f.moveAblage.checked });
const backupForm = $('#form-backup');
const backupBody = (f) => ({ backupEnabled: f.backupEnabled.checked, backupTime: f.backupTime.value, backupKeep: Number(f.backupKeep.value), backupDir: f.backupDir.value.trim() });
const advPortal = (f) => ({ enabled: f.portalEnabled.checked, httpPort: Number(f.portalHttpPort.value), httpsPort: Number(f.portalHttpsPort.value) });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function loadSettings() {
  const [s, m, p] = await Promise.all([api('settings'), api('mail'), api('portal')]);
  const f = form.elements;
  managerPort = s.managerPort;
  f.network.checked = s.network;
  f.portalPath.value = p.basePath;
  f.portalHttps.checked = p.https;
  const bf = backupForm.elements;
  bf.backupEnabled.checked = s.backupEnabled !== false;
  bf.backupTime.value = s.backupTime;
  bf.backupKeep.value = s.backupKeep;
  bf.backupDir.value = s.backupDir;
  f.mailEnabled.checked = m.enabled;
  f.mailHost.value = m.host;
  f.mailPort.value = m.port;
  f.mailSecure.value = String(m.secure);
  f.mailUser.value = m.user;
  f.mailPassword.value = '';
  f.mailPassword.placeholder = m.passwordSet ? 'gesetzt – leer lassen zum Behalten' : '';
  f.mailFrom.value = m.from;
  f.mailRecipients.value = m.recipients.join(', ');
  f.mailBaseUrl.value = m.appBaseUrl;
  f.mailBaseUrl.placeholder = status?.addresses ? (status.addresses.network[0] ?? status.addresses.local) : '';
  $('#mail-state').textContent = m.enabled ? (m.host && m.from ? '– eingerichtet' : '– bitte ausfüllen') : '';
  $('#mail-fields').hidden = !m.enabled;
  $('#mail-smtp').open = m.enabled && !(m.host && m.from);
  $('#portal-cert-state').textContent = certText(p.certificate) + (p.conflicts.length ? ` ${p.conflicts.map((c) => c.message).join(' ')} ${p.hint}` : '');
  $('#link-cert-download').hidden = !p.certificate?.present;
  const a = adv.elements;
  for (const k of ['appPort', 'dataDir', 'ablageDir']) a[k].value = s[k] ?? '';
  a.moveAblage.checked = false;
  a.portalEnabled.checked = p.enabled;
  a.portalHttpPort.value = p.httpPort;
  a.portalHttpsPort.value = p.httpsPort;
  loaded = { network: s.network, portal: portalBody(f), mail: mailBody(f), backup: backupBody(bf), adv: advBody(a), advPortal: advPortal(a) };
}
form.elements.mailEnabled.addEventListener('change', (e) => {
  $('#mail-fields').hidden = !e.target.checked;
  if (e.target.checked && !form.elements.mailHost.value) $('#mail-smtp').open = true;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = form.elements;
  const err = $('#settings-error');
  err.hidden = true;
  const btn = e.submitter ?? form.querySelector('[type=submit]');
  const pathChanged = !same(portalBody(f), loaded.portal);
  if (pathChanged && !(await confirmAccess('Adresse ändern?', `Neue Adresse: …${f.portalPath.value.trim() || '/'}${f.portalHttps.checked ? ' (HTTPS)' : ''}.`))) return;
  if (f.network.checked !== loaded.network && !f.network.checked && !(await confirmAccess('Nur noch auf diesem Rechner?', 'Geräte im Schulnetz erreichen Mosaik³LAB dann nicht mehr – auch diese Seite nicht, wenn sie nicht am Server selbst geöffnet ist.'))) return;
  await busy(btn, async () => {
    try {
      const done = [];
      // Reihenfolge: Pfad/HTTPS (bestimmt die Ports) → Netzfreigabe (Firewall, eine Windows-Bestätigung) → Rest
      if (pathChanged) {
        const r = await api('portal', portalBody(f));
        await askPaths(r.reconcile);
        done.push('Adresse');
      }
      if (f.network.checked !== loaded.network) {
        await api('firewall', { enabled: f.network.checked });
        done.push(f.network.checked ? 'im Schulnetz erreichbar' : 'nur noch auf diesem Rechner');
      }
      if (!same(mailBody(f), loaded.mail) || f.mailPassword.value) {
        await api('mail', { ...mailBody(f), password: f.mailPassword.value || undefined });
        done.push('E-Mail');
      }
      await loadSettings();
      return done;
    } catch (ex) {
      err.textContent = ex.hint ? `${ex.message} – ${ex.hint}` : ex.message;
      err.hidden = false;
      throw ex;
    }
  }, (done) => (done.length ? `Gespeichert: ${done.join(', ')}.` : 'Nichts geändert.'));
});

backupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#backup-error');
  err.hidden = true;
  await busy(e.submitter ?? backupForm.querySelector('[type=submit]'), async () => {
    try {
      if (same(backupBody(backupForm.elements), loaded.backup)) return 'Nichts geändert.';
      await api('settings', backupBody(backupForm.elements));
      await loadSettings();
      return 'Gespeichert.';
    } catch (ex) {
      err.textContent = ex.hint ? `${ex.message} – ${ex.hint}` : ex.message;
      err.hidden = false;
      throw ex;
    }
  }, (t) => t);
});

adv.addEventListener('submit', async (e) => {
  e.preventDefault();
  const a = adv.elements;
  const err = $('#advanced-error');
  err.hidden = true;
  const ports = !same(advPortal(a), loaded.advPortal) || Number(a.appPort.value) !== loaded.adv.appPort;
  if (ports && !(await confirmAccess('Ports bzw. Portal ändern?', 'Die Web-App startet danach neu.'))) return;
  await busy(e.submitter ?? adv.querySelector('[type=submit]'), async () => {
    try {
      let note = '';
      if (!same(advPortal(a), loaded.advPortal)) await api('portal', advPortal(a)).then((r) => askPaths(r.reconcile));
      if (!same(advBody(a), loaded.adv)) note = (await api('settings', advBody(a))).ablageNote ?? '';
      await loadSettings();
      return note;
    } catch (ex) {
      err.textContent = ex.hint ? `${ex.message} – ${ex.hint}` : ex.message;
      err.hidden = false;
      throw ex;
    }
  }, (note) => `Gespeichert.${note ? ` ${note}` : ''}`);
});

action($('#btn-mail-test'), async () => {
  $('#mail-result').textContent = 'Testmail wird gesendet …';
  const r = await api('mail/test', { to: form.elements.mailTestTo.value });
  $('#mail-result').textContent = `${r.ok ? '✔' : '✘'} ${r.message}`;
  $('#mail-result').className = `small full${r.ok ? '' : ' error'}`;
  return false;
});

// ---------- HTTPS: Zertifikat ----------
const readFile = (file, as) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(fr.result);
  fr.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
  as === 'base64' ? fr.readAsDataURL(file) : fr.readAsText(file);
});
action($('#btn-cert-generate'), async () => {
  const r = await api('portal/cert/generate', {});
  $('#portal-cert-state').textContent = certText(r.certificate);
  $('#link-cert-download').hidden = false;
  return r;
}, 'Zertifikat erzeugt – jetzt „HTTPS verwenden“ ankreuzen und speichern.');
$('#btn-cert-upload-toggle').addEventListener('click', () => ($('#cert-upload').hidden = !$('#cert-upload').hidden));
action($('#btn-cert-upload'), async () => {
  const f = form.elements;
  const body = {};
  if (f.certPfx.files[0]) Object.assign(body, { pfx: String(await readFile(f.certPfx.files[0], 'base64')).replace(/^data:[^,]*,/, ''), passphrase: f.certPass.value });
  else if (f.certPem.files[0] && f.certKey.files[0]) Object.assign(body, { cert: await readFile(f.certPem.files[0]), key: await readFile(f.certKey.files[0]) });
  else throw new Error('Bitte eine PFX-Datei (mit Passwort) oder Zertifikat und Schlüssel (PEM) auswählen.');
  const r = await api('portal/cert/upload', body);
  f.certPass.value = '';
  $('#portal-cert-state').textContent = certText(r.certificate);
  $('#link-cert-download').hidden = false;
  return r;
}, 'Zertifikat hinterlegt und geprüft.');

// ---------- Einrichten (unter „Erweitert“) ----------
const setupForm = $('#form-setup');
function showSteps(job) {
  $('#setup-steps').replaceChildren(...job.steps.map((st) => el('li', { 'data-state': st.status, testid: `step-${st.id}` },
    light({ fertig: 'ok', geplant: 'info', übersprungen: 'off', fehler: 'error', läuft: 'warn' }[st.status] ?? 'off', st.status),
    el('span', { class: 'detail' }, el('strong', {}, st.title), st.detail ? ` – ${st.detail}` : '')),
  ), ...[job.backupPassword ? el('li', {}, el('span', {}, ''), el('span', { class: 'error', role: 'alert' }, `Backup-Passwort (jetzt notieren – wird nicht erneut angezeigt): ${job.backupPassword}`)) : null, ...(job.needsInput ?? []).map((n) => el('li', {}, el('span', {}, 'Rückfrage:'), el('span', { class: 'error' }, `${n.label} ${n.path}: ${n.reason} – unter „Abweichende Ordner“ ${n.key}=<Ordner> eintragen und erneut einrichten.`))), job.error ? el('li', {}, el('span', {}, ''), el('span', { class: 'error' }, `${job.error}${job.hint ? ` Was tun? ${job.hint}` : ''}`)) : null, job.command ? el('li', {}, el('span', {}, 'Befehl:'), el('pre', { class: 'cmd' }, job.command)) : null].filter(Boolean));
}
async function loadSetup() {
  const { proposal, job } = await api('setup');
  const f = setupForm.elements;
  f.programRoot.value ||= proposal.programRoot;
  f.dataRoot.value ||= proposal.dataRoot;
  $('#wrapper-row').hidden = !proposal.needsWrapper;
  $('#setup-intro').textContent = `Kopiert Mosaik³LAB in den Programmordner, legt die Daten getrennt davon ab und richtet Dienste (Autostart, Neustart nach Absturz), Firewall und Verknüpfungen ein. „Probelauf“ zeigt zuerst, was passieren würde.${proposal.untested ? ' (Plattform ungetestet)' : ''}`;
  if (status?.mode === 'installation') $('#h-adv-setup').textContent = 'Einrichtung erneut ausführen / reparieren';
  if (job) showSteps(job);
}
async function runSetup(dryRun) {
  const f = setupForm.elements;
  const a = adv.elements;
  if (!dryRun && !(await confirmBox('Jetzt einrichten?', 'Mosaik³LAB wird als Programm eingerichtet. Für Dienste und Firewall fragt Windows nach Administratorrechten. Jeder Schritt kann bei Bedarf wiederholt werden.', 'Einrichten'))) return false;
  await api('setup', { dryRun, input: { programRoot: f.programRoot.value.trim(), dataRoot: f.dataRoot.value.trim(), appPort: Number(a.appPort.value), backupTime: form.elements.backupTime.value, backupKeep: Number(a.backupKeep.value), network: form.elements.network.checked, ...(f.adminEmail.value.trim() ? { admin: { email: f.adminEmail.value.trim(), name: f.adminName.value.trim(), password: f.adminPassword.value } } : {}), downloadWrapper: f.downloadWrapper.checked, ...(f.fromBackupDir.value.trim() ? { fromBackup: { dir: f.fromBackupDir.value.trim(), password: f.fromBackupPassword.value || undefined, paths: Object.fromEntries(f.fromBackupPaths.value.split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) } } : {}) } });
  for (;;) {
    await new Promise((r) => setTimeout(r, 1200));
    const { job } = await api('setup').catch(() => ({ job: null }));
    if (!job) {
      if (!dryRun) toast('Der Manager läuft jetzt als Dienst – Seite wird neu geladen …'); // Übergabe an den Manager-Dienst
      setTimeout(() => location.reload(), 4000);
      return true;
    }
    showSteps(job);
    if (job.phase !== 'läuft') {
      if (job.handover) setTimeout(() => location.reload(), 6000);
      return job.phase === 'fertig';
    }
  }
}
action($('#btn-dry'), () => runSetup(true));
action($('#btn-setup'), () => runSetup(false), 'Einrichtung abgeschlossen.');

// „Erweitert“ lädt seine Inhalte erst beim Aufklappen (Laufzeit fragt nodejs.org).
$('#advanced').addEventListener('toggle', (e) => {
  if (!e.target.open) return;
  loadRuntime().catch(() => {});
  showLog().catch(() => {});
  loadSetup().catch(() => {});
});

// ---------- Start ----------
async function start() {
  $('#main').hidden = false;
  $('#tools').hidden = false;
  if (!status) {
    $('#summary').setAttribute('aria-busy', 'true');
    $('#summary-text').textContent = 'Status wird geladen …';
  }
  await refresh();
  await loadSettings().catch(showError);
  clearInterval(timer);
  // Nicht neu zeichnen, während jemand tippt oder ein Dialog offen ist.
  timer = setInterval(() => !document.hidden && !document.querySelector('dialog[open]') && refresh(), 5000);
}
const auth = await api('auth').catch((err) => {
  // Ohne Antwort bliebe die Seite leer: Hinweis zeigen, „Neu laden“ versucht es erneut.
  $('#main').hidden = false;
  $('#summary').dataset.state = 'error';
  $('#summary-text').textContent = `${err.message}. Bitte die Seite in einer Minute neu laden.`;
  return null;
});
if (!auth) throw new Error('Anmeldestatus nicht ladbar');
remote = auth.remote === true;
managerPort = auth.managerPort ?? managerPort;
$('#btn-logout').hidden = remote; // über die App-Adresse gilt die Anmeldung der App
if (auth.needsAdmin) $('#dlg-first').showModal();
else if (auth.loggedIn) start();
else showLogin();
