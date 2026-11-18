// Kleine Hilfen, die mehrere Module brauchen – ohne Importe aus dem Manager (keine Kreis-Importe).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

/** Läuft der Prozess? EPERM = läuft, gehört aber einem anderen Konto. */
export function lebt(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/** SHA-256 einer Datei (hex), gestreamt. */
export async function sha256Datei(file) {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), h);
  return h.digest('hex');
}

/** Version aus <dir>/package.json oder null. */
export function paketVersion(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

/** Ordner anlegen und Schreibprobe. → null (in Ordnung) oder der Fehler (mit code). */
export function schreibprobe(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.schreibtest-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe);
    return null;
  } catch (err) {
    return err;
  }
}
