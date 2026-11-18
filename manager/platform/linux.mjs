// Plattform Linux (Debian/Ubuntu, Raspberry Pi OS): systemd, ufw/firewalld, .desktop-Dateien, sudo.
// Echt getestet mit dem Installer-Paket auf Ubuntu 24.04 x64 und arm64 (.github/workflows/installer-linux.yml).
// Ungetestet: Raspberry Pi OS 32 Bit, macOS, Laufzeiten per apt (runtime.*), Zertifikat per openssl.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { run, shQuote, SERVICE_IDS, SERVICE_TITLES, FIREWALL_RULE } from './common.mjs';
import { ADMIN_MAX_MS, HELFER_MAX_MS } from '../lib/zeitlimits.mjs';

const USER = 'mosaik3lab'; // eingeschränkter Systembenutzer für alle Dienste
const POLKIT_RULE = '/etc/polkit-1/rules.d/50-mosaik3lab.rules';

/**
 * Datei als root schreiben (Teil eines Admin-Skripts): Inhalt steht im Skript, nie in einer Zwischendatei. Erst in eine
 * Temp-Datei im Zielordner (gehört root), dann Besitzer/Rechte setzen und umbenennen – das Ziel ist nie halb geschrieben.
 */
export const rootWrite = (target, content) => {
  const dir = path.posix.dirname(target);
  return `mkdir -p ${shQuote(dir)} && t=$(mktemp ${shQuote(`${dir}/.mosaik3lab.`)}XXXXXX) && printf '%s' ${shQuote(content)} > "$t" && chown root:root "$t" && chmod 644 "$t" && mv -f "$t" ${shQuote(target)}`;
};

/** Ausgabe von „pkaction --version“ („pkaction version 0.105“ bzw. „… 122“) → Version, wenn älter als 0.106 (keine JS-Regeln), sonst null. */
export function polkitTooOld(text) {
  const m = /(\d+)(?:\.(\d+))?/.exec(String(text ?? ''));
  if (!m || Number(m[1]) > 0 || Number(m[2] ?? 0) >= 106) return null;
  return m[0];
}
/**
 * Ein Argument für ExecStart=/Environment= einer systemd-Unit: in "…" (Pfade mit Leerzeichen bleiben ein Argument),
 * \ und " maskiert, % verdoppelt (sonst ein systemd-Platzhalter).
 */
export const sdQuote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%')}"`;
/** Pfad in Exec= einer .desktop-Datei: in "…", darin \ " ` $ maskiert. */
const desktopQuote = (s) => `"${String(s).replace(/[\\"`$]/g, '\\$&')}"`;
const which = async (cmd) => (await run('sh', ['-c', `command -v ${cmd}`], { timeout: 3000 })).code === 0;

export const linux = {
  id: 'linux',
  label: 'Linux',
  ownsDataDirs: true, // als root eingerichtet → Datenordner danach dem Dienstbenutzer übergeben (setup.mjs)

  defaults: () => ({ programRoot: '/opt/mosaik3lab', dataRoot: '/var/lib/mosaik3lab', backupDir: '/var/backups/mosaik3lab', logDir: '/var/log/mosaik3lab' }),

  async isAdmin() {
    return process.getuid?.() === 0;
  },

  /**
   * Darf der Manager (Benutzer mosaik3lab) Web-App, Backup, Portal und Update-Helfer steuern? Das regelt eine polkit-Regel
   * in JavaScript (/etc/polkit-1/rules.d) – die versteht polkit erst ab 0.106. Raspberry Pi OS/Debian 11 „Bullseye“ und
   * Ubuntu 22.04 haben 0.105. → null (in Ordnung oder nicht feststellbar) oder ein Satz für die IT.
   */
  async polkitProblem() {
    const r = await run('pkaction', ['--version'], { timeout: 5000 });
    const folgen = 'Der Server-Manager kann die Dienste dann nicht selbst starten und stoppen, „Jetzt aktualisieren“ geht nicht. Mosaik³LAB läuft trotzdem: Updates mit dem neuen Paket (sudo ./installieren.sh), Dienste mit sudo systemctl. Empfohlen: Raspberry Pi OS „Bookworm“ (Debian 12) bzw. Ubuntu 24.04 oder neuer.';
    if (r.code !== 0) {
      if (['/usr/lib/polkit-1/polkitd', '/usr/libexec/polkitd', '/usr/lib/policykit-1/polkitd'].some((f) => fs.existsSync(f))) return null; // da, Version unbekannt
      return `polkit fehlt (sudo apt-get install polkitd). ${folgen}`;
    }
    const alt = polkitTooOld(r.stdout);
    if (!alt) return null;
    return `polkit ${alt} ist zu alt für die Regel des Managers (erst ab 0.106, z. B. Raspberry Pi OS „Bullseye“, Ubuntu 22.04). ${folgen}`;
  },

  async portOwner(port) {
    const r = await run('ss', ['-ltnpH', `sport = :${Number(port)}`], { timeout: 5000 });
    const m = /\("([^"]+)",pid=(\d+)/.exec(r.stdout);
    return r.stdout ? { pid: m ? Number(m[2]) : null, process: m?.[1] ?? null } : null;
  },

  async killTree(pid) {
    // Zuerst die ganze Prozessgruppe (Prozess mit detached gestartet → eigene Gruppe, samt Unterprozessen), sonst nur ihn
    try {
      process.kill(-pid, 'SIGKILL');
      return;
    } catch {
      /* keine eigene Gruppe */
    }
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* schon beendet */
    }
  },

  openAppWindow(url) {
    if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return;
    const child = spawn('sh', ['-c', `(chromium-browser --app=${shQuote(url)} || chromium --app=${shQuote(url)} || xdg-open ${shQuote(url)}) >/dev/null 2>&1`], { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  },

  /**
   * Admin-Skript: als root direkt, sonst sudo ohne Passwortabfrage – sonst Befehl zum Kopieren (nichts hängt).
   * Zeitlimit ADMIN_MAX_MS (30 min): „Datenordner dem Dienstbenutzer übergeben“ (chown -R) dauert auf einem Pi mit großer Ablage.
   */
  async elevate(script) {
    const r = (await linux.isAdmin()) ? await run('sh', ['-ec', script], { timeout: ADMIN_MAX_MS }) : await run('sudo', ['-n', 'sh', '-ec', script], { timeout: ADMIN_MAX_MS });
    if (r.code === 0) return { ok: true, code: 0, output: r.stdout };
    return { ok: false, code: 3, manual: true, message: 'Administratorrechte nötig – Befehl bitte mit sudo im Terminal ausführen.', output: r.stderr };
  },

  /**
   * Programmordner (Paket-Installation) nur für root beschreibbar – unabhängig davon, was der Elternordner vererbt
   * (z. B. Standard-ACLs auf /opt). Der Update-Helfer läuft als root aus diesem Ordner.
   */
  protectProgramScript: (dir) =>
    `chown -R -h root:root ${shQuote(dir)} && chmod -R go-w ${shQuote(dir)} && { ! command -v setfacl >/dev/null 2>&1 || setfacl -R -b ${shQuote(dir)}; }`,

  /** Dienstbenutzer anlegen und ihm die Ordner übergeben; wer einrichtet (auch hinter sudo), kommt in seine Gruppe. */
  prepareDirsScript(dirs) {
    const me = process.env.SUDO_USER || os.userInfo().username;
    return [
      `id -u ${USER} >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin ${USER}`,
      me !== 'root' ? `usermod -aG ${USER} ${shQuote(me)}` : '',
      ...dirs.map((d) => `mkdir -p ${shQuote(d)} && chown -R ${USER}:${USER} ${shQuote(d)} && chmod -R g+rwX ${shQuote(d)}`),
    ].filter(Boolean).join('\n');
  },

  firewall: {
    /** ufw oder firewalld installiert (auch ausgeschaltet) – dann legt die Einrichtung die Regel vorsorglich an. */
    available: async () => (await which('ufw')) || (await which('firewall-cmd')),
    /**
     * Ist überhaupt eine Firewall aktiv? Raspberry Pi OS hat meist keine, Ubuntu hat ufw installiert, aber aus.
     * Ohne aktive Firewall sind alle Ports offen – dann gibt es keine Regel anzulegen (und keine Warnung).
     */
    async active() {
      if (await which('ufw')) {
        // ufw.conf ist für alle lesbar – „ufw status“ selbst bräuchte root (der Manager-Dienst läuft als mosaik3lab)
        const conf = (() => {
          try {
            return fs.readFileSync('/etc/ufw/ufw.conf', 'utf8');
          } catch {
            return '';
          }
        })();
        if (/^\s*ENABLED\s*=\s*yes/im.test(conf)) return true;
      }
      if (await which('firewall-cmd')) return (await run('firewall-cmd', ['--state'], { timeout: 5000 })).stdout.trim() === 'running';
      return false;
    },
    /** true/false, oder null = nicht prüfbar (z. B. ufw ohne root) – dann wird nichts angemahnt. */
    async exists(port) {
      if (!(await linux.firewall.active())) return null;
      const want = `${Number(port)}/tcp`;
      if (await which('ufw')) {
        const r = (await linux.isAdmin()) ? await run('ufw', ['status']) : await run('sudo', ['-n', 'ufw', 'status']);
        return r.code === 0 && /Status: active/i.test(r.stdout) ? r.stdout.split('\n').some((l) => l.trim().startsWith(want)) : null;
      }
      const r = await run('firewall-cmd', ['--list-ports'], { timeout: 5000 });
      return r.code === 0 ? r.stdout.split(/\s+/).includes(want) : null;
    },
    allowScript: (port) => `if command -v ufw >/dev/null; then ufw allow ${Number(port)}/tcp comment ${shQuote(FIREWALL_RULE(port))}; elif command -v firewall-cmd >/dev/null; then firewall-cmd --permanent --add-port=${Number(port)}/tcp && firewall-cmd --reload; fi`,
    removeScript: (port) => `if command -v ufw >/dev/null; then ufw delete allow ${Number(port)}/tcp || true; elif command -v firewall-cmd >/dev/null; then firewall-cmd --permanent --remove-port=${Number(port)}/tcp && firewall-cmd --reload; fi`,
    publicNetwork: async () => false, // keine Netzwerk-Einstufung wie unter Windows
  },

  services: {
    async status(key) {
      const r = await run('systemctl', ['show', SERVICE_IDS[key], '--property=LoadState,ActiveState'], { timeout: 5000 });
      return { installed: r.stdout.includes('LoadState=loaded'), running: r.stdout.includes('ActiveState=active') };
    },
    /**
     * Sicherheit: Unit-Dateien und polkit-Regel entstehen im Setup-Prozess und stehen als Text im Admin-Skript – root schreibt
     * sie direkt nach /etc (gehört root, 644) – nie über einen Ordner des Dienstbenutzers: Ein übernommener Manager
     * könnte sie dort vor dem Installieren austauschen (→ Code als root). Deshalb schreibt setup.mjs hier nichts selbst.
     */
    filesInInstallScript: true,
    /** Der Update-Helfer darf seine eigene Unit während eines Laufs erneuern (daemon-reload stoppt ihn nicht) – neue Zeitlimits gelten sofort. */
    updaterLiveUpdate: true,
    files(def) {
      if (def.key === 'updater') {
        // Update-Helfer: root, einmaliger Lauf (beim Hochfahren: Notfall-Prüfung; sonst auf Anforderung des Managers).
        // TimeoutStartSec = Gesamtlimit des Helfers (lib/zeitlimits.mjs) – größer als Wächter und Sicherung darin.
        const unit = `# Erzeugt vom Mosaik³LAB Server-Manager\n[Unit]\nDescription=${def.title}\nAfter=network-online.target\n\n[Service]\nType=oneshot\nWorkingDirectory=${def.workDir}\nExecStart=${[def.node, ...def.args].map(sdQuote).join(' ')}\n` +
          Object.entries(def.env).map(([k, v]) => `Environment=${sdQuote(`${k}=${v}`)}\n`).join('') + `TimeoutStartSec=${Math.round(HELFER_MAX_MS / 1000)}\n\n[Install]\nWantedBy=multi-user.target\n`;
        return [{ path: `/etc/systemd/system/${def.id}.service`, content: unit }];
      }
      const unit =
        `# Erzeugt vom Mosaik³LAB Server-Manager\n[Unit]\nDescription=${def.title}\nAfter=network-online.target\n\n[Service]\nType=simple\nUser=${USER}\nGroup=${USER}\n` +
        `WorkingDirectory=${def.workDir}\nExecStart=${[def.node, ...def.args].map(sdQuote).join(' ')}\n` + Object.entries(def.env).map(([k, v]) => `Environment=${sdQuote(`${k}=${v}`)}\n`).join('') +
        (def.key === 'portal' ? 'AmbientCapabilities=CAP_NET_BIND_SERVICE\nCapabilityBoundingSet=CAP_NET_BIND_SERVICE\n' : '') + // Port 80/443 ohne Root
        `Restart=on-failure\nRestartSec=5\nTimeoutStopSec=30\nNoNewPrivileges=yes\nProtectSystem=full\n\n[Install]\nWantedBy=multi-user.target\n`;
      const files = [{ path: `/etc/systemd/system/${def.id}.service`, content: unit }];
      if (def.key === 'manager') {
        files.push({ path: POLKIT_RULE, content: `// Manager darf Web-App, Backup, Portal und den Update-Helfer steuern\npolkit.addRule(function(a, s) {\n  if (a.id == "org.freedesktop.systemd1.manage-units" && s.user == "${USER}" && /^mosaik3lab-(webapp|backup|portal|updater)\\.service$/.test(a.lookup("unit"))) return polkit.Result.YES;\n});\n` });
      }
      return files;
    },
    installScript: (def) => [
      ...linux.services.files(def).map((f) => rootWrite(f.path, f.content)),
      `systemctl daemon-reload && systemctl enable ${def.id}`,
    ].join('\n'),
    uninstallScript: (id) => `systemctl disable --now ${shQuote(id)} 2>/dev/null || true; rm -f ${shQuote(`/etc/systemd/system/${id}.service`)} ${POLKIT_RULE}; systemctl daemon-reload`,
    controlScript: (key, action) => `systemctl ${action} ${SERVICE_IDS[key]}`,
    async control(key, action) {
      // Update-Helfer (Typ oneshot): „start“ würde bis zum Ende des Updates warten – im Hintergrund starten (--no-block)
      const args = key === 'updater' && action === 'start' ? [action, '--no-block', SERVICE_IDS[key]] : [action, SERVICE_IDS[key]];
      return (await run('systemctl', args, { timeout: 30_000 })).code === 0;
    },
  },

  /** Als root (Installer-Paket): Menüeinträge für alle unter /usr/share/applications, kein Desktop – auf einem Server ohne Desktop harmlos. */
  shortcutDirs() {
    const base = process.env.MOSAIK3LAB_SHORTCUT_DIR;
    if (!base && process.getuid?.() === 0) return { desktop: null, menu: '/usr/share/applications/mosaik3lab' };
    const desktop = base ?? path.join(os.homedir(), 'Desktop');
    return { desktop: base || fs.existsSync(desktop) ? desktop : null, menu: base ? path.join(base, 'applications') : path.join(os.homedir(), '.local', 'share', 'applications') };
  },
  async createShortcuts(items) {
    for (const it of items) {
      fs.mkdirSync(path.dirname(it.file), { recursive: true });
      const exec = it.url ? `xdg-open ${it.url}` : `${it.target} ${it.args ?? ''}`.trim();
      fs.writeFileSync(it.file, `[Desktop Entry]\nType=Application\nName=${path.basename(it.file, '.desktop')}\nComment=${it.description ?? ''}\nExec=${exec}\nIcon=${it.icon}\nTerminal=${it.terminal ? 'true' : 'false'}\nCategories=Office;Education;\n`, { mode: 0o755 });
    }
  },
  shortcutExt: () => '.desktop',
  launcher: (programDir, arg = '') => ({ target: 'sh', args: `${desktopQuote(path.join(programDir, 'manager', 'mosaik3lab.sh'))}${arg ? ` ${arg}` : ''}`, terminal: arg === 'uninstall' }),

  linkDir: (target, link) => fs.symlinkSync(target, link, 'dir'),
  unlinkDir: (link) => fs.unlinkSync(link),

  /** Laufzeiten per apt (Node über NodeSource) – UNGETESTET. */
  runtime: {
    installScript: () => 'curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && apt-get install -y nodejs',
    upgradeScript: () => 'curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && apt-get install -y --only-upgrade nodejs',
    backScript: (what, version) => `apt-get install -y --allow-downgrades nodejs=${version}-1nodesource1`,
  },
  /** Selbstsigniertes HTTPS-Zertifikat mit openssl (UNGETESTET). → { cert, key } (PEM) */
  async generateCertificate({ dnsNames, ips, days, workDir }) {
    const keyFile = path.join(workDir, 'key.pem');
    const certFile = path.join(workDir, 'cert.pem');
    const san = [...dnsNames.map((d) => `DNS:${d}`), ...ips.map((i) => `IP:${i}`)].join(',');
    const r = await run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', String(Number(days)), '-keyout', keyFile, '-out', certFile, '-subj', `/CN=${dnsNames[0]}`, '-addext', `subjectAltName=${san}`], { timeout: 60_000 });
    if (r.code !== 0 || !fs.existsSync(certFile)) throw new Error(`Zertifikat konnte nicht erzeugt werden (openssl): ${r.stderr || r.error || r.code}`);
    return { cert: fs.readFileSync(certFile, 'utf8'), key: fs.readFileSync(keyFile, 'utf8') };
  },

  nodeInstall: 'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs',
  wrapper: null,
  SERVICE_TITLES,
};
