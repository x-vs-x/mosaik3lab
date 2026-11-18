import crypto from 'node:crypto';

// Technische IDs (siehe docs/DATENMODELL.md): UUID v7 – zeitlich sortierbar, nie wiederverwendet.
// Bestehende IDs (UUID v4 aus der JSON-Zeit, feste Schlüssel wie „offen“) bleiben unverändert gültig.

let lastMs = 0;
let seq = 0;

/** Erzeugt eine UUID v7 (RFC 9562): 48 Bit Millisekunden, danach Zufall. Innerhalb einer Millisekunde aufsteigend. */
export function uuidv7(now = Date.now()): string {
  const bytes = crypto.randomBytes(16);
  if (now <= lastMs) {
    now = lastMs;
    seq = (seq + 1) & 0xfff;
    if (seq === 0) now = ++lastMs; // 4096 IDs in einer Millisekunde: auf die nächste ausweichen
  } else {
    lastMs = now;
    seq = bytes.readUInt16BE(6) & 0x7ff; // zufälliger Start, Platz zum Hochzählen
  }
  bytes.writeUIntBE(now, 0, 6);
  bytes[6] = 0x70 | (seq >> 8);
  bytes[7] = seq & 0xff;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Neue technische ID für einen Datensatz. */
export const newId = () => uuidv7();

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
