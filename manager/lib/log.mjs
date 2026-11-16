// Protokolle: Zeilen mit Zeitstempel, Rotation (5 MB × 5 Dateien), letzte Zeilen lesen, Fehler erkennen.
import fs from 'node:fs';
import path from 'node:path';
import { resolvePaths } from './config.mjs';

export const LOGS = ['app', 'manager', 'backup', 'update', 'portal'];
const MAX_BYTES = 5 * 1024 * 1024;
const ERROR = /\b(error|fehler|exception|EADDRINUSE|EACCES|EPERM|failed|fehlgeschlagen|abgestürzt)\b/i;

export const logFile = (name) => path.join(resolvePaths().logDir, `${name}.log`);
export const isErrorLine = (line) => ERROR.test(line);

export function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Hängt Text an eine Logdatei an und rotiert sie bei Bedarf (log → log.1 → … → log.5). */
export function append(file, text) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
      for (let i = 4; i >= 1; i--) if (fs.existsSync(`${file}.${i}`)) fs.renameSync(`${file}.${i}`, `${file}.${i + 1}`);
      fs.renameSync(file, `${file}.1`);
    }
    fs.appendFileSync(file, text);
  } catch {
    /* Protokoll darf nie den Betrieb anhalten */
  }
}

/** logger('manager').info('…') – schreibt in <logDir>/manager.log (und auf die Konsole, außer in der CLI). */
export function logger(name) {
  const write = (level, msg) => {
    const line = `${timestamp()} ${level.padEnd(6)} ${msg}`;
    if (process.env.MOSAIK3LAB_QUIET !== '1') (level === 'FEHLER' ? console.error : console.log)(line);
    append(logFile(name), `${line}\n`);
  };
  return { info: (m) => write('INFO', m), warn: (m) => write('WARN', m), error: (m) => write('FEHLER', m) };
}

/** Letzte Zeilen einer Logdatei (Farbcodes entfernt). */
export function tail(name, count = 100) {
  let fd;
  try {
    fd = fs.openSync(logFile(name), 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, 256 * 1024);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).filter((l) => l.trim());
    if (len < size) lines.shift();
    return lines.slice(-count).map((text) => ({ text, error: isErrorLine(text) }));
  } catch {
    return [];
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
