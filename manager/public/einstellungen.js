// Einstellungen je Reiter: Netzwerk (Schulnetz, Adresse, HTTPS, Ports), E-Mail, Sicherungs-Zeitplan, Ordner.
// Gespeichert wird je Formular nur, was sich seit dem Laden geändert hat.
import { $, action, api, busy, confirmAccess, ctx, errorInto } from './ui.js';
import { askPaths } from './erweitert.js';

const net = $('#form-network');
const mail = $('#form-mail');
const backupForm = $('#form-backup');
const folders = $('#form-folders');
let loaded = {}; // Stand beim Laden
const certText = (c) => (!c?.present ? 'Es ist noch kein Zertifikat hinterlegt.' : c.valid ? `Zertifikat: ${c.subject}, gültig bis ${c.notAfter.slice(0, 10)} (noch ${c.daysLeft} Tage)${c.warnings.length ? ` – Hinweis: ${c.warnings.join(' ')}` : ''}` : `Zertifikat nicht verwendbar: ${c.problems.join(' ')}`);
const mailBody = (f) => ({ enabled: f.mailEnabled.checked, host: f.mailHost.value.trim(), port: Number(f.mailPort.value) || 587, secure: f.mailSecure.value === 'true', user: f.mailUser.value.trim(), from: f.mailFrom.value.trim(), recipients: f.mailRecipients.value, appBaseUrl: f.mailBaseUrl.value.trim() });
// Der Pfad ist fest (/mosaik3lab) und nicht einstellbar – hier nur HTTPS.
const addressBody = (f) => ({ https: f.portalHttps.checked });
const portsBody = (f) => ({ enabled: f.portalEnabled.checked, httpPort: Number(f.portalHttpPort.value), httpsPort: Number(f.portalHttpsPort.value) });
const folderBody = (f) => ({ dataDir: f.dataDir.value.trim(), ablageDir: f.ablageDir.value.trim(), moveAblage: f.moveAblage.checked });
const backupBody = (f) => ({ backupEnabled: f.backupEnabled.checked, backupTime: f.backupTime.value, backupKeep: Number(f.backupKeep.value), backupDir: f.backupDir.value.trim() });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = async (box, ex) => {
  // „Gespeichert, aber …“ (z. B. die Firewall-Regel braucht Adminrechte): Formular auf den gespeicherten Stand bringen
  if (ex.saved) await loadSettings().catch(() => {});
  errorInto(box, ex); // mit dem Befehl für Administratoren zum Kopieren
  throw ex;
};

export async function loadSettings() {
  const [s, m, p] = await Promise.all([api('settings'), api('mail'), api('portal')]);
  // Sitzung abgelaufen (z. B. nach dem Wechsel vom Einrichtungs-Manager zum Manager-Dienst): api() zeigt schon die Anmeldung
  if (!s || !m || !p) return;
  ctx.managerPort = s.managerPort;
  const n = net.elements;
  n.network.checked = s.network;
  n.portalHttps.checked = p.https;
  n.portalEnabled.checked = p.enabled;
  n.portalHttpPort.value = p.httpPort;
  n.portalHttpsPort.value = p.httpsPort;
  n.appPort.value = s.appPort ?? '';
  $('#portal-cert-state').textContent = certText(p.certificate) + (p.conflicts.length ? ` ${p.conflicts.map((c) => c.message).join(' ')} ${p.hint}` : '');
  $('#link-cert-download').hidden = !p.certificate?.present;

  const f = mail.elements;
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
  f.mailBaseUrl.placeholder = ctx.status?.addresses ? (ctx.status.addresses.network[0] ?? ctx.status.addresses.local) : '';
  $('#mail-state').textContent = m.enabled ? (m.host && m.from ? '– eingeschaltet' : '– bitte ausfüllen') : '– aus';
  $('#mail-fields').hidden = !m.enabled;
  $('#mail-test-box').hidden = !m.enabled;

  const bf = backupForm.elements;
  bf.backupEnabled.checked = s.backupEnabled !== false;
  bf.backupTime.value = s.backupTime;
  bf.backupKeep.value = s.backupKeep;
  bf.backupDir.value = s.backupDir;

  const a = folders.elements;
  a.dataDir.value = s.dataDir ?? '';
  a.ablageDir.value = s.ablageDir ?? '';
  a.moveAblage.checked = false;
  loaded = { network: s.network, address: addressBody(n), ports: portsBody(n), appPort: Number(n.appPort.value), mail: mailBody(f), backup: backupBody(bf), folders: folderBody(a) };
}
mail.elements.mailEnabled.addEventListener('change', (e) => ($('#mail-fields').hidden = !e.target.checked));

// ---------- Netzwerk: Schulnetz, Adresse, HTTPS, Ports ----------
net.addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = net.elements;
  const err = $('#settings-error');
  err.hidden = true;
  const addressChanged = !same(addressBody(n), loaded.address);
  const portsChanged = !same(portsBody(n), loaded.ports) || Number(n.appPort.value) !== loaded.appPort;
  const netChanged = n.network.checked !== loaded.network;
  if (addressChanged && !(await confirmAccess(n.portalHttps.checked ? 'HTTPS einschalten?' : 'HTTPS ausschalten?', `Die Adresse beginnt danach mit ${n.portalHttps.checked ? 'https://' : 'http://'}.`))) return;
  if (portsChanged && !(await confirmAccess('Ports bzw. Portal ändern?', 'Die Web-App startet danach neu.'))) return;
  if (netChanged && !n.network.checked && !(await confirmAccess('Nur noch auf diesem Rechner?', 'Geräte im Schulnetz erreichen Mosaik³LAB dann nicht mehr – auch diese Seite nicht, wenn sie nicht am Server selbst geöffnet ist.'))) return;
  await busy(e.submitter ?? net.querySelector('[type=submit]'), async () => {
    try {
      const done = [];
      // Reihenfolge: Portal (Pfad, HTTPS, Ports – bestimmt die Firewall-Ports) → App-Port → Netzfreigabe (Firewall)
      if (addressChanged || !same(portsBody(n), loaded.ports)) {
        const r = await api('portal', { ...addressBody(n), ...portsBody(n) });
        await askPaths(r.reconcile);
        done.push(addressChanged ? 'HTTPS' : 'Ports');
      }
      if (Number(n.appPort.value) !== loaded.appPort) {
        await api('settings', { appPort: Number(n.appPort.value) });
        if (!done.includes('Ports')) done.push('Ports');
      }
      if (netChanged) {
        await api('firewall', { enabled: n.network.checked });
        done.push(n.network.checked ? 'im Schulnetz erreichbar' : 'nur noch auf diesem Rechner');
      }
      await loadSettings();
      return done;
    } catch (ex) {
      await fail(err, ex);
    }
  }, (done) => (done.length ? `Gespeichert: ${done.join(', ')}.` : 'Nichts geändert.'));
});

// ---------- E-Mail ----------
mail.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = mail.elements;
  const err = $('#mail-error');
  err.hidden = true;
  await busy(e.submitter ?? mail.querySelector('[type=submit]'), async () => {
    try {
      if (same(mailBody(f), loaded.mail) && !f.mailPassword.value) return 'Nichts geändert.';
      await api('mail', { ...mailBody(f), password: f.mailPassword.value || undefined });
      await loadSettings();
      return 'E-Mail-Einstellungen gespeichert.';
    } catch (ex) {
      await fail(err, ex);
    }
  }, (t) => t);
});

action($('#btn-mail-test'), async () => {
  const box = $('#mail-result');
  if (!same(mailBody(mail.elements), loaded.mail) || mail.elements.mailPassword.value) {
    box.textContent = '✘ Bitte zuerst speichern – die Testmail nutzt die gespeicherten Einstellungen.';
    box.className = 'small error';
    return false;
  }
  box.textContent = 'Testmail wird gesendet …';
  box.className = 'small';
  let r;
  try {
    r = await api('mail/test', { to: mail.elements.mailTestTo.value });
  } catch (ex) {
    r = { ok: false, message: ex.hint ? `${ex.message} – ${ex.hint}` : ex.message };
  }
  if (!r) return false; // abgemeldet
  box.textContent = `${r.ok ? '✔' : '✘'} ${r.message}`;
  box.className = `small${r.ok ? '' : ' error'}`;
  return false;
});

// ---------- Sicherung: Zeitplan und Speicherort ----------
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
      await fail(err, ex);
    }
  }, (t) => t);
});

// ---------- System: Ordner ----------
folders.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#advanced-error');
  err.hidden = true;
  await busy(e.submitter ?? folders.querySelector('[type=submit]'), async () => {
    try {
      if (same(folderBody(folders.elements), loaded.folders)) return 'Nichts geändert.';
      const note = (await api('settings', folderBody(folders.elements))).ablageNote ?? '';
      await loadSettings();
      return `Gespeichert.${note ? ` ${note}` : ''}`;
    } catch (ex) {
      await fail(err, ex);
    }
  }, (t) => t);
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
  if (!r) return false; // abgemeldet
  $('#portal-cert-state').textContent = certText(r.certificate);
  $('#link-cert-download').hidden = false;
  return r;
}, 'Zertifikat erzeugt – jetzt „HTTPS verwenden“ ankreuzen und speichern.');
$('#btn-cert-upload-toggle').addEventListener('click', (e) => {
  $('#cert-upload').hidden = !$('#cert-upload').hidden;
  e.currentTarget.setAttribute('aria-expanded', String(!$('#cert-upload').hidden));
});
action($('#btn-cert-upload'), async () => {
  const f = net.elements;
  const body = {};
  if (f.certPfx.files[0]) Object.assign(body, { pfx: String(await readFile(f.certPfx.files[0], 'base64')).replace(/^data:[^,]*,/, ''), passphrase: f.certPass.value });
  else if (f.certPem.files[0] && f.certKey.files[0]) Object.assign(body, { cert: await readFile(f.certPem.files[0]), key: await readFile(f.certKey.files[0]) });
  else throw new Error('Bitte eine PFX-Datei (mit Passwort) oder Zertifikat und Schlüssel (PEM) auswählen.');
  const r = await api('portal/cert/upload', body);
  if (!r) return false; // abgemeldet
  f.certPass.value = '';
  $('#portal-cert-state').textContent = certText(r.certificate);
  $('#link-cert-download').hidden = false;
  return r;
}, 'Zertifikat hinterlegt und geprüft.');
