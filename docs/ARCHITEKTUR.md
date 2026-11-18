# Mosaik³LAB – Architektur und API-Vertrag

Stand: 31.10.2026. Dieses Dokument ist die verbindliche Schnittstelle zwischen Frontend und Backend.

## Glossar – einheitliche Begriffe (Oberfläche, Mails, Fehlermeldungen, Doku)

Die Schule nutzt die gedruckten Teile als **Hilfs- und Lehrmittel**. In Texten gilt:

| Begriff | Bedeutung | Nicht verwenden |
| --- | --- | --- |
| **Druckteil** | Oberbegriff für einen Eintrag im Katalog (technisch `Item`/`artikel`, Nummer `ART-…`) | Hilfsmittel als Oberbegriff, Artikel, Produkt |
| **Hilfsmittel** | Art eines Druckteils: unterstützt Schülerinnen und Schüler im Alltag/Unterricht | – |
| **Lehrmittel** | Art eines Druckteils: Material für den Unterricht | – |
| **Hilfs- und Lehrmittel** | Titel/Werbetext für den ganzen Katalog (Seitentitel, Logo, Login-Seite) und die Art „beides“ | Hilfsmittelkatalog |
| **Katalog** | Seite `/katalog` mit allen veröffentlichten Druckteilen; Filter u. a. nach Art | – |
| **Anfrage** | Wunsch einer Lehrkraft nach einem Druckteil (`ANF-…`) | Bestellung, Auftrag |
| **Vorschlag** | Wunsch nach einem Druckteil, das es noch nicht gibt (`VOR-…`) | – |
| **Druckdatei** | STL/3MF-Datei eines Druckteils | – |
| **Druck-Team** | Rolle `druckteam`; im Fließtext „3D-Druck-Team“ | – |
| **Farbrolle / Filament** | Rolle mit Farbe, aus der gedruckt wird | – |

Die **Art** (`Item.kind`: `hilfsmittel` · `lehrmittel` · `beides`, Spalte `artikel.art`, Migration `004_artikel_art.sql`,
Standard `hilfsmittel`) ist im Druckteil-Editor wählbar und im Katalog filterbar (`GET /api/items?kind=`; „Hilfsmittel“
bzw. „Lehrmittel“ zeigt auch Druckteile der Art „beides“). Export/Import enthalten das Feld; ältere Pakete ohne Feld
werden als Hilfsmittel importiert. Internes (URLs `/verwaltung/hilfsmittel`, Rechte-Schlüssel, Tabellennamen) bleibt unverändert.

## Fachliche Grundsätze

- **Lehrkräfte brauchen kein Konto.** Sie stöbern im Katalog und reichen Anfragen mit ihrer
  **Schul-E-Mail** und der **Klasse** ein. Unbekannte E-Mail-Adressen werden automatisch im
  Besteller-Verzeichnis (Tabelle `lehrkraft`) angelegt – ohne Passwort, ohne Profilseite.
- **Lehrkräfte sehen keinen Status** (angemeldet nur ihre Anfragen ohne Bearbeitungsstand). Das Druck-Team bringt fertige Druckteile persönlich vorbei.
  Technisch bleibt die Statusabfrage erhalten (Schalter `features.requesterTracking`, Standard: aus).
- **Anmeldung per E-Mail** (kleines Anmelde-Symbol in der Navigation, `/login`), zweistufig:
  1. E-Mail prüfen → Konto von Admin/Druck-Team: **Passwort** nötig; bekannte Lehrkraft (Eintrag in
     Tabelle `lehrkraft`): **direkt angemeldet ohne Passwort**, Rolle `lehrkraft`, nur Recht `orders:own`;
     unbekannt: eigene Ansicht mit „Jetzt Konto anlegen“ (`/api/auth/register`, legt nur einen `Requester` an,
     nie ein Konto) oder „E-Mail korrigieren“.
  2. Passwort (nur Konten). Konten (Tabelle `benutzer`) gibt es nur für `admin` und `druckteam`; jedes hat eine
     eindeutige, klein geschriebene `email`. Frühere Konten mit Rolle `lehrkraft` bleiben gespeichert,
     melden sich aber nur noch als Lehrkraft (ohne Passwort) an.
- **Angemeldet bleiben:** dauerhaftes Session-Cookie (30 Tage, `rolling` – bei jeder Nutzung verlängert,
  HttpOnly, SameSite=Strict); Abmelden zerstört Session und Cookie.
- **Testbarkeit:** Login-Seite mit `data-testid`: `login-email`, `login-next`, `login-password`, `login-submit`,
  `login-change-email`, `login-unknown`, `login-unknown-email`, `login-register`, `login-correct-email`, `login-error`.
- **Rollen & Häkchen (seit 2026-11-02):** Drei Rollen – Lehrkraft (ohne Passwort), 3D-Druck-Team, Administrator (beide mit
  Passwort). Statt Einzelrechten gibt es wenige **Häkchen** (`BEREICHE` in `shared/src/konten.ts`, je ein Satz „Darf …“):
  Lehrkraft: „Druckteile anfragen“, „Druckteile vorschlagen“ (gelten für jede Person, gespeichert an `lehrkraft`);
  Druck-Team: „Anfragen bearbeiten“, „Druckteile pflegen“ (inkl. Export/Einspielen), „Vorschläge bearbeiten“,
  „Farbrollen leer/vorrätig“, „Stammdaten pflegen“ (Tabelle `benutzer_bereich`). Der Administrator darf alles, dazu
  `users:manage` und `settings:manage` (inkl. Ablauf der Anfragen). Jedes Häkchen schaltet feste Prüfpunkte (`Permission`)
  frei; `rechteFuer(role, bereiche)` rechnet sie aus, der Server prüft nur diese (`requirePermission`).
- **Eine Person = eine E-Mail:** Konten behalten ihre Lehrkraft-Funktionen (`loadUser` setzt bei Konten zusätzlich
  `req.requester` aus dem Lehrkräfte-Verzeichnis). Ohne Lehrkraft-Häkchen „anfragen“ lehnt der Server auch Anfragen ohne
  Anmeldung mit dieser Adresse ab. Zurück zur Lehrkraft = Konto ruht (`aktiv = 0`), Anmeldung wieder ohne Passwort.
- **Passwort per Link:** Wer mehr als Lehrkraft-Rechte bekommt, erhält automatisch eine Mail „Passwort festlegen“
  (`module/konten/passwortlink.ts`, Link `…/passwort#<token>`, nur SHA-256 gespeichert, Einmal-Link). Links vom
  Administrator laufen nicht ab, „Passwort vergessen?“ und die Sperre-Mail gelten 24 Stunden. Ohne Mailversand bekommt der
  Administrator den Link zum Weitergeben angezeigt. Bis zum Festlegen meldet sich die Person weiter als Lehrkraft an.
- **Sperre:** Nach 10 falschen Passwörtern in Folge (`benutzer.fehlversuche`) ist das Konto **für eine Stunde** gesperrt (`benutzer.gesperrt_seit`, Migration 014), eine Mail mit Link
  zum Zurücksetzen geht raus; ein neues Passwort hebt die Sperre auf. Passwörter frei wählbar, mindestens 8 Zeichen.
- **Lehrkraft-Session:** `session.requesterId` statt `session.userId`; `loadUser` setzt dann `req.requester`.
- **Stammdaten** (Kategorien, Einsatzbereiche, Materialien, Farbrollen) pflegt die Administration selbst – Seite mit drei Tabs, Materialien und Farbrollen zusammen unter „Material & Farben“; selten Geändertes (Farbe/Symbol, Marke/Linie/Farbwert) ist eingeklappt.
- **Bestellstatus sind fest** (`STATUS_CATALOG` in `shared/src/anfragen.ts`: Reihenfolge, Phase, Farbe, Erklärung; Symbole in
  `client/src/lib/constants.ts`): Offen · In Prüfung · In Druck · Gedruckt · Abholbereit · Übergeben · Abgelehnt ·
  Storniert. Die Administration schaltet sie nur an/aus (`OrderStatusDef.active`, Einstellungen → „Ablauf der Anfragen“, Recht `masterdata:manage`); Standard: **Offen** (immer an) und
  **Gedruckt**. Ausgeschaltete Status sind nicht wählbar und erscheinen nicht als Kachel auf der Übersicht; Anfragen
  behalten ihn. Früher frei angelegte Status werden beim Laden auf feste abgebildet (ID → Name → Phase), die Zuordnung
  steht in `settings.statusAliases`, die Anfragen werden beim Start nachgezogen (`migrateLegacyStatuses`).
- **Bambu-Lab-Katalog** (`server/src/domain/bambuKatalog.json`, erzeugt mit `node scripts/bambu-katalog.mjs` aus der Farbliste
  von Bambu Studio): Farbrollen mit `katalogId` sind schreibgeschützt (nur „vorrätig“, Reihenfolge, Entfernen); beim Start gleicht
  `bambuAbgleich.ts` Name, Nummer und Farbe ab, kennzeichnet weggefallene Farben und merkt neue für den Import vor. Eigene Rollen
  (`katalogId: null`) fasst der Abgleich nie an. Anzeige für Team/Admin: `filamentRolle()` in `shared/src/stammdaten.ts`.
- **Farbrollen leer/vorrätig** (`Filament.available`): Das Druck-Team schaltet unter Verwaltung → **Farbrollen**
  (`/verwaltung/filamente`, Recht `filaments:manage`) um. Katalog, Produktseite und Anfrageformular zeigen nur
  vorrätige Farben (`client/src/lib/colors.ts` → `availableFilaments`); Anfragen mit leerer Farbe lehnt der
  Server ab (400). Im Druckteil-Editor sind leere Rollen weiter wählbar und mit „(leer)“ markiert.
- **Sicherheitshinweise** werden Lehrkräften derzeit nicht angezeigt (nur im Druckteil-Editor).
- **E-Mail-Benachrichtigung** bei jeder neuen Anfrage an ein oder mehrere Postfächer. **Eingerichtet nur im
  Server-Manager**; gespeichert in der Datenbank (Tabelle `betrieb_einstellung`, Bereich `mail`, Migration 006):
  `enabled`, `smtp { host, port, secure, user, pass }`, `from`, `recipients[]`, `appBaseUrl`.
  Die App liest sie bei jedem Versand (kein Neustart), schreibt sie nie und zeigt in Verwaltung → Einstellungen nur
  den Zustand + letzten Versand. Fehlt/ungültig → Versand aus, Logeintrag. Testmail:
  `npm run mail:test -s -w server -- --db <pfad zu mosaik3lab.db> [--to <adresse>]`. Das Session-Geheimnis liegt ebenfalls
  in `betrieb_einstellung` (Bereich `betrieb`); die App erzeugt es beim ersten Start.
  HTML-Mail + Text mit allen Angaben und Links, erzeugt von `buildOrderMail` (`module/anfragen/anfragen.mail.ts`; neue
  Bestellfelder nur in `orderMailFields` ergänzen). Versand im Hintergrund – Fehler verhindern nie die Anfrage.
- **Pfade** (Datenordner `STORAGE_DIR`, Ablage `ABLAGE_DIR`, Backup-Ziel) stellt nur der Server-Manager ein; die App
  zeigt sie unter Verwaltung → Einstellungen nur an (`AdminSettings.paths = { storageDir, dbFile, ablageDir }`).

## Erreichbarkeit: Basis-Pfad, Portal, HTTPS
Die App läuft unter einem einstellbaren **Basis-Pfad** (`BASE_PATH`, leer = `/`, z. B. `/mosaik3lab`): Der Server hängt alle Routen (API, Dateien, Frontend) darunter ein
(`server/src/app.ts`, `basePath.ts`), setzt beim Ausliefern von `index.html` den `<base href>` (das Frontend ist mit relativen Adressen gebaut, ein Build für jeden Pfad), das
Sitzungs-Cookie gilt nur unter dem Pfad; der Client liest den Pfad aus `<base>` (`client/src/lib/basePath.ts`: Router-`basename`, API-/Bild-/Datei-Adressen). Die App hört nur auf
`127.0.0.1` (`trust proxy` nur für Loopback); nach außen steht das **Portal** des Server-Managers (Port 80/443, optional HTTPS, siehe `manager/README.md`). Helmet setzt
`upgrade-insecure-requests` und HSTS nur bei `PUBLIC_HTTPS=true` – sonst funktioniert `http://<IP>` im Schulnetz.

**Server-Manager unter `<Pfad>/manager`:** Portal (Betrieb) bzw. Vite-Proxy (Entwicklung, `MANAGER_PORT`, Standard 5190) leiten
`<Pfad>/manager…` ohne Präfix an den Manager auf `127.0.0.1` weiter und setzen dabei immer selbst den Kopf `X-Mosaik3lab-Manager`.
Daran erkennt der Manager „über das Netz“: Zugang hat, wer in der App als Administrator angemeldet ist (der Manager fragt
`GET <Pfad>/api/auth/me` mit dem Cookie des Browsers, `user.role === 'admin'`) – keine zweite Anmeldung. Direkt am Server
(Notzugang `127.0.0.1:5190`) meldet man sich mit E-Mail + Passwort eines App-Administrators an. In der App öffnet
Verwaltung → Server-Manager (nur Rolle Administrator) den Manager. Ohne Administrator leitet die App auf die Ersteinrichtung
um (direkt am Server und über das Netz, solange es noch keinen gibt). Der App-Server ist dafür unverändert. Details: `manager/README.md`.

## Datenhaltung (Vertrag: [DATENMODELL.md](DATENMODELL.md))

- **SQLite** über `node:sqlite` (Node ≥ 24), Datei `<STORAGE_DIR>/mosaik3lab.db`, WAL, Fremdschlüssel an.
  Schema in `server/src/storage/sqlite/migrations/NNN_name.sql`, Stand in `schema_version`. Neue Migration = neue
  Datei mit der nächsten Nummer; sie läuft beim nächsten Start automatisch (vorher Sicherung nach
  `<STORAGE_DIR>/sicherungen/`), jede Migration in einer Transaktion.
- **Repositories** je Fachbereich (`module/<bereich>/<bereich>.repository.ts`) sind der einzige SQL-Zugriff der
  Fachlogik; sie bilden die fachlichen Typen (`domain/types.ts`) auf die Tabellen ab. Zusammengebaut als `Storage`
  (`storage/index.ts`, Typ in `storage/repositories.ts`). Einzelzugriffe und Filter laufen als gezielte Abfrage
  (`WHERE`, Indizes aus Migration 008), Zählungen per SQL – nicht „ganze Tabelle laden und in JS filtern“. `update(id, change)` läuft synchron in einer
  Transaktion (lesen → ändern → schreiben), Kindzeilen behalten beim Abgleich ihre ID.
- **IDs/Nummern:** `newId()` (`kern/ids.ts`, UUID v7) für neue Datensätze; Nummernkreise (`kern/objekttypen.ts`
  → `NUMMERNKREISE`, Tabelle `nummernkreis`): `ANF-JJJJ-NNNN`, `ART-NNNN`, `VOR-JJJJ-NNNN`. `Item.number` ist neu (lesend).
- **Dateien:** `storage.files` (`FileStore`, `kern/files.ts`): `save({ objekttyp, objektId, rolle, buffer, ext, … })`
  schreibt nach `<ablage>/<objekttyp>/<objekt-id>/<rolle>/<datei-id>.<endung>` und legt den Datensatz an.
  Objekttypen und Rollen nur in `kern/objekttypen.ts` (+ CHECK in der Migration). `Item.images`,
  `modelFiles`, `videos[].file` werden aus `datei` abgeleitet (öffentlicher Name `<datei-id>.<endung>`); was beim
  Speichern eines Artikels nicht mehr darin steht, wird samt Datei gelöscht (erst DB, dann Datei).
  Auslieferung nur über `/api/files/…` mit Rechteprüfung anhand des Datensatzes.
- **Bilder und Bildpflege** (`kern/bilder/`, `storage.bilder` + `storage.bildpflege`): Die einzige Stelle, die Bilder
  umrechnet. Reines JavaScript (`jpeg-js`, `pngjs` – kein natives Modul, gleich auf Windows, Linux x64 und Pi) in
  **einem Rechen-Thread** (`worker.ts`, gebündelt `server/dist/bild-worker.mjs`; `rechner.ts`: Aufträge nacheinander,
  „sofort“ vor „hintergrund“, Zeitgrenze 60 s je Bild, Thread nach Absturz/Zeitüberschreitung neu, JS-Speicher des
  Threads begrenzt, nach 30 s Ruhe beendet). Grenzen gegen Speicherüberlauf: höchstens 40 Megapixel (am Dateikopf
  geprüft, `format.ts`), `maxMemoryUsageInMB` beim Dekodieren; CMYK/12 Bit/arithmetisch/WebP → Original bleibt.
  Verkleinern mit Flächenmittel zeilenweise, EXIF-Drehung nach dem Verkleinern. Schnittstelle zum Austauschen der
  Bibliothek: `verarbeitung.ts` (`verkleinere(buffer, maxKante)`, `verarbeite(auftrag)`).
  - **Hochladen:** `addImages` trägt die Bilder erst ins Druckteil ein, dann verarbeitet `storage.bilder.verarbeite`
    jedes sofort (Original ggf. verkleinern über `FileStore.replace`: Zwischendatei → umbenennen → Datensatz;
    Vorschaubilder über Zwischendatei). Scheitert es, bleibt das Original, die Bildpflege holt es nach.
  - **Bildpflege** (`bildpflege.ts`): einmal einige Minuten nach dem Start der App (`BILDPFLEGE_NACH_MIN`, Standard 5;
    nie im Installer/Update), zusätzlich für eingespielte Bilder nach einem Import. Räumt veraltete Größen-Ordner und
    verwaiste Vorschaubilder auf, geht dann alle Druckteil-Bilder einzeln durch (200 ms Pause), überspringt Erledigtes
    (Vorschaubilder da, Original ≤ 2000 px – nur Dateikopf gelesen), pausiert bei Import (`importLaeuft()`) und
    Sicherung (`<ablage>/.sicherung.lock` des Server-Managers), bricht beim Beenden ab und macht beim nächsten Start
    weiter. Log: „Bildpflege: 22 Bilder geprüft, 18 verkleinert (44,8 MB → 5,6 MB), 44 Vorschaubilder erzeugt (…)“.
  - **Client:** `ItemImage` mit `groesse` (`karte` Katalogkarte, `mini` kleine Vorschauen, `original` Galerie) und
    `sizes`; `client/src/lib/bildQuellen.ts` baut `srcset` (mini 360w, karte 1080w, Original 2000w als oberste Stufe; der Browser nimmt die kleinste ausreichende Fassung).
- **Updates ab 1.6.3:** Die Übernahme aus der JSON-Zeit (Daten, `mail.json`, `.session-secret`, `mosaik3lab.config.json`)
  und das Ergänzen von Konten ohne E-Mail sind entfernt – 1.6.3 hat sie erledigt. Ältere Stände zuerst auf 1.6.3 bringen.
  Ein früherer Eintrag `einstellung` „json_uebernahme“ bleibt als Vermerk stehen.
- **Für den Server-Manager:** `/api/health` → `{ ok, version, demoAccountsEnabled, db: { vorhanden, schemaVersion, groesseBytes } }`;
  `npm run --silent db:backup -w server -- --ziel <datei> [--quelle <db>]` → eine Zeile `OK …` / `FEHLER: …`, Exit 0/1.

## Ordnerstruktur

```
server/src/
  domain/        types.ts (Server-Sicht der Entitäten: Passwort-Hash, Ablagename), bambuKatalog.ts/.json (mitgelieferter Bambu-Lab-Katalog) – Rest seit 1.7.x bei den Bereichen: Rechte `module/konten/rechte.ts`, Vorgaben `module/einstellungen/einstellungen.vorgaben.ts`, Status `module/stammdaten/orderStatuses.ts`; `kern/ids.ts` (UUID v7), `kern/objekttypen.ts` (Objekttypen, Datei-Rollen, Nummernkreise)
  module/<bereich>/   je Fachbereich: <bereich>.routes.ts (nur parsen → Service → antworten),
                      <bereich>.service.ts (Regeln), <bereich>.repository.ts (SQLite-Zugriff)
    katalog/          Druckteile, Bilder/Videos/Druckdateien, /api/items + /api/files
    anfragen/         Anfragen, Statusabfrage, Übersicht (/api/orders, /api/dashboard), anfragen.mail.ts (Bestell-Mail, Testmail)
    vorschlaege/      Vorschläge der Lehrkräfte inkl. Fotos und Umwandeln, vorschlaege.mail.ts
    konten/           Anmeldung (/api/auth), Personen & Rechte (/api/personen), Passwort-Links, Lehrkräfte, erstes Admin-Konto
    stammdaten/       Kategorien, Einsatzbereiche, Materialien, Farbrollen, Status-Schalter (unter /api/admin/settings, /api/filaments)
    neuigkeiten/      „Was ist neu“ für Admins nach einem Update (CHANGELOG.md, /api/neuigkeiten; auch vom Server-Manager genutzt)
    einstellungen/    /api/config, /api/admin/settings (Formular, Schalter) – ohne eigenen Service, da keine Regeln
    datenaustausch/   Export/Import der Stammdaten: .export.ts (Format), .paket.ts (Lesen/Prüfen), .service.ts (Ablauf),
                      nutzt die Repositories von Katalog und Einstellungen (kein eigenes)
  kern/          Technik ohne Fachbegriffe: db.ts (SQLite, Migrationen, SQL-Kurzformen, Nummernkreise), files.ts (Ablage),
                 lock.ts, betrieb.ts (betrieb_einstellung), auth/ (Middleware, Passwort, Sitzungen + Session-Store),
                 mail/ (SMTP-Versand, Mail-Einstellungen, Vorlagen-Hilfen), uploads.ts, rateLimit.ts, errors.ts, http.ts,
                 bilder/ (Bildverarbeitung, siehe „Bilder und Bildpflege“)
  storage/       index.ts (Speicher zusammenbauen, Sperrdatei), repositories.ts (Typ `Storage`),
                 sqlite/migrations/ (global nummeriert, fester Ort – der Server-Manager liest sie dort)
  seed/          Beispieldaten (nutzt Services/Repositories, nie Routen)
  app.ts, index.ts, config.ts, basePath.ts
server/scripts/  Skripte (tsx); bundle.ts bündelt für das Installer-Paket nach server/dist/ (siehe unten)
client/src/
  lib/           api.ts (api, apiUpload, fehlerText), types.ts (Sammel-Export der Typen aus shared/), config.tsx (ConfigProvider/useMasterData),
                 constants.ts (Kategorie-/Status-Darstellung), colors.ts (Farbrollen, Farbauswahl), format.ts, useApi.ts, suchParameter.ts
  auth/          AuthContext.tsx
  components/    gemeinsame Bausteine: ui.tsx, Listenwerkzeug.tsx (FilterKnopf, Suchfeld, LadeFehler), Layout.tsx, Dialog.tsx, Logo.tsx,
                 ItemImage.tsx, ColorSwatch.tsx, StatusBadge.tsx, ListEditor.tsx, Toast.tsx, StatusPages.tsx
  features/
    katalog/       CatalogPage, ItemDetailPage
    anfragen/      RequestDialog + AnfrageFelder + anfragePruefung.ts, MyOrdersPage + OrderCard, AnfrageVerlauf (Fortschritt,
                   Verlauf), farbAnzeige.ts, zugang.ts („Meine Anfragen“ sichtbar?), guestOrders.ts, anfrageEmail.ts
    konto/         LoginPage, AccountPage
    verwaltung/    DashboardPage, OrdersAdminPage + OrderRow, RequestersPage, ItemsAdminPage, UsersAdminPage + UserDialogs
      druckteil-bearbeiten/  ItemEditPage (Laden/Speichern), useItemForm (Formular-Zustand), itemForm.ts (Leerwerte, Prüfung),
                     Section (aufklappbarer Rahmen), je Abschnitt eine Komponente (Basics, Colors + FilamentPicker, Media +
                     VideosEditor, CustomFields, Material, ModelFiles, Safety, VisibilityPanel), FilePicker (Upload)
    einstellungen/ SettingsPage
      stammdaten/  MasterDataPage (Tabs), ListPanel (generischer Listen-Editor) + listRows.ts, je Liste ein Panel
                     (Categories, Simple = Einsatzbereiche/Materialien, Filaments + BambuImportDialog, Statuses), KeyPickers
```

**Installer-Paket = gebündelt.** Entwicklung, Tests und Git-Update starten den Server aus TypeScript über tsx. Das
Installer-Paket (`scripts/paket.mjs`) enthält stattdessen `server/dist/*.mjs` (esbuild, eine ESM-Datei je Einstieg: `server`,
`create-admin`, `db-backup`, `mail-test`, dazu `bcryptjs.cjs` für den Server-Manager) und keine `node_modules`. Pfade laufen
deshalb über `ROOT_DIR` (config.ts, gleich aus `src/` und `dist/`), die Migrationen bleiben als Dateien am festen Ort, JSON
(z. B. `bambuKatalog.json`) wird eingebettet. Welche Form startet, entscheidet `manager/lib/appstart.mjs` (tsx hat Vorrang).

## Gemeinsames Paket shared/

`shared/` (`@mosaik3lab/shared`, npm-Workspace) enthält Typen und Validierung **einmal** für Server und Client: reines
TypeScript + zod, kein Build – `tsx` (Server) und Vite (Client) lesen die Quellen direkt (`exports: { "./*": "./src/*.ts" }`),
Import z. B. `import { itemInputSchema } from '@mosaik3lab/shared/katalog'`.

| Modul | Inhalt |
|---|---|
| `basis.ts` | deutsche Fehlermeldungen (zod-Fehlerkarte), `zodFieldErrors`, Bausteine (`text`, `uniqueList`, `emailSchema`, `httpLink`) |
| `katalog.ts` | Druckteil (`itemInputSchema`, `Item`, `ItemView`), Farbbereiche, Personalisierung, Videos, Art (`ITEM_KINDS`) |
| `anfragen.ts` | Anfrage (`orderInputSchema`, `Order`, …), feste Statusliste `STATUS_CATALOG`, Status-Schemas |
| `vorschlaege.ts` | Vorschlag (`proposalInputSchema`, `proposalUpdateSchema`, `Proposal`), Status/Dringlichkeit |
| `konten.ts` | Rollen, Rechte-Matrix `PERMISSION_DEFS` (Schlüssel, Klartext), Konto-/Anmelde-Schemas |
| `stammdaten.ts` | Kategorien, Einsatzbereiche, Materialien, Farbrollen (`masterDataSchemas`), Farb-/Symbol-Schlüssel |
| `einstellungen.ts` | Funktionen, Anfrageformular, `PublicConfig`, `AdminSettings` |

Typen entstehen per `z.infer` aus den Eingabe-Schemas; Felder, die nur der Server vergibt (ID, Nummer, Zeitstempel),
kommen per `&` dazu. Reine Antwort-Typen ohne Eingabe (z. B. `Order`) stehen dort als `interface`. Nur Server-intern
bleiben `server/src/domain/types.ts` (Passwort-Hash, Ablagename der Druckdateien) und die Prüf-Logik in `module/konten/rechte.ts`.
Der Client sammelt die Typen in `client/src/lib/types.ts` (nur Re-Exporte). Export/Import (`stammdatenImport.ts`) prüft
Artikel mit `itemInputSchema` und Stammdaten mit `masterDataSchemas`; das Paketformat selbst bleibt dort bewusst nachsichtig.
zod läuft dadurch auch im Client-Bundle mit (≈ 15 KB gzip).

## API

Alle ändernden Anfragen brauchen den Header `X-Requested-With: mosaik3lab`. Fehler: `{ error: string, fields?: Record<string,string> }`.
Typen und Eingabe-Schemas: `shared/src/*.ts` (maßgeblich, siehe „Gemeinsames Paket shared/“).

### Öffentlich (ohne Anmeldung)

| Methode | Pfad | Antwort / Body |
| --- | --- | --- |
| POST | `/api/auth/identify` | Body `{ email }` → `{ result: 'password' }` · `{ result: 'signed-in', user, permissions }` (bekannte Lehrkraft, Session gestartet) · `{ result: 'unknown' }`. Rate-Limit 60/10 min je IP (gemeinsam mit `/login`). |
| POST | `/api/auth/register` | Body `{ email }` → 201 `{ result: 'signed-in', user, permissions }` (Lehrkraft angelegt bzw. schon bekannt, Session gestartet). 400 bei fremder Domain (`orderForm.allowedEmailDomains`), 409 wenn die Adresse zu einem Konto gehört. Rate-Limit 20/h je IP. |
| POST | `/api/auth/login` | Body `{ email, password }` → `{ user, permissions }` (nur Admin/Druck-Team). 401 falsch (ab 3 verbleibenden Versuchen mit Hinweis „Noch n Versuche“), 403 gesperrt/Demo-Sperre: Nach 10 falschen Passwörtern (`MAX_FEHLVERSUCHE`, je Konto gezählt, unabhängig von der IP) ist das Konto 1 Stunde gesperrt (`SPERRE_MS`) – bzw. bis ein neues Passwort über den automatisch gemailten Link gesetzt wird; erfolgreiche Anmeldung setzt die Zählung zurück. 429 nur über das Rate-Limit 60/10 min je IP (gemeinsam mit `/identify`, im Arbeitsspeicher). |
| GET | `/api/auth/me` | `{ user: SessionUser oder null, permissions }` – `SessionUser` = `{ id, email, displayName, role, username (null bei Lehrkraft), isDemo, lastLoginAt }` |
| GET | `/api/config` | `PublicConfig` = `{ masterData, features, orderForm, demoAccountsEnabled }` |
| GET | `/api/items?q=&category=&area=&kind=` | `Item[]` (nur veröffentlichte; `modelFiles` leer) |
| GET | `/api/items/:id` | `Item` |
| GET | `/api/files/images/:file?groesse=karte\|mini` | Bild (nur von veröffentlichten Druckteilen, Entwürfe fürs Druck-Team). Mit `groesse`: Vorschaubild (JPEG, 1080 bzw. 360 px), gleiche Rechte; fehlt es, rechnet der Server es sofort (höchstens 15 s warten), sonst/bei Fehler kommt das Original mit `Cache-Control: no-store`. Unbekannte Größe → 400. Alter Name mit anderer Endung (nach Verkleinern PNG → JPG) wird über die ID gefunden. |
| GET | `/api/files/videos/:file` | Video MP4/WebM (Sichtbarkeit wie Bilder, Range-Anfragen möglich) |
| POST | `/api/orders` | Body `OrderInput` `{ itemId, quantity, colors: { [Farbbereich-ID]: Filament-ID }, size, requesterEmail, classOrTeam, customization, personalization: { [Feld-ID]: Text } }` → 201 `OrderReceipt` `{ id, number, itemName }`. Ältere Clients dürfen statt `colors` noch `color` (Filament-ID) senden – gilt bei genau einem Farbbereich. Fehlerfelder `color.<Bereich-ID>` bzw. `custom.<Feld-ID>`. Ohne Anmeldung muss die E-Mail zu `orderForm.allowedEmailDomains` passen (leer = alle). Angemeldet (Lehrkraft oder Konto) gilt immer die eigene Adresse der Sitzung – eine andere `requesterEmail` im Body wird still ersetzt (keine Domänenprüfung), die Anfrage erscheint so sicher unter „Meine Anfragen“. Löst Mail-Benachrichtigung aus. Optional `repeatOf` (ID einer eigenen früheren Anfrage, „Erneut anfragen“) wird als `wiederholt_von` gespeichert, bei fremden/unbekannten IDs still ignoriert. Mehrere Farben: optional `variants: [{ quantity, colors }]` (1–10) – dann `quantity` = Summe (≤ 20, sonst 400 mit Feld `quantity`), erste Variante = bisherige Farbe, Aufteilung in `colorVariants`; Fehlerfelder ab der 2. Variante `variants.<n>.color…`. |
| POST | `/api/orders/track` | nur wenn `features.requesterTracking`, sonst 404 |

### Angemeldete Lehrkraft (`orders:own`)

| Methode | Pfad | Hinweis |
| --- | --- | --- |
| GET | `/api/orders/mine` | `OwnOrder[]` (eigene Anfragen, neueste zuerst, mit `itemImages`/`itemCategory` für die Kartenansicht). `status`, `history`, `trackingCode` nur bei `features.requesterTracking`. `editable` (vom Server): noch änderbar, solange der Status `offen` ist. |
| PUT | `/api/orders/:id` | Eigene Anfrage ändern, solange `offen` (= vom Team noch nicht angesehen). Gleiches Schema/gleiche Prüfung wie POST, `itemId` muss gleich bleiben (sonst 400), E-Mail und Nummer bleiben. Fremd/unbekannt → 404, anderer Status → 409 („Die Anfrage wird schon bearbeitet …“). Verlaufseintrag „Von der Lehrkraft geändert“ (Status bleibt), Mail „Geänderte Anfrage“ ans Team. → `OwnOrder`. |
| GET | `/api/orders/:id/vorlage` | (`orders:own`, nur die eigene Anfrage, sonst 404) Vorbelegung zum erneuten Anfragen und Bearbeiten `RequestTemplate`: `{ orderId, number, itemId, itemName, available, quantity, colors, variants?, size, classOrTeam, customization, personalization, hinweise[] }`. Geprüft gegen den aktuellen Stand des Druckteils: nicht mehr veröffentlicht → `available:false`; leere/nicht mehr erlaubte Farben, Größen, Auswahlwerte bleiben weg und stehen in `hinweise`. |

### Vorschläge (Welle 2)

Lehrkräfte schlagen Druckteile vor, die es im Katalog nicht gibt. Tabelle `vorschlag` (Migration `002_vorschlag.sql`),
Nummer `VOR-JJJJ-NNNN`, Fotos als `datei` (`objekttyp vorschlag`, `rolle foto`, max. 5 Bilder, gleiche Prüfung wie
Artikelbilder). Status: `neu`, `in_pruefung`, `umgesetzt`, `abgelehnt`. Rechte: `vorschlaege:eigene` (Lehrkraft),
`vorschlaege:sehen` · `vorschlaege:bearbeiten` (braucht „sehen“) · `vorschlaege:umwandeln` (braucht „bearbeiten“ und
zusätzlich `catalog:manage`) für Admin/Druck-Team, je Konto abschaltbar.

| Methode | Pfad | Hinweis |
| --- | --- | --- |
| POST | `/api/proposals` | (`vorschlaege:eigene`) Multipart: Feld `data` = JSON `{ title (3–100), description (10–3000), usage, links[] (max. 5, nur http/https), quantity (1–100), urgency: normal/bald/dringend }`, Dateien `photos` (max. 5, je 5 MB). 201 `OwnProposal`. Rate-Limit 15/h je IP. Löst Mail an die Empfänger aus `mail.json` aus (Links nur als Text). |
| GET | `/api/proposals/mine` | (`vorschlaege:eigene`) `OwnProposal[]` – ohne interne Felder (E-Mail, Artikel-ID) |
| GET | `/api/proposals?status=&q=` | (`vorschlaege:sehen`) `Proposal[]` |
| GET | `/api/proposals/:id` | (`vorschlaege:sehen`) |
| PATCH | `/api/proposals/:id` | (`vorschlaege:bearbeiten`) `{ status, reply }`; „abgelehnt“ braucht eine Antwort |
| POST | `/api/proposals/:id/convert` | (`vorschlaege:umwandeln` + `catalog:manage`) legt einen **unveröffentlichten** Artikel-Entwurf an (Titel, Beschreibung, Fotos als Artikelbilder mit neuen IDs/Dateien kopiert; Platzhalter für Pflichtfelder), setzt Status `umgesetzt`, verknüpft `umgesetzt_artikel_id`. 201 `{ proposal, itemId }`; 409 wenn schon umgewandelt. |
| GET | `/api/proposals/:id/photos/:file` | Foto – nur die einreichende Lehrkraft und `vorschlaege:sehen` |

Oberfläche: `/vorschlag/neu` (Formular), `/vorschlaege` (Meine Vorschläge), `/verwaltung/vorschlaege` (Team).

### Druck-Team & Administration

Recht je Zeile in Klammern (Standard: Admin und Druck-Team; je Druck-Team-Konto abschaltbar).

| Methode | Pfad | Hinweis |
| --- | --- | --- |
| GET | `/api/items?all=1` | inkl. Entwürfe (`catalog:view`) |
| POST/PUT/DELETE | `/api/items[/:id]` | (`catalog:manage`) Body `ItemInput`; `category`, `material`, `useAreas` = Namen aus Stammdaten; `colorAreas` = `[{ id, name, colors: Filament-IDs }]` (mind. 1; `Item.colors` = alle Farben aller Bereiche, abgeleitet; älteres `colors` wird als ein Bereich „Farbe“ angenommen); `price` (freier Text, max. 80); `customFields` = `[{ id, label, type: text/number/select, required, maxLength ≤ 200, hint, options }]` (max. 10). Leere IDs vergibt der Server, vorhandene bleiben erhalten. |
| PATCH | `/api/items/:id/publish` | `{ published }` |
| POST/DELETE | `/api/items/:id/images`, `/api/items/:id/models` | Multipart-Feld `files` |
| POST | `/api/items/:id/videos` | Multipart: `file` (MP4/WebM, max. 50 MB, Inhalt per Magic Bytes geprüft) + `title`; max. 4 Videos je Druckteil. Recht `catalog:manage`. Ablage unter `<ablage>/artikel/<id>/video/`, gespeichert über `FileStore`. |
| POST | `/api/items/:id/videos/link` | `{ title, url }` (nur `http(s)://`) |
| DELETE | `/api/items/:id/videos/:videoId` | entfernt Video (und Datei) |
| GET | `/api/orders?status=&q=` | (`orders:view`) `Order[]` (enthält `requesterEmail`, `color` (Label; mehrfarbig „Bereich: Farbe; …“), `colorId`/`colorHex` (erster Bereich), `colorChoices` (je Bereich), `personalization` `[{ fieldId, label, value }]`) |
| PATCH | `/api/orders/:id/status` | (`orders:manage`) `{ status: OrderStatusDef.id, comment }` – nur eingeschaltete Status (Kommentar zum aktuellen geht immer) |
| GET | `/api/orders/requesters` | (`orders:view`) `Requester[]` mit `orderCount` |
| GET | `/api/dashboard` | (`dashboard:view`) `DashboardData` (Zahlen je Phase open/active/done und `byStatus`) |
| PATCH | `/api/filaments/:id/availability` | (`filaments:manage`) `{ available }` → `MasterData` |

### Nur Administration (`settings:manage`)

| Methode | Pfad | Body / Antwort |
| --- | --- | --- |
| PUT/GET/POST | `/api/admin/settings/masterdata/…`, `/bambu-palette` | Stammdaten: Recht `masterdata:manage` (Admin; Häkchen „Stammdaten pflegen“ fürs Druck-Team). Der Ablauf der Anfragen (`/order-statuses/:id`) gehört zu `settings:manage`. |
| GET | `/api/admin/settings` | `AdminSettings` (Passwort nie enthalten, nur `passwordSet`) |
| PUT | `/api/admin/settings/masterdata/:list` | `list` ∈ `categories, useAreas, materials, filaments`; Body `{ entries: [...] }` (komplette Liste; neue Einträge ohne `id`; bei Farbrollen bleibt `available` erhalten, wenn es fehlt). Antwort: `MasterData`. 400 bei ungültigen Einträgen mit Meldung je Zeile (z. B. „Zeile 8: Name fehlt.“) und `fields` je Zeilenindex ab 0 (`{ "7": "Name fehlt" }`, die Oberfläche markiert die Zeile). 409, wenn ein entfernter Eintrag noch verwendet wird. Umbenennungen werden in Druckteilen nachgezogen. |
| GET | `/api/admin/settings/bambu-palette` | `BambuKatalogAntwort` = `{ quelle, stand, eintraege, hinweis }` (mitgelieferter Bambu-Lab-Katalog mit Nummer und Originalname, dazu der Hinweis nach dem letzten Abgleich) |
| DELETE | `/api/admin/settings/bambu-palette/hinweis` | Hinweis zum Abgleich ausblenden (204) |
| POST | `/api/items/farbe-zuordnen` | (`catalog:manage`) `{ filamentId, ziele: [{ itemId, bereiche }] }` → `{ druckteile, bereiche }`; fügt eine Farbrolle vielen Druckteilen in einer Transaktion hinzu, „Alle Farben“-Bereiche bleiben unberührt |
| PATCH | `/api/admin/settings/order-statuses/:id` | `{ active }` → `MasterData`. 400 für „offen“ bzw. den letzten eingeschalteten erledigt-Status. |
| POST | `/api/admin/settings/masterdata/filaments/import` | `{ ids: string[] }` (Katalog-IDs) → `{ masterData, added }` (bereits vorhandene werden übersprungen) |
| PUT | `/api/admin/settings/mail` | `{ enabled, host, port, secure, user, password?, from, notifyTo, appUrl }` (leeres Passwort = unverändert) → `AdminSettings` |
| POST | `/api/admin/settings/mail/test` | `{ to? }` → `{ ok, message }` oder 502 |
| PUT | `/api/admin/settings/orderform` | `{ allowedEmailDomains: string[] }` → `AdminSettings` |
| PUT | `/api/admin/settings/features` | `{ requesterTracking }` → `AdminSettings` |
| GET | `/api/personen` | (`users:manage`) `Person[]` – Lehrkräfte und Konten zusammengeführt über die E-Mail (Rolle, Häkchen, Passwort-Stand, Anfragen) |
| PUT | `/api/personen` | `{ email, name?, role, bereiche: Bereich[] }` → `{ person, passwortLink }`. Legt die Person bei Bedarf an. Mehr als Lehrkraft-Rechte ohne Passwort → Mail „Passwort festlegen“ (`passwortLink.gesendet`), sonst `token` zum Weitergeben. 400: sich selbst die Adminrolle entziehen. |
| POST | `/api/personen/passwort-link` | `{ email }` → `PasswortLinkErgebnis` („Passwort zurücksetzen“ bzw. „Link erneut senden“; 404 bei Lehrkräften) |

### Passwort (ohne Anmeldung)

| Methode | Pfad | Body / Antwort |
| --- | --- | --- |
| POST | `/api/auth/passwort-vergessen` | `{ email }` → immer `{ ok: true }`; Mail nur, wenn es ein Konto gibt (Link 24 h) |
| POST | `/api/auth/passwort-link` | `{ token }` → `{ email, name, zweck }` oder 404 (ungültig/benutzt/abgelaufen) |
| POST | `/api/auth/passwort-setzen` | `{ token, password }` (mind. 8 Zeichen) → wie Login; hebt die Sperre auf, beendet alle anderen Sitzungen |

### Druckteile exportieren und einspielen (Administration und Druck-Team)

Der **eine** Weg, Druckteile weiterzugeben (Laien-Anleitung: [ANLEITUNG-DRUCKTEILE-UND-SICHERUNG.md](ANLEITUNG-DRUCKTEILE-UND-SICHERUNG.md)).
Oberfläche: Verwaltung → Druckteile verwalten (`ItemsAdminPage` + `DruckteileAustausch.tsx`): Druckteile anhaken → „Exportieren“,
„Einspielen …“ → Datei → Vorschau → „überspringen“/„ersetzen“ → Ergebnis. System-Sicherungen gibt es in der App nicht (Server-Manager).
Rechte `daten:export` (braucht `catalog:view`) und `daten:import` (braucht `catalog:manage`), Standard Admin + Druck-Team, je Team-Konto abschaltbar.
Code: `module/datenaustausch/` – `datenaustausch.export.ts` (Format, Strom), `datenaustausch.zip.ts` (ZIP schreiben/lesen, Sicherheitsregeln; `yazl`/`yauzl`, reines JavaScript), `datenaustausch.paket.ts` (Lesen, Prüfen), `datenaustausch.service.ts` (Vorschau, Einspielen), `datenaustausch.abgleich.ts` (Bezüge ergänzen), `datenaustausch.aehnliche.ts` (ähnliche Druckteile), `datenaustausch.routes.ts`.

**Datei (seit 1.7.0, Format 2)** `mosaik3lab-druckteile-JJJJ-MM-TT.zip` bzw. `mosaik3lab-druckteil-<Nummer>.zip`: ZIP mit `paket.json` (dasselbe Objekt wie
Zeile 1 des alten Formats, `version: 2`, je Datei zusätzlich `pfad`, je Druckteil `aehnliche: [{ id, name, nummer }]`) und den Dateien als echte
Binärdateien in `bilder/`, `druckdateien/`, `videos/` (Name `<Datei-ID>.<Endung>`). JPG/PNG/WebP/MP4/WebM/3MF unkomprimiert, JSON/STL/PDF mit Deflate;
rund ein Viertel kleiner als Base64 (Messung: 48 echte Bilder, 132,6 → 99,5 MB). Erkannt wird das Format an den ersten Bytes (`PK\x03\x04`), nicht am Namen.
Import-Regeln für ZIP: nur `paket.json` und genau die beschriebenen Pfade (kein `..`, nicht absolut, Ordner passend zur Rolle), keine doppelten oder
verschlüsselten Einträge, höchstens 20.000 Einträge, `paket.json` ≤ 64 MB, Summe entpackt < 4 GB, je Datei Größe aus dem Inhaltsverzeichnis =
angegebene Größe ≤ Upload-Grenze **vor** dem Entpacken (Zip-Bombe; yauzl prüft beim Entpacken, dass sie stimmt), dann SHA-256 und Magic Bytes.
Installationen bis 1.6.x melden bei einer ZIP „Das ist keine Export-Datei von Mosaik³LAB“ – die App weist beim Export auf 1.7.0 hin.
**Ähnliche Druckteile** (Format 2): nur hinzufügen, in beiden Modi; Partner über Zuordnung in der Datei, gleiche ID oder `artikel.herkunft_id`, sonst
vorgemerkt in `artikel_aehnlich_offen` und bei jedem späteren Import aufgelöst. Sie zählen nicht in den Vergleich „gleich/ersetzt“.

**Datei bis 1.6.x (Format 1, wird weiter gelesen)** `….json`: als Ganzes gültiges JSON, zeilenweise aufgebaut –
Zeile 1 = Kopf (`format, version, exportiertAm, appVersion, schemaVersion, mitDateien: true, auswahl: true, hinweise`) + `stammdaten` (nur die
Kategorien, Einsatzbereiche, Materialien und Farbrollen, auf die die Druckteile verweisen; `statusarten: []`) + `artikel` (alle Angaben, Farbbereiche,
Personalisierungsfelder, Preis, Videolinks, `dateien`: Rolle, Originalname, MIME, Größe, SHA-256), danach je Zeile eine Datei `{"id","daten":"<Base64>"}`
in `dateiinhalte`. Nie enthalten: Anfragen, Lehrkräfte, Konten/Passwörter, Einstellungen. Es wird nie mehr als eine Datei (beim Export ein ~0,8-MB-Block)
im Speicher gehalten; beim Import liegt die hochgeladene Datei auf der Platte (`<STORAGE_DIR>/import-tmp`).
**Ältere Exporte** (vor 2026-11-02: ohne `auswahl`, mit allen Stammdaten und Anfragestatus, evtl. `mitDateien: false`) werden genauso gelesen; nicht
gebrauchte Stammdaten und die Anfragestatus werden ignoriert, ohne Dateien bleiben vorhandene Dateien unberührt.

| Methode | Pfad | Hinweis |
| --- | --- | --- |
| GET | `/api/admin/daten/export[?artikel=id1,id2]` | Download als Strom (`Content-Disposition: attachment`). Ohne `artikel` = alle Druckteile; mit Liste max. 200 IDs, unbekannte ID → 404, keine Druckteile → 404. |
| POST | `/api/admin/daten/import/vorschau` | Multipart `datei` (Limit `IMPORT_MAX_MB`, Standard 1024 MB). Prüft Format/Version, **jede Datei** (Größe, SHA-256, Typ/Magic Bytes, gleiche Regeln wie Uploads) – eine Abweichung lehnt die ganze Datei ab (400, deutsche Meldung). Antwort: `importId` (30 min gültig), `kopf` (`artikel`, `vorhanden`, `dateien`, `hinweise` …), `berichte.ueberspringen` / `berichte.ersetzen` (je Bereich neu/ersetzt/gleich/übersprungen + Einzelheiten). Ändert nichts (Durchrechnen in zurückgerollter Transaktion). Rate-Limit 30/h. |
| POST | `/api/admin/daten/import/ausfuehren` | `{ importId, modus?: 'ueberspringen' (Standard) \| 'ersetzen' }`. Ablauf: DB-Sicherung (`<daten>/sicherungen/mosaik3lab-vor-import-<zeit>.db`) → Dateien erneut prüfen und in `<ablage>/.import-tmp/<id>/` schreiben → eine Transaktion: Datenbank ändern und Dateien an ihren Platz verschieben → erst danach ersetzte Dateien löschen. Fehler = alles zurück (DB zurückgerollt, verschobene Dateien/Ordner entfernt). Antwort `{ bericht, sicherung }`. |
| DELETE | `/api/admin/daten/import/:id` | Vorschau verwerfen (löscht die hochgeladene Datei) |

**Zuordnung:** Ein Druckteil „gibt es schon“ bei gleicher ID (Datei stammt von hier) oder – Datei von einer anderen Installation – wenn **genau ein**
Druckteil gleichen Namens existiert (Groß/Klein egal). Vorhandene werden je nach Wahl übersprungen oder **ersetzt** (Texte, Farben, Bilder, Videos,
Druckdateien aus der Datei; ID, Nummer und Anfragen bleiben; identischer Stand = „gleich“). Neue behalten ihre Nummer, wenn sie frei ist, sonst gibt es
eine neue (Hinweis). **Bezüge:** Kategorien, Einsatzbereiche, Materialien über den Namen, Farbrollen über die Katalog-ID bzw. Bambu-Nummer (dann mit den Daten des eigenen Katalogs), sonst Marke+Linie+Farbe+Hex oder die ID; was fehlt,
wird angelegt (aus der Datei, sonst mit Standardfarbe/-symbol), Vorhandenes wird nie geändert oder gelöscht. Farben, die in der Datei fehlen, werden
weggelassen (Hinweis); Druckteile mit ungültigen Angaben werden mit Grund übersprungen. Das frühere „Ersetzen“ des ganzen Katalogs gibt es nicht mehr.

## Erweiterbarkeit („später mehr“)

- Weitere Status: in `STATUS_CATALOG` (`shared/src/anfragen.ts`) ergänzen, dazu ein Symbol in `client/src/lib/constants.ts` (sonst Symbol der Phase).
- Statusanzeige für Lehrkräfte: `features.requesterTracking` einschalten (Backend + `MyOrdersPage` vorhanden).
- Datenbank: neue Tabelle/Spalte = neue Migration `server/src/storage/sqlite/migrations/NNN_name.sql` + Abbildung im
  Repository des Bereichs (`module/<bereich>/<bereich>.repository.ts`). Neue Dateiart: Objekttyp/Rolle in `kern/objekttypen.ts` (+ CHECK per Migration).
