-- Erneut anfragen: Verweis auf die ursprüngliche Anfrage (nur Verweis, kein Fremdschlüssel –
-- die neue Anfrage bleibt lesbar, auch wenn die alte gelöscht wird).
ALTER TABLE anfrage ADD COLUMN wiederholt_von TEXT;
