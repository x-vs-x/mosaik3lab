-- Mehrere Farben in einer Anfrage (z. B. 3 × Blau, 4 × Gelb): Aufteilung als JSON-Liste
-- [{ "quantity": 3, "colorChoices": [{ areaId, area, colorId, color, colorHex }] }, …].
-- Leer bei nur einer Farbe und bei allen bisherigen Anfragen – dann gelten farbe/anfrage_farbe wie bisher.
ALTER TABLE anfrage ADD COLUMN farbvarianten TEXT NOT NULL DEFAULT '[]';
