const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });
const timeOnly = new Intl.DateTimeFormat('de-DE', { timeStyle: 'short' });
const relative = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });

export function formatDateTime(iso: string) {
  return dateTime.format(new Date(iso));
}

export function formatDate(iso: string) {
  return dateOnly.format(new Date(iso));
}

/** Nur die Uhrzeit, z. B. „14:05“. */
export function formatTime(iso: string) {
  return timeOnly.format(new Date(iso));
}

export function formatRelative(iso: string) {
  const diffSec = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diffSec);
  if (abs < 60) return 'gerade eben';
  if (abs < 3600) return relative.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return relative.format(Math.round(diffSec / 86400), 'day');
  return formatDate(iso);
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `ca. ${m} Min.`;
  if (m === 0) return `ca. ${h} Std.`;
  return `ca. ${h} Std. ${m} Min.`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** „1 Bild“, „3 Bilder“ */
export const plural = (n: number, eins: string, mehrere: string) => `${n} ${n === 1 ? eins : mehrere}`;
