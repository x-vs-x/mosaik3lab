import type { Storage } from '../../storage';
import { readMailConfig, type MailConfig } from './mailConfig';
import { sendMail, type BuiltMail } from './mailer';

/**
 * Benachrichtigung an die Bestell-Mail-Empfänger im Hintergrund (neue/geänderte Anfrage, neuer Vorschlag). Ein Mailfehler
 * verhindert nie den Vorgang, wird aber ins Log geschrieben und als „mailStatus“ in den Einstellungen angezeigt.
 */
export function benachrichtigeImHintergrund(storage: Storage, nummer: string, baueMail: (config: MailConfig) => BuiltMail | Promise<BuiltMail>) {
  void (async () => {
    const r = readMailConfig(storage.sqlite.db);
    if (r.state !== 'ok' || !r.config.enabled) return;
    let status: { ok: boolean; message: string };
    try {
      await sendMail(r.config, r.config.recipients, await baueMail(r.config));
      status = { ok: true, message: `Benachrichtigung zu ${nummer} versendet.` };
    } catch (err) {
      status = { ok: false, message: `Versand zu ${nummer} fehlgeschlagen: ${(err as Error).message}` };
      console.warn('[Mail]', status.message);
    }
    // nur diesen einen Wert schreiben (nicht alle Einstellungen und Stammdaten)
    storage.settings.setSetting('mailStatus', { at: new Date().toISOString(), ...status });
  })().catch((err) => console.warn('[Mail] Unerwarteter Fehler:', err));
}
