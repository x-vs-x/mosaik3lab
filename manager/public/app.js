// Server-Manager – Reiter: Übersicht (Update, Gesamtstatus mit Knopf, Adresse, Dienste, Sicherung kurz), Sicherung,
// Netzwerk, E-Mail, System (Version, Ordner, Abgleichen, Protokoll, Einrichten). Nutzt nur die JSON-API.
import { $, action, api, askPassword, busy, changed, cmpVer, confirmBox, ctx, el, emergency, fmt, fmtBytes, light, reasonText, showError, since } from './ui.js';
import { installUpdate, loadUpdate, markPaket, paketMode, updatingSummary, updWatch } from './update.js';
import { loadNews } from './neuigkeiten.js';
import { askPaths, showReconcile, updateRuntime } from './erweitert.js';
import { loadSettings } from './einstellungen.js';

let timer = null;
ctx.refresh = refresh; // Helfer in ui.js (busy, api) brauchen diese beiden
ctx.showLogin = showLogin;

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

/** Nach der Ersteinrichtung über das Netz: im Browser bei der App anmelden (gleiches Konto) – die Web-App startet
 *  dafür gerade neu, also kurz wiederholen. Danach gilt die Admin-Sitzung der App auch hier. */
async function appLogin(email, password) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${ctx.appBase}/api/auth/login`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mosaik3lab' }, body: JSON.stringify({ email, password }) }).catch(() => null);
    if (res?.ok) return true;
    if (res && res.status !== 502 && res.status !== 503 && res.status !== 504) return false;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}
// Ersteinrichtung in zwei Schritten: Angaben (inkl. Frage nach der Schul-Domain) → Zusammenfassung → Anlegen.
/** Wie shared/src/einstellungen.ts (emailDomainSchema): nur der Teil nach dem @. '' = ungültig. */
const domainOf = (v) => {
  const d = String(v ?? '').trim().toLowerCase().replace(/^@/, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : '';
};
const adminDomain = () => domainOf($('#first-email').value.split('@')[1]);
const eigeneDomain = () => $('#form-first input[name=first-domain-ok]:checked')?.value === 'nein';
function updateDomainFrage() {
  const d = adminDomain();
  $('#first-domain-frage').hidden = !d;
  $('#first-domain-vorschlag').textContent = d ? `@${d}` : '';
  $('#first-domain-eigen').hidden = !eigeneDomain();
  $('#first-domain').required = !!d && eigeneDomain();
}
$('#first-email').addEventListener('input', updateDomainFrage);
for (const r of document.querySelectorAll('#form-first input[name=first-domain-ok]')) {
  r.addEventListener('change', () => {
    updateDomainFrage();
    if (eigeneDomain()) $('#first-domain').focus();
  });
}
let firstInput = null; // geprüfte Angaben aus Schritt 1
function showFirstStep(pruefen) {
  $('#form-first').hidden = pruefen;
  $('#first-pruefen').hidden = !pruefen;
}
$('#form-first').addEventListener('submit', (e) => {
  e.preventDefault();
  const err = $('#first-error');
  const email = $('#first-email').value.trim();
  const password = $('#first-pw').value;
  err.hidden = true;
  const fail = (text, field) => {
    err.textContent = text;
    err.hidden = false;
    field.focus();
  };
  if (password !== $('#first-pw2').value) return fail('Die beiden Passwörter stimmen nicht überein.', $('#first-pw2'));
  const vorschlag = adminDomain();
  const schulDomain = vorschlag && eigeneDomain() ? domainOf($('#first-domain').value) : vorschlag;
  if (vorschlag && eigeneDomain() && !schulDomain) return fail('Bitte die Domain der Schule angeben – nur den Teil nach dem @, z. B. schule.example.', $('#first-domain'));
  firstInput = { email, name: $('#first-name').value.trim(), password, schulDomain };
  $('#first-pruefen-email').textContent = email;
  $('#first-pruefen-name').textContent = firstInput.name;
  $('#first-pruefen-domain').textContent = schulDomain ? `@${schulDomain}` : '–';
  $('#first-pruefen-error').hidden = true;
  showFirstStep(true);
  $('#first-pruefen-titel').focus();
});
$('#first-zurueck').addEventListener('click', () => {
  showFirstStep(false);
  $('#form-first button[type=submit]').focus();
});
$('#first-save').addEventListener('click', async () => {
  const err = $('#first-pruefen-error');
  const btn = $('#first-save');
  const { email, password } = firstInput;
  err.hidden = true;
  btn.disabled = true;
  $('#first-zurueck').disabled = true;
  btn.textContent = 'Wird angelegt …';
  try {
    await api('auth/first', firstInput);
    if (ctx.remote) {
      btn.textContent = 'Wird angemeldet …';
      if (await appLogin(email, password)) return location.reload();
      // Konto ist angelegt – nur die automatische Anmeldung hat nicht geklappt: zur Anmeldung der App
      return location.assign(`${ctx.appBase}/login`);
    }
    $('#first-pw').value = $('#first-pw2').value = '';
    firstInput = null;
    $('#dlg-first').close();
    start();
  } catch (ex) {
    err.textContent = ex.hint ? `${ex.message} ${ex.hint}` : ex.message;
    err.hidden = false;
    btn.focus();
  } finally {
    btn.disabled = false;
    $('#first-zurueck').disabled = false;
    btn.textContent = 'Ja, anlegen';
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
  https: ['HTTPS-Einstellungen öffnen', () => openSection('netzwerk', '#https')],
  ports: ['Ports öffnen', () => openSection('netzwerk', '#ports')],
  log: ['Protokoll öffnen', () => openSection('system', '#h-adv-log')],
  advanced: ['System öffnen', () => openSection('system')],
};
/** Knopf zu einem Hinweis; „portal-port:8080“ = Portal auf einen freien Ausweich-Port legen (Port 80 belegt). */
const fixFor = (k) => FIX[k] ?? (/^portal-port:\d+$/.test(k ?? '') ? [`Port ${k.slice(12)} verwenden`, () => api('portal', { httpPort: Number(k.slice(12)) })] : null);

// ---------- Reiter: Übersicht · Sicherung · Netzwerk · E-Mail · System (Adresse #reiter, Pfeiltasten wechseln) ----------
const TABS = [...document.querySelectorAll('[role=tab]')];
const TAB_IDS = TABS.map((t) => t.dataset.tab);
function showTab(id, { focus = false, push = true } = {}) {
  if (!TAB_IDS.includes(id)) id = 'uebersicht';
  for (const t of TABS) {
    const on = t.dataset.tab === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(`#page-${t.dataset.tab}`).hidden = !on;
    if (on && focus) t.focus();
  }
  if (push && location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  if (id === 'system') document.dispatchEvent(new CustomEvent('m3l:system'));
}
for (const t of TABS) {
  t.addEventListener('click', () => showTab(t.dataset.tab));
  t.addEventListener('keydown', (e) => {
    const i = TABS.indexOf(t);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    showTab(TAB_IDS[(next + TABS.length) % TABS.length], { focus: true });
  });
}
for (const b of document.querySelectorAll('[data-goto]')) b.addEventListener('click', () => showTab(b.dataset.goto, { focus: true }));
window.addEventListener('hashchange', () => showTab(location.hash.slice(1), { push: false }));
showTab(location.hash.slice(1), { push: false });

function openSection(tab, sel) {
  showTab(tab);
  const d = sel ? $(sel) : $(`#page-${tab}`);
  d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  d.focus?.({ preventScroll: true });
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
  const more = s.notes.filter((n) => (n.light === 'warn' || n.light === 'error') && n.text !== s.summary.text);
  if (changed('notes', [more, s.summary.fix])) $('#notes').replaceChildren(...more.map((n) => el('li', { class: n.light }, n.text, fixFor(n.fix) && n.fix !== s.summary.fix ? el('button', { type: 'button', class: 'link', onclick: (e) => busy(e.currentTarget, fixFor(n.fix)[1], 'Erledigt.') }, fixFor(n.fix)[0]) : null)));
  $('#checked').textContent = `aktualisiert ${new Date(s.checkedAt).toLocaleTimeString('de-DE')}`;
}

// ---------- Seite ----------
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
      ctx.status = s;
      render(s);
    } catch (err) {
      $('#btn-fix').hidden = true;
      if (updWatch) {
        // Während eines Updates startet der Manager selbst neu – das ist normal, kein Fehler.
        updatingSummary('Der Server-Manager startet neu … Die Seite aktualisiert sich von selbst.');
        return;
      }
      $('#summary').dataset.state = 'error';
      $('#overall').replaceChildren(light('error', 'Fehler'));
      $('#summary-text').textContent = `Der Status konnte nicht geladen werden (${err.message}). Neuer Versuch in wenigen Sekunden.`;
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
  // Während eines Updates sind Web-App und Dienste kurz weg – keine „Web-App starten“-Aufforderung, die dazwischenfunkt.
  if (updWatch) updatingSummary('Ein Update läuft – Mosaik³LAB ist dabei einige Minuten nicht erreichbar. Bitte nichts starten oder stoppen.');

  // Adresse der App
  if (!ctx.remote) $('#back-app').href = s.addresses.local; // über die App-Adresse: „../“ = <pfad>/
  const main = s.addresses.network[0] ?? s.addresses.local;
  Object.assign($('#app-link'), { href: main, textContent: main.replace(/\/$/, '') }); // z. B. http://server/mosaik3lab
  $('#address-more').textContent = s.addresses.network.length
    ? `Auf diesem Rechner: ${s.addresses.local}${s.addresses.network.length > 1 ? ` · weitere Adressen: ${s.addresses.network.slice(1, 3).join(' · ')}` : ''}`
    : 'Nur auf diesem Rechner erreichbar. Für Geräte im Schulnetz: Reiter „Netzwerk“ → „Im Schulnetz erreichbar“.';

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
  $('#backup-next').textContent = !s.backupAuto ? 'Die automatische Sicherung ist ausgeschaltet.' : s.nextBackup ? `Nächste automatische Sicherung: ${fmt(s.nextBackup)}` : 'Automatische Sicherung: der Backup-Dienst läuft nicht (siehe „Dienste“ in der Übersicht).';
  // Kurzfassung für die Übersicht
  $('#backup-short').textContent = `${last ? `Letzte Sicherung ${fmt(last.created)} (vor ${since(last.created)})` : 'Noch keine Sicherung'} · ${!s.backupAuto ? 'automatisch: aus' : s.nextBackup ? `nächste ${fmt(s.nextBackup)}` : 'Backup-Dienst läuft nicht'} · ${s.backupEncrypted ? 'mit Passwortschutz' : 'ohne Passwortschutz'}`;
  $('#backup-crypto-state').textContent = s.backupEncrypted ? '– eingeschaltet' : '– aus';
  $('#backup-crypto').textContent = s.backupEncrypted ? 'Neue Sicherungen sind mit Passwort geschützt.' : 'Sicherungen sind noch nicht geschützt. Empfehlung: Passwort erzeugen.';
  $('#btn-bk-password').hidden = s.backupEncrypted;
  $('#btn-bk-new').hidden = !s.backupEncrypted;
  $('#btn-bk-off').hidden = !s.backupEncrypted;
  $('#backup-dir-show').textContent = s.backupDir ?? '';
  if (changed('backups', s.backups.map((b) => [b.id, b.encrypted, b.app?.version]).concat(s.backupEncrypted))) renderBackupTable(s);

  // Update – Paket-Installation: Karte immer sichtbar (renderUpdate); sonst nur, wenn etwas verfügbar ist
  if (s.updates.app?.paket) markPaket();
  const app = !paketMode && s.updates.app?.available ? s.updates.app : null;
  const rt = (s.updates.runtime ?? []).filter((r) => r.action); // nur, wo es wirklich etwas zu tun gibt
  $('#card-update').hidden = !paketMode && !app && !rt.length;
  if (changed('updates', [app, rt.map((r) => [r.id, r.label])])) $('#updates').replaceChildren(
    ...[app ? el('div', { class: 'svc' }, el('div', { class: 'svc-head' }, el('strong', {}, `Mosaik³LAB ${app.id}`), action(el('button', { type: 'button', class: 'primary', testid: 'update-install' }, 'Installieren'), installUpdate)), app.changes?.length ? el('ul', { class: 'small' }, app.changes.map((c) => el('li', {}, c))) : null) : null,
    ...rt.map((row) => el('div', { class: 'svc', testid: `runtime-update-${row.id}` }, el('div', { class: 'svc-head' }, el('strong', {}, row.title), el('button', { type: 'button', onclick: (e) => updateRuntime(row, e.currentTarget) }, row.action === 'install' ? 'Installieren' : 'Aktualisieren')), el('div', { class: 'muted small' }, row.label)))].filter(Boolean));

  // System: Version, Betriebssystem, Fakten; Texte, die je System anders sind
  renderSystem(s.system);
  $('#btn-check').hidden = paketMode; // Paket-Installation: Updates stehen in der Übersicht
  $('#btn-audit').hidden = paketMode; // npm audit braucht npm und den Quellstand – das Paket bringt beides nicht mit
  $('#version').textContent = s.version?.version ? `${s.version.version}${s.version.id && s.version.id !== 'Arbeitskopie' ? ` (${s.version.id})` : ' (Arbeitskopie)'}` : s.version?.id ?? '–';
  $('#node').textContent = `· Node.js ${s.node}`;
  $('#facts').textContent = [`Mailversand eingerichtet: ${s.mail.label}`, `Datenbank: ${s.database.label}`, ...s.notes.filter((n) => n.light === 'info').map((n) => n.text)].join(' · ');
}

/** Hinweise passend zum Betriebssystem: Firewall, Pfad-Beispiele, Zertifikat-Werkzeug. */
function renderSystem(sys) {
  if (!sys || !changed('system', sys)) return;
  const win = sys.id === 'windows';
  ctx.system = sys;
  $('#system-line').textContent = `Betriebssystem: ${sys.label} (${sys.arch})`;
  $('#d-network').textContent = win
    ? 'Damit Geräte im Schulnetz Mosaik³LAB öffnen können. Die Windows-Firewall-Regel wird automatisch gesetzt (Windows fragt einmal nach).'
    : sys.firewall
      ? 'Damit Geräte im Schulnetz Mosaik³LAB öffnen können. Die Firewall-Regel (ufw bzw. firewalld) wird gesetzt – das braucht Administratorrechte; sonst zeigt der Manager den Befehl zum Ausführen mit sudo.'
      : 'Damit Geräte im Schulnetz Mosaik³LAB öffnen können. Auf diesem System ist keine Firewall aktiv – die Freigabe wirkt sofort, eine Regel ist nicht nötig.';
  $('#folder-example').textContent = win ? 'D:\\Mosaik3LAB\\ablage' : '/srv/mosaik3lab/ablage';
  $('#paths-example').textContent = win ? 'ablageDir=D:\\Mosaik3LAB\\ablage' : 'ablageDir=/srv/mosaik3lab/ablage';
  $('#cert-tool-note').hidden = win;
  $('#cert-tool-note').textContent = win ? '' : '„Zertifikat erzeugen“ braucht das Programm openssl (auf Raspberry Pi OS und Ubuntu vorhanden).';
}

function renderBackupTable(s) {
  $('#backups').replaceChildren(s.backups.length
    ? el('div', { class: 'table-wrap' }, el('table', { testid: 'backup-table' }, el('thead', {}, el('tr', {}, el('th', {}, 'Zeitpunkt'), el('th', {}, 'Anlass'), el('th', {}, 'Größe'), el('th', {}, el('span', { class: 'sr-only' }, 'Aktion')))),
      el('tbody', {}, s.backups.map((b) => el('tr', {},
        el('td', {}, fmt(b.created), b.encrypted ? el('span', { title: 'mit Passwort geschützt', 'aria-label': 'mit Passwort geschützt' }, ' 🔒') : null,
          b.app?.version ? el('div', { class: 'muted small', testid: `backup-version-${b.id}` }, `von Version ${b.app.version}`) : null),
        el('td', {}, reasonText(b.reason), b.kind === 'daten' ? el('div', { class: 'muted small' }, 'ältere Art, ohne Bilder') : null),
        el('td', {}, b.bytes ? fmtBytes(b.bytes) : '–'),
        el('td', {}, action(el('button', { type: 'button', testid: `restore-${b.id}`, 'aria-label': `Sicherung vom ${fmt(b.created)} wiederherstellen` }, 'Wiederherstellen'), () => restore(b), 'Wiederhergestellt und geprüft – alles läuft wieder mit dem Stand der Sicherung.')))))))
    : el('p', { class: 'empty' }, 'Noch keine Sicherung.'));
}

// ---------- Sicherung ----------
action($('#btn-backup'), () => api('backup', {}), () => 'Gesichert und geprüft.');
async function restore(b) {
  const ohneBilder = b.kind === 'daten' ? ' Diese ältere Sicherung enthält keine Bilder und Druckdateien – die vorhandenen bleiben.' : '';
  // Ältere Version: die App bringt die Daten beim Start selbst auf den neuen Stand. Neuere lehnt der Server mit klarer Meldung ab.
  const inst = ctx.status?.version?.version;
  const from = b.app?.version;
  const upgrade = from && inst && cmpVer(from, inst) < 0 ? ` Diese Sicherung ist von Version ${from}. Danach wird sie automatisch auf ${inst} gebracht.` : '';
  if (!(await confirmBox('Diese Sicherung wiederherstellen?', `Alles wird auf den Stand vom ${fmt(b.created)} zurückgesetzt: Einstellungen, Konten, Anfragen und Druckteile.${ohneBilder}${upgrade} Was seitdem dazugekommen ist, ist danach weg. Der jetzige Stand wird vorher automatisch gesichert. Mosaik³LAB ist dafür kurz nicht erreichbar.`, 'Ja, wiederherstellen'))) return false;
  // Geschützte Sicherung ohne Passwort auf diesem Rechner (z. B. von einem anderen Rechner): Passwort abfragen.
  const password = b.encrypted && !ctx.status?.backupEncrypted ? askPassword() : undefined;
  if (b.encrypted && !ctx.status?.backupEncrypted && !password) return false;
  const r = await api('backup/restore', { id: b.id, confirm: b.id, password, autoStop: true });
  if (!r) return false; // abgemeldet
  showReconcile(r.reconcile);
  await askPaths(r.reconcile);
  return r;
}

async function makeBackupPassword() {
  if (!(await confirmBox('Passwort für Sicherungen erzeugen?', 'Neue Sicherungen werden ab jetzt mit diesem Passwort verschlüsselt. Es wird nur einmal angezeigt. Ohne dieses Passwort lässt sich eine Sicherung nicht zurückspielen – bitte aufschreiben und sicher aufbewahren.', 'Erzeugen'))) return false;
  const r = await api('backup/password', { generate: true });
  showTab('sicherung');
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

// ---------- Start ----------
async function start() {
  $('#main').hidden = false;
  $('#tools').hidden = false;
  if (!ctx.status) {
    $('#summary').setAttribute('aria-busy', 'true');
    $('#summary-text').textContent = 'Status wird geladen …';
  }
  await loadUpdate(); // vor dem Status: Paket-Installation erkennen
  await refresh();
  await loadSettings().catch(showError);
  loadNews().catch(() => {});
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
ctx.remote = auth.remote === true;
ctx.appBase = auth.appBase ?? '';
ctx.managerPort = auth.managerPort ?? ctx.managerPort;
$('#btn-logout').hidden = ctx.remote; // über die App-Adresse gilt die Anmeldung der App
if (auth.needsAdmin) {
  $('#dlg-first').showModal();
  $('#first-email').focus();
}
else if (auth.loggedIn) start();
else showLogin();
