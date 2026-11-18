-- Ähnliche Druckteile: gegenseitige Verknüpfung A ↔ B, als Paar ohne Richtung gespeichert (a < b, also nur eine Zeile).
-- Wird ein Druckteil gelöscht, verschwinden seine Verknüpfungen mit. Nicht Teil von Export/Import.
CREATE TABLE artikel_aehnlich (
  a TEXT NOT NULL REFERENCES artikel (id) ON DELETE CASCADE,
  b TEXT NOT NULL REFERENCES artikel (id) ON DELETE CASCADE,
  PRIMARY KEY (a, b),
  CHECK (a < b)
);
CREATE INDEX idx_artikel_aehnlich_b ON artikel_aehnlich (b);
