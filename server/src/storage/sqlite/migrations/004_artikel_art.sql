-- Art des Druckteils: Hilfsmittel, Lehrmittel oder beides (Filter im Katalog).
-- Bestehende Druckteile gelten zunächst als Hilfsmittel; das Druck-Team kann die Art je Druckteil ändern.
ALTER TABLE artikel ADD COLUMN art TEXT NOT NULL DEFAULT 'hilfsmittel' CHECK (art IN ('hilfsmittel', 'lehrmittel', 'beides'));
