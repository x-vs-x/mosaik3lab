// Plattform Windows: Dienste über WinSW, Windows-Firewall, Verknüpfungen (.lnk), Admin-Schritte per UAC.
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { run, psQuote, SERVICE_IDS, SERVICE_TITLES, FIREWALL_RULE } from './common.mjs';

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SYSTEM32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const LOCAL_SERVICE_SID = 'S-1-5-19'; // eingeschränktes Standardkonto „Lokaler Dienst“

/** PowerShell-Skript ausführen (Base64 → keine Anführungszeichen-Probleme), Ausgabe UTF-8. */
export function powershell(script, opts = {}) {
  const full = `$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.Encoding]::UTF8;${script}`;
  // PSModulePath von PowerShell 7 (z. B. aus einem pwsh-Fenster gestartet) bricht Windows PowerShell 5.1 (kein Cert:-Laufwerk) → weglassen
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toLowerCase() !== 'psmodulepath'));
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(full, 'utf16le').toString('base64')], { timeout: 60_000, env, ...opts });
}

// Dienst-Wrapper, fest gepinnt. Geladen wird er nur, wenn der Nutzer es bei der Einrichtung ausdrücklich erlaubt.
export const WINSW = {
  version: '2.12.0',
  url: 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW.NET461.exe', // braucht .NET 4.6.1+ (ab Windows 10 vorhanden)
  size: 655872,
  sha256: null, // TODO: einmalig prüfen und eintragen – bis dahin wird nur die Größe geprüft und die Prüfsumme protokolliert
};

export const windows = {
  id: 'windows',
  label: 'Windows',

  /** Feste Vorgabe: alles unter C:\\Mosaik3LAB (Programm, Daten, Ablage, Sicherungen, Protokolle, Manager). */
  defaults() {
    // Programm wie jedes Programm unter „Programme“, in C:\Mosaik3LAB nur Daten, Ablage, Sicherungen, Protokolle
    const root = path.join(`${process.env.SystemDrive || 'C:'}\\`, 'Mosaik3LAB');
    const programRoot = path.join(process.env.ProgramFiles || path.join(`${process.env.SystemDrive || 'C:'}\\`, 'Program Files'), 'Mosaik3LAB');
    return { programRoot, dataRoot: root, backupDir: path.join(root, 'backups'), logDir: path.join(root, 'logs') };
  },
  serviceFilesInProgram: true, // Dienst-.exe/.xml, WinSW und install-manifest liegen im Programmordner (layout())

  async isAdmin() {
    return (await run('net', ['session'], { timeout: 5000 })).code === 0;
  },

  /** Wer belegt einen TCP-Port? → { pid, process, address } oder null (netstat + tasklist: schnell, sprachunabhängig) */
  async portOwner(port) {
    const r = await run('netstat', ['-ano', '-p', 'TCP'], { timeout: 10_000 });
    // Lauschende Einträge erkennt man an der Gegenadresse 0.0.0.0:0 bzw. [::]:0 (unabhängig von der Sprache).
    const line = r.stdout.split(/\r?\n/).map((l) => l.trim().split(/\s+/)).find((c) => c[1]?.endsWith(`:${Number(port)}`) && /^(0\.0\.0\.0|\[::\]):0$/.test(c[2] ?? ''));
    if (!line) return null;
    const pid = Number(line.at(-1));
    const t = await run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { timeout: 10_000 });
    return { pid, process: /^"([^"]+?)(\.exe)?"/i.exec(t.stdout)?.[1] ?? null, address: line[1].slice(0, line[1].lastIndexOf(':')).replace(/^\[|\]$/g, '') };
  },

  async killTree(pid) {
    await run('taskkill', ['/PID', String(pid), '/T', '/F'], { timeout: 10_000 });
  },

  /** Manager als eigenes Programmfenster öffnen (Edge/Chrome im App-Modus), sonst Standardbrowser. */
  openAppWindow(url) {
    const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
    const browser = roots.flatMap((r) => [path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe')]).find((f) => fs.existsSync(f));
    const child = browser
      ? spawn(browser, [`--app=${url}`, '--window-size=1100,820'], { detached: true, stdio: 'ignore' })
      : spawn('cmd.exe', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  },

  /** Admin-Skript ausführen: direkt (schon Admin) oder mit Windows-Bestätigung (UAC). Als Dienst: nur Anleitung. */
  async elevate(script) {
    if (await windows.isAdmin()) {
      const r = await powershell(`$ErrorActionPreference='Stop';${script}`, { timeout: 600_000 });
      return { ok: r.code === 0, code: r.code, output: `${r.stdout}\n${r.stderr}`.trim() };
    }
    if (process.env.MOSAIK3LAB_SERVICE === '1') return { ok: false, code: 3, manual: true, message: 'Als Dienst kann keine Windows-Bestätigung angezeigt werden – Befehl bitte als Administrator ausführen.' };
    const encoded = Buffer.from(`$ErrorActionPreference='Stop';${script}`, 'utf16le').toString('base64');
    const r = await powershell(`try { $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'; exit $p.ExitCode } catch { exit 1223 }`, { timeout: 600_000 });
    if (r.code === 1223) return { ok: false, code: 3, message: 'Die Windows-Bestätigung wurde abgelehnt.' };
    return { ok: r.code === 0, code: r.code, output: `${r.stdout}\n${r.stderr}`.trim() };
  },

  /** Ordner anlegen und beschreibbar machen: für den angemeldeten Benutzer und das Dienstkonto. */
  prepareDirsScript(dirs) {
    const user = psQuote(`${process.env.USERDOMAIN ?? os.hostname()}\\${os.userInfo().username}`);
    return dirs.map((d) => `New-Item -ItemType Directory -Force ${psQuote(d)} | Out-Null; & icacls ${psQuote(d)} /grant "${user.slice(1, -1)}:(OI)(CI)M" "*${LOCAL_SERVICE_SID}:(OI)(CI)M" /T /C /Q | Out-Null`).join('\n');
  },

  // ---------- Firewall ----------
  firewall: {
    async exists(port) {
      const r = await powershell(`@(Get-NetFirewallRule -DisplayName ${psQuote(FIREWALL_RULE(port))} -ErrorAction SilentlyContinue).Count`);
      return Number(r.stdout) > 0;
    },
    allowScript: (port) => `if (-not (Get-NetFirewallRule -DisplayName ${psQuote(FIREWALL_RULE(port))} -ErrorAction SilentlyContinue)) { New-NetFirewallRule -DisplayName ${psQuote(FIREWALL_RULE(port))} -Direction Inbound -Protocol TCP -LocalPort ${Number(port)} -Action Allow -Profile Private,Domain | Out-Null }`,
    // Alle Regeln filtern statt -DisplayName: fehlt die Regel schon, ist das kein Fehler (sonst endet das Admin-Skript mit Code 1, z. B. beim Deinstallieren)
    removeScript: (port) => `Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object DisplayName -eq ${psQuote(FIREWALL_RULE(port))} | Remove-NetFirewallRule`,
    /** Ist ein aktives Netzwerk als „Öffentlich“ eingestuft? Dann greift die Regel (Privat, Domäne) dort nicht. */
    async publicNetwork() {
      const r = await powershell("@(Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object NetworkCategory -eq 'Public').Count");
      return Number(r.stdout) > 0;
    },
  },

  // ---------- Dienste (WinSW) ----------
  services: {
    async status(key) {
      const r = await run('sc.exe', ['query', SERVICE_IDS[key]], { timeout: 10_000 });
      const state = /:\s+(\d)\s+[A-Z_]+/.exec(r.stdout)?.[1]; // 4 = RUNNING
      return r.code === 0 && state ? { installed: true, running: state === '4' } : { installed: false, running: false };
    },
    /** WinSW-Konfiguration: Autostart, Neustart nach Absturz, Logrotation, Konto „Lokaler Dienst“. */
    files(def) {
      const content =
        `<!-- Erzeugt vom Mosaik³LAB Server-Manager -->\n<service>\n  <id>${def.id}</id>\n  <name>${xml(def.title)}</name>\n  <description>${xml(def.title)}</description>\n` +
        `  <executable>${xml(def.node)}</executable>\n  <arguments>${def.args.map((a) => `"${xml(a)}"`).join(' ')}</arguments>\n  <workingdirectory>${xml(def.workDir)}</workingdirectory>\n` +
        `  <startmode>Automatic</startmode>\n  <delayedAutoStart>true</delayedAutoStart>\n  <stoptimeout>30 sec</stoptimeout>\n` +
        `  <onfailure action="restart" delay="5 sec"/>\n  <onfailure action="restart" delay="30 sec"/>\n  <onfailure action="restart" delay="120 sec"/>\n  <resetfailure>1 hour</resetfailure>\n` +
        `  <logpath>${xml(def.logDir)}</logpath>\n  <log mode="roll-by-size"><sizeThreshold>5120</sizeThreshold><keepFiles>5</keepFiles></log>\n` +
        Object.entries(def.env).map(([k, v]) => `  <env name="${xml(k)}" value="${xml(v)}"/>\n`).join('') +
        `  <serviceaccount><domain>NT AUTHORITY</domain><user>LocalService</user><allowservicelogon>true</allowservicelogon></serviceaccount>\n</service>\n`;
      return [{ path: path.join(def.serviceDir, `${def.id}.xml`), content }];
    },
    installScript(def) {
      const exe = psQuote(path.join(def.serviceDir, `${def.id}.exe`));
      // Nur kopieren, wenn anders (erneutes Einrichten: laufende .exe ist gesperrt → dann vorher stoppen)
      const copy = `if (-not (Test-Path ${exe}) -or (Get-FileHash ${exe}).Hash -ne (Get-FileHash ${psQuote(def.wrapperExe)}).Hash) { Stop-Service -Name '${def.id}' -Force -ErrorAction SilentlyContinue; Copy-Item -Force ${psQuote(def.wrapperExe)} ${exe} }`;
      const lines = [copy, `if (-not (Get-Service -Name '${def.id}' -ErrorAction SilentlyContinue)) { & ${exe} install; if ($LASTEXITCODE) { exit $LASTEXITCODE } }`];
      // Der Manager-Dienst (Lokaler Dienst) darf Web-App und Backup starten/stoppen.
      if (def.key !== 'manager') lines.push(`$sd = ((& sc.exe sdshow '${def.id}') -join '').Trim(); if ($sd -notlike '*;;;LS)*') { & sc.exe sdset '${def.id}' ($sd -replace '^D:', 'D:(A;;RPWPLCLOCRRC;;;LS)') | Out-Null }`);
      return lines.join('\n');
    },
    uninstallScript: (id, serviceDir) => `if (Get-Service -Name '${id}' -ErrorAction SilentlyContinue) { Stop-Service -Name '${id}' -Force -ErrorAction SilentlyContinue; & sc.exe delete '${id}' | Out-Null }; Remove-Item -Force -ErrorAction SilentlyContinue ${psQuote(path.join(serviceDir, `${id}.exe`))}, ${psQuote(path.join(serviceDir, `${id}.xml`))}`,
    controlScript: (key, action) => `${action === 'start' ? 'Start' : 'Stop'}-Service '${SERVICE_IDS[key]}'`,
    /** Start/Stopp ohne UAC (klappt dank Dienst-Rechten für den Manager bzw. als Admin). */
    async control(key, action) {
      const r = await run('sc.exe', [action, SERVICE_IDS[key]], { timeout: 30_000 });
      return r.code === 0 || /1056|1062/.test(r.stdout); // 1056 läuft schon, 1062 läuft nicht
    },
  },

  // ---------- Verknüpfungen ----------
  shortcutDirs() {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return {
      desktop: process.env.MOSAIK3LAB_SHORTCUT_DIR ?? path.join(os.homedir(), 'Desktop'),
      menu: process.env.MOSAIK3LAB_SHORTCUT_DIR ? path.join(process.env.MOSAIK3LAB_SHORTCUT_DIR, 'Startmenü', 'Mosaik³LAB') : path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Mosaik³LAB'),
    };
  },
  /** Verknüpfungen anlegen: items = [{ file, target, args, icon, url? }] – .url für Webadressen, sonst .lnk. */
  async createShortcuts(items) {
    const lines = ['$sh = New-Object -ComObject WScript.Shell'];
    for (const it of items) {
      lines.push(`New-Item -ItemType Directory -Force ${psQuote(path.dirname(it.file))} | Out-Null`);
      if (it.url) lines.push(`Set-Content -Encoding ASCII -Path ${psQuote(it.file)} -Value "[InternetShortcut]","URL=${it.url}","IconFile=${it.icon}","IconIndex=0"`);
      else lines.push(`$l = $sh.CreateShortcut(${psQuote(it.file)}); $l.TargetPath = ${psQuote(it.target)}; $l.Arguments = ${psQuote(it.args ?? '')}; $l.WorkingDirectory = ${psQuote(it.workDir ?? path.dirname(it.target))}; $l.IconLocation = ${psQuote(`${it.icon},0`)}; $l.WindowStyle = 7; $l.Description = ${psQuote(it.description ?? '')}; $l.Save()`);
    }
    const r = await powershell(lines.join('\n'));
    if (r.code !== 0) throw new Error(`Verknüpfungen konnten nicht angelegt werden: ${r.stderr}`);
  },
  shortcutExt: (item) => (item.url ? '.url' : '.lnk'),
  launcher: (programDir, arg = '') => ({ target: path.join(SYSTEM32, 'cmd.exe'), args: `/c ""${path.join(programDir, 'manager', 'mosaik3lab.cmd')}"${arg ? ` ${arg}` : ''}"`, workDir: programDir }),

  /** Git-Archiv (.tar.gz) entpacken – immer das Windows-eigene tar (bsdtar). */
  async extract(file, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const r = await run(path.join(SYSTEM32, 'tar.exe'), ['-xf', file, '-C', dest], { timeout: 300_000 });
    if (r.code !== 0) throw new Error(`Entpacken fehlgeschlagen: ${r.stderr || r.error}`);
  },
  linkDir: (target, link) => fs.symlinkSync(target, link, 'junction'), // Junction: ohne Admin-Rechte
  unlinkDir: (link) => fs.rmdirSync(link),
  /** Ordner löschen, auch wenn der Manager gerade daraus läuft (verzögert, nach Programmende). */

  /**
   * Selbstsigniertes HTTPS-Zertifikat erzeugen (Namen + IP-Adressen, Jahre gültig) und als PFX-Datei exportieren.
   * Es wird im Benutzer-Zertifikatspeicher angelegt (ohne Administratorrechte) und direkt nach dem Export wieder entfernt
   * (samt Schlüssel) – im System bleibt nichts zurück. → { pfx: Buffer, passphrase }
   */
  async generateCertificate({ dnsNames, ips, days, workDir }) {
    const passphrase = crypto.randomBytes(18).toString('base64url');
    const file = path.join(workDir, 'portal.pfx');
    const san = [...dnsNames.map((d) => `DNS=${d}`), ...ips.map((i) => `IPAddress=${i}`)].join('&');
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$c = New-SelfSignedCertificate -Subject ${psQuote(`CN=${dnsNames[0]}`)} -TextExtension @(${psQuote(`2.5.29.17={text}${san}`)}) -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter (Get-Date).AddDays(${Number(days)}) -CertStoreLocation Cert:\\CurrentUser\\My -FriendlyName 'Mosaik3LAB (selbst erzeugt)'`,
      "try { Export-PfxCertificate -Cert $c -FilePath " + psQuote(file) + " -Password (ConvertTo-SecureString -String " + psQuote(passphrase) + " -AsPlainText -Force) | Out-Null } finally { Remove-Item -LiteralPath ('Cert:\\CurrentUser\\My\\' + $c.Thumbprint) -DeleteKey -Force }",
    ].join('\n');
    const r = await powershell(script, { timeout: 120_000 });
    if (r.code !== 0 || !fs.existsSync(file)) throw new Error(`Zertifikat konnte nicht erzeugt werden: ${r.stderr || r.stdout || r.code}`);
    return { pfx: fs.readFileSync(file), passphrase };
  },

  nodeInstall: 'winget install --id OpenJS.NodeJS.LTS -e',
  gitInstall: 'winget install --id Git.Git -e',
  /** Übliche Orte von git.exe – das Dienstkonto „Lokaler Dienst“ hat oft einen anderen PATH als der Benutzer. */
  gitCandidates: () => [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432].filter(Boolean).map((d) => path.join(d, 'Git', 'cmd', 'git.exe')).concat(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'cmd', 'git.exe')] : []),
  /** Laufzeiten per winget (Windows-Bestätigung): installieren bzw. aktualisieren; 0x8A15002B = „kein Update nötig“. */
  runtime: {
    ids: { node: 'OpenJS.NodeJS.LTS', git: 'Git.Git' },
    installScript: (what) => `winget install --id ${windows.runtime.ids[what]} -e --silent --accept-package-agreements --accept-source-agreements; if ($LASTEXITCODE) { exit $LASTEXITCODE }`,
    upgradeScript: (what) => `winget upgrade --id ${windows.runtime.ids[what]} -e --silent --accept-package-agreements --accept-source-agreements; if ($LASTEXITCODE -and $LASTEXITCODE -ne -1978335189) { exit $LASTEXITCODE }`,
    backScript: (what, version) => `winget install --id ${windows.runtime.ids[what]} -e --version ${version}`,
  },
  wrapper: WINSW,
  SERVICE_TITLES,
};
