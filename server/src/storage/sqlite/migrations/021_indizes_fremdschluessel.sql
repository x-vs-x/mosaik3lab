-- Indizes auf Fremdschlüsseln der Kindtabellen und für „neueste Anfragen“ (Code-Hygiene D17).
-- Ohne Index prüft SQLite beim Löschen einer Farbrolle, Kategorie, eines Materials oder Einsatzbereichs jede Kindtabelle
-- mit einem vollständigen Durchlauf; die Verwendungs-Zählung der Stammdaten nutzt dieselben Spalten.
-- Rein ergänzend wie 008: keine Datenänderung, bestehende Zeilen bleiben unverändert.
CREATE INDEX IF NOT EXISTS artikel_farbbereich_filament_filament ON artikel_farbbereich_filament (filament_id);
CREATE INDEX IF NOT EXISTS artikel_einsatzbereich_einsatzbereich ON artikel_einsatzbereich (einsatzbereich_id);
CREATE INDEX IF NOT EXISTS artikel_kategorie ON artikel (kategorie_id);
CREATE INDEX IF NOT EXISTS artikel_material ON artikel (material_id);
CREATE INDEX IF NOT EXISTS anfrage_erstellt ON anfrage (erstellt_am, id);
