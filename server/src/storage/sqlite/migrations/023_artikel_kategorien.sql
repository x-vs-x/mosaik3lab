-- Mehrere Kategorien je Druckteil. Die Zuordnung steht in artikel_kategorien (Reihenfolge = Auswahl, die erste ist die
-- Hauptkategorie). artikel.kategorie_id bleibt und enthält weiter die Hauptkategorie (Symbolbild, ältere Sicherungen und
-- Exporte bleiben lesbar); das Speichern eines Druckteils hält beide gleich.
-- Löschen eines Druckteils entfernt seine Zuordnungen (CASCADE). Eine verwendete Kategorie lässt sich nicht löschen
-- (Prüfung im Stammdaten-Service, zusätzlich Fremdschlüssel ohne CASCADE) – so behält jedes Druckteil mindestens eine.
CREATE TABLE artikel_kategorien (
  id            TEXT PRIMARY KEY,
  artikel_id    TEXT NOT NULL REFERENCES artikel (id) ON DELETE CASCADE,
  kategorie_id  TEXT NOT NULL REFERENCES kategorie (id),
  sortierung    INTEGER NOT NULL,
  UNIQUE (artikel_id, kategorie_id)
);
CREATE INDEX artikel_kategorien_kategorie ON artikel_kategorien (kategorie_id);

-- Bestand: jedes Druckteil behält seine bisherige (einzige) Kategorie.
INSERT INTO artikel_kategorien (id, artikel_id, kategorie_id, sortierung)
SELECT lower(hex(randomblob(16))), a.id, a.kategorie_id, 0
FROM artikel a JOIN kategorie k ON k.id = a.kategorie_id;
