-- Alte Einzelrechte entfernen (Code-Hygiene D16): Seit Migration 011 gelten Rollen und Bereiche (benutzer_bereich),
-- benutzer_recht wird seitdem weder gelesen noch geschrieben. 011 läuft immer vorher (auch beim Einspielen sehr alter
-- Sicherungen) und übernimmt die Einzelrechte; danach ist die Tabelle überflüssig. Keine andere Tabelle verweist auf sie.
DROP TABLE IF EXISTS benutzer_recht;
