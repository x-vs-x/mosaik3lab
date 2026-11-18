// Bildverarbeitung in reinem JavaScript (jpeg-js, pngjs – keine nativen Module, läuft gleich auf Windows, Linux und Pi).
// Läuft im Rechen-Thread (worker.ts), nie im Haupt-Thread. Nur dieses Modul kennt die Bibliotheken: Sollen sie später
// ersetzt werden (z. B. WebAssembly, WebP), ändert sich nur diese Datei.
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { istQuer, leseKopf, type BildKopf } from './format';
import { MAX_MEGAPIXEL, MAX_SPEICHER_MB, ORIGINAL_MAX_KANTE, ORIGINAL_ZU_GROSS_BYTES, QUALITAET_ORIGINAL, QUALITAET_VORSCHAU } from './groessen';

export type BildExt = 'jpg' | 'png';

/** Pixel als RGBA (4 Byte je Pixel), im gespeicherten (nicht gedrehten) Zustand. */
interface Rgba {
  breite: number;
  hoehe: number;
  daten: Uint8Array;
}

export class NichtUnterstuetzt extends Error {}

/** Dekodiert JPEG/PNG mit Grenzen gegen Speicherüberlauf. Unbekanntes, CMYK, 12 Bit, arithmetisch → NichtUnterstuetzt. */
export function dekodiere(daten: Uint8Array): { bild: Rgba; kopf: BildKopf; transparent: boolean } {
  const kopf = leseKopf(daten);
  if (!kopf) throw new NichtUnterstuetzt('Kein gültiges JPG- oder PNG-Bild.');
  if ((kopf.breite * kopf.hoehe) / 1e6 > MAX_MEGAPIXEL) throw new NichtUnterstuetzt(`Bild zu groß (${kopf.breite} × ${kopf.hoehe} px).`);
  if (kopf.format === 'jpg') {
    if (kopf.komponenten !== 1 && kopf.komponenten !== 3) throw new NichtUnterstuetzt('JPG mit CMYK-Farben wird nicht unterstützt.');
    if (kopf.bits !== 8) throw new NichtUnterstuetzt(`JPG mit ${kopf.bits} Bit wird nicht unterstützt.`);
    if (kopf.arithmetisch) throw new NichtUnterstuetzt('JPG mit arithmetischer Kodierung wird nicht unterstützt.');
    const r = jpeg.decode(daten, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: MAX_MEGAPIXEL, maxMemoryUsageInMB: MAX_SPEICHER_MB });
    return { bild: { breite: r.width, hoehe: r.height, daten: r.data }, kopf, transparent: false };
  }
  const png = PNG.sync.read(Buffer.from(daten.buffer, daten.byteOffset, daten.byteLength));
  const d = new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength);
  let transparent = false;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < 255) {
      transparent = true;
      break;
    }
  }
  return { bild: { breite: png.width, hoehe: png.height, daten: d }, kopf, transparent };
}

/** Gewichte für das Verkleinern einer Achse (Flächenmittel: jedes Zielpixel mittelt die überdeckten Quellpixel). */
function gewichte(quelle: number, ziel: number) {
  const s = quelle / ziel;
  const max = Math.ceil(s) + 1;
  const start = new Int32Array(ziel);
  const anzahl = new Int32Array(ziel);
  const w = new Float32Array(ziel * max);
  for (let i = 0; i < ziel; i++) {
    const a = i * s;
    const b = Math.min(quelle, (i + 1) * s);
    const j0 = Math.floor(a);
    start[i] = j0;
    let n = 0;
    for (let j = j0; j < b && n < max; j++, n++) w[i * max + n] = (Math.min(j + 1, b) - Math.max(j, a)) / s;
    anzahl[i] = n;
  }
  return { start, anzahl, w, max };
}

/**
 * Verkleinert (nie vergrößern) mit Flächenmittel, zeilenweise (Speicher: nur wenige Zeilen zusätzlich).
 * Farben werden mit Alpha gewichtet (keine dunklen Ränder); `aufWeiss` setzt Transparenz auf weißen Grund.
 */
export function skaliere(q: Rgba, breite: number, hoehe: number, aufWeiss: boolean): Rgba {
  breite = Math.max(1, Math.min(q.breite, breite));
  hoehe = Math.max(1, Math.min(q.hoehe, hoehe));
  const gx = gewichte(q.breite, breite);
  const gy = gewichte(q.hoehe, hoehe);
  const aus = new Uint8Array(breite * hoehe * 4);
  const zeile = new Float32Array(breite * 4);
  const summe = new Float32Array(breite * 4);
  let letzteY = -1;
  const src = q.daten;
  const rechneZeile = (y: number) => {
    if (y === letzteY) return;
    letzteY = y;
    const off = y * q.breite * 4;
    for (let x = 0; x < breite; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      const n = gx.anzahl[x];
      const s0 = gx.start[x];
      for (let k = 0; k < n; k++) {
        const p = off + (s0 + k) * 4;
        const wa = (gx.w[x * gx.max + k] * src[p + 3]) / 255;
        r += wa * src[p];
        g += wa * src[p + 1];
        b += wa * src[p + 2];
        a += wa;
      }
      const o = x * 4;
      zeile[o] = r;
      zeile[o + 1] = g;
      zeile[o + 2] = b;
      zeile[o + 3] = a;
    }
  };
  for (let y = 0; y < hoehe; y++) {
    summe.fill(0);
    const n = gy.anzahl[y];
    for (let k = 0; k < n; k++) {
      rechneZeile(gy.start[y] + k);
      const w = gy.w[y * gy.max + k];
      for (let i = 0; i < summe.length; i++) summe[i] += w * zeile[i];
    }
    const off = y * breite * 4;
    for (let x = 0; x < breite; x++) {
      const i = x * 4;
      const a = summe[i + 3];
      if (aufWeiss) {
        const weiss = (1 - a) * 255;
        aus[off + i] = summe[i] + weiss;
        aus[off + i + 1] = summe[i + 1] + weiss;
        aus[off + i + 2] = summe[i + 2] + weiss;
        aus[off + i + 3] = 255;
      } else {
        aus[off + i] = a > 0 ? summe[i] / a : 0;
        aus[off + i + 1] = a > 0 ? summe[i + 1] / a : 0;
        aus[off + i + 2] = a > 0 ? summe[i + 2] / a : 0;
        aus[off + i + 3] = a * 255;
      }
    }
  }
  return { breite, hoehe, daten: aus };
}

/** Dreht/spiegelt nach EXIF-Ausrichtung (1–8) – nach dem Verkleinern, also auf wenigen Pixeln. */
export function orientiere(q: Rgba, o: number): Rgba {
  if (o < 2 || o > 8) return q;
  const W = q.breite;
  const H = q.hoehe;
  const quer = istQuer(o);
  const breite = quer ? H : W;
  const hoehe = quer ? W : H;
  const aus = new Uint8Array(q.daten.length);
  const ein = q.daten.byteOffset % 4 ? q.daten.slice() : q.daten; // Uint32-Sicht braucht ausgerichteten Speicher
  const u32in = new Uint32Array(ein.buffer, ein.byteOffset, W * H);
  const u32aus = new Uint32Array(aus.buffer, 0, W * H);
  for (let y2 = 0; y2 < hoehe; y2++) {
    for (let x2 = 0; x2 < breite; x2++) {
      let x: number, y: number;
      switch (o) {
        case 2: x = W - 1 - x2; y = y2; break;
        case 3: x = W - 1 - x2; y = H - 1 - y2; break;
        case 4: x = x2; y = H - 1 - y2; break;
        case 5: x = y2; y = x2; break;
        case 6: x = y2; y = H - 1 - x2; break;
        case 7: x = W - 1 - y2; y = H - 1 - x2; break;
        default: x = W - 1 - y2; y = x2; break; // 8
      }
      u32aus[y2 * breite + x2] = u32in[y * W + x];
    }
  }
  return { breite, hoehe, daten: aus };
}

function kodiereJpeg(b: Rgba, qualitaet: number): Uint8Array {
  return new Uint8Array(jpeg.encode({ data: b.daten, width: b.breite, height: b.hoehe }, qualitaet).data);
}

function kodierePng(b: Rgba): Uint8Array {
  const png = new PNG({ width: b.breite, height: b.hoehe });
  png.data = Buffer.from(b.daten.buffer, b.daten.byteOffset, b.daten.byteLength);
  return new Uint8Array(PNG.sync.write(png));
}

/** Zielmaße im gedrehten Zustand → Maße im gespeicherten Zustand. */
function zielImSpeicher(breite: number, hoehe: number, orientierung: number) {
  return istQuer(orientierung) ? { breite: hoehe, hoehe: breite } : { breite, hoehe };
}

/** Kleine Schnittstelle: längste Kante höchstens `maxKante`, EXIF-Drehung übernommen; Transparenz → PNG, sonst JPEG. */
export function verkleinere(daten: Uint8Array, maxKante: number): { daten: Uint8Array; ext: BildExt } {
  const { bild, kopf, transparent } = dekodiere(daten);
  const f = Math.min(1, maxKante / Math.max(bild.breite, bild.hoehe));
  const klein = skaliere(bild, Math.round(bild.breite * f), Math.round(bild.hoehe * f), !transparent);
  const fertig = orientiere(klein, kopf.orientierung);
  return transparent ? { daten: kodierePng(fertig), ext: 'png' } : { daten: kodiereJpeg(fertig, QUALITAET_ORIGINAL), ext: 'jpg' };
}

export interface Auftrag {
  daten: Uint8Array;
  /** Prüfen, ob das Original zu groß ist, und ggf. eine kleinere Fassung liefern. */
  original: boolean;
  /** Gewünschte Vorschaubilder (immer JPEG, Transparenz auf Weiß). `breite` gilt im gedrehten Zustand. */
  vorschau: { name: string; breite: number }[];
}

export interface Ergebnis {
  /** Maße des Originals (gedreht, wie angezeigt). */
  breite: number;
  hoehe: number;
  /** Nur wenn das Original zu groß war: neue Fassung (ob sie genommen wird, entscheidet der Aufrufer, ≥ 20 % kleiner). */
  original?: { daten: Uint8Array; ext: BildExt };
  vorschau: { name: string; daten: Uint8Array }[];
}

/** Ein Bild einmal dekodieren und alle Fassungen daraus berechnen (Vorschau aus der jeweils nächstgrößeren Stufe). */
export function verarbeite(a: Auftrag): Ergebnis {
  const { bild, kopf, transparent } = dekodiere(a.daten);
  const o = kopf.orientierung;
  const quer = istQuer(o);
  const ow = quer ? bild.hoehe : bild.breite;
  const oh = quer ? bild.breite : bild.hoehe;
  const ergebnis: Ergebnis = { breite: ow, hoehe: oh, vorschau: [] };

  let basis = bild;
  const zuGross = Math.max(ow, oh) > ORIGINAL_MAX_KANTE;
  // Deutlich zu große Datei bei passenden Maßen: neu als JPEG speichern lohnt nur ohne Transparenz.
  const zuSchwer = !zuGross && a.daten.length > ORIGINAL_ZU_GROSS_BYTES && !transparent;
  if (a.original && (zuGross || zuSchwer)) {
    const f = Math.min(1, ORIGINAL_MAX_KANTE / Math.max(ow, oh));
    basis = f < 1 ? skaliere(bild, Math.round(bild.breite * f), Math.round(bild.hoehe * f), !transparent) : bild;
    const fertig = orientiere(basis, o);
    ergebnis.original = transparent ? { daten: kodierePng(fertig), ext: 'png' } : { daten: kodiereJpeg(fertig, QUALITAET_ORIGINAL), ext: 'jpg' };
  }

  let stufe = basis;
  let aufWeissFertig = false;
  for (const v of [...a.vorschau].sort((x, y) => y.breite - x.breite)) {
    // Breite B, Höhe höchstens 2·B (sehr hohe Bilder werden schmaler), nie vergrößern
    const f = Math.min(1, v.breite / ow, (2 * v.breite) / oh);
    const ziel = zielImSpeicher(Math.max(1, Math.round(ow * f)), Math.max(1, Math.round(oh * f)), o);
    if (ziel.breite < stufe.breite || ziel.hoehe < stufe.hoehe || !aufWeissFertig) {
      stufe = skaliere(stufe, ziel.breite, ziel.hoehe, true);
      aufWeissFertig = true;
    }
    ergebnis.vorschau.push({ name: v.name, daten: kodiereJpeg(orientiere(stufe, o), QUALITAET_VORSCHAU) });
  }
  return ergebnis;
}
