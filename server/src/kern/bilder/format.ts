// Kopfdaten von JPEG und PNG lesen, ohne das Bild zu dekodieren: Maße, EXIF-Drehung, Farbkanäle.
// Schnell (nur die ersten Bytes) – damit prüft die Bildpflege, ob ein Original zu groß ist, und lehnt Riesenbilder ab,
// bevor Speicher belegt wird. Ungültige Daten → null.

export type BildFormat = 'jpg' | 'png';

export interface BildKopf {
  format: BildFormat;
  breite: number;
  hoehe: number;
  /** EXIF-Ausrichtung 1–8 (1 = unverändert). PNG: immer 1. */
  orientierung: number;
  /** JPEG: Anzahl Farbkomponenten (1 Grau, 3 Farbe, 4 CMYK); PNG: 0. */
  komponenten: number;
  /** JPEG: Bits je Kanal (8 üblich, 12 selten); PNG: Bittiefe. */
  bits: number;
  /** JPEG: arithmetische Kodierung (wird nicht unterstützt). */
  arithmetisch: boolean;
}

const PNG_SIGNATUR = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function erkenneFormat(b: Uint8Array): BildFormat | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 24 && Buffer.from(b.buffer, b.byteOffset, 8).equals(PNG_SIGNATUR)) return 'png';
  return null;
}

/** Ausrichtung 5–8: Bild ist um 90° gedreht gespeichert (Breite und Höhe tauschen). */
export const istQuer = (orientierung: number) => orientierung >= 5 && orientierung <= 8;

export function leseKopf(b: Uint8Array): BildKopf | null {
  const format = erkenneFormat(b);
  if (format === 'png') return pngKopf(b);
  if (format === 'jpg') return jpegKopf(b);
  return null;
}

function pngKopf(b: Uint8Array): BildKopf | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null;
  const breite = v.getUint32(16);
  const hoehe = v.getUint32(20);
  if (!breite || !hoehe) return null;
  return { format: 'png', breite, hoehe, orientierung: 1, komponenten: 0, bits: b[24], arithmetisch: false };
}

function jpegKopf(b: Uint8Array): BildKopf | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let orientierung = 1;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++; // Füllbyte
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // Bildende/Bilddaten vor dem Kopf
    const laenge = v.getUint16(i + 2);
    if (laenge < 2 || i + 2 + laenge > b.length) return null;
    const start = i + 4;
    if (marker === 0xe1 && orientierung === 1) orientierung = exifOrientierung(b, start, laenge - 2);
    // SOF0–SOF15 außer DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (laenge < 8) return null;
      const bits = b[start];
      const hoehe = v.getUint16(start + 1);
      const breite = v.getUint16(start + 3);
      const komponenten = b[start + 5];
      if (!breite || !hoehe) return null;
      return { format: 'jpg', breite, hoehe, orientierung, komponenten, bits, arithmetisch: marker >= 0xc9 };
    }
    i += 2 + laenge;
  }
  return null;
}

/** Tag 0x0112 (Orientation) aus IFD0 eines APP1-„Exif“-Blocks; bei allem Unerwarteten 1. */
function exifOrientierung(b: Uint8Array, start: number, laenge: number): number {
  const ende = start + laenge;
  if (laenge < 14 || String.fromCharCode(b[start], b[start + 1], b[start + 2], b[start + 3]) !== 'Exif') return 1;
  const tiff = start + 6;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const le = b[tiff] === 0x49 && b[tiff + 1] === 0x49; // „II“ = little endian, „MM“ = big endian
  if (!le && !(b[tiff] === 0x4d && b[tiff + 1] === 0x4d)) return 1;
  const u16 = (p: number) => (p + 2 <= ende ? v.getUint16(p, le) : -1);
  const u32 = (p: number) => (p + 4 <= ende ? v.getUint32(p, le) : -1);
  if (u16(tiff + 2) !== 42) return 1;
  const ifd = u32(tiff + 4);
  if (ifd < 8) return 1;
  const anzahl = u16(tiff + ifd);
  for (let k = 0; k < anzahl && k < 500; k++) {
    const e = tiff + ifd + 2 + k * 12;
    if (e + 12 > ende) return 1;
    if (u16(e) === 0x0112) {
      const wert = u16(e + 8);
      return wert >= 1 && wert <= 8 ? wert : 1;
    }
  }
  return 1;
}
