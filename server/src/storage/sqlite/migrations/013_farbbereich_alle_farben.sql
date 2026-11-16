-- „Alle Farben“ je Farbbereich: dann gelten alle Farbrollen, auch später angelegte (statt einer festen Liste).
-- Bereiche, die heute alle vorhandenen Farbrollen enthalten, werden umgestellt; ihre Einzelverweise entfallen.
ALTER TABLE artikel_farbbereich ADD COLUMN alle_farben INTEGER NOT NULL DEFAULT 0;
UPDATE artikel_farbbereich SET alle_farben = 1
 WHERE (SELECT COUNT(*) FROM filament) > 0
   AND (SELECT COUNT(*) FROM artikel_farbbereich_filament ff WHERE ff.farbbereich_id = artikel_farbbereich.id
          AND ff.filament_id IN (SELECT id FROM filament)) = (SELECT COUNT(*) FROM filament);
DELETE FROM artikel_farbbereich_filament WHERE farbbereich_id IN (SELECT id FROM artikel_farbbereich WHERE alle_farben = 1);
