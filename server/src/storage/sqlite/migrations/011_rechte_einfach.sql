-- Rechte einfacher (2026-11-02): drei Rollen, wenige Häkchen („Bereiche“), Passwort per Link.
-- Nur ergänzend: Die alte Tabelle benutzer_recht bleibt stehen (wird nicht mehr gelesen).

-- Lehrkraft-Häkchen; bestehende Lehrkräfte dürfen weiter alles wie bisher.
ALTER TABLE lehrkraft ADD COLUMN darf_anfragen INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lehrkraft ADD COLUMN darf_vorschlagen INTEGER NOT NULL DEFAULT 1;

-- Falsche Passwort-Eingaben in Folge (ab 10 gesperrt, bis ein neues Passwort gesetzt ist).
ALTER TABLE benutzer ADD COLUMN fehlversuche INTEGER NOT NULL DEFAULT 0;

-- Druck-Team-Häkchen je Konto.
CREATE TABLE benutzer_bereich (
  benutzer_id  TEXT NOT NULL REFERENCES benutzer (id) ON DELETE CASCADE,
  bereich      TEXT NOT NULL,
  PRIMARY KEY (benutzer_id, bereich)
);

-- Bisherige Einzelrechte → Bereiche: Ein Bereich ist an, wenn sein Kernrecht bisher nicht abgeschaltet war.
-- So verliert niemand etwas; wer z. B. „Katalog sehen“ ohne „bearbeiten“ hatte, darf jetzt auch bearbeiten.
INSERT INTO benutzer_bereich (benutzer_id, bereich)
SELECT b.id, x.bereich
FROM benutzer b
JOIN (
  SELECT 'team-anfragen' AS bereich, 'orders:view' AS kern
  UNION ALL SELECT 'team-druckteile', 'catalog:view'
  UNION ALL SELECT 'team-vorschlaege', 'vorschlaege:sehen'
  UNION ALL SELECT 'team-farbrollen', 'filaments:manage'
) x
WHERE b.rolle = 'druckteam'
  AND NOT EXISTS (SELECT 1 FROM benutzer_recht r WHERE r.benutzer_id = b.id AND r.recht = x.kern AND r.erlaubt = 0);

INSERT INTO benutzer_bereich (benutzer_id, bereich)
SELECT r.benutzer_id, 'stammdaten'
FROM benutzer_recht r JOIN benutzer b ON b.id = r.benutzer_id
WHERE b.rolle = 'druckteam' AND r.recht = 'masterdata:manage' AND r.erlaubt = 1;

-- Gesperrte Konten melden sich künftig wie Lehrkräfte ohne Passwort an. Anfragen konnten sie schon bisher
-- (ohne Anmeldung) stellen, Vorschläge nicht – deshalb nur „vorschlagen“ aus.
INSERT INTO lehrkraft (id, email, angelegt_am, letzte_anfrage_am, darf_anfragen, darf_vorschlagen)
SELECT lower(hex(randomblob(16))), b.email, b.erstellt_am, '', 1, 0
FROM benutzer b
WHERE b.aktiv = 0 AND b.rolle <> 'lehrkraft' AND b.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM lehrkraft l WHERE l.email = b.email);
UPDATE lehrkraft SET darf_vorschlagen = 0
WHERE email IN (SELECT email FROM benutzer WHERE aktiv = 0 AND rolle <> 'lehrkraft' AND email IS NOT NULL);

-- Einmal-Links zum Festlegen bzw. Zurücksetzen des Passworts. Gespeichert wird nur der SHA-256 des Tokens.
-- gueltig_bis leer = läuft nicht ab („Passwort festlegen“ nach dem Vergeben von Rechten).
CREATE TABLE passwort_link (
  token_hash   TEXT PRIMARY KEY,
  benutzer_id  TEXT NOT NULL REFERENCES benutzer (id) ON DELETE CASCADE,
  zweck        TEXT NOT NULL CHECK (zweck IN ('einrichten', 'zuruecksetzen')),
  erstellt_am  TEXT NOT NULL,
  gueltig_bis  TEXT
);
CREATE INDEX passwort_link_benutzer ON passwort_link (benutzer_id);
