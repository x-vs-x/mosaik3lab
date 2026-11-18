-- Ähnliche Druckteile im Export/Import (nur hinzufügend, bestehende Daten bleiben unverändert):
-- 1) Herkunfts-ID: ID, die ein eingespieltes Druckteil in der Quelle hatte (leer = hier angelegt oder ID unverändert).
--    Damit findet ein späterer Import Verknüpfungen auch dann, wenn das Druckteil hier eine neue ID bekommen hat.
ALTER TABLE artikel ADD COLUMN herkunft_id TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_artikel_herkunft ON artikel (herkunft_id) WHERE herkunft_id <> '';

-- 2) Vorgemerkte Verknüpfungen: Das Druckteil ist da, sein ähnliches Druckteil (Partner) noch nicht. Sobald ein Import
--    den Partner bringt (gleiche ID oder Herkunfts-ID), wird daraus eine Zeile in artikel_aehnlich und die Vormerkung
--    entfällt. Name und Nummer des Partners nur als Hilfe. Wird das Druckteil gelöscht, verschwindet die Vormerkung mit.
CREATE TABLE artikel_aehnlich_offen (
  artikel_id       TEXT NOT NULL REFERENCES artikel (id) ON DELETE CASCADE,
  partner_herkunft TEXT NOT NULL,
  partner_name     TEXT NOT NULL DEFAULT '',
  partner_nummer   TEXT NOT NULL DEFAULT '',
  vorgemerkt_am    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (artikel_id, partner_herkunft)
);
CREATE INDEX idx_artikel_aehnlich_offen_partner ON artikel_aehnlich_offen (partner_herkunft);
