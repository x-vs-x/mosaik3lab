-- Mosaik³LAB – Grundschema (Vertrag: docs/DATENMODELL.md)
-- Jede Tabelle hat eine eigene technische ID (Spalte id, UUID v7; aus der JSON-Zeit übernommene IDs bleiben).
-- Zeitpunkte als ISO-Text (UTC), Wahrheitswerte als 0/1. Einfache Wertelisten (z. B. Größen) als JSON-Text.

-- Technik ---------------------------------------------------------------------------------------------
CREATE TABLE nummernkreis (
  id             TEXT PRIMARY KEY,
  objekttyp      TEXT NOT NULL,
  jahr           INTEGER NOT NULL DEFAULT 0,      -- 0 = Zähler ohne Jahr (z. B. ART)
  letzte_nummer  INTEGER NOT NULL,
  UNIQUE (objekttyp, jahr)
);

CREATE TABLE einstellung (
  id            TEXT PRIMARY KEY,
  schluessel    TEXT NOT NULL UNIQUE,
  wert          TEXT NOT NULL,                    -- JSON
  geaendert_am  TEXT NOT NULL
);

CREATE TABLE sitzung (
  id         TEXT PRIMARY KEY,                    -- Session-ID von express-session
  daten      TEXT NOT NULL,                       -- JSON
  laeuft_ab  INTEGER NOT NULL                     -- Millisekunden seit 1970
);
CREATE INDEX sitzung_laeuft_ab ON sitzung (laeuft_ab);

-- Konten und Lehrkräfte -------------------------------------------------------------------------------
CREATE TABLE benutzer (
  id                TEXT PRIMARY KEY,
  benutzername      TEXT NOT NULL UNIQUE,
  email             TEXT UNIQUE,                  -- klein geschrieben; NULL nur bei Altkonten bis zur Ergänzung
  anzeigename       TEXT NOT NULL,
  rolle             TEXT NOT NULL CHECK (rolle IN ('admin', 'druckteam', 'lehrkraft')),
  passwort_hash     TEXT NOT NULL,
  aktiv             INTEGER NOT NULL DEFAULT 1,
  ist_demo          INTEGER NOT NULL DEFAULT 0,
  erstellt_am       TEXT NOT NULL,
  geaendert_am      TEXT NOT NULL,
  letzte_anmeldung  TEXT
);

CREATE TABLE benutzer_recht (
  id           TEXT PRIMARY KEY,
  benutzer_id  TEXT NOT NULL REFERENCES benutzer (id) ON DELETE CASCADE,
  recht        TEXT NOT NULL,
  erlaubt      INTEGER NOT NULL,
  UNIQUE (benutzer_id, recht)
);

CREATE TABLE lehrkraft (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,
  angelegt_am        TEXT NOT NULL,
  letzte_anfrage_am  TEXT NOT NULL DEFAULT ''
);

-- Stammdaten ------------------------------------------------------------------------------------------
CREATE TABLE kategorie (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  farbe       TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  sortierung  INTEGER NOT NULL
);

CREATE TABLE einsatzbereich (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sortierung  INTEGER NOT NULL
);

CREATE TABLE material (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sortierung  INTEGER NOT NULL
);

CREATE TABLE filament (
  id          TEXT PRIMARY KEY,
  marke       TEXT NOT NULL,
  linie       TEXT NOT NULL,
  farbname    TEXT NOT NULL,
  hex         TEXT NOT NULL,
  verfuegbar  INTEGER NOT NULL DEFAULT 1,
  sortierung  INTEGER NOT NULL
);

-- Inhalte (Name, Phase, Farbe, Reihenfolge) stehen im Code (domain/orderStatuses.ts), hier nur der Schalter.
CREATE TABLE statusart (
  id          TEXT PRIMARY KEY,                   -- fester Schlüssel, z. B. „offen“
  aktiv       INTEGER NOT NULL,
  sortierung  INTEGER NOT NULL
);

-- Artikel (Hilfsmittel / Druckteile) ------------------------------------------------------------------
CREATE TABLE artikel (
  id                   TEXT PRIMARY KEY,
  nummer               TEXT NOT NULL UNIQUE,      -- ART-0042
  name                 TEXT NOT NULL,
  kurzbeschreibung     TEXT NOT NULL DEFAULT '',
  beschreibung         TEXT NOT NULL DEFAULT '',
  kategorie_id         TEXT REFERENCES kategorie (id),
  material_id          TEXT REFERENCES material (id),
  material_info        TEXT NOT NULL DEFAULT '',
  preis                TEXT NOT NULL DEFAULT '',
  druckzeit_minuten    INTEGER NOT NULL DEFAULT 0,
  groessen             TEXT NOT NULL DEFAULT '[]', -- JSON-Liste von Texten
  sicherheitshinweise  TEXT NOT NULL DEFAULT '[]', -- JSON-Liste von Texten
  veroeffentlicht      INTEGER NOT NULL DEFAULT 0,
  ist_demo             INTEGER NOT NULL DEFAULT 0,
  erstellt_am          TEXT NOT NULL,
  geaendert_am         TEXT NOT NULL
);

CREATE TABLE artikel_einsatzbereich (
  id                 TEXT PRIMARY KEY,
  artikel_id         TEXT NOT NULL REFERENCES artikel (id) ON DELETE CASCADE,
  einsatzbereich_id  TEXT NOT NULL REFERENCES einsatzbereich (id),
  sortierung         INTEGER NOT NULL,
  UNIQUE (artikel_id, einsatzbereich_id)
);

CREATE TABLE artikel_farbbereich (
  id          TEXT PRIMARY KEY,
  artikel_id  TEXT NOT NULL REFERENCES artikel (id) ON DELETE CASCADE,
  schluessel  TEXT NOT NULL,                      -- ID des Bereichs aus Sicht der API (z. B. „farbe“), je Artikel eindeutig
  name        TEXT NOT NULL,
  sortierung  INTEGER NOT NULL,
  UNIQUE (artikel_id, schluessel)
);

CREATE TABLE artikel_farbbereich_filament (
  id              TEXT PRIMARY KEY,
  farbbereich_id  TEXT NOT NULL REFERENCES artikel_farbbereich (id) ON DELETE CASCADE,
  filament_id     TEXT NOT NULL REFERENCES filament (id),
  sortierung      INTEGER NOT NULL,
  UNIQUE (farbbereich_id, filament_id)
);

CREATE TABLE artikel_feld (
  id           TEXT PRIMARY KEY,
  artikel_id   TEXT NOT NULL REFERENCES artikel (id) ON DELETE CASCADE,
  schluessel   TEXT NOT NULL,                     -- ID des Felds aus Sicht der API
  bezeichnung  TEXT NOT NULL,
  typ          TEXT NOT NULL CHECK (typ IN ('text', 'number', 'select')),
  pflicht      INTEGER NOT NULL DEFAULT 0,
  max_laenge   INTEGER NOT NULL,
  hinweis      TEXT NOT NULL DEFAULT '',
  optionen     TEXT NOT NULL DEFAULT '[]',        -- JSON-Liste (nur Typ select)
  sortierung   INTEGER NOT NULL,
  UNIQUE (artikel_id, schluessel)
);

-- Dateien: jede Datei ein Datensatz, angehängt über Objekttyp + Objekt-ID + Rolle (domain/objekttypen.ts).
-- pfad ist relativ zum Ablageordner: <objekttyp>/<objekt-id>/<rolle>/<datei-id>.<endung>
CREATE TABLE datei (
  id            TEXT PRIMARY KEY,
  objekttyp     TEXT NOT NULL CHECK (objekttyp IN ('artikel', 'anfrage', 'vorschlag', 'benutzer', 'lehrkraft')),
  objekt_id     TEXT NOT NULL,
  rolle         TEXT NOT NULL CHECK (rolle IN ('bild', 'video', 'druckdatei', 'foto', 'anhang')),
  originalname  TEXT NOT NULL DEFAULT '',
  mime          TEXT NOT NULL,
  groesse       INTEGER NOT NULL,
  sha256        TEXT NOT NULL,
  pfad          TEXT NOT NULL UNIQUE,
  sortierung    INTEGER NOT NULL DEFAULT 0,
  erstellt_am   TEXT NOT NULL,
  erstellt_von  TEXT NOT NULL DEFAULT ''          -- Benutzer-ID (leer = System/Übernahme)
);
CREATE INDEX datei_objekt ON datei (objekttyp, objekt_id, rolle, sortierung);

-- Videos eines Artikels: hochgeladene Datei (datei_id) oder externer Link (url).
CREATE TABLE artikel_video (
  id           TEXT PRIMARY KEY,
  artikel_id   TEXT NOT NULL REFERENCES artikel (id) ON DELETE CASCADE,
  titel        TEXT NOT NULL,
  url          TEXT NOT NULL DEFAULT '',
  datei_id     TEXT REFERENCES datei (id) ON DELETE CASCADE,
  sortierung   INTEGER NOT NULL,
  erstellt_am  TEXT NOT NULL
);

-- Anfragen (Bestellungen) -----------------------------------------------------------------------------
CREATE TABLE anfrage (
  id              TEXT PRIMARY KEY,
  nummer          TEXT NOT NULL UNIQUE,           -- ANF-2026-0007 bzw. ältere M3L-2026-0001
  lehrkraft_id    TEXT REFERENCES lehrkraft (id) ON DELETE SET NULL,
  artikel_id      TEXT REFERENCES artikel (id) ON DELETE SET NULL,
  artikel_name    TEXT NOT NULL,                  -- Schnappschuss
  menge           INTEGER NOT NULL,
  farbe           TEXT NOT NULL DEFAULT '',       -- Schnappschuss (Text des ersten bzw. einzigen Bereichs)
  farbe_id        TEXT NOT NULL DEFAULT '',
  farbe_hex       TEXT NOT NULL DEFAULT '',
  groesse         TEXT NOT NULL DEFAULT '',
  klasse          TEXT NOT NULL DEFAULT '',
  bemerkung       TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL REFERENCES statusart (id),
  besteller_email TEXT NOT NULL DEFAULT '',
  besteller_name  TEXT NOT NULL DEFAULT '',
  abruf_code      TEXT NOT NULL DEFAULT '',
  ist_demo        INTEGER NOT NULL DEFAULT 0,
  erstellt_am     TEXT NOT NULL,
  geaendert_am    TEXT NOT NULL
);
CREATE INDEX anfrage_lehrkraft ON anfrage (lehrkraft_id);
CREATE INDEX anfrage_artikel ON anfrage (artikel_id);

CREATE TABLE anfrage_farbe (
  id                 TEXT PRIMARY KEY,
  anfrage_id         TEXT NOT NULL REFERENCES anfrage (id) ON DELETE CASCADE,
  bereich_schluessel TEXT NOT NULL,
  bereich            TEXT NOT NULL,
  filament_id        TEXT NOT NULL,               -- Schnappschuss, bewusst ohne Fremdschlüssel
  farbe              TEXT NOT NULL,
  hex                TEXT NOT NULL DEFAULT '',
  sortierung         INTEGER NOT NULL
);

CREATE TABLE anfrage_feldwert (
  id              TEXT PRIMARY KEY,
  anfrage_id      TEXT NOT NULL REFERENCES anfrage (id) ON DELETE CASCADE,
  feld_schluessel TEXT NOT NULL,
  bezeichnung     TEXT NOT NULL,
  wert            TEXT NOT NULL,
  sortierung      INTEGER NOT NULL
);

CREATE TABLE anfrage_statusverlauf (
  id              TEXT PRIMARY KEY,
  anfrage_id      TEXT NOT NULL REFERENCES anfrage (id) ON DELETE CASCADE,
  status          TEXT NOT NULL REFERENCES statusart (id),
  zeitpunkt       TEXT NOT NULL,
  von_benutzer_id TEXT NOT NULL DEFAULT '',       -- Schnappschuss (Konto kann gelöscht werden)
  von_name        TEXT NOT NULL DEFAULT '',
  kommentar       TEXT NOT NULL DEFAULT '',
  sortierung      INTEGER NOT NULL
);
CREATE INDEX anfrage_statusverlauf_anfrage ON anfrage_statusverlauf (anfrage_id, sortierung);
