import fs from 'node:fs';
import path from 'node:path';
import { hatBereich } from '../kern/betrieb';
import { stamp as zeitstempel, type Db } from '../kern/db';
import { writeMailConfig } from '../kern/mail/mailConfig';

// Einmalige Übernahme alter Betriebsdateien aus der Zeit vor der Datenbank (bis 1.0): config/mail.json, das Feld „mail“
// in settings.json und .session-secret. Läuft bei jedem Start, tut aber nur etwas, solange solche Dateien da sind.

/**
 * Einmalige Übernahme alter Mail-Daten in die Datenbank – nur wenn es dort noch keine Mail-Einstellungen gibt:
 *  1. <storage>/config/mail.json (bisherige Betriebsdatei) → danach umbenannt in mail.json.vor-datenbank-<zeit>.bak
 *  2. alte SMTP-Daten aus <dataDir>/settings.json (Feld „mail“; vorher Sicherung, danach aus der Datei entfernt)
 * Läuft nach den Migrationen beim Start der App.
 */
export function importLegacyMail(db: Db, opts: { storageDir: string; dataDir: string }) {
  const stamp = zeitstempel();
  const mailFile = path.join(opts.storageDir, 'config', 'mail.json');
  const settingsFile = path.join(opts.dataDir, 'settings.json');

  if (!hatBereich(db, 'mail') && fs.existsSync(mailFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(mailFile, 'utf8').replace(/^﻿/, ''));
      writeMailConfig(db, raw);
      fs.renameSync(mailFile, `${mailFile}.vor-datenbank-${stamp}.bak`);
      console.log(`[Mail] ${mailFile} in die Datenbank übernommen (Datei als .bak umbenannt).`);
    } catch (err) {
      console.warn(`[Mail] ${mailFile} konnte nicht übernommen werden: ${(err as Error).message}`);
    }
  }

  if (!fs.existsSync(settingsFile)) return;
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch {
    return; // Defekte Datei behandelt die einmalige JSON-Übernahme.
  }
  const old = settings.mail as Record<string, unknown> | undefined;
  if (!old || typeof old !== 'object') return;

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const hasData = ['host', 'user', 'password', 'from', 'notifyTo'].some((k) => str(old[k]));
  const backup = `${settingsFile}.vor-mail-umzug-${stamp}.bak`;
  fs.copyFileSync(settingsFile, backup);

  if (hasData && !hatBereich(db, 'mail')) {
    const port = Number(old.port);
    writeMailConfig(db, {
      enabled: old.enabled === true,
      smtp: {
        host: str(old.host),
        port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 587,
        secure: old.secure === true,
        user: str(old.user),
        pass: typeof old.password === 'string' ? old.password : '',
      },
      from: str(old.from),
      recipients: str(old.notifyTo).split(/[,;\s]+/).filter(Boolean),
      appBaseUrl: str(old.appUrl).replace(/\/+$/, ''),
    });
    console.log(`[Mail] Mail-Einstellungen aus settings.json in die Datenbank übernommen (Sicherung: ${backup}).`);
  } else if (hasData) {
    console.log(`[Mail] Es gibt bereits Mail-Einstellungen in der Datenbank – alte Mail-Daten aus settings.json entfernt (Sicherung: ${backup}).`);
  }

  const { mail: _removed, ...rest } = settings;
  const tmp = `${settingsFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rest, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, settingsFile);
}

/** Altes Session-Geheimnis (<dataDir>/.session-secret) einmalig in die Datenbank übernehmen. */
export function importLegacySessionSecret(dataDir: string, setIfNew: (secret: string) => boolean) {
  const file = path.join(dataDir, '.session-secret');
  try {
    const secret = fs.readFileSync(file, 'utf8').trim();
    if (secret.length >= 32 && setIfNew(secret)) {
      fs.renameSync(file, `${file}.vor-datenbank-${zeitstempel()}.bak`);
      console.log('[Übernahme] Session-Geheimnis in die Datenbank übernommen (Datei als .bak umbenannt).');
    }
  } catch {
    /* nichts zu übernehmen */
  }
}
