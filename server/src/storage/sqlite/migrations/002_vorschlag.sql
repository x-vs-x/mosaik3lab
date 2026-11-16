-- Schema 2: Vorschläge der Lehrkräfte („Etwas vorschlagen“, Welle 2). Fotos liegen in `datei`
-- (objekttyp 'vorschlag', rolle 'foto'), die Nummer VOR-JJJJ-NNNN kommt aus `nummernkreis`.

CREATE TABLE vorschlag (
  id                   TEXT PRIMARY KEY,
  nummer               TEXT NOT NULL UNIQUE,
  lehrkraft_id         TEXT REFERENCES lehrkraft (id) ON DELETE SET NULL,
  lehrkraft_email      TEXT NOT NULL DEFAULT '',          -- Schnappschuss, bleibt lesbar, auch wenn die Lehrkraft entfernt wird
  titel                TEXT NOT NULL,
  beschreibung         TEXT NOT NULL DEFAULT '',
  einsatz              TEXT NOT NULL DEFAULT '',          -- wofür / in welcher Situation
  links                TEXT NOT NULL DEFAULT '[]',        -- JSON-Liste (nur http/https)
  menge                INTEGER NOT NULL DEFAULT 1,
  dringlichkeit        TEXT NOT NULL DEFAULT 'normal' CHECK (dringlichkeit IN ('normal', 'bald', 'dringend')),
  status               TEXT NOT NULL DEFAULT 'neu' CHECK (status IN ('neu', 'in_pruefung', 'umgesetzt', 'abgelehnt')),
  antwort              TEXT NOT NULL DEFAULT '',          -- Antwort des Teams an die Lehrkraft
  umgesetzt_artikel_id TEXT REFERENCES artikel (id) ON DELETE SET NULL,
  bearbeitet_von       TEXT NOT NULL DEFAULT '',          -- Benutzer-ID der letzten Bearbeitung
  erstellt_am          TEXT NOT NULL,
  geaendert_am         TEXT NOT NULL
);
CREATE INDEX idx_vorschlag_lehrkraft ON vorschlag (lehrkraft_id);
CREATE INDEX idx_vorschlag_status ON vorschlag (status);
