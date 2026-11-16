-- Indizes für gezielte Abfragen (Umbau Schritt 3, W3): Kindzeilen je Anfrage/Druckteil, Statusabfrage per Code,
-- Filter nach Status. Rein ergänzend, keine Datenänderung.
CREATE INDEX IF NOT EXISTS anfrage_farbe_anfrage ON anfrage_farbe (anfrage_id, sortierung);
CREATE INDEX IF NOT EXISTS anfrage_feldwert_anfrage ON anfrage_feldwert (anfrage_id, sortierung);
CREATE INDEX IF NOT EXISTS anfrage_abruf_code ON anfrage (abruf_code);
CREATE INDEX IF NOT EXISTS anfrage_status ON anfrage (status);
CREATE INDEX IF NOT EXISTS artikel_video_artikel ON artikel_video (artikel_id, sortierung);
