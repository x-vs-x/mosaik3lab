-- Personen entfernen (Verwaltung → Personen): Konto und Lehrkraft-Eintrag bleiben als „entfernt“ markiert stehen, damit
-- Anfragen, Vorschläge und Verlauf ihren Bezug behalten. Die E-Mail wird dabei durch einen Platzhalter ersetzt
-- („entfernt-<id>“, keine gültige Adresse) – so kann dieselbe Adresse später neu vergeben werden.
ALTER TABLE benutzer ADD COLUMN entfernt_am TEXT;
ALTER TABLE lehrkraft ADD COLUMN entfernt_am TEXT;
