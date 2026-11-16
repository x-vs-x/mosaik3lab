-- „Was ist neu“ für Administratoren (2026-11-15): zuletzt gelesene Version je Konto. Leer = noch nichts gelesen.
ALTER TABLE benutzer ADD COLUMN neuigkeiten_gesehen TEXT;
