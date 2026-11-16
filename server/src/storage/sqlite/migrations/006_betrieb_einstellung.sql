-- Betriebs-, Mail- und Manager-Einstellungen in der Datenbank (eine Quelle der Wahrheit, Backup = vollständig).
-- bereich: 'betrieb' (Ports, Netzfreigabe, Pfade, Backup-Zeitplan, Update-Quelle, Session-Geheimnis),
--          'mail' (SMTP, Empfänger), 'manager' (Manager-Port, Passwort-Hash).
-- Die fachlichen App-Einstellungen (Domains, Schalter) bleiben in Tabelle einstellung (= Bereich „app“).
-- wert ist JSON; geheim = 1 markiert Geheimnisse (nie in Anzeigen/Logs ausgeben).
-- Der Server-Manager legt dieselbe Tabelle bei Bedarf selbst an (CREATE TABLE IF NOT EXISTS), bevor die App je lief.
CREATE TABLE IF NOT EXISTS betrieb_einstellung (
  bereich       TEXT NOT NULL CHECK (bereich IN ('betrieb', 'mail', 'manager')),
  schluessel    TEXT NOT NULL,
  wert          TEXT NOT NULL,
  geheim        INTEGER NOT NULL DEFAULT 0,
  geaendert_am  TEXT NOT NULL,
  PRIMARY KEY (bereich, schluessel)
);
