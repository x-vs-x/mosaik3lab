// Minimaler tar-Schreiber/-Leser (ustar) ohne Abhängigkeiten – für die Sicherungsdatei (.m3lbackup).
// Nur normale Dateien; Namen bis 255 Byte (Name + Präfix), Größen > 8 GiB per Base-256. Keine Verknüpfungen, keine Sonderrechte.
import fs from 'node:fs';

const BLOCK = 512;

function octal(buf, offset, length, value) {
  buf.write(`${value.toString(8).padStart(length - 1, '0')}\0`, offset, 'latin1');
}

function header(name, size, mtime) {
  const nameBytes = Buffer.from(name, 'utf8');
  let prefix = Buffer.alloc(0);
  let base = nameBytes;
  if (nameBytes.length > 100) {
    // an einem „/“ so trennen, dass Name ≤ 100 und Präfix ≤ 155 Byte
    let cut = Math.min(155, nameBytes.length - 1);
    while (cut > 0 && !(nameBytes[cut] === 0x2f && nameBytes.length - cut - 1 <= 100)) cut--;
    if (cut < 1) throw new Error(`Name zu lang für die Sicherung: ${name}`);
    prefix = nameBytes.subarray(0, cut);
    base = nameBytes.subarray(cut + 1);
  }
  const h = Buffer.alloc(BLOCK);
  base.copy(h, 0);
  octal(h, 100, 8, 0o644);
  octal(h, 108, 8, 0);
  octal(h, 116, 8, 0);
  if (size < 8 ** 11) octal(h, 124, 12, size);
  else {
    h[124] = 0x80; // Base-256 für sehr große Dateien
    h.writeBigUInt64BE(BigInt(size), 128);
  }
  octal(h, 136, 12, Math.floor(mtime / 1000));
  h.fill(0x20, 148, 156); // Prüfsumme zunächst aus Leerzeichen
  h[156] = 0x30; // normale Datei
  h.write('ustar\0', 257, 'latin1');
  h.write('00', 263, 'latin1');
  prefix.copy(h, 345);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'latin1');
  return h;
}

/**
 * Asynchroner Strom von tar-Blöcken. entries: [{ name, size, file? , data? }] – Inhalt aus Datei (file) oder Puffer (data).
 * Die Größe muss stimmen (wird beim Lesen geprüft).
 */
export async function* packTar(entries) {
  for (const e of entries) {
    yield header(e.name, e.size, e.mtime ?? Date.now());
    let written = 0;
    if (e.data) {
      yield e.data;
      written = e.data.length;
    } else {
      for await (const chunk of fs.createReadStream(e.file, { highWaterMark: 1 << 20 })) {
        yield chunk;
        written += chunk.length;
      }
    }
    if (written !== e.size) throw new Error(`Datei hat sich während der Sicherung geändert: ${e.name}`);
    if (written % BLOCK) yield Buffer.alloc(BLOCK - (written % BLOCK));
  }
  yield Buffer.alloc(BLOCK * 2);
}

const readOctal = (buf, offset, length) => parseInt(buf.toString('latin1', offset, offset + length).replace(/\0.*$/, '').trim() || '0', 8);

/**
 * Liest einen tar-Strom. onEntry(name, size) → Senke { write(chunk), end() } oder null (Eintrag überspringen).
 * Namen mit „..“ oder absolutem Pfad werden abgelehnt.
 */
export async function unpackTar(source, onEntry) {
  let buf = Buffer.alloc(0);
  let sink = null;
  let remaining = 0;
  let pad = 0;
  let zero = 0;
  let done = false;
  for await (const chunk of source) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length && !done) {
      if (remaining > 0) {
        const n = Math.min(remaining, buf.length);
        if (sink) await sink.write(buf.subarray(0, n));
        remaining -= n;
        buf = buf.subarray(n);
        if (remaining === 0) {
          if (sink) await sink.end();
          sink = null;
        }
        continue;
      }
      if (pad > 0) {
        const n = Math.min(pad, buf.length);
        pad -= n;
        buf = buf.subarray(n);
        continue;
      }
      if (buf.length < BLOCK) break;
      const h = buf.subarray(0, BLOCK);
      buf = buf.subarray(BLOCK);
      if (h.every((b) => b === 0)) {
        if (++zero >= 2) done = true;
        continue;
      }
      zero = 0;
      let sum = 0;
      for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i];
      if (sum !== readOctal(h, 148, 8)) throw new Error('Sicherungsdatei beschädigt (Kopfprüfsumme).');
      const prefix = h.toString('utf8', 345, 500).replace(/\0.*$/, '');
      const base = h.toString('utf8', 0, 100).replace(/\0.*$/, '');
      const name = prefix ? `${prefix}/${base}` : base;
      const size = h[124] & 0x80 ? Number(h.readBigUInt64BE(128)) : readOctal(h, 124, 12);
      if (h[156] !== 0x30 && h[156] !== 0) throw new Error(`Unerwarteter Eintragstyp in der Sicherung: ${name}`);
      if (name.startsWith('/') || name.split('/').includes('..') || /^[A-Za-z]:/.test(name)) throw new Error(`Ungültiger Name in der Sicherung: ${name}`);
      sink = await onEntry(name, size);
      remaining = size;
      pad = size % BLOCK ? BLOCK - (size % BLOCK) : 0;
      if (size === 0 && sink) {
        await sink.end();
        sink = null;
      }
    }
  }
  if (remaining > 0 || !done) throw new Error('Sicherungsdatei ist abgeschnitten oder beschädigt.');
}
