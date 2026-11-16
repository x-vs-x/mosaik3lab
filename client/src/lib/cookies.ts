import { withBase } from './basePath';

/**
 * Darf diese Seite Cookies speichern? Die Anmeldung braucht ein Sitzungs-Cookie. Blockiert der Browser Cookies für
 * diese Adresse (z. B. Edge: Seite auf der Liste „Blockieren“), wäre man nach dem Anmelden sofort wieder abgemeldet.
 * Test: ein harmloses Cookie schreiben und wieder lesen.
 */
export function cookiesWork(): boolean {
  try {
    if (!navigator.cookieEnabled) return false;
    const path = withBase('/');
    document.cookie = `m3l.test=1; path=${path}; SameSite=Strict`;
    const ok = document.cookie.split(';').some((c) => c.trim() === 'm3l.test=1');
    document.cookie = `m3l.test=; path=${path}; Max-Age=0; SameSite=Strict`;
    return ok;
  } catch {
    return false;
  }
}
