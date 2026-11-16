-- Anfragende sehen nur noch die Farbe, nicht das Filament dahinter. Bisher stand im Schnappschuss
-- „Farbname · Marke Linie“; ab jetzt nur der Farbname. Die Verwaltung zeigt die Rolle über filament_id/farbe_id.
UPDATE anfrage_farbe SET farbe = substr(farbe, 1, instr(farbe, ' · ') - 1) WHERE instr(farbe, ' · ') > 0;

-- Mehrfarbige Anfragen: Gesamttext („Bereich: Farbe; …“) aus den bereinigten Bereichen neu bilden.
UPDATE anfrage
SET farbe = (SELECT group_concat(f.bereich || ': ' || f.farbe, '; ' ORDER BY f.sortierung) FROM anfrage_farbe f WHERE f.anfrage_id = anfrage.id)
WHERE (SELECT count(*) FROM anfrage_farbe f WHERE f.anfrage_id = anfrage.id) > 1;

UPDATE anfrage SET farbe = substr(farbe, 1, instr(farbe, ' · ') - 1) WHERE instr(farbe, ' · ') > 0;
