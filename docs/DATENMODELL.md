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
- SQL steht in den Repositories der Bereiche (`server/src/module/<bereich>/<bereich>.repository.ts`, zusammengefasst in
  `server/src/storage/repositories.ts`). Bewusste Ausnahmen: Export/Import (`module/datenaustausch/`, eigene Transaktion
  über `storage.sqlite.db`), Betriebs- und Mail-Einstellungen (`kern/betrieb.ts`, `kern/mail/mailConfig.ts`, Tabelle
  `betrieb_einstellung`, auch vom Server-Manager gelesen).
- Die einmalige Übernahme der früheren JSON-Dateien gibt es seit 1.8.0 nicht mehr (1.6.3 hat sie erledigt; ältere Stände
  zuerst auf 1.6.3 bringen, siehe ARCHITEKTUR.md).

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

## Objekttypen (fest im Code, `server/src/kern/objekttypen.ts`)
`artikel`, `anfrage`, `vorschlag`, `benutzer`, `lehrkraft`. Neue Typen nur dort ergänzen.

## Tabellen (Kern)
| Tabelle | Inhalt |
| --- | --- |
| `benutzer` | Admin/Druck-Team-Konten (E-Mail – immer klein geschrieben, Rolle, Passwort-Hash – leer = noch nicht festgelegt, aktiv – 0 = ruht/nur Lehrkraft, `fehlversuche` (011), `gesperrt_seit` (014), `neuigkeiten_gesehen` (015), `entfernt_am` (016: entfernt, E-Mail durch Platzhalter `entfernt-<id>` ersetzt)) |
| `benutzer_bereich` | angehakte Druck-Team-Bereiche je Konto (benutzer_id, bereich) – seit Migration 011 |
| `passwort_link` | Einmal-Links „Passwort festlegen/zurücksetzen“ (SHA-256 des Tokens, benutzer_id, zweck, gueltig_bis – leer = läuft nicht ab) |
| `lehrkraft` | bekannte Lehrkräfte (E-Mail, angelegt_am, Häkchen `darf_anfragen`, `darf_vorschlagen` (011), `entfernt_am` (016, wie bei `benutzer`)) |
| `kategorie`, `einsatzbereich`, `material` | Stammdaten |
| `artikel_kategorien` | seit 023: Kategorien je Druckteil (artikel_id → `artikel` `ON DELETE CASCADE`, kategorie_id → `kategorie` ohne Kaskade, `sortierung` = Reihenfolge der Auswahl, die erste = Hauptkategorie, `UNIQUE (artikel_id, kategorie_id)`, Index auf kategorie_id) |
| `filament` | Farbrolle (Marke, Linie, Farbname, Hex, verfügbar). Seit 012: `katalog_id` (ID im mitgelieferten Bambu-Lab-Katalog, NULL = eigene Rolle), `hersteller_nummer` (Bambu-Nr. bzw. freiwillige eigene Nummer), `hersteller_name` (Originalname, englisch), `weggefallen` (nicht mehr im Bambu-Katalog). Abgleich beim Start: `module/stammdaten/bambuAbgleich.ts`; Hinweis für den Admin und bekannte Katalog-IDs in `einstellung` (`bambuAbgleichHinweis`, `bambuKatalogBekannt`) |
| `statusart` | feste Bestellstatus (Schlüssel, aktiv) – Inhalte aus dem Code, nur `aktiv` änderbar |
| `artikel` | Druckteil (nummer, Name, Beschreibung, Preis-Text, veröffentlicht …; seit 018 `links`: JSON-Liste der Link-Knöpfe `{ id, text, beschreibung, url }`, nur http/https, höchstens 50, bestehende Druckteile `[]`; seit 020 `herkunft_id`: ID des Druckteils in der Quelle eines Imports, wenn es hier eine andere ID hat, sonst leer) |
| `artikel_farbbereich` | Farbbereiche je Artikel (Name, Sortierung, seit 013 `alle_farben`: 1 = alle Farbrollen, auch später angelegte – dann keine Einzelverweise; seit 017 `gruppen`: JSON-Liste ganzer Linien/Materialarten wie `art:PLA`, auch später angelegte Rollen) + `artikel_farbbereich_filament` (erlaubte Farben bei „Nur bestimmte Farben“) |
| `artikel_aehnlich_offen` | seit 020: vorgemerkte Verknüpfung aus einem Import, deren Partner hier noch fehlt (`artikel_id` → `artikel` `ON DELETE CASCADE`, `partner_herkunft` = ID des Partners in der Quelle, `partner_name`/`partner_nummer` nur als Hilfe, `vorgemerkt_am`) |
| `artikel_feld` | Personalisierungsfelder je Artikel (Bezeichnung, Typ, Pflicht, max. Länge) |
| `artikel_aehnlich` | seit 019: ähnliche Druckteile, gegenseitig (A ↔ B). Paar ohne Richtung `(a, b)` mit `a < b` (eine Zeile je Paar), beide `ON DELETE CASCADE` (Löschen eines Druckteils räumt auf), Index auf `b`. Seit 020 im Export/Import (nur hinzufügen, siehe Migration 020). API: `GET/POST /api/items/:id/aehnliche`, `DELETE /api/items/:id/aehnliche/:andereId` (`module/katalog/aehnliche.ts`) |
| `anfrage` | Bestellung (nummer, lehrkraft_id, artikel_id, Klasse, Menge, Bemerkung, status) |
| `anfrage_farbe` | gewählte Farbe je Farbbereich |
| `anfrage_feldwert` | Werte der Personalisierungsfelder |
| `anfrage_statusverlauf` | jede Statusänderung (neuer Status, wer, wann, Kommentar; der vorige Status ergibt sich aus der Zeile davor) |
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

**Vorschaubilder der Druckteil-Bilder** (seit 2026-11-18, `server/src/kern/bilder/`) – abgeleitet, ohne Datensatz:
```
<ablage>/vorschau/karte-1080/<datei-id>.jpg  Katalogkarte, 1080 px breit
<ablage>/vorschau/mini-360/<datei-id>.jpg    kleine Vorschau (Ähnliche Druckteile, Listen), 360 px breit
```
- Höchstens drei Größen je Bild: Original (längste Kante ≤ 2000 px; größere verkleinert der Server, nur bei ≥ 20 %
  Ersparnis), `karte`, `mini`. Vorschaubilder sind immer JPEG (Transparenz auf Weiß), Höhe höchstens 2 × Breite.
- Die Breite steht im Ordnernamen: Ändert sich eine Größe, entsteht ein neuer Ordner, die Bildpflege füllt ihn und
  löscht den alten. Löschen/Ersetzen eines Bildes löscht seine Vorschaubilder mit (`FileStore.entferneVorschau`).
- Jederzeit neu berechenbar: nicht im Export, nicht im Backup des Server-Managers, keine Waisen im `doctor`.
- `<ablage>/.sicherung.lock` legt der Server-Manager während einer Sicherung an (Bildpflege pausiert).

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
- **`statusart.id`** ist der feste Schlüssel aus dem Code (`offen`, `gedruckt` …); nur `aktiv` wird gespeichert. Die Liste
  steht heute in `shared/src/werte/anfragen.ts` (der Kommentar in `001_grundschema.sql` nennt noch `domain/orderStatuses.ts`;
  eingespielte Migrationen bleiben unverändert).
- **Einstellungen** (`orderForm`, `features`, `mailStatus`, `statusAliases`; der Schlüssel
  `json_uebernahme` aus der früheren JSON-Übernahme wird nicht mehr geschrieben) liegen als JSON-Wert je Schlüssel in `einstellung`.
- **Schema 2 (`002_vorschlag.sql`):** Tabelle `vorschlag` (Titel, Beschreibung, Einsatz, Links als JSON, Menge, Dringlichkeit,
  Status, Antwort, `umgesetzt_artikel_id` → `artikel` ON DELETE SET NULL, `lehrkraft_id` ON DELETE SET NULL mit E-Mail-Schnappschuss). Fotos: `datei` (`vorschlag`/`foto`).
- **Ablageordner** stellt nur der Server-Manager ein (`ABLAGE_DIR`, nur bei gestoppter App, optional mit Kopieren der
  Dateien). Die frühere Datei `mosaik3lab.config.json` wird nicht mehr gelesen.
  Waisen-Prüfung (Datei ↔ Datensatz) im Manager-`doctor`.

## Migration 003 – Erneut anfragen
`anfrage.wiederholt_von` (TEXT, NULL erlaubt, bewusst ohne Fremdschlüssel): ID der Ursprungsanfrage, wenn eine Lehrkraft „Erneut anfragen“ nutzt. Die neue Anfrage ist ein eigener Datensatz mit neuer ID und Nummer.

## Migration 010 – Mehrere Farben in einer Anfrage
`anfrage.farbvarianten` (TEXT, JSON, Standard `'[]'`): Aufteilung der Stückzahl auf Farben, z. B. 3 × Blau + 4 × Gelb –
`[{ quantity, colorChoices: [{ areaId, area, colorId, color, colorHex }] }]`. Leer bei nur einer Farbe und bei allen älteren
Anfragen. Bei mehreren Varianten gilt: `menge` = Summe, `anfrage_farbe`/`farbe_id`/`farbe_hex` = erste Variante,
`farbe` = kurze Aufteilung („3 × Blau, 4 × Gelb“) für Listen, Suche und ältere Anzeigen.

## Migration 004 – Art des Druckteils
`artikel.art` (`hilfsmittel` | `lehrmittel` | `beides`, CHECK, Standard `hilfsmittel` für bestehende Druckteile).

## Migration 011 – Rechte einfach
Häkchen statt Einzelrechte: `benutzer_bereich` (Druck-Team-Bereiche je Konto), `lehrkraft.darf_anfragen`/`darf_vorschlagen`
(bestehende Lehrkräfte: 1), `benutzer.fehlversuche`, Tabelle `passwort_link`. Übernommen aus den alten Einzelrechten
`benutzer_recht`; die Tabelle entfernt Migration 022.

## Migration 012 – Farbrollen aus dem Bambu-Lab-Katalog
`filament.katalog_id` (eindeutig, NULL = eigene Rolle), `hersteller_nummer`, `hersteller_name`, `weggefallen`. Bisherige
`bambu-…`-Rollen gehören zum Katalog; Nummer, Namen und Farbe pflegt der Abgleich beim Start.

## Migration 014 – Sperre zeitlich begrenzt
`benutzer.gesperrt_seit` (leer = nicht gesperrt). Gesperrt ist ein Konto bei `fehlversuche` ≥ 10 und `gesperrt_seit` jünger als
eine Stunde (`istGesperrt`, `shared/src/konten.ts`). Gezählt wird in einer Transaktion aus dem aktuellen Stand – auch
gleichzeitige Fehlversuche zählen alle.

## Migration 016 – Personen entfernen
`benutzer.entfernt_am`, `lehrkraft.entfernt_am`: Die Zeile bleibt (Bezug für Anfragen, Vorschläge, Verlauf), die E-Mail wird
durch `entfernt-<id>` ersetzt, damit dieselbe Adresse neu vergeben werden kann.

## Migration 017 – Ganze Gruppen je Farbbereich
`artikel_farbbereich.gruppen` (JSON-Liste, Standard `'[]'`): `linie:<Marke Linie>` oder `art:<Materialart>` (erstes Wort der
Linie, groß). Gruppen sind Text, keine Fremdschlüssel: Benennt das Team eine eigene Farbrolle um und verschwindet dadurch eine
Linie bzw. Materialart, die eindeutig unter neuem Namen weiterlebt, schreibt das Speichern der Farbrollen die Gruppen der
Druckteile mit um (`gruppenNachfolger`, `module/stammdaten/stammdaten.service.ts`). Verteilt sich eine Linie auf mehrere neue
oder fällt sie ganz weg, bleibt die Gruppe stehen und trifft keine Rolle mehr.

## Migration 006 – Betriebs-, Mail- und Manager-Einstellungen (`betrieb_einstellung`)
Eine Quelle der Wahrheit: Alle Einstellungen, auch die des Servers, stehen in der Datenbank – ein Backup der Datenbank
(+ Ablage) rekonstruiert den Zustand vollständig (Ports, Pfade, Mail, Passwörter). Die fachlichen App-Einstellungen
(Bestellformular, Domains, Status-Schalter …) bleiben in `einstellung` (**Bereich „app“**).

| Spalte | Bedeutung |
| --- | --- |
| `bereich` | `betrieb` · `mail` · `manager` (CHECK) – zusammen mit `schluessel` der Primärschlüssel |
| `schluessel` | z. B. `app.port`, `app.network`, `paths.ablageDir`, `backup.time`, `backup.keep`, `backup.encrypt`, `sessionSecret` (frühere `update.*`-Schlüssel aus der Zeit des Git-Updates werden ignoriert und bleiben für einen Rückfall stehen); Bereich `mail`: `enabled`, `smtp`, `from`, `recipients`, `appBaseUrl`; Bereich `manager`: `manager.port` (Anmeldung am Manager = Admin-Konto der App; frühere `manager.passwordHash`/`manager.remote` entfernt der Manager) |
| `wert` | JSON |
| `geheim` | 1 = Geheimnis (Mail-Passwort in `smtp`, Passwort-Hash, Session-Geheimnis) – nie in Anzeigen/Logs/Exporten ausgeben |
| `geaendert_am` | ISO-Zeit |

- **Schreiber:** der Server-Manager (direkt per `node:sqlite`, kurze Transaktionen, WAL, `busy_timeout`); die App schreibt nur
  das Session-Geheimnis (einmalig) und die Versionsmerker `version.aktuell`/`version.vorherige`. Die Übernahme alter Dateien
  (`config/mail.json`, `data/.session-secret`) ist seit 1.8.0 entfernt. **Leser:** App (Mail, Geheimnis) und Manager (alles).
- Der Manager legt die Tabelle bei Bedarf selbst an (`CREATE TABLE IF NOT EXISTS`), falls er vor der App läuft; die Migration
  ist identisch und ändert nichts.
- **Nicht in der Datenbank** (Henne-Ei): `<Wurzel>/mosaik3lab.json` = `{ dataDir, managerPort }`; das Backup-Passwort
  (`<Wurzel>/backup.key`); Systemzustand (Dienste, Firewall-Regeln) – der wird aus der Datenbank abgeleitet („Abgleichen“).
- Der Stammdaten-Export (Export/Import) enthält diese Tabelle nie.

## Migration 008 – Indizes für gezielte Abfragen
Nur Indizes, keine Datenänderung: `anfrage_farbe (anfrage_id, sortierung)`, `anfrage_feldwert (anfrage_id, sortierung)`,
`anfrage (abruf_code)` (Statusabfrage per Code), `anfrage (status)` (Statusfilter), `artikel_video (artikel_id, sortierung)`.
Die Repositories lesen Kindzeilen damit nur für die gefundenen Datensätze statt der ganzen Tabelle.

## Migration 021 – Indizes auf Fremdschlüsseln
Nur Indizes, keine Datenänderung: `artikel_farbbereich_filament (filament_id)`, `artikel_einsatzbereich (einsatzbereich_id)`,
`artikel (kategorie_id)`, `artikel (material_id)`, `anfrage (erstellt_am, id)` (neueste Anfragen im Dashboard). Beim Löschen
von Stammdaten prüft SQLite die Kindtabellen damit gezielt statt per vollständigem Durchlauf.

## Migration 023 – Mehrere Kategorien je Druckteil (`artikel_kategorien`)
Neue Zuordnungstabelle Druckteil ↔ Kategorie (Spalten siehe Tabelle oben). Die Migration übernimmt für jedes Druckteil seine
bisherige Kategorie (`artikel.kategorie_id`, Sortierung 0); Druckteile ohne Kategorie bleiben ohne. Alle anderen Zeilen bleiben unverändert.
- **`artikel.kategorie_id` bleibt** und enthält weiter die **Hauptkategorie** (= erste der Liste); das Speichern eines Druckteils hält
  beide gleich. Gründe: Die Spalte trägt einen Fremdschlüssel – entfernen hieße in SQLite die Tabelle `artikel` samt aller Verweise
  neu aufbauen (Risiko beim Update der Schule ohne Nutzen); Symbolbild, „Ähnliche Druckteile“ und Bilder zu Anfragen lesen die
  Hauptkategorie weiter direkt; ältere Sicherungen und Exporte bleiben ohne Umweg lesbar.
- **API:** `categories: string[]` (Namen, mind. eine, höchstens 20, Doppelte entfallen) statt `category` in `itemInputSchema` und am
  Druckteil (`shared/src/katalog.ts`). Katalogfilter `?category=` trifft jede Kategorie eines Druckteils, die Suche alle.
- **Löschen/Umbenennen:** Eine Kategorie, die irgendein Druckteil (auch als zweite) verwendet, lässt sich wie bisher nicht löschen
  (409 mit Zahl, Zählung über `artikel_kategorien`); so behält jedes Druckteil mindestens eine. Umbenennen wirkt per ID sofort.
- **Export/Import:** je Druckteil `categories` (alle) und `category` (Hauptkategorie, damit 1.7.0/1.8.0 neue Dateien mit der
  Hauptkategorie einspielen können). Dateien ohne `categories` (JSON bis 1.6.x, ZIP aus 1.7.0/1.8.0) → `[category]`. Paketformat bleibt 2.

## Migration 022 – alte Einzelrechte entfernt
`DROP TABLE IF EXISTS benutzer_recht`. Die Tabelle wurde seit 011 weder gelesen noch geschrieben; 011 läuft immer vorher
(auch beim Wiederherstellen älterer Sicherungen) und übernimmt die Einzelrechte nach `benutzer_bereich`. Kein Verweis anderer
Tabellen, keine weitere Datenänderung.

## Portal und HTTPS (keine eigene Migration – Zeilen in `betrieb_einstellung`, Bereich `betrieb`)
Schlüssel `portal.enabled`, `portal.basePath` (leer oder `/mosaik3lab`), `portal.httpPort`, `portal.httpsPort`, `portal.https` sowie
`portal.cert` (JSON: PFX als Base64 + Passwort **oder** PEM-Zertifikat + Schlüssel; als geheim markiert). Dadurch im Backup, im „Abgleichen“
und bei „Aus Backup einrichten“ enthalten. Die App bekommt den Pfad als `BASE_PATH` und den HTTPS-Modus als `PUBLIC_HTTPS` vom Manager.

## Migration 015 – „Was ist neu“ (`benutzer.neuigkeiten_gesehen`)
Neue Spalte `benutzer.neuigkeiten_gesehen` (TEXT, Standard NULL): zuletzt gelesene Version je Administratorkonto. Dazu schreibt
die App beim Start in `betrieb_einstellung` (Bereich `betrieb`) `version.aktuell` und bei einem Versionswechsel `version.vorherige`
(Update von 1.0.0, das noch nichts speicherte: `1.0.0`; Neuinstallation: keine). Angezeigt werden die Abschnitte aus `CHANGELOG.md`
mit `gesehen (sonst vorherige) < Version ≤ aktuelle` (`module/neuigkeiten/`, `GET /api/neuigkeiten`, `POST /api/neuigkeiten/gelesen`).

## Migration 019 – Ähnliche Druckteile (`artikel_aehnlich`)
Neue Tabelle `artikel_aehnlich (a, b)`: Verknüpfung zweier Druckteile, gilt für beide Seiten. Gespeichert wird das Paar
sortiert (`CHECK (a < b)`), so gibt es jede Verknüpfung nur einmal. Bestehende Daten: keine Verknüpfungen. Löschen eines
Druckteils entfernt seine Paare per Fremdschlüssel. Bewusst nicht im Export/Import (Entscheidung des Nutzers, 2026-11-18).
Besucher bekommen nur veröffentlichte Teile; Pflegen mit `catalog:manage`.

## Migration 020 – Ähnliche Druckteile im Export/Import (`artikel.herkunft_id`, `artikel_aehnlich_offen`)
Nur hinzufügend, bestehende Daten bleiben unverändert (Entscheidung des Nutzers, 2026-11-18, ersetzt „nicht im Export“ aus 019):
- `artikel.herkunft_id` (TEXT, Standard `''`, Teilindex auf nicht-leere Werte): ID, die ein eingespieltes Druckteil in der Quelle
  hatte, wenn es hier eine andere ID hat (neue ID oder über den Namen zugeordnet). Wird nur gesetzt, solange leer – nie überschrieben.
- `artikel_aehnlich_offen (artikel_id, partner_herkunft)`: Verknüpfung aus einer Export-Datei, deren Partner hier noch fehlt.
  Jeder Import löst vorgemerkte Verknüpfungen auf, sobald es ein Druckteil mit `id` oder `herkunft_id` = `partner_herkunft` gibt
  (→ Zeile in `artikel_aehnlich`, Vormerkung entfällt). Löschen des Druckteils löscht seine Vormerkungen mit.
- Export-Datei Format 2 (ZIP): je Druckteil `aehnliche: [{ id, name, nummer }]` – auch Partner außerhalb des Exports; Name und
  Nummer nur als Hilfe. Import: Partner über das Druckteil der Datei, gleiche ID oder Herkunfts-ID, sonst vormerken. Nur hinzufügen,
  nie löschen (beide Modi). Verknüpfungen zählen nicht in den Vergleich „gleich/ersetzt“ eines Druckteils (`fingerabdruck`).
- **Paketformat 2** (ZIP, `module/datenaustausch/datenaustausch.zip.ts`): `paket.json` (Kopf, Stammdaten, Druckteile mit
  Datei-Metadaten samt SHA-256 und `pfad`) + `bilder/`, `druckdateien/`, `videos/` mit `<Datei-ID>.<Endung>`. Format 1
  (JSON-Zeilen-Datei mit Base64) wird weiter gelesen; Details in ARCHITEKTUR.md, Abschnitt „Druckteile exportieren und einspielen“.
