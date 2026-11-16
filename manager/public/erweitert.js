// Reiter „System“: Laufzeit, Abgleichen, Protokoll, Einrichten.
import { $, action, api, confirmBox, ctx, el, light, showError, toast } from './ui.js';
import { stepList } from './update.js';

/** Wer nach Administratorrechten fragt – je Betriebssystem. */
const adminHint = () => (ctx.system?.id === 'windows' ? 'Windows fragt ggf. nach einer Bestätigung.' : 'Dafür sind Administratorrechte nötig – fehlen sie, zeigt der Manager den Befehl zum Ausführen mit sudo.');
const LIGHT_TEXT ={ ok: 'aktuell', warn: 'Update', error: 'Handlungsbedarf', info: 'Info' };
async function loadRuntime() {
  const r = await api('runtime');
  if (!r) return; // abgemeldet
  $('#runtime-rows').replaceChildren(...r.rows.map((row) => el('li', { testid: `runtime-${row.id}` },
    light(row.light, LIGHT_TEXT[row.light] ?? row.light),
    el('span', { class: 'detail' }, `${row.title}: ${row.label}`),
    row.action && row.light !== 'ok' ? el('button', { type: 'button', class: row.light === 'warn' || row.light === 'error' ? 'primary' : null, 'aria-label': `${row.title} ${row.action === 'install' ? 'installieren' : 'aktualisieren'}`, onclick: (e) => updateRuntime(row, e.currentTarget) }, row.action === 'install' ? 'Installieren' : 'Aktualisieren') : el('span'),
    row.hint && row.light !== 'ok' ? el('div', { class: 'muted small' }, `Was tun? ${row.hint}`) : null)));
}
export async function updateRuntime(row, btn) {
  const what = row.action === 'install' ? 'installieren' : 'aktualisieren';
  if (!(await confirmBox(`${row.title} ${what}?`, `Vorher wird gesichert. Die Web-App ist kurz nicht erreichbar. ${adminHint()} Scheitert etwas, bleiben die Daten unverändert und Sie sehen, wie Sie zurückgehen.`, row.action === 'install' ? 'Installieren' : 'Aktualisieren'))) return;
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
    ctx.refresh();
  }
}
action($('#btn-runtime-check'), loadRuntime, false);
action($('#btn-audit'), async () => {
  const r = await api('runtime/audit', {});
  if (!r) return false; // abgemeldet
  $('#audit-info').replaceChildren(light(r.light, LIGHT_TEXT[r.light] ?? r.light), ` ${r.label}`);
}, false);

// ---------- Abgleichen ----------
export function showReconcile(r) {
  if (!r) return r;
  $('#reconcile-info').replaceChildren(el('ol', { class: 'steps' }, r.steps.map((st) => el('li', {}, light({ ok: 'ok', fertig: 'ok', geplant: 'warn', fehler: 'error', warnung: 'warn', rueckfrage: 'warn' }[st.status] ?? 'info', st.status), el('span', { class: 'detail' }, st.detail)))));
  return r;
}
/** Ordner, die auf diesem Rechner nicht passen (z. B. anderes Laufwerk): nachfragen und erneut abgleichen. */
export async function askPaths(r) {
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
  if (!lines) return; // abgemeldet
  $('#log-text').replaceChildren(...(lines.length ? lines.map((l) => el('span', { class: l.error ? 'err' : null }, `${l.text}\n`)) : ['(leer)']));
  $('#log-text').scrollTop = $('#log-text').scrollHeight;
}
$('#log-which').addEventListener('change', () => showLog().catch(showError));

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
  $('#wrapper-row').hidden = !proposal.needsWrapper; // nur Windows (WinSW)
  // Eingerichtet heißt: es gibt schon einen Administrator – das Konto-Feld wäre nur verwirrend. Programm- und Datenordner
  // stehen fest (Reparieren am selben Ort, sonst entstünde eine zweite Installation); Ordner ändert man unter „Ordner“.
  const installed = ctx.status?.mode === 'installation';
  $('#admin-account').hidden = installed;
  for (const k of ['programRoot', 'dataRoot']) {
    f[k].readOnly = installed;
    if (installed) f[k].value = proposal[k];
  }
  $('#setup-fixed').hidden = !installed;
  $('#setup-intro').textContent = `Kopiert Mosaik³LAB in den Programmordner, legt die Daten getrennt davon ab und richtet Dienste (Autostart, Neustart nach Absturz), Firewall und Verknüpfungen ein. „Probelauf“ zeigt zuerst, was passieren würde.${proposal.untested ? ' (Plattform ungetestet)' : ''}`;
  if (ctx.status?.mode === 'installation') $('#h-adv-setup').textContent = 'Einrichtung erneut ausführen / reparieren';
  if (job) showSteps(job);
}
async function runSetup(dryRun) {
  const f = setupForm.elements;
  const n = $('#form-network').elements;
  const b = $('#form-backup').elements;
  if (!dryRun && !(await confirmBox('Jetzt einrichten?', `Mosaik³LAB wird als Programm eingerichtet (Dienste, Firewall, Verknüpfungen). ${adminHint()} Jeder Schritt kann bei Bedarf wiederholt werden.`, 'Einrichten'))) return false;
  await api('setup', { dryRun, input: { programRoot: f.programRoot.value.trim(), dataRoot: f.dataRoot.value.trim(), appPort: Number(n.appPort.value), backupTime: b.backupTime.value, backupKeep: Number(b.backupKeep.value), network: n.network.checked, ...(f.adminEmail.value.trim() ? { admin: { email: f.adminEmail.value.trim(), name: f.adminName.value.trim(), password: f.adminPassword.value } } : {}), downloadWrapper: f.downloadWrapper.checked, ...(f.fromBackupDir.value.trim() ? { fromBackup: { dir: f.fromBackupDir.value.trim(), password: f.fromBackupPassword.value || undefined, paths: Object.fromEntries(f.fromBackupPaths.value.split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) } } : {}) } });
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

// Reiter „System“ lädt seine Inhalte erst beim Öffnen (Laufzeit fragt nodejs.org) – höchstens einmal je Minute.
let systemLoaded = 0;
document.addEventListener('m3l:system', () => {
  showLog().catch(() => {});
  if (Date.now() - systemLoaded < 60_000) return;
  systemLoaded = Date.now();
  loadRuntime().catch(() => {});
  loadSetup().catch(() => {});
});

