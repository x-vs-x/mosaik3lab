-- Link-Knöpfe am Druckteil (JSON-Liste von { id, text, beschreibung, url }), z. B. Bestellliste oder Zubehör.
-- Bestehende Druckteile: keine Links.
ALTER TABLE artikel ADD COLUMN links TEXT NOT NULL DEFAULT '[]';
