// Hinweis „Link nur im Schulnetz“ in den Mails. Die Regeln liegen EINMAL in manager/lib/erreichbarkeit.mjs
// (der Server-Manager nutzt sie für Anzeige und Warnung; esbuild bündelt die Datei in server/dist).
import { ERREICHBARKEIT, erkenneErreichbarkeit, pruefeLinks, type Erreichbarkeit } from '../../../../manager/lib/erreichbarkeit.mjs';

export { ERREICHBARKEIT, erkenneErreichbarkeit, pruefeLinks, type Erreichbarkeit };

/** Was eine Mail-Vorlage für Links braucht (Teil der Mail-Einstellungen). */
export interface MailLinks {
  appBaseUrl: string;
  erreichbarkeit?: Erreichbarkeit;
}

/** Hinweis „nur im Schulnetz“ unter dem Knopf zeigen? (Entscheidungstabelle siehe pruefeLinks) */
export const linksNurImSchulnetz = (c: MailLinks) => pruefeLinks(c).hinweis;
