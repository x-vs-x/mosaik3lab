-- Sitzungen kennen ihr Konto: beim Passwortwechsel oder Sperren lassen sich alle Sitzungen des Kontos beenden.
ALTER TABLE sitzung ADD COLUMN benutzer_id TEXT;
UPDATE sitzung SET benutzer_id = json_extract(daten, '$.userId');
CREATE INDEX sitzung_benutzer ON sitzung (benutzer_id);
