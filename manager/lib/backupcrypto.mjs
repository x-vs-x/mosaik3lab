// Verschlüsselung der Sicherungsdatei: AES-256-GCM (node:crypto), Schlüssel aus dem Backup-Passwort per scrypt.
// Die ganze Sicherung ist ein Strom: [IV 12 Byte][Chiffretext][Auth-Tag 16 Byte]. Salt und eine Passwortprobe stehen im
// unverschlüsselten Kopf der Datei – so wird ein falsches Passwort sofort und sauber abgelehnt, ohne Daten anzufassen.
// Das Passwort liegt nie in der Datenbank und nie im Backup, sondern in <Wurzel>/backup.key (nur für Administratoren
// und das Dienstkonto lesbar); es wird beim Einrichten erzeugt und einmalig angezeigt.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { InputError, resolvePaths, updateConfig, requireValidConfig } from './config.mjs';
import { runShell } from '../platform/common.mjs';
import { logger } from './log.mjs';

const ALGO = 'aes-256-gcm';
const PROBE = 'mosaik3lab-backup-passwort-ok';
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

const deriveKey = (password, salt) => crypto.scryptSync(password, salt, 32, SCRYPT);

/** Zufälliges, gut abschreibbares Passwort (ohne verwechselbare Zeichen), z. B. K7QX-9M2D-… */
export function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(20);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return chars.join('').match(/.{1,4}/g).join('-');
}

export const keyFileExists = () => fs.existsSync(resolvePaths().keyFile);

export function readBackupPassword() {
  try {
    return fs.readFileSync(resolvePaths().keyFile, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

/** Passwort speichern (Datei nur für Administratoren, SYSTEM, Dienstkonto und Besitzer lesbar). */
export function saveBackupPassword(password, keyFile = resolvePaths().keyFile) {
  if (typeof password !== 'string' || password.length < 8) throw new InputError('Das Backup-Passwort braucht mindestens 8 Zeichen.');
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, `${password}\n`, { mode: 0o600 });
  if (process.platform === 'win32') {
    // S-1-5-32-544 Administratoren, S-1-5-18 SYSTEM, S-1-5-19 Lokaler Dienst (liest), S-1-3-4 Besitzer der Datei
    runShell(`icacls "${keyFile}" /inheritance:r /grant:r *S-1-5-32-544:F *S-1-5-18:F *S-1-5-19:R *S-1-3-4:F`, { timeout: 15_000 }).then((r) => {
      if (r.code !== 0) logger('manager').warn(`Rechte für backup.key konnten nicht eingeschränkt werden (${r.code}).`);
    });
  }
}

/** Neue Verschlüsselung: { key, header } – header kommt in backup.json. */
export function newEncryption(password) {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([c.update(PROBE, 'utf8'), c.final()]);
  return { key, header: { algo: ALGO, kdf: 'scrypt', salt: salt.toString('hex'), probe: { iv: iv.toString('hex'), ct: ct.toString('hex'), tag: c.getAuthTag().toString('hex') } } };
}

/** Schlüssel aus Passwort und Header; falsches Passwort → InputError (vor jeder Änderung). */
export function openEncryption(password, header) {
  if (!password) throw new InputError('Diese Sicherung ist verschlüsselt – bitte das Backup-Passwort angeben.', 'Das Passwort steht in der Datei backup.key der Installation bzw. wurde bei der Einrichtung angezeigt.');
  const key = deriveKey(password, Buffer.from(header.salt, 'hex'));
  try {
    const d = crypto.createDecipheriv(ALGO, key, Buffer.from(header.probe.iv, 'hex'));
    d.setAuthTag(Buffer.from(header.probe.tag, 'hex'));
    const text = Buffer.concat([d.update(Buffer.from(header.probe.ct, 'hex')), d.final()]).toString('utf8');
    if (text !== PROBE) throw new Error('falsch');
  } catch {
    throw new InputError('Falsches Backup-Passwort – die Sicherung wurde nicht angerührt.');
  }
  return key;
}

/** Strom verschlüsseln: [IV 12][Chiffretext][Auth-Tag 16] – die ganze Sicherung als ein Strom. */
export async function* encryptStream(key, source) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv(ALGO, key, iv);
  yield iv;
  for await (const chunk of source) yield c.update(chunk);
  yield c.final();
  yield c.getAuthTag();
}

/** Strom entschlüsseln (Datei ab Byte start); der Auth-Tag wird am Ende geprüft – manipulierte Dateien werfen einen Fehler. */
export async function* decryptStream(key, file, start = 0) {
  const size = (await fsp.stat(file)).size - start;
  if (size < 28) throw new Error('Verschlüsselte Sicherung zu kurz.');
  const fd = await fsp.open(file, 'r');
  const iv = Buffer.alloc(12);
  const tag = Buffer.alloc(16);
  try {
    await fd.read(iv, 0, 12, start);
    await fd.read(tag, 0, 16, start + size - 16);
  } finally {
    await fd.close();
  }
  const d = crypto.createDecipheriv(ALGO, key, iv);
  d.setAuthTag(tag);
  if (size > 28) for await (const chunk of fs.createReadStream(file, { start: start + 12, end: start + size - 17, highWaterMark: 1 << 20 })) yield d.update(chunk);
  try {
    yield d.final();
  } catch {
    throw new Error('Entschlüsselung fehlgeschlagen – die Sicherung ist beschädigt oder verändert worden.');
  }
}

/**
 * Backup-Passwort einrichten: { password } setzen, { generate: true } erzeugen (wird nur hier zurückgegeben – notieren!),
 * { disable: true } Verschlüsselung ausschalten (Sicherungen enthalten dann Passwörter im Klartext). Schaltet `backup.encrypt` mit.
 */
export function configureBackupPassword({ password, generate = false, disable = false } = {}) {
  requireValidConfig();
  if (disable) {
    updateConfig({ backup: { encrypt: false } });
    return { encrypt: false };
  }
  const pw = generate ? generatePassword() : password;
  saveBackupPassword(pw);
  updateConfig({ backup: { encrypt: true } });
  return { encrypt: true, password: generate ? pw : undefined };
}
