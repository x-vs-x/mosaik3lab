// Dateien herunterladen, ohne dass das App-Fenster wegnavigiert.
// Hintergrund: Auf iPad/iPhone (vor allem als Web-App vom Home-Bildschirm, ohne Browser-Leiste) öffnet ein Link auf eine
// Datei eine Vorschau, aus der man nicht mehr in die App zurückkommt. Darum: per fetch laden → auf iOS das Teilen-Menü
// („In Dateien sichern“), sonst über eine Blob-Adresse mit <a download> speichern.

export type Weg = 'teilen' | 'herunterladen';

/** iPhone/iPad – auch iPadOS, das sich als „Macintosh“ ausgibt, aber Touch hat. */
export function istIOS(userAgent: string, maxTouchPoints: number) {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/**
 * Teilen-Menü nur auf iOS (dort gibt es kein brauchbares Herunterladen); Desktop und Android laden normal herunter,
 * auch wenn ihr Browser Dateien teilen könnte.
 */
export function waehleWeg(geraet: { userAgent: string; maxTouchPoints: number; kannDateiTeilen: boolean }): Weg {
  return geraet.kannDateiTeilen && istIOS(geraet.userAgent, geraet.maxTouchPoints) ? 'teilen' : 'herunterladen';
}

/** Dateiname aus `Content-Disposition` (filename* nach RFC 5987 bevorzugt), sonst der Ersatzname. */
export function dateinameAus(header: string | null, ersatz: string): string {
  if (!header) return ersatz;
  const stern = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (stern) {
    try {
      return decodeURIComponent(stern[1].trim().replace(/^"|"$/g, '')) || ersatz;
    } catch {
      /* kaputt kodiert → normaler Name */
    }
  }
  const einfach = /filename\s*=\s*("([^"]*)"|[^;]+)/.exec(header);
  const name = (einfach?.[2] ?? einfach?.[1] ?? '').trim();
  return name || ersatz;
}

/** Verständliche Meldung je HTTP-Status (wenn der Server keine eigene schickt). */
export function fehlertext(status: number, serverText?: string): string {
  if (serverText) return serverText;
  if (status === 0) return 'Der Server ist nicht erreichbar. Bitte prüfen Sie die Verbindung und versuchen Sie es erneut.';
  if (status === 401) return 'Sie sind nicht mehr angemeldet. Bitte melden Sie sich neu an.';
  if (status === 403) return 'Dafür fehlt Ihnen die Berechtigung.';
  if (status === 404) return 'Die Datei gibt es nicht mehr.';
  if (status === 413) return 'Die Datei ist zu groß. Bitte weniger auf einmal herunterladen.';
  if (status >= 500) return 'Der Server konnte die Datei gerade nicht liefern. Bitte gleich noch einmal versuchen.';
  return `Herunterladen fehlgeschlagen (Fehler ${status}).`;
}

export class DownloadFehler extends Error {}

/** Datei per fetch holen (gleiche Anmeldung wie die übrigen API-Aufrufe). `pfad` ist schon mit Basis-Pfad (withBase). */
export async function holeDatei(pfad: string, ersatzname: string): Promise<File> {
  let res: Response;
  let blob: Blob;
  try {
    res = await fetch(pfad, { credentials: 'same-origin', headers: { 'X-Requested-With': 'mosaik3lab' } });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let serverText: string | undefined;
      try {
        serverText = (JSON.parse(text) as { error?: string }).error;
      } catch {
        /* keine JSON-Antwort */
      }
      throw new DownloadFehler(fehlertext(res.status, serverText));
    }
    blob = await res.blob();
  } catch (err) {
    if (err instanceof DownloadFehler) throw err;
    // Abbruch mitten im Laden (offline, Speicher voll …)
    throw new DownloadFehler(fehlertext(0));
  }
  const name = dateinameAus(res.headers.get('Content-Disposition'), ersatzname);
  return new File([blob], name, { type: blob.type || 'application/octet-stream' });
}

/** Wie wird auf diesem Gerät gespeichert? */
export function wegFuer(file: File): Weg {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  let kannDateiTeilen = false;
  try {
    kannDateiTeilen = !!nav?.canShare?.({ files: [file] }) && typeof nav?.share === 'function';
  } catch {
    kannDateiTeilen = false;
  }
  return waehleWeg({ userAgent: nav?.userAgent ?? '', maxTouchPoints: nav?.maxTouchPoints ?? 0, kannDateiTeilen });
}

/** Über eine Blob-Adresse speichern – das Fenster bleibt, wo es ist. */
export function speichereLokal(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Etwas warten, bis der Browser die Datei übernommen hat.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * iOS-Teilen-Menü öffnen. Ergebnis: 'fertig' (auch bei Abbruch durch die Person) oder 'braucht-tippen', wenn Safari
 * das Teilen nach dem Laden nicht mehr erlaubt (die Berechtigung durch das Tippen ist dann abgelaufen).
 */
export async function teile(file: File, titel: string): Promise<'fertig' | 'braucht-tippen'> {
  try {
    await navigator.share({ files: [file], title: titel });
    return 'fertig';
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'AbortError') return 'fertig';
    if (name === 'NotAllowedError') return 'braucht-tippen';
    // Teilen geht gar nicht → normal speichern als letzter Versuch
    speichereLokal(file);
    return 'fertig';
  }
}
