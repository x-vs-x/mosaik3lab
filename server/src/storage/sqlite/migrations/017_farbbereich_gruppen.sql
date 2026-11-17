-- Ganze Gruppen je Farbbereich (JSON-Liste): „linie:<Marke Linie>“ oder „art:<Materialart>“, z. B. alle PLA-Farben.
-- Später angelegte Farbrollen der Gruppe gelten automatisch mit. Bestehende Bereiche: keine Gruppen.
ALTER TABLE artikel_farbbereich ADD COLUMN gruppen TEXT NOT NULL DEFAULT '[]';
