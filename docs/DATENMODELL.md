# Datenmodell (Vertrag, festgelegt im Hauptchat am 2026-10-31)

Ziel: feste, klar benannte Tabellen; **jeder Datensatz in jeder Tabelle hat eine eigene ID**; Dateien sind eigene
Datensätze, die über Objekttyp + Objekt-ID an Vorgänge gehängt werden; Ablagepfade sind vorhersagbar.

## Plug & Play (Vorgabe des Nutzers)
Die Datenbank kommt bei der Installation automatisch mit – **kein eigener Datenbankserver, keine Einrichtung**:
- SQLite steckt bereits in Node; der Server-Manager prüft nur die Node-Version.
- Beim ersten Start legt die App Datei, Tabellen und Ablageordner selbst an; bei jedem Start werden ausstehende
  Migrationen automatisch eingespielt (vorher automatische Sicherung). Bei Updates genauso.
- Der Server-Manager zeigt nur Status an (Datenbank vorhanden, Schema-Version, Größe, letzte Sicherung) und sichert
  die Datenbank im Backup konsistent (SQLite-Online-Backup bzw. `VACUUM INTO`, nicht einfach Datei kopieren).

## Datenbank
- **SQLite** über das in Node eingebaute Modul `node:sqlite` – eine Datei, keine nativen npm-Module
  (läuft auf Windows, Linux, Raspberry Pi). Mindestversion Node 24 LTS.
- Datei: `<daten>/mosaik3lab.db` (installiert: `C:\Mosaik3LAB\daten\mosaik3lab.db`).
- Fremdschlüssel an (`PRAGMA foreign_keys = ON`), WAL-Modus, Schema-Versionen über Tabelle `schema_version` und
  nummerierte Migrationen in `server/src/storage/sqlite/migrations/NNN_name.sql`.
- Die Routen kennen weiter nur die Repository-Schnittstellen (`server/src/storage/repositories.ts`).
- Einmalige Migration der bisherigen JSON-Dateien beim ersten Start (vorher Backup, JSON bleibt als Sicherung liegen).

## IDs
- **Technische ID** in jeder Tabelle: Spalte `id`, UUID v7 (zeitlich sortierbar), nie wiederverwendet.
- **Lesbare Nummer** dort, wo Menschen darüber sprechen, eigene Spalte `nummer`, eindeutig, je Typ eigener Zähler
  (Tabelle `nummernkreis`):

| Objekttyp | Präfix | Beispiel |
| --- | --- | --- |
| `anfrage` | `ANF` | `ANF-2026-0007` (bestehende `M3L-…`-Nummern bleiben gültig) |
| `artikel` | `ART` | `ART-0042` |
| `vorschlag` | `VOR` | `VOR-2026-0003` |
| `datei` | – | nur technische ID |

## Objekttypen (fest im Code, `server/src/domain/objekttypen.ts`)
`artikel`, `anfrage`, `vorschlag`, `benutzer`, `lehrkraft`. Neue Typen nur dort ergänzen.

## Tabellen (Kern)
| Tabelle | Inhalt |
| --- | --- |
| `benutzer` | Admin/Druck-Team-Konten (E-Mail, Rolle, Passwort-Hash – leer = noch nicht festgelegt, aktiv – 0 = ruht/nur Lehrkraft, `fehlversuche`) |
| `benutzer_bereich` | angehakte Druck-Team-Bereiche je Konto (benutzer_id, bereich) – seit Migration 011 |
| `benutzer_recht` | alte Einzelrechte (bis Migration 011, wird nicht mehr gelesen) |
| `passwort_link` | Einmal-Links „Passwort festlegen/zurücksetzen“ (SHA-256 des Tokens, benutzer_id, zweck, gueltig_bis – leer = läuft nicht ab) |
| `lehrkraft` | bekannte Lehrkräfte (E-Mail, angelegt_am, Häkchen `darf_anfragen`, `darf_vorschlagen`) |
| `kategorie`, `einsatzbereich`, `material` | Stammdaten |
| `filament` | Farbrolle (Marke, Linie, Farbname, Hex, verfügbar). Seit 012: `katalog_id` (ID im mitgelieferten Bambu-Lab-Katalog, NULL = eigene Rolle), `hersteller_nummer` (Bambu-Nr. bzw. freiwillige eigene Nummer), `hersteller_name` (Originalname, englisch), `weggefallen` (nicht mehr im Bambu-Katalog). Abgleich beim Start: `module/stammdaten/bambuAbgleich.ts`; Hinweis für den Admin und bekannte Katalog-IDs in `einstellung` (`bambuAbgleichHinweis`, `bambuKatalogBekannt`) |
| `statusart` | feste Bestellstatus (Schlüssel, aktiv) – Inhalte aus dem Code, nur `aktiv` änderbar |
| `artikel` | Druckteil (nummer, Name, Beschreibung, Preis-Text, veröffentlicht …; seit 018 `links`: JSON-Liste der Link-Knöpfe `{ id, text, beschreibung, url }`, nur http/https, höchstens 50, bestehende Druckteile `[]`) |
| `artikel_farbbereich` | Farbbereiche je Artikel (Name, Sortierung, seit 013 `alle_farben`: 1 = alle Farbrollen, auch später angelegte – dann keine Einzelverweise; seit 017 `gruppen`: JSON-Liste ganzer Linien/Materialarten wie `art:PLA`, auch später angelegte Rollen) + `artikel_farbbereich_filament` (erlaubte Farben bei „Nur bestimmte Farben“) |
| `artikel_feld` | Personalisierungsfelder je Artikel (Bezeichnung, Typ, Pflicht, max. Länge) |
| `anfrage` | Bestellung (nummer, lehrkraft_id, artikel_id, Klasse, Menge, Bemerkung, status) |
| `anfrage_farbe` | gewählte Farbe je Farbbereich |
| `anfrage_feldwert` | Werte der Personalisierungsfelder |
| `anfrage_statusverlauf` | jede Statusänderung (wer, wann, von → nach) |
| `vorschlag` | Vorschlag einer Lehrkraft (Welle 2) |
| `datei` | **jede Datei** (siehe unten) |
| `nummernkreis`, `schema_version`, `sitzung`, `einstellung` | Technik |

## Dateien
Tabelle `datei`: `id`, `objekttyp`, `objekt_id`, `rolle`, `originalname`, `mime`, `groesse`, `sha256`,
`pfad` (**relativ** zum Ablage-Wurzelordner), `sortierung`, `erstellt_am`, `erstellt_von`.

Rollen (fest): `bild`, `video`, `druckdatei`, `foto` (Vorschlag), `anhang`.

Ablagepfad, immer gleich aufgebaut:
```
<ablage>/<objekttyp>/<objekt-id>/<rolle>/<datei-id>.<endung>
z. B. C:\Mosaik3LAB\ablage\artikel\0193…\bild\0193…a1.jpg
```
- In der Datenbank steht nur der relative Pfad → der Ablageordner kann verschoben werden.
- Löschen eines Datensatzes löscht seine Dateien mit (in einer Transaktion: erst DB, dann Datei; Waisen-Prüfung
  im Server-Manager-`doctor`).
- Auslieferung nur über die API mit Rechteprüfung, nie direkter Ordnerzugriff.

## Umsetzung (Schema 1, `migrations/001_grundschema.sql`) – begründete Abweichungen und Ergänzungen
- **Bestehende IDs bleiben.** Datensätze aus der JSON-Zeit behalten ihre ID (UUID v4, feste Schlüssel wie
  Status `offen`, Filament-IDs aus der Bambu-Palette), damit Links, Sitzungen und Verweise gültig bleiben. Neue
  Datensätze erhalten UUID v7. Bilder/Videos behalten ihren öffentlichen Namen (`<datei-id>.<endung>` = alter
  Dateiname), Druckdateien ihre bisherige ID (Download-Link bleibt gleich).
- **Datenbankdatei** liegt im Datenordner, den der Server-Manager als `STORAGE_DIR` übergibt:
  `<STORAGE_DIR>/mosaik3lab.db`. Ablage: `ABLAGE_DIR`, Standard `<STORAGE_DIR>/ablage`.
- **Zusätzliche Tabelle `artikel_video`** (Titel, Link *oder* `datei_id`, Sortierung): Videos können auch externe
  Links sein und haben einen Titel – das passt nicht in `datei`.
- **Kindzeilen mit `schluessel`:** `artikel_farbbereich.schluessel` und `artikel_feld.schluessel` sind die IDs aus
  Sicht der API (z. B. Farbbereich `farbe`), nur je Artikel eindeutig; die technische `id` ist davon getrennt.
  `artikel_einsatzbereich` verbindet Artikel und Einsatzbereich.
- **Einfache Wertelisten als JSON-Text:** `artikel.groessen`, `artikel.sicherheitshinweise`, `artikel.links`, `artikel_feld.optionen`
  (reine Textlisten ohne eigene Bedeutung).
- **Schnappschüsse ohne Fremdschlüssel:** `anfrage_farbe.filament_id`, `anfrage_statusverlauf.von_benutzer_id`
  (die Anfrage soll lesbar bleiben, auch wenn Farbe oder Konto gelöscht werden). `anfrage.artikel_id` und
  `anfrage.lehrkraft_id` sind Fremdschlüssel mit `ON DELETE SET NULL` (Name/E-Mail bleiben als Schnappschuss).
- **`statusart.id`** ist der feste Schlüssel aus dem Code (`offen`, `gedruckt` …); nur `aktiv` wird gespeichert.
- **Einstellungen** (`orderForm`, `features`, `mailStatus`, `statusAliases`, Ergebnis der JSON-Übernahme
  `json_uebernahme`) liegen als JSON-Wert je Schlüssel in `einstellung`.
- **Schema 2 (`002_vorschlag.sql`):** Tabelle `vorschlag` (Titel, Beschreibung, Einsatz, Links als JSON, Menge, Dringlichkeit,
  Status, Antwort, `umgesetzt_artikel_id` → `artikel` ON DELETE SET NULL, `lehrkraft_id` ON DELETE SET NULL mit E-Mail-Schnappschuss). Fotos: `datei` (`vorschlag`/`foto`).
- **Ablageordner** stellt nur der Server-Manager ein (`ABLAGE_DIR`, nur bei gestoppter App, optional mit Kopieren der
  Dateien); früher in der App eingestellte Ordner (`mosaik3lab.config.json`) dienen nur noch als Quelle der Übernahme.
  Waisen-Prüfung (Datei ↔ Datensatz) im Manager-`doctor`.

## Migration 003 – Erneut anfragen
`anfrage.wiederholt_von` (TEXT, NULL erlaubt, bewusst ohne Fremdschlüssel): ID der Ursprungsanfrage, wenn eine Lehrkraft „Erneut anfragen“ nutzt. Die neue Anfrage ist ein eigener Datensatz mit neuer ID und Nummer.

## Migration 010 – Mehrere Farben in einer Anfrage
`anfrage.farbvarianten` (TEXT, JSON, Standard `'[]'`): Aufteilung der Stückzahl auf Farben, z. B. 3 × Blau + 4 × Gelb –
`[{ quantity, colorChoices: [{ areaId, area, colorId, color, colorHex }] }]`. Leer bei nur einer Farbe und bei allen älteren
Anfragen. Bei mehreren Varianten gilt: `menge` = Summe, `anfrage_farbe`/`farbe_id`/`farbe_hex` = erste Variante,
`farbe` = kurze Aufteilung („3 × Blau, 4 × Gelb“) für Listen, Suche und ältere Anzeigen.

## Migration 006 – Betriebs-, Mail- und Manager-Einstellungen (`betrieb_einstellung`)
Eine Quelle der Wahrheit: Alle Einstellungen, auch die des Servers, stehen in der Datenbank – ein Backup der Datenbank
(+ Ablage) rekonstruiert den Zustand vollständig (Ports, Pfade, Mail, Passwörter). Die fachlichen App-Einstellungen
(Bestellformular, Domains, Status-Schalter …) bleiben in `einstellung` (**Bereich „app“**).

| Spalte | Bedeutung |
| --- | --- |
| `bereich` | `betrieb` · `mail` · `manager` (CHECK) – zusammen mit `schluessel` der Primärschlüssel |
| `schluessel` | z. B. `app.port`, `app.network`, `paths.ablageDir`, `backup.time`, `backup.keep`, `backup.encrypt`, `update.repo`, `update.gitPath`, `sessionSecret`; Bereich `mail`: `enabled`, `smtp`, `from`, `recipients`, `appBaseUrl`; Bereich `manager`: `manager.port` (Anmeldung am Manager = Admin-Konto der App; frühere `manager.passwordHash`/`manager.remote` entfernt der Manager) |
| `wert` | JSON |
| `geheim` | 1 = Geheimnis (Mail-Passwort in `smtp`, Passwort-Hash, Session-Geheimnis) – nie in Anzeigen/Logs/Exporten ausgeben |
| `geaendert_am` | ISO-Zeit |

- **Schreiber:** der Server-Manager (direkt per `node:sqlite`, kurze Transaktionen, WAL, `busy_timeout`); die App schreibt nur
  das Session-Geheimnis (einmalig) und übernimmt beim Start alte Dateien (`config/mail.json`, `data/.session-secret`,
  `settings.json`-Mailfelder → `*.vor-datenbank-<zeit>.bak`). **Leser:** App (Mail, Geheimnis) und Manager (alles).
- Der Manager legt die Tabelle bei Bedarf selbst an (`CREATE TABLE IF NOT EXISTS`), falls er vor der App läuft; die Migration
  ist identisch und ändert nichts.
- **Nicht in der Datenbank** (Henne-Ei): `<Wurzel>/mosaik3lab.json` = `{ dataDir, managerPort }`; das Backup-Passwort
  (`<Wurzel>/backup.key`); Systemzustand (Dienste, Firewall-Regeln) – der wird aus der Datenbank abgeleitet („Abgleichen“).
- Der Stammdaten-Export (Export/Import) enthält diese Tabelle nie.

## Migration 008 – Indizes für gezielte Abfragen
Nur Indizes, keine Datenänderung: `anfrage_farbe (anfrage_id, sortierung)`, `anfrage_feldwert (anfrage_id, sortierung)`,
`anfrage (abruf_code)` (Statusabfrage per Code), `anfrage (status)` (Statusfilter), `artikel_video (artikel_id, sortierung)`.
Die Repositories lesen Kindzeilen damit nur für die gefundenen Datensätze statt der ganzen Tabelle.

## Portal und HTTPS (keine eigene Migration – Zeilen in `betrieb_einstellung`, Bereich `betrieb`)
Schlüssel `portal.enabled`, `portal.basePath` (leer oder `/mosaik3lab`), `portal.httpPort`, `portal.httpsPort`, `portal.https` sowie
`portal.cert` (JSON: PFX als Base64 + Passwort **oder** PEM-Zertifikat + Schlüssel; als geheim markiert). Dadurch im Backup, im „Abgleichen“
und bei „Aus Backup einrichten“ enthalten. Die App bekommt den Pfad als `BASE_PATH` und den HTTPS-Modus als `PUBLIC_HTTPS` vom Manager.

## Migration 015 – „Was ist neu“ (`benutzer.neuigkeiten_gesehen`)
Neue Spalte `benutzer.neuigkeiten_gesehen` (TEXT, Standard NULL): zuletzt gelesene Version je Administratorkonto. Dazu schreibt
die App beim Start in `betrieb_einstellung` (Bereich `betrieb`) `version.aktuell` und bei einem Versionswechsel `version.vorherige`
(Update von 1.0.0, das noch nichts speicherte: `1.0.0`; Neuinstallation: keine). Angezeigt werden die Abschnitte aus `CHANGELOG.md`
mit `gesehen (sonst vorherige) < Version ≤ aktuelle` (`module/neuigkeiten/`, `GET /api/neuigkeiten`, `POST /api/neuigkeiten/gelesen`).
