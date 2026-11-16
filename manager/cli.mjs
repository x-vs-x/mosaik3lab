#!/usr/bin/env node
// Kommandozeile des Server-Managers (lokal, ohne Anmeldung). Kompakter Text, mit --json maschinenlesbar.
// Exit-Codes: 0 ok · 1 Warnung · 2 Fehler · 3 Administratorrechte fehlen (Befehl wird ausgegeben) · 4 falscher Aufruf
const argv = process.argv.slice(2);
const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
if (opt('--manager-config')) process.env.MANAGER_CONFIG = opt('--manager-config');
process.env.MOSAIK3LAB_QUIET = '1';

const fs = await import('node:fs');
const readline = await import('node:readline/promises');
const { publicConfig, resolvePaths, configErrors, getConfig } = await import('./lib/config.mjs');
const { serviceStatus, startService, stopService, KEYS } = await import('./lib/services.mjs');
const { listBackups, createBackup, restoreBackup, fillMissingFiles, KINDS } = await import('./lib/backup.mjs');
const { checkUpdate, installUpdate } = await import('./lib/update.mjs');
const { install, uninstall } = await import('./lib/setup.mjs');
const { reconcile } = await import('./lib/reconcile.mjs');
const { configureBackupPassword, keyFileExists } = await import('./lib/backupcrypto.mjs');
const { runtimeStatus, updateRuntime, npmAudit } = await import('./lib/runtime.mjs');
const { pageStatus, doctor } = await import('./lib/status.mjs');
const { tail } = await import('./lib/log.mjs');
const { mailSettings, sendTestMail } = await import('./lib/mail.mjs');

const VALUE_OPTS = ['--manager-config', '--config', '--which', '--data-root', '--to', '--from-backup', '--password', '--backup-password', '--path', '--kind'];
const words = argv.filter((a, i) => !a.startsWith('--') && !VALUE_OPTS.includes(argv[i - 1]));
const has = (f) => argv.includes(f);
const JSON_OUT = has('--json');
const SYM = { ok: '✔', warn: '!', error: '✘', off: '·', info: 'i' };

const HELP = `Mosaik³LAB Server-Manager – Kommandozeile
  status                       Gesamtstatus, Dienste, Hinweise
  doctor                       alle Prüfungen (Exit 0 grün, 1 Warnung, 2 Fehler)
  start|stop <webapp|backup>   Dienst starten/stoppen
  backup [list|run]            Sicherungen anzeigen / jetzt sichern (ganzes System: Datenbank, Einstellungen, Bilder, Druckdateien)
  backup fill-files <id> [--password <pw>]    nur fehlende Dateien aus einer Sicherung nachholen (nach einer älteren „Nur Datenbank“-Sicherung)
  backup restore <id> --yes [--password <pw>] [--path ablageDir=<ordner>]
                               wiederherstellen (Web-App gestoppt), danach automatisch abgleichen
  backup password set <pw>|generate|off    Backup-Passwort (AES-256-GCM) festlegen / erzeugen / Verschlüsselung aus
  reconcile [--dry-run] [--path ablageDir|backupDir|logDir=<ordner>]
                               System aus der Datenbank abgleichen (Firewall, Ports, Ordner, Dienste)
  update [check|install]       Update aus Git (mit Backup und automatischem Rollback)
  runtime [status [--audit]]   Node.js, Git, Dienst-Wrapper: installiert / aktuell / Ampel (+ npm audit)
  runtime update <node|git|wrapper> [--dry-run]   aktualisieren (Sicherung, Dienste stoppen/starten, Health-Check)
  setup --config <datei.json> [--dry-run]     einrichten (siehe README)
  setup --from-backup <datei.m3lbackup> [--config <datei.json>] [--backup-password <pw>] [--path <schlüssel>=<ordner>] [--system-dry-run]
                               aus Backup einrichten: alle Einstellungen aus der Datenbank der Sicherung
  uninstall [--dry-run] [--delete-data] [--yes] [--data-root <ordner>] [--manager-dir <ordner>]
  logs [--which app|manager|backup|update] [--errors]
  mail [test [--to <adresse>]] E-Mail bei neuen Anfragen anzeigen / Testmail senden
  config                       Einstellungen ohne Geheimnisse
Optionen: --json, --manager-config <datei>`;

/** --path ablageDir=D:\\Daten (mehrfach möglich) → { ablageDir: 'D:\\Daten' } */
const pathOpts = () => Object.fromEntries(argv.flatMap((a, i) => (argv[i - 1] === '--path' && a.includes('=') ? [[a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]] : [])));
const RSYM = { ok: '✔', fertig: '✔', geplant: '○', fehler: '✘', warnung: '!', rueckfrage: '?' };
const reconcileLines = (r) => [...r.steps.map((s) => `${RSYM[s.status] ?? '·'} ${s.id}: ${s.detail}${s.command ? `\n    ${s.command.replace(/\n/g, '\n    ')}` : ''}`), ...r.needsInput.map((n) => `  ? ${n.label}: ${n.path} (${n.reason}) → --path ${n.key}=<anderer Ordner>`)];
const print = (data, text) => console.log(JSON_OUT ? JSON.stringify(data, null, 1) : typeof text === 'function' ? text(data) : text);
function fail(err, code) {
  const exit = code ?? (err.command ? 3 : 2);
  if (JSON_OUT) console.log(JSON.stringify({ ok: false, error: err.message, hint: err.hint, command: err.command, needsInput: err.needsInput, steps: err.steps }, null, 1));
  else console.error([`✘ ${err.message}`, err.hint && `  → ${err.hint}`, ...(err.needsInput ?? []).map((n) => `  ? ${n.label}: ${n.path} (${n.reason}) → --path ${n.key}=<anderer Ordner>`), err.command && `  Als Administrator ausführen:\n${err.command.replace(/^/gm, '    ')}`].filter(Boolean).join('\n'));
  process.exit(exit);
}
const svcLine = (s) => `${SYM[s.light]} ${s.title.padEnd(20)} ${s.label}${s.pid ? ` · PID ${s.pid}` : ''}${s.port ? ` · Port ${s.port}` : ''}${s.installed ? ' · Dienst' : ''}`;
const stepLine = (s) => `${{ fertig: '✔', geplant: '○', übersprungen: '·', fehler: '✘' }[s.status] ?? '·'} ${s.id}: ${s.status}${s.detail ? ` – ${s.detail}` : ''}`;
async function ask(question) {
  if (!process.stdin.isTTY) return '';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(question);
  rl.close();
  return a.trim().toLowerCase();
}

const [cmd, sub, arg] = words;
try {
  switch (cmd) {
    case 'status': {
      const s = await pageStatus();
      print(s, () => [`${SYM[s.light]} Gesamt: ${s.label} (${s.mode}, Version ${s.version?.version ?? s.version?.id ?? '?'}, Node ${s.node})`, ...s.services.map(svcLine), ...s.notes.map((n) => `${SYM[n.light]} ${n.text}`), `Letzte Sicherung: ${s.backups[0]?.id ?? 'keine'}`, `Mailversand eingerichtet: ${s.mail.label} · Datenbank: ${s.database.label}`].join('\n'));
      process.exitCode = { ok: 0, warn: 1, error: 2 }[s.light];
      break;
    }
    case 'doctor': {
      const d = await doctor();
      print(d, () => [...d.items.map((i) => `${SYM[i.light]} ${i.title}: ${i.value}${i.light !== 'ok' && i.hint ? ` → ${i.hint}` : ''}`), ...d.recentErrors.map((e) => `  letzte Fehler: ${e}`), `Ergebnis: ${d.light} (Exit ${d.exitCode})`].join('\n'));
      process.exitCode = d.exitCode;
      break;
    }
    case 'start':
    case 'stop': {
      if (!KEYS.includes(sub)) fail(new Error('Dienst angeben: webapp oder backup'), 4);
      await (cmd === 'start' ? startService : stopService)(sub);
      const s = await serviceStatus(sub);
      print(s, svcLine(s));
      break;
    }
    case 'backup': {
      if (!sub || sub === 'list') {
        const l = await listBackups(20);
        print(l, () => l.map((b) => `${b.id}  ${KINDS[b.kind]}${b.encrypted ? ', verschlüsselt' : ''}  ${b.reason}  ${b.files} Dateien`).join('\n') || 'Keine Sicherungen.');
      } else if (sub === 'run') {
        const kind = opt('--kind') ?? 'komplett'; // --kind daten nur noch für Tests (ältere Art)
        if (!KINDS[kind]) fail(new Error('Unbekannte Art (--kind komplett).'), 4);
        const r = await createBackup('manuell (CLI)', { kind });
        print(r, `✔ ${r.id} (${KINDS[kind]}, ${r.files} Dateien, geprüft${r.encrypted ? ', verschlüsselt' : ''})`);
      } else if (sub === 'fill-files') {
        const r = await fillMissingFiles(arg, { password: opt('--password') });
        print(r, `✔ ${r.copied} fehlende Datei(en) nachgeholt, ${r.present} waren schon da (von ${r.total} in der Sicherung)`);
      } else if (sub === 'restore') {
        if (!has('--yes')) fail(new Error('Ersetzt die aktuellen Daten – bitte mit --yes bestätigen.'), 4);
        if ((await serviceStatus('webapp')).running) fail(new Error('Web-App läuft – zuerst: stop webapp'));
        const r = await restoreBackup(arg, arg, { password: opt('--password') });
        const ab = await reconcile({ restart: false, paths: pathOpts() });
        print({ ...r, reconcile: ab }, () => [`✔ ${r.restored} wiederhergestellt${r.encrypted ? ' (verschlüsselt)' : ''} (vorher gesichert: ${r.safetyBackup ?? '–'})`, ...reconcileLines(ab)].join('\n'));
        process.exitCode = ab.needsInput.length ? 1 : 0;
      } else if (sub === 'password') {
        if (arg === 'set') {
          const pw = words[3];
          if (!pw) fail(new Error('Passwort angeben: backup password set <passwort>'), 4);
          configureBackupPassword({ password: pw });
          print({ encrypt: true }, '✔ Backup-Passwort gespeichert, Sicherungen werden verschlüsselt. Bitte sicher aufbewahren – ohne Passwort ist keine Wiederherstellung möglich.');
        } else if (arg === 'generate') {
          const r = configureBackupPassword({ generate: true });
          print(r, `✔ Neues Backup-Passwort (jetzt notieren, wird nicht erneut angezeigt): ${r.password}`);
        } else if (arg === 'off') {
          configureBackupPassword({ disable: true });
          print({ encrypt: false }, '! Verschlüsselung aus – Sicherungen enthalten Passwörter im Klartext.');
        } else {
          const st = { encrypt: getConfig().backup.encrypt, keyFile: keyFileExists() };
          print(st, `Verschlüsselung: ${st.encrypt ? 'an' : 'aus'} · Passwortdatei: ${st.keyFile ? 'vorhanden' : 'fehlt'}`);
        }
      } else fail(new Error(`Unbekannt: backup ${sub}`), 4);
      break;
    }
    case 'update': {
      if (!sub || sub === 'check') {
        const r = await checkUpdate();
        print(r, () => [`Installiert: ${r.installed?.id ?? '–'}`, `Verfügbar:   ${r.available.id}${r.updateAvailable ? '  ← Update verfügbar' : ' (aktuell)'}`, ...r.available.changes.map((c) => `  ${c}`)].join('\n'));
        process.exitCode = r.updateAvailable ? 1 : 0;
      } else if (sub === 'install') {
        const r = await installUpdate(undefined, (id, status, detail) => !JSON_OUT && status !== 'läuft' && console.log(stepLine({ id, status, detail })));
        print(r, `${r.ok ? '✔' : '✘'} ${r.message}`);
        process.exitCode = r.ok ? 0 : 2;
      } else fail(new Error(`Unbekannt: update ${sub}`), 4);
      break;
    }
    case 'runtime': {
      if (!sub || sub === 'status') {
        const r = await runtimeStatus();
        const audit = has('--audit') ? await npmAudit() : null;
        print({ ...r, audit }, () => [...r.rows.map((x) => `${SYM[x.light]} ${x.title.padEnd(24)} ${x.label}${x.light !== 'ok' && x.hint ? ` → ${x.hint}` : ''}`), audit && `${SYM[audit.light]} npm-Pakete (audit)      ${audit.label}`].filter(Boolean).join('\n'));
        process.exitCode = r.rows.some((x) => x.light === 'error') ? 2 : r.rows.some((x) => x.light === 'warn') ? 1 : 0;
      } else if (sub === 'update') {
        if (!arg) fail(new Error('Laufzeit angeben: runtime update <node|git|wrapper> [--dry-run]'), 4);
        const r = await updateRuntime(arg, { dryRun: has('--dry-run') }, (id, status, detail) => !JSON_OUT && status !== 'läuft' && console.log(stepLine({ id, status, detail })));
        if (r.dryRun) print(r, () => [`Probelauf – ${r.what} (installiert: ${r.from ?? 'nicht gefunden'}):`, ...r.steps.map((t, i) => `  ${i + 1}. ${t}`), 'Befehl (mit Administratorrechten):', r.command.replace(/^/gm, '    ')].join('\n'));
        else {
          print(r, `${r.ok ? '✔' : '✘'} ${r.message}${r.hint ? `\n  → ${r.hint}` : ''}`);
          process.exitCode = r.ok ? 0 : 2;
        }
      } else fail(new Error(`Unbekannt: runtime ${sub}`), 4);
      break;
    }
    case 'reconcile': {
      const r = await reconcile({ dryRun: has('--dry-run'), paths: pathOpts() });
      print(r, () => reconcileLines(r).join('\n'));
      process.exitCode = r.needsInput.length ? 1 : r.ok ? 0 : 1;
      break;
    }
    case 'setup': {
      const file = opt('--config');
      const from = opt('--from-backup');
      if ((!file || !fs.existsSync(file)) && !from) fail(new Error('Einstellungsdatei angeben: setup --config <datei.json> [--dry-run] – oder: setup --from-backup <sicherungsordner>'), 4);
      const input = file ? JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) : {};
      if (from) input.fromBackup = { dir: from, password: opt('--backup-password'), paths: pathOpts() };
      if (has('--system-dry-run')) input.systemDryRun = true;
      if (has('--skip-build')) input.skipBuild = true;
      const r = await install(input, (id, status, detail) => !JSON_OUT && status !== 'läuft' && console.log(stepLine({ id, status, detail })), { dryRun: has('--dry-run') });
      if (JSON_OUT) print(r);
      else if (r.backupPassword) console.log(`\n! BACKUP-PASSWORT (jetzt notieren, wird nicht erneut angezeigt): ${r.backupPassword}\n  Ohne dieses Passwort lassen sich die verschlüsselten Sicherungen nicht wiederherstellen.`);
      break;
    }
    case 'uninstall': {
      let keepData = !has('--delete-data');
      const dataRoot = opt('--data-root');
      const managerDir = opt('--manager-dir');
      const plan = await uninstall({ dataRoot, managerDir, keepData, dryRun: true });
      if (!has('--dry-run') && !has('--yes')) {
        console.log(`Mosaik³LAB deinstallieren\n  Dienste: ${plan.services.join(', ') || '–'}\n  Firewall-Regeln: ${plan.firewall.join(', ') || '–'}\n  Verknüpfungen: ${plan.shortcuts.length}\n  Programmordner: ${plan.folders[0] ?? '–'}`);
        if (!has('--delete-data')) keepData = (await ask('Daten, Sicherungen und Einstellungen behalten? [J/n] ')) !== 'n';
        if ((await ask(`Wirklich deinstallieren${keepData ? '' : ' UND ALLE DATEN LÖSCHEN'}? [j/N] `)) !== 'j') fail(new Error('Abgebrochen.'), 4);
      }
      const r = await uninstall({ dataRoot, managerDir, keepData, dryRun: has('--dry-run') });
      print(r, () => [`${r.dryRun ? 'Probelauf – würde entfernen:' : '✔ Entfernt:'}`, `  Dienste: ${r.services.join(', ') || '–'}`, `  Firewall: ${r.firewall.join(', ') || '–'}`, `  Verknüpfungen: ${r.shortcuts.join(', ') || '–'}`, `  Ordner: ${r.folders.join(', ') || '–'}`, r.keep.length ? `  Behalten: ${r.keep.join(', ')}` : ''].filter(Boolean).join('\n'));
      break;
    }
    case 'logs': {
      const lines = tail(opt('--which') ?? 'app', 100).filter((l) => !has('--errors') || l.error);
      print(lines, () => lines.map((l) => `${l.error ? '✘' : ' '} ${l.text}`).join('\n') || '(leer)');
      break;
    }
    case 'mail': {
      if (sub === 'test') {
        const r = await sendTestMail(opt('--to'));
        print(r, `${r.ok ? '✔' : '✘'} ${r.message}`);
        process.exitCode = r.ok ? 0 : 2;
      } else {
        const m = mailSettings();
        print(m, () => `Mailversand: ${m.enabled ? 'an' : 'aus'} · ${m.host || '–'}:${m.port} ${m.secure ? 'SSL/TLS' : 'STARTTLS'} · Absender ${m.from || '–'} · Empfänger ${m.recipients.join(', ') || '–'} · Passwort ${m.passwordSet ? 'gesetzt' : 'leer'}\nDatei: ${m.file}`);
      }
      break;
    }
    case 'config':
      print({ config: publicConfig(), paths: resolvePaths(), errors: configErrors() }, (d) => JSON.stringify(d, null, 2));
      break;
    case undefined:
    case 'help':
      console.log(HELP);
      break;
    default:
      fail(new Error(`Unbekannter Befehl „${cmd}“.\n${HELP}`), 4);
  }
} catch (err) {
  fail(err);
}
setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref();
