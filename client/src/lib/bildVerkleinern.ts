// Bilder vor dem Hochladen im Browser verkleinern (Canvas, keine Zusatzbibliothek – läuft auf Handy, Tablet und PC).
// Längste Kante höchstens 2000 px, ohne Transparenz als JPEG (Qualität 0,85), mit Transparenz als PNG.
// Grundsatz: Im Zweifel das Original nehmen (Fehler, GIF, schon klein, Ergebnis nicht kleiner).

export const MAX_KANTE = 2000;
export const JPEG_QUALITAET = 0.85;
/** Bis zu dieser Größe gilt ein Bild als „schon klein“ und wird nicht angefasst. */
export const KLEIN_BYTES = 300 * 1024;

const VERARBEITBAR = ['image/jpeg', 'image/png', 'image/webp'];

/** Verkleinern lohnt nur bei JPG/PNG/WebP über der Kleingrenze (GIF und Unbekanntes bleiben unverändert). */
export const sollVerkleinern = (typ: string, bytes: number) => VERARBEITBAR.includes(typ.toLowerCase()) && bytes > KLEIN_BYTES;

/** Zielmaße: längste Kante höchstens `max`, Seitenverhältnis bleibt, nie vergrößern. */
export function zielMasse(breite: number, hoehe: number, max = MAX_KANTE) {
  const f = Math.min(1, max / Math.max(breite, hoehe));
  return { breite: Math.max(1, Math.round(breite * f)), hoehe: Math.max(1, Math.round(hoehe * f)) };
}

/** Ausgabeformat: Transparenz → PNG (sonst würde sie schwarz/weiß), alles andere → JPEG. */
export const ausgabeTyp = (hatTransparenz: boolean) => (hatTransparenz ? 'image/png' : 'image/jpeg');

/** Ergebnis nur nehmen, wenn es um mindestens `mindestErsparnis` (Anteil) kleiner ist. */
export const ergebnisNehmen = (alt: number, neu: number, mindestErsparnis = 0) => neu > 0 && neu < alt * (1 - mindestErsparnis);

/** Dateiname mit passender Endung (foto.png → foto.jpg). */
export function neuerName(name: string, typ: string) {
  const endung = typ === 'image/png' ? '.png' : '.jpg';
  const basis = name.replace(/\.[^./\\]*$/, '') || 'bild';
  return basis + endung;
}

/** Gibt es halbtransparente Pixel? (Alpha-Kanal, jedes 4. Byte) */
export function hatTransparenz(rgba: Uint8ClampedArray) {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
  return false;
}

function alsBlob(canvas: HTMLCanvasElement, typ: string) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, typ, typ === 'image/jpeg' ? JPEG_QUALITAET : undefined));
}

/**
 * Verkleinert ein Bild. Liefert immer eine Datei: die verkleinerte oder – wenn nicht sinnvoll oder fehlgeschlagen –
 * das Original. `mindestErsparnis` z. B. 0,2 = nur ersetzen, wenn mindestens 20 % kleiner.
 */
export async function bildVerkleinern(datei: File, mindestErsparnis = 0): Promise<File> {
  if (!sollVerkleinern(datei.type, datei.size) || typeof createImageBitmap !== 'function') return datei;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(datei, { imageOrientation: 'from-image' }); // EXIF-Drehung übernehmen
    const { breite, hoehe } = zielMasse(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = breite;
    canvas.height = hoehe;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return datei;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, breite, hoehe);
    const transparent = datei.type !== 'image/jpeg' && hatTransparenz(ctx.getImageData(0, 0, breite, hoehe).data);
    const typ = ausgabeTyp(transparent);
    if (typ === 'image/jpeg') {
      // Sicherheitshalber weißer Hintergrund unter dem Bild (falls doch ein Rest Transparenz durchkäme)
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, breite, hoehe);
    }
    const blob = await alsBlob(canvas, typ);
    canvas.width = canvas.height = 0; // Speicher auf dem Handy gleich freigeben
    if (!blob || blob.type !== typ || !ergebnisNehmen(datei.size, blob.size, mindestErsparnis)) return datei;
    return new File([blob], neuerName(datei.name, typ), { type: typ, lastModified: datei.lastModified });
  } catch {
    return datei; // z. B. zu großes Bild für den Speicher des Geräts → Original hochladen
  } finally {
    bitmap?.close();
  }
}

/** Mehrere Dateien nacheinander verkleinern (nacheinander schont den Speicher auf dem Handy). */
export async function bilderVerkleinern(dateien: File[]): Promise<File[]> {
  const fertig: File[] = [];
  for (const d of dateien) fertig.push(await bildVerkleinern(d));
  return fertig;
}
