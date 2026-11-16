-- Farbrollen: Herkunft (Bambu-Lab-Katalog oder eigene), Bambu-Nummer und Originalname.
-- katalog_id = ID im mitgelieferten Katalog (server/src/domain/bambuKatalog.json), NULL = eigene Farbrolle.
-- Bisherige Bambu-Rollen (IDs „bambu-…“ aus dem Import) gehören zum Katalog; Nummer, Namen und Farbe trägt der
-- Abgleich beim Start nach (module/stammdaten/bambuAbgleich.ts). Druckteile verweisen weiter über filament.id.
ALTER TABLE filament ADD COLUMN katalog_id TEXT;
ALTER TABLE filament ADD COLUMN hersteller_nummer TEXT NOT NULL DEFAULT '';
ALTER TABLE filament ADD COLUMN hersteller_name TEXT NOT NULL DEFAULT '';
ALTER TABLE filament ADD COLUMN weggefallen INTEGER NOT NULL DEFAULT 0;
UPDATE filament SET katalog_id = id WHERE id LIKE 'bambu-%';
CREATE UNIQUE INDEX filament_katalog ON filament (katalog_id) WHERE katalog_id IS NOT NULL;
