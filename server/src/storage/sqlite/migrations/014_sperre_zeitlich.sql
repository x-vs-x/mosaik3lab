-- Sperre nach zu vielen falschen Passwörtern endet nach einer Stunde von selbst (2026-11-02).
-- Leer = nicht gesperrt; Sperren aus der Zeit davor gelten damit als abgelaufen.
ALTER TABLE benutzer ADD COLUMN gesperrt_seit TEXT;
