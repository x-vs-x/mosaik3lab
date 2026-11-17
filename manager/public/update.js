// Karte „Updates“: Paket-Installation (Stand, Änderungen, ein Knopf, Fortschritt, Neustart-Erkennung) und das bisherige
// Git-Update für Arbeitskopien.
import { $, action, api, changed, cmpVer, confirmBox, ctx, el, fmt, fmtBytes, fmtDay, icon, light, toast } from './ui.js';
import { markdown } from './neuigkeiten.js';

// ---------- Update, Laufzeit ----------
export const stepList = (u) => [el('ol', { class: 'steps' }, u.steps.map((st) => el('li', {}, light(st.status === 'fertig' ? 'ok' : st.status === 'fehler' ? 'error' : 'warn', st.status), el('span', { class: 'detail' }, `${st.id}${st.detail ? ` – ${st.detail}` : ''}`)))), u.result ? el('p', { class: u.result.ok ? '' : 'error' }, u.result.message) : null, u.result && !u.result.ok && u.result.hint ? el('p', { class: 'small' }, `Was tun? ${u.result.hint}`) : null];
export async function installUpdate() {
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
  if (u?.paket) {
    paketMode = true;
    renderUpdate(u);
    $('#update-info').replaceChildren(el('p', {}, u.behind ? `Neue Version verfügbar: ${u.latest.version} – siehe Karte „Updates“.` : u.error ? u.error : 'Mosaik³LAB ist aktuell.'));
    return false;
  }
  $('#update-info').replaceChildren(el('p', {}, u.available ? `Neue Version verfügbar: ${u.id} – siehe Karte „Updates“.` : `Aktuell (${u.id}).`));
  return false;
});

// ---------- Updates aus dem Installer-Paket (Karte „Updates“) ----------
// GET api/update → { paket, installed, checkedAt, error, hint, unsupported, versions, behind, latest, download, lauf }.
// Während des Updates startet der Manager selbst neu: Anfragen schlagen dann kurz fehl → ruhig warten und weiter fragen.
export let paketMode = false;
export const markPaket = () => (paketMode = true);
let upd = null; // letzter Zustand
export let updWatch = null; // { from, restarted, fails } solange ein Update läuft
let updTimer = null;
const RESULT_DAYS = 7; // Ergebnis des letzten Updates so lange anzeigen

const updActive = (u) => !!u && ((u.download && !u.download.error && !u.download.fertig) || ['wartet', 'läuft'].includes(u.lauf?.phase));
export function updatingSummary(text) {
  $('#summary').dataset.state = 'warn';
  $('#overall').replaceChildren(light('warn', 'Update läuft'));
  $('#summary-text').textContent = text;
  $('#btn-fix').hidden = true;
}
/** Hinweisfeld: Icon + Satz (+ „Was tun?“). state: ok | warn | error | info | new */
function callout(box, state, text, hint) {
  box.className = `callout ${state}`;
  box.dataset.state = state;
  box.replaceChildren(icon({ ok: 'ok', warn: 'warn', error: 'error', new: 'download' }[state] ?? 'info'),
    el('div', {}, el('p', { class: 'callout-text' }, text), hint ? el('p', { class: 'small' }, `Was tun? ${hint}`) : null));
}
/** Ergebnis des letzten Laufs, solange es etwas zu sagen hat. → [state, text, hint] | null */
function updResult(u) {
  if (updActive(u)) return null;
  if (u.download?.error) return ['error', u.download.error, u.download.hint];
  const l = u.lauf;
  // Lauf-Kennung: ein Lauf vor dem aktuellen Download ist ein altes Ergebnis
  if (u.download?.startedAt && l?.at && Date.parse(l.at) < Date.parse(u.download.startedAt)) return null;
  if (!l?.at || Date.now() - Date.parse(l.at) > RESULT_DAYS * 86400_000) return null;
  const inst = u.installed?.version;
  if (l.phase === 'fertig' && l.version === inst) return ['ok', `Version ${l.version} ist installiert und läuft.`, null];
  if (cmpVer(l.version, inst) <= 0) return null; // inzwischen erledigt
  if (l.phase === 'zurueckgesetzt') return ['warn', l.meldung || `Das Update auf Version ${l.version} hat nicht geklappt. Die bisherige Version läuft weiter.`, l.hint ?? 'Sie können es später noch einmal versuchen. Ihre Daten sind unverändert.'];
  if (l.phase === 'fehler') return ['error', l.meldung || `Das Update auf Version ${l.version} ist fehlgeschlagen.`, l.hint];
  return null;
}
function updStatusLine(u) {
  if (updActive(u)) return ['info', `Update auf Version ${u.download?.version ?? u.lauf?.version} läuft – bitte warten.`, null];
  if (u.unsupported) return ['info', 'Für dieses Betriebssystem gibt es keine Updates per Knopfdruck.', 'Neue Versionen mit dem Installer-Paket einspielen.'];
  if (u.error) return ['info', u.error, u.hint ?? 'Ohne Internet ist das normal – es wird später automatisch erneut geprüft.'];
  if (u.behind > 0) return ['new', `Version ${u.latest.version} ist verfügbar${u.behind > 1 ? ` (${u.behind} neue Versionen)` : ''}.`, null];
  if (!u.checkedAt) return ['info', 'Es wurde noch nicht nach Updates gesucht.', null];
  return ['ok', 'Mosaik³LAB ist aktuell.', null];
}
export function renderUpdate(u) {
  upd = u;
  $('#card-update').hidden = false;
  $('#update-paket').hidden = false;
  $('#update-installed-version').textContent = u.installed?.version ? `Version ${u.installed.version}` : 'unbekannt';
  const active = updActive(u) || !!updWatch?.restarting;

  const res = updResult(u);
  $('#update-result').hidden = !res;
  if (res && changed('upd-result', res)) callout($('#update-result'), ...res);
  const line = updStatusLine(u);
  if (changed('upd-status', line)) callout($('#update-status'), ...line);

  // Fortschritt: erst Download in %, dann die Meldung des Update-Helfers; Schritte nur unter „Details“
  $('#update-progress').hidden = !active;
  if (active) {
    const d = u.download;
    const bar = $('#update-bar');
    let text;
    if (updWatch?.restarting) {
      // Während Sicherung und Umschalten ist der Manager gestoppt – der Update-Helfer arbeitet weiter (Zeitlimits: lib/zeitlimits.mjs)
      const z = u.zeitlimits ?? { sicherung: 120, helfer: 240 };
      const std = (min) => (min % 60 ? `${min} Minuten` : `${min / 60} Stunden`);
      text = 'Wird gesichert und umgestellt … Der Server-Manager ist dabei kurz gestoppt, die Seite lädt sich danach selbst neu.';
      if (updWatch.fails > 120) text += ` Das dauert länger als üblich – meist die Sicherung (bei vielen Bildern und Videos, z. B. auf einem Raspberry Pi, bis zu ${std(z.sicherung)}). Bitte nichts abbrechen; erst wenn sich nach ${std(z.helfer)} nichts getan hat, den Server neu starten.`;
      bar.removeAttribute('value');
    } else if (d && !d.fertig && !d.error) {
      const pct = d.total ? Math.min(100, Math.round((d.done / d.total) * 100)) : null;
      text = pct === null ? `Update wird heruntergeladen … ${fmtBytes(d.done ?? 0)}` : `Update wird heruntergeladen … ${pct} %`;
      if (pct === null) bar.removeAttribute('value');
      else bar.value = pct;
    } else {
      text = u.lauf?.meldung || 'Update wird vorbereitet …';
      bar.removeAttribute('value');
    }
    if ($('#update-progress-text').textContent !== text) $('#update-progress-text').textContent = text;
    const steps = u.lauf?.schritte ?? [];
    $('#update-steps-box').hidden = !steps.length;
    if (changed('upd-steps', steps.length)) $('#update-steps').replaceChildren(...steps.map((t) => el('li', {}, el('span', { class: 'detail' }, t))));
  }

  // Änderungen je Version (neueste zuerst, die neueste aufgeklappt)
  const versions = [...(u.versions ?? [])].sort((a, b) => cmpVer(b.version, a.version));
  if (changed('upd-versions', versions)) $('#update-versions').replaceChildren(...(versions.length ? [
    el('h3', {}, versions.length > 1 ? 'Was ändert sich?' : `Was ist neu in Version ${versions[0].version}?`),
    ...versions.map((v, i) => el('details', { class: 'version', open: i === 0, testid: `update-version-${v.version}` },
      el('summary', {}, `Version ${v.version}`, v.date ? el('span', { class: 'muted small' }, ` · ${fmtDay(v.date)}`) : null),
      el('div', { class: 'md' }, markdown(v.notes)))),
  ] : []));

  const now = $('#btn-update-now');
  now.hidden = active || !(u.behind > 0) || !!u.unsupported;
  $('#btn-update-search').disabled = active;
  $('#update-checked').textContent = u.checkedAt ? `Zuletzt geprüft: ${fmt(u.checkedAt)}${u.latest?.size ? ` · Download ${fmtBytes(u.latest.size)}` : ''}` : '';
}
/** Zustand holen und zeichnen; während eines Updates alle 2,5 s, sonst alle 30 s. */
export async function loadUpdate() {
  clearTimeout(updTimer);
  let u;
  try {
    u = await api('update');
  } catch {
    if (updWatch) {
      // Manager startet gerade neu (gehört zum Update) – ruhig weiter versuchen
      Object.assign(updWatch, { restarting: true, restarted: true, fails: (updWatch.fails ?? 0) + 1 });
      if (upd) renderUpdate(upd);
    }
    updTimer = setTimeout(loadUpdate, updWatch ? 3000 : 30_000);
    return;
  }
  if (u === undefined) return; // abgemeldet → Anmeldung zeigt sich; nach dem Anmelden startet start() neu
  if (!u?.paket) return; // Arbeitskopie/Git-Update: bisheriges Verhalten (Karte über den Status)
  paketMode = true;
  if (updWatch) Object.assign(updWatch, { restarting: false, fails: 0 });
  if (updActive(u) && !updWatch) updWatch = { from: u.installed?.version, restarted: false };
  if (updWatch && !updActive(u)) {
    // Fertig (geklappt, zurückgesetzt oder Fehler): nach einem Neustart die Seite neu laden – neue Oberfläche, neuer Schlüssel
    const reload = updWatch.restarted || u.installed?.version !== updWatch.from;
    updWatch = null;
    ctx.refresh();
    if (reload) {
      toast('Update abgeschlossen – die Seite wird neu geladen …');
      setTimeout(() => location.reload(), 2500);
    }
  }
  renderUpdate(u);
  updTimer = setTimeout(loadUpdate, updWatch ? 2500 : 30_000);
}
action($('#btn-update-now'), async () => {
  const u = upd;
  if (!u?.latest || updActive(u) || updWatch) return false;
  const ok = await confirmBox(`Auf Version ${u.latest.version} aktualisieren?`,
    `Vorher wird automatisch alles gesichert. Mosaik³LAB ist dabei einige Minuten nicht erreichbar – am besten zu einer ruhigen Zeit, wenn niemand damit arbeitet. Sollte etwas nicht klappen, läuft automatisch die bisherige Version ${u.installed?.version ?? ''} weiter, Ihre Daten bleiben erhalten.`,
    'Jetzt aktualisieren');
  if (!ok) return false;
  updWatch = { from: u.installed?.version, restarted: false };
  try {
    await api('update/install', {});
  } catch (err) {
    updWatch = null;
    throw err;
  }
  await loadUpdate();
  return false;
});
action($('#btn-update-search'), async () => {
  const u = await api('update/check', {});
  if (!u?.paket) return false;
  renderUpdate(u);
  toast(u.behind > 0 ? `Neue Version ${u.latest.version} gefunden.` : u.error ? 'Suche nicht möglich – siehe Karte „Updates“.' : 'Mosaik³LAB ist aktuell.');
  return false;
});

