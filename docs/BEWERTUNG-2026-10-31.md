# Mosaik³LAB – Gesamtbewertung (Stand `main` @ 9e12921, 31.10.2026)

Unabhängige Prüfung, nur lesend. Grundlage: Code in `server/`, `client/`, `manager/`, dazu `CLAUDE.md`, `README.md`,
`docs/ARCHITEKTUR.md`, `docs/DATENMODELL.md`, `docs/BACKLOG.md`, `manager/README.md`.
Ausgeführt: `node scripts/check.mjs` → ✔ typecheck (15,6 s), ✔ test (34,4 s); `node --test "manager/test/*.mjs"` → 25/25 grün (48 s).

## Kurzfazit

1. Für einen Prototyp ist das Projekt ungewöhnlich sorgfältig: Rechte werden in jeder Backend-Route geprüft, Uploads per Magic Bytes kontrolliert, SQLite mit Migrationen, Transaktionen und Sicherung vor jedem Schemawechsel, dazu ein Server-Manager mit Watchdog, geprüften Backups und Update-Rollback inklusive Datenbank.
2. Für das erklärte Ziel „HTTPS im Schulnetz, plug & play“ ist es **noch nicht einsatzreif**: Es gibt kein HTTPS, Lehrkräfte melden sich ohne jeden Nachweis nur mit einer E-Mail-Adresse an, und eine frische Produktivinstallation hat **keinen Weg, das erste Admin-Konto anzulegen** (nur über Demo-Konten mit öffentlich dokumentierten Passwörtern).
3. Im Manager gibt es zwei echte Datenfehler: Beim Wechsel des Datenordners und bei der Einrichtung mit vorhandenen Daten wird die SQLite-Datenbank **nicht** mitkopiert (stattdessen ggf. veraltete JSON-Altdaten neu übernommen).
4. Struktur und Benennung sind übersichtlich, die Fachlogik sitzt aber in den Routen (keine echte Domain-Schicht), mehrere Dateien sind mit 800–1.600 Zeilen zu groß, und die Repositories laden bei jedem Einzelzugriff ganze Tabellen – das wird auf einem Raspberry Pi mit wachsendem Datenbestand spürbar.
5. Backend-Tests sind breit und aussagekräftig, das Frontend ist dagegen völlig ungetestet, es gibt kein CI und keinen Linter; die Barrierefreiheit ist aus Code-Sicht gut, mit kleinen Kontrast- und Ansagelücken.

## Notentabelle

| # | Bereich | Note | Begründung in einem Satz |
|---|---|:-:|---|
| 1 | Struktur & Übersichtlichkeit | **3** | Klare Ordner und einheitlicher UI-Baukasten, aber Fachlogik in Routen, mehrere Riesendateien, doppelte Typen Client/Server, gemischte Deutsch/Englisch-Benennung. |
| 2 | Datenmodell & Datenhaltung | **2** | Saubere Tabellen mit IDs, FKs, Migrationen mit Vorab-Sicherung und Transaktionen; Abzüge für Voll-Tabellen-Ladevorgänge, unbegrenzte Migrationssicherungen und teure CHECK-Erweiterungen. |
| 3 | Sicherheit | **4** | Solide Grundlagen (CSRF-Header, SameSite=Strict, bcrypt, Rate-Limits, Pfadprüfung), aber passwortlose Lehrkraft-Anmeldung, kein HTTPS, kein sicherer Erst-Admin, Netzfreigabe über reines HTTP. |
| 4 | Zuverlässigkeit & Betrieb | **3** | Watchdog, geprüfte Backups, Rollback inkl. DB sind stark; Datenordner-Wechsel/Einrichtung verlieren die DB, Backups nur lokal und als Vollkopie, verpasste Nachtsicherungen, Linux ungetestet, `tsx` im Produktivbetrieb. |
| 5 | Zukunftsfähigkeit | **3** | Rechte/Status/Objekttypen zentral definiert, Repository-Interfaces vorhanden; HTTPS, andere DB und i18n wären jeweils großer Umbau. |
| 6 | Tests | **3** | ~150 API-Tests + Storage + Export/Import + 25 Manager-Tests (inkl. Rollback) – aber 0 Frontend-Tests, kein CI, kein Lint, eigener Test-Runner in einer 1.582-Zeilen-Datei, kritische Betriebspfade ungetestet. |
| 7 | Barrierefreiheit (Code) | **2** | Skip-Link, Landmarks, natives `<dialog>`, sichtbarer Fokus, Labels über `Field`, 44-px-Ziele, `prefers-reduced-motion`; kleine Kontrastfehler, Fehlermeldungen werden nicht angesagt. |
| 8 | Wachstumsfähigkeit der Struktur (Zusatzauftrag) | **3–4** | Heute noch beherrschbar, aber jede neue Funktion berührt 6–10 zentrale Dateien in Client und Server; ohne Umbau zu Funktions-Modulen wird jede Erweiterung teurer (siehe Abschnitt „Zielstruktur für Wachstum“). |

Aufwand: **S** ≤ ½ Tag · **M** 1–3 Tage · **L** > 3 Tage.

---

## Kritisch (vor einem Einsatz im Schulnetz beheben)

### K1 – Lehrkraft-Anmeldung ohne jeden Nachweis
- **Datei:** `server/src/routes/auth.ts:71-84` (identify startet Session nur anhand der E-Mail), `server/src/routes/orders.ts:112` (jede anonyme Anfrage legt eine beliebige Domain-Adresse als Lehrkraft an), `server/src/routes/auth.ts:88-104` (register).
- **Problem:** Wer eine Lehrkraft-Adresse kennt oder rät (Schema `vorname.nachname@schule`), ist sofort als diese Lehrkraft angemeldet und sieht deren Anfragen inkl. Klasse, Bemerkung und Personalisierungsfeldern (die Namen von Kindern enthalten können) sowie Vorschläge mit Fotos. Über `POST /api/orders` kann jeder anonym neue „Lehrkräfte“ anlegen und sich danach als diese anmelden. Die README (Z. 203-206) nennt das Risiko selbst, Abhilfe fehlt. `identify` verrät außerdem, ob zu einer Adresse ein Admin-/Team-Konto existiert (`result: 'password'`).
- **Vorschlag:** Einmal-Link/Code per Mail (Mailversand ist vorhanden): `identify` → Token (Hash in DB, 15 min gültig, einmalig) → `GET /api/auth/link/:token` startet Session. Bis dahin Lehrkraft-Anmeldung per Schalter abschaltbar machen. `identify` für Konten und Unbekannte gleich antworten lassen.
- **Aufwand:** M

### K2 – Kein HTTPS, Netzfreigabe über reines HTTP
- **Datei:** `server/src/app.ts:63-69` (`secure: false` fest), kein `app.set('trust proxy', …)`; `manager/lib/services.mjs:16` (`network` → `0.0.0.0` über HTTP); `server/src/index.ts:6-11` warnt nur.
- **Problem:** Der Manager bietet „Im Netzwerk freigeben“ per Knopf an – dann laufen Admin-Passwörter und dauerhafte 30-Tage-Session-Cookies im Klartext durchs Schulnetz. HTTPS steht nur im Backlog.
- **Vorschlag:** Entweder eingebauter TLS-Modus (`https.createServer` mit Zertifikat/Schlüssel aus `<daten>/config/tls/`, Pfade im Manager, Port 443 bzw. 8443, HTTP→HTTPS-Weiterleitung) **oder** dokumentierter Reverse-Proxy (Caddy) mit `TRUST_PROXY`-Variable; dann `cookie.secure = 'auto'`/`true`, HSTS. Netzfreigabe im Manager erst erlauben, wenn TLS aktiv ist.
- **Aufwand:** L

### K3 – Frische Produktivinstallation hat kein Admin-Konto
- **Datei:** `server/src/seed/seed.ts:15-45` (legt nur Demo-Konten an), `server/src/config.ts:87-88`, `manager/runners/webapp.mjs:33` (`SEED_DEMO_DATA`/`DISABLE_DEMO_ACCOUNTS` = Gegenteil von `demoAccounts`), `manager/lib/setup.mjs` (kein Schritt „erstes Konto“).
- **Problem:** Mit Standard-Einstellungen (`demoAccounts: false`) startet die App mit leerer Benutzertabelle – niemand kann sich anmelden. Der einzige Weg ist, Demo-Konten einzuschalten, deren Passwörter im README stehen (`README.md:107-108`), also genau das, was im Netz verboten sein sollte. Nicht plug & play und ein Sicherheitsloch während der Einrichtung.
- **Vorschlag:** Im Einrichtungsdialog des Managers Admin-E-Mail + Passwort abfragen und über ein App-Skript `npm run --silent user:create-admin -w server -- --email … ` (Passwort über stdin) anlegen; zusätzlich `doctor`-Warnung „kein aktiver Admin“. Demo-Konten in Installationen gar nicht anbieten.
- **Aufwand:** M

### K4 – Datenordner-Wechsel kopiert die Datenbank nicht
- **Datei:** `manager/server.mjs:72-77`
- **Problem:** Beim Ändern des Datenordners werden nur `data/` und `uploads/` kopiert, nicht `mosaik3lab.db`, `config/` (mail.json) und – im Entwicklungsmodus – `ablage/`. Die App startet danach im neuen Ordner mit **leerer Datenbank** (bzw. übernimmt veraltete JSON-Altdaten aus `data/` erneut, siehe `server/src/storage/sqlite/importJson.ts:80-98`). Die Daten sind nicht verloren, wirken aber verloren; neue Eingaben landen in einem abweichenden Bestand. Kein Test deckt diesen Pfad ab.
- **Vorschlag:** DB über `db:backup` (VACUUM INTO) in den neuen Ordner schreiben, `config/` mitkopieren, danach Schema-Version und Datensatzanzahl vergleichen; Test in `manager/test/manager.test.mjs` ergänzen.
- **Aufwand:** S

### K5 – Einrichtung übernimmt vorhandene Daten ohne Datenbank
- **Datei:** `manager/lib/setup.mjs:205-213`
- **Problem:** Gleicher Fehler bei der Erst-Einrichtung (`copyData`): Kopiert werden `data`, `uploads`, `config` – nicht `mosaik3lab.db` und nicht `ablage/`. Ergebnis: Die installierte App importiert die **veralteten** JSON-Dateien aus der Zeit vor SQLite oder startet leer. Bestehende Anfragen, Vorschläge, Artikel seit der Umstellung fehlen.
- **Vorschlag:** Wie K4: DB konsistent sichern und kopieren, `ablage/` in den Installations-Ablageordner kopieren, Prüfsummen/Anzahlen vergleichen, Ergebnis im Einrichtungsbericht.
- **Aufwand:** S

---

## Wichtig

### W1 – Helmet-CSP `upgrade-insecure-requests` bricht HTTP im LAN (im Browser verifizieren)
- **Datei:** `server/src/app.ts:43`
- **Problem:** `helmet()` setzt standardmäßig die CSP-Direktive `upgrade-insecure-requests`. Wird die App per Netzfreigabe über `http://<IP>:3001` aufgerufen (Manager-Schalter), werten Browser Skripte/Styles auf `https://<IP>:3001` um – dort spricht aber niemand TLS. Sehr wahrscheinlich bleibt die Seite weiß. Auf `localhost` fällt es nicht auf. Ungetestet.
- **Vorschlag:** Direktive nur bei aktivem HTTPS setzen (`contentSecurityPolicy: { directives: { upgradeInsecureRequests: tls ? [] : null } }`), HSTS ebenso. Zusammen mit K2 lösen.
- **Aufwand:** S

### W2 – Passwortwechsel beendet andere Sitzungen nicht
- **Datei:** `server/src/routes/auth.ts:141-150`, `server/src/routes/users.ts:89-99`
- **Problem:** Nach eigenem Passwortwechsel oder Admin-Reset bleiben alle bestehenden 30-Tage-Sessions (rolling) gültig – ein gestohlenes Cookie überlebt den Reset.
- **Vorschlag:** In `sitzung` beim Speichern die `userId` als Spalte mitführen (Migration) und bei Passwortänderung alle Sessions dieses Kontos außer der aktuellen löschen; alternativ `passwortGeaendertAm` in der Session prüfen.
- **Aufwand:** S

### W3 – Repositories laden bei Einzelzugriffen ganze Tabellen, keine Paginierung
- **Datei:** `server/src/storage/sqlite/SqliteRepositories.ts:309` (alle `artikel_farbbereich_filament` ohne Filter), `:570-577` (für **jede** `findById`/`update` einer Anfrage alle Farben, Feldwerte und Verlaufseinträge aller Anfragen), `server/src/routes/orders.ts:235-246`, `server/src/routes/misc.ts:15-19`, `server/src/routes/items.ts:113-126` (Liste + Filter in JS).
- **Problem:** Aufwand jeder Statusänderung wächst linear mit allen Anfragen der Schulgeschichte; die Verwaltungsliste liefert immer alles. Auf einem Raspberry Pi nach einigen Jahren spürbar.
- **Vorschlag:** Kindzeilen mit `WHERE anfrage_id IN (…)` bzw. `= ?` laden, Indizes auf `anfrage_farbe(anfrage_id)`, `anfrage_feldwert(anfrage_id)`, `artikel_farbbereich(artikel_id)` per Migration; `GET /api/orders` mit `limit/offset` und Filter in SQL; Dashboard-Zahlen per `COUNT … GROUP BY`.
- **Aufwand:** M

### W4 – Nachtsicherung fällt aus, wenn der Rechner nachts aus ist; keine Warnung
- **Datei:** `manager/runners/backup.mjs:9-27`, `manager/lib/backup.mjs:202-208`
- **Problem:** Der nächste Termin wird beim Start immer auf den nächsten 02:00-Zeitpunkt gelegt; ein Schul-PC, der nachts ausgeschaltet ist, sichert nie. Fehlschläge stehen nur im Manager, den niemand täglich öffnet.
- **Vorschlag:** Beim Start nachholen, wenn die letzte erfolgreiche Sicherung > 24 h alt ist; bei Fehler oder > 48 h ohne Sicherung Mail an die Empfänger aus `mail.json` und Hinweis in Verwaltung → Einstellungen.
- **Aufwand:** S

### W5 – Backups: Vollkopie, gleiche Platte, Migrationssicherungen wachsen unbegrenzt
- **Datei:** `manager/lib/backup.mjs:131-137` (jedes Mal komplette Ablage inkl. Videos bis 4×50 MB je Teil), Standard-Ziel `C:\Mosaik3LAB\backups` (`manager/lib/config.mjs:208`); `server/src/storage/sqlite/db.ts:90-93` und `server/src/routes/daten.ts:176-179` schreiben nach `<daten>/sicherungen/` ohne Aufräumen.
- **Problem:** 14 Vollkopien auf derselben Platte schützen nicht vor Plattendefekt/Diebstahl/Ransomware und füllen die SD-Karte eines Raspberry Pi schnell; `sicherungen/` wächst still weiter.
- **Vorschlag:** Ablage inkrementell (Hardlinks auf unveränderte Dateien des Vortags oder nur neue Dateien nach SHA-256), zweites Ziel (USB/NAS) mit Prüfung, `sicherungen/` auf die letzten N begrenzen, Warnung bei Ziel auf Systemlaufwerk.
- **Aufwand:** M

### W6 – Windows-Ordnerrechte: Programm- und Datenordner für alle angemeldeten Benutzer änderbar (zu prüfen)
- **Datei:** `manager/platform/windows.mjs:80-83`
- **Problem:** `prepareDirsScript` vergibt nur zusätzliche Rechte (`icacls /grant`), entfernt aber die Vererbung nicht. Unter `C:\` erben neue Ordner standardmäßig „Authentifizierte Benutzer: Ändern“. Dann kann jeder lokale Benutzer Programmcode ändern, den die Dienste (Lokaler Dienst) ausführen, und `mosaik3lab.db` (Sitzungen!) sowie `manager.config.json` (Session-Secret) lesen. `mail.json` wird dagegen gesperrt (`manager/lib/mail.mjs:82-88`) – inkonsistent. Mit `icacls C:\Mosaik3LAB` verifizieren.
- **Vorschlag:** Programmordner: Vererbung aus, nur Administratoren/SYSTEM Vollzugriff, LocalService Lesen; Daten-/Ablage-/Backup-Ordner: Administratoren, SYSTEM, LocalService Ändern – sonst niemand.
- **Aufwand:** S

### W7 – Produktivbetrieb über `tsx` und Build auf dem Zielgerät
- **Datei:** `manager/runners/webapp.mjs:26-31, 40`, `manager/lib/setup.mjs:217-232`, `manager/lib/update.mjs:191-195`
- **Problem:** Der Server läuft per TypeScript-Transpiler zur Laufzeit; `npm ci` (inkl. devDependencies) und der Vite-Build mit nativen Binärpaketen (esbuild, rollup, lightningcss/oxide) laufen bei Einrichtung **und jedem Update** auf dem Zielrechner – braucht Internet, RAM und Zeit (Raspberry Pi), und das mit Windows erzeugte `package-lock.json` kann plattformspezifische optionale Pakete für Linux auslassen (bekanntes npm-Problem). Steht im Backlog.
- **Vorschlag:** Release-Artefakt bauen (Server mit `tsc`/esbuild nach `server/dist`, Client `dist`), nur `npm ci --omit=dev` auf dem Ziel; Updates als fertiges Paket.
- **Aufwand:** M

### W8 – Linux/Raspberry-Pi-Pfad ungetestet
- **Datei:** `manager/platform/linux.mjs:1-2` („UNGETESTET“), `manager/platform/linux.mjs:121-125` (`curl … | bash` für Node)
- **Problem:** Das Betriebsziel „später Raspberry Pi“ ist nur behauptet; Dienste, polkit-Regel, Firewall, Rechte und Updates wurden nie ausgeführt.
- **Vorschlag:** Einmal auf Raspberry Pi OS 64 Bit durchspielen (Einrichtung, Update, Rollback, Backup/Restore), Selbsttest `manager/test/selftest.mjs` dort laufen lassen, Ergebnis dokumentieren; Node-Installation per signiertem apt-Repo statt Pipe-to-Shell.
- **Aufwand:** M

### W9 – Fachlogik in den Routen, Querverweise zwischen Schichten
- **Datei:** `server/src/routes/orders.ts:21-57` (Farb-/Personalisierungsprüfung), `server/src/routes/items.ts:62-93`, `server/src/routes/settings.ts:84-144` (Umbenennen/Kaskade), `server/src/seed/seed.ts:6` und `server/src/routes/misc.ts:9` importieren aus `routes/orders.ts`.
- **Problem:** Die dokumentierte Schichtung „Routen → Domain → Repositories“ existiert nur halb: `domain/` enthält Typen und Konstanten, die Geschäftsregeln stehen in Express-Handlern und sind nur über HTTP testbar; Seed hängt von einer Route ab.
- **Vorschlag:** `services/anfragen.ts`, `services/katalog.ts`, `services/stammdaten.ts` mit reinen Funktionen (Eingabe → Ergebnis/Fehler), Routen nur noch parsen/aufrufen/antworten; `createTrackingCode`/`countByStatus` nach `domain/`.
- **Aufwand:** M

### W10 – Zu große Dateien
- **Datei:** `client/src/features/verwaltung/ItemEditPage.tsx` (1.175 Z.), `client/src/features/einstellungen/MasterDataPage.tsx` (926), `server/src/storage/sqlite/SqliteRepositories.ts` (828), `server/src/services/stammdatenImport.ts` (667), `server/scripts/smoke-test.ts` (1.582)
- **Problem:** Schwer zu überblicken, Konfliktgefahr bei der im `CLAUDE.md` beschriebenen Parallelarbeit, Tests nicht einzeln ausführbar.
- **Vorschlag:** ItemEditPage je Abschnitt (Stammangaben, Farben, Felder, Medien, Druckdateien) in eigene Komponenten; Repositories je Entität eine Datei; Smoke-Test nach Bereich aufteilen und auf `node:test` umstellen.
- **Aufwand:** M

### W11 – API-Typen doppelt gepflegt
- **Datei:** `client/src/lib/types.ts:6-23` (Rechte-Liste von Hand), gesamte Datei (357 Z.) vs. `server/src/domain/types.ts`, `server/src/domain/permissions.ts:39-181`
- **Problem:** Jede Feld- oder Rechteänderung muss in zwei Dateien nachgezogen werden; Abweichungen fallen erst zur Laufzeit auf.
- **Vorschlag:** Gemeinsames Workspace-Paket `shared/` (reine Typen + Rechte-Schlüssel), von Server und Client importiert.
- **Aufwand:** M

### W12 – Kein CI, kein Linter, keine Frontend-Tests
- **Datei:** fehlt (`.github/`, `eslint.config.*` nicht vorhanden); `client/package.json` ohne Testskript
- **Problem:** Prüfung hängt daran, dass jemand `npm run check` aufruft; UI-Regressionen (Formulare, Rechte-abhängige Navigation, Barrierefreiheit) werden nie automatisch erkannt.
- **Vorschlag:** GitHub Actions (oder lokaler Hook) mit typecheck/test/manager:test auf Windows + Linux; ESLint mit `jsx-a11y`; Playwright mit 5–10 Kernabläufen (Katalog → Anfrage, Login Team, Status ändern) plus `@axe-core/playwright`.
- **Aufwand:** M

### W13 – Sicherheitshinweise werden Lehrkräften nicht angezeigt
- **Datei:** `client/src/features/katalog/ItemDetailPage.tsx:174-181`, `docs/ARCHITEKTUR.md:65`
- **Problem:** Hinweise wie „verschluckbare Kleinteile – nur unter Aufsicht“ erreichen genau die Personen nicht, die das Teil bei Kindern mit motorischen Einschränkungen einsetzen. Fachlich und haftungsrechtlich heikel (bewusste Entscheidung, aber riskant). Technisch liefert die API sie ohnehin öffentlich aus.
- **Vorschlag:** Mit der Schulleitung entscheiden; mindestens im Anfrage-Dialog und bei Übergabe anzeigen bzw. im Mail-Text an das Team mitführen.
- **Aufwand:** S

### W14 – Kommandoinjektion in der Testmail des Managers
- **Datei:** `manager/lib/mail.mjs:97` (`--to ${to}` unquotiert in Shell-Befehl), Prüfung `manager/lib/mail.mjs:10` erlaubt `&`, `|`, `;`, `$`, `` ` ``
- **Problem:** Eine Adresse wie `a&calc@x.de` führt unter Windows Befehle aus. Nur für angemeldete lokale Manager-Admins erreichbar (geringes Risiko), aber ein echter Fehler.
- **Vorschlag:** `run()` mit Argumentliste statt `runShell` (npm über `process.execPath` + `npm-cli.js`) oder strengere Adressprüfung (`^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$`) und Quoting.
- **Aufwand:** S

### W15 – Sperrdatei per PID kann nach Neustart fälschlich blockieren
- **Datei:** `server/src/storage/index.ts:93-107`, `manager/lib/backup.mjs:164-171`
- **Problem:** Nach Absturz/Stromausfall bleibt `.lock` mit alter PID liegen; nach einem Neustart kann diese PID zu einem anderen Prozess gehören → App startet nicht („wird bereits verwendet“) bzw. Wiederherstellung wird verweigert. Auf dem Pi mit kleinen PIDs realistisch.
- **Vorschlag:** Zusätzlich Startzeit/Prozessname prüfen oder exklusive Dateisperre bzw. SQLite-`locking_mode=EXCLUSIVE` nutzen.
- **Aufwand:** S

### W16 – Kontraste unter WCAG AA in der Navigation
- **Datei:** `client/src/components/Layout.tsx:122` und `:179` (`text-stone-500` auf `canvas-deep`, 0,8 rem ≈ 4,1:1 < 4,5:1), `:193` (Anmelde-Symbol `text-stone-400` ≈ 2,2:1 < 3:1, 36 px)
- **Problem:** Der einzige sichtbare Zugang zur Anmeldung für Lehrkräfte und Team ist ein blasses, kleines Symbol – schlecht wahrnehmbar und schlecht treffbar für Nutzer mit motorischen oder Seh-Einschränkungen.
- **Vorschlag:** `text-stone-600/700`, Anmeldelink als beschriftete Schaltfläche („Anmelden“) mit ≥ 44 px.
- **Aufwand:** S

---

## Nice-to-have

| # | Datei:Zeile | Problem | Vorschlag | Aufwand |
|---|---|---|---|:-:|
| N1 | `client/src/components/ui.tsx:243-248` | Feldfehler werden nur per `aria-describedby` verknüpft, nicht angesagt; kein Fokus auf erstes fehlerhaftes Feld (nur einzelne Formulare). | Fehler-Zusammenfassung mit `role="alert"` + Fokus auf erstes ungültiges Feld zentral im Formular-Hook. | S |
| N2 | `client/src/components/ui.tsx:319` + `:328` | `Switch` doppelt benannt (`sr-only`-Text und `<label for>`) → Screenreader lesen den Namen zweimal. | Einen der beiden entfernen (`aria-labelledby` auf das Label). | S |
| N3 | `server/src/routes/items.ts:68-70`, `server/src/routes/orders.ts:71` | `canManage` prüft einmal `catalog:view`, einmal `orders:view` – irreführender Name. | `canSeeDrafts`, `isTeamViewer` o. ä. | S |
| N4 | `server/src/routes/items.ts:48`, `server/src/routes/proposals.ts:19-31` | `originalName` und Bild-Upload-Konfiguration doppelt. | In `uploads.ts` bündeln (`photoUpload` = `imageUpload` mit anderem Limit). | S |
| N5 | `server/src/routes/items.ts:186-216` | Dateien werden vor dem Artikel-Update geschrieben; scheitert das Update (Artikel parallel gelöscht), bleiben Waisen (nur bei Videos wird aufgeräumt, Z. 271-274). | Wie bei Videos `try/catch` + `files.delete`. | S |
| N6 | `server/src/routes/orders.ts:151-159` | Abruf per Code (falls eingeschaltet) liefert das komplette interne `Order`-Objekt inkl. Teamnamen im Verlauf. | `toOwnOrder(o, true)` verwenden. | S |
| N7 | `server/src/routes/orders.ts:100-112` | Angemeldete Lehrkraft kann Anfragen unter fremder E-Mail stellen. | Bei `req.requester` E-Mail aus der Session erzwingen. | S |
| N8 | `server/src/services/mailConfig.ts:128-129` | Sicherungskopie `settings.json.vor-mail-umzug-*.bak` enthält das SMTP-Passwort im Klartext mit Standardrechten (und landet in Backups). | Passwortfeld vor dem Sichern entfernen oder Datei wie `mail.json` sperren. | S |
| N9 | `server/src/services/mailer.ts:10-19` | Bei `secure:false` kein `requireTLS` → Zugangsdaten können unverschlüsselt gehen, wenn der Server kein STARTTLS anbietet. | `requireTLS: true` als Standard, abschaltbar im Manager. | S |
| N10 | `manager/server.mjs:98-99` | Einstellungen werden gespeichert, bevor das Passwort geprüft wird → bei falschem altem Passwort Teil-Speicherung. | Passwort zuerst prüfen. | S |
| N11 | `server/src/index.ts:17-18` | Startmeldung zeigt die Alt-Ordner (`data`, `uploads/*`) statt DB- und Ablagepfad. | `dbFile`/`ablageDir` ausgeben. | S |
| N12 | `server/src/app.ts:62` + `auth/sessionStore.ts:38-43` | `rolling: true` schreibt bei jeder Anfrage in die DB (`touch`). | Nur verlängern, wenn Restlaufzeit < z. B. 29 Tage. | S |
| N13 | `client/src/App.tsx:7-23` | Kein Code-Splitting – Lehrkräfte laden die gesamte Verwaltung (u. a. 1.175-Z.-Editor) mit. | `React.lazy` für `/verwaltung/*`. | S |
| N14 | `README.md:137-164` | Ordnerstruktur veraltet (`pages/`, `admin/` statt `features/`), Rechte-Tabelle ohne Vorschläge/Filamente/Export; `npm run backup`-Zielname weicht ab. | README an `docs/ARCHITEKTUR.md` angleichen. | S |
| N15 | `server/src/routes/settings.ts:112-142` | Umbenennungs-Kaskade ist seit SQLite überflüssig (Artikel referenzieren `kategorie_id`), läuft aber weiter über alle Artikel. | Entfernen bzw. nur Nutzungszählung per SQL. | S |
| N16 | gesamt | Gemischte Benennung (`fuehreAus`, `wartend`, `verwerfe` neben `itemRoutes`, `presentItem`). | Festlegen: Code englisch, Oberfläche/DB deutsch – und schrittweise angleichen. | M |

---

## Zukunftsfähigkeit – Aufwand je Änderung (aus dem Code abgeleitet)

| Änderung | Betroffene Stellen | Aufwand |
|---|---|:-:|
| **Neue Rolle** | `Role`/`ACCOUNT_ROLES` in `server/src/domain/types.ts`, `roles` in jeder `PERMISSION_DEFS`-Zeile, `supportsOverrides` (fest `druckteam`, `permissions.ts:194`), **CHECK** `benutzer.rolle` (`001_grundschema.sql:34` → Tabellen-Neuaufbau in SQLite), Client `ROLE_LABELS`, Navigation. | M |
| **Neue Objektart (Dateien)** | `domain/objekttypen.ts` + **CHECK** in `datei` (`001_grundschema.sql:159-161` → Tabellen-Neuaufbau), Repository, Routen, Backup/Export. | M |
| **Neue Einstellung** | `domain/settings.ts` (Default + `withDefaults`), `SETTING_KEYS` (`SqliteRepositories.ts:784`), Zod-Schema, Route in `routes/settings.ts`, Client-Typ + Seite. 5–6 Stellen, aber klar vorgezeichnet. | S–M |
| **Andere Datenbank** | Interfaces sind asynchron (gut), aber `Storage.sqlite` und `FileStore(db)` legen SQLite offen (`repositories.ts:77-88`), Export/Import nutzt rohe SQL-Transaktionen, `update(id, change)` setzt synchrone Transaktionen voraus. | L |
| **HTTPS** | Nichts vorhanden (siehe K2): TLS/Proxy, Cookie, `trust proxy`, CSP/HSTS, Manager-Einstellungen, Firewall-Port, `appBaseUrl`. | L |
| **Mehrsprachigkeit** | Alle Texte fest in ~40 Komponenten und in Server-Fehlermeldungen/Mails, keine i18n-Bibliothek. | L |

## Zielstruktur für Wachstum

Auftrag des Nutzers: „perfekte Struktur, um bei Änderungen nicht das ganze Projekt neu umbauen zu müssen“. Ehrliche
Einordnung vorab: Eine „perfekte“ Struktur gibt es nicht, aber eine, bei der **eine fachliche Änderung in genau einem
Modul passiert**. Davon ist das Projekt heute ein gutes Stück entfernt – die Bausteine (Repository-Interfaces,
zentrale Rechte-Matrix, Migrationen, UI-Baukasten) sind aber vorhanden, ein Umbau ist schrittweise möglich, ohne neu
anzufangen.

### 1. Wo Trennung und Kapselung heute verletzt sind

**Typische Änderung „neues Feld an der Anfrage“ berührt heute ~10 Dateien:** Migration, `server/src/domain/types.ts:167`
(`Order`), `server/src/validation.ts:130` (`orderInputSchema`), `server/src/routes/orders.ts` (Logik + `toOwnOrder` Z. 286),
`server/src/storage/sqlite/SqliteRepositories.ts:566-706` (Lesen + Schreiben, je eine Spaltenliste), `server/src/services/orderMail.ts`,
`server/src/storage/sqlite/importJson.ts`, `client/src/lib/types.ts` (Kopie des Typs), `client/src/features/katalog/RequestDialog.tsx`,
`client/src/features/verwaltung/OrdersAdminPage.tsx`, ggf. `MyOrdersPage.tsx` und Tests in `server/scripts/smoke-test.ts`.

| Verletzung | Beleg (Datei:Zeile) | Folge |
|---|---|---|
| **Typen doppelt, von Hand synchron gehalten** | `client/src/lib/types.ts:6-23` (Rechte-Union), `:256` (`Item.safetyNotes`) ↔ `server/src/domain/types.ts:99-136`, `server/src/domain/permissions.ts:39-181` | Jede Feldänderung zweimal; Abweichung erst zur Laufzeit sichtbar. |
| **Validierung getrennt vom Typ** | `server/src/validation.ts` (alle Schemas aller Bereiche, 273 Z.), daneben `server/src/proposalSchemas.ts` und ein drittes Schema in `server/src/services/stammdatenImport.ts:97` | Drei Stellen beschreiben dasselbe `Item`; zentrale Datei, die jede Funktion anfasst. |
| **Zentrale Registrierungslisten** | `server/src/app.ts:13-20, 81-91` (jede Route von Hand eingehängt), `client/src/App.tsx:7-23, 58-75` (jede Seite), `client/src/components/Layout.tsx:48` (`ADMIN_NAV`), `server/src/domain/permissions.ts:39` (alle Rechte aller Bereiche in einer Liste), `server/src/domain/objekttypen.ts` | Jede neue Funktion ändert dieselben 4–5 Dateien → Merge-Konflikte bei Parallel-Sessions (CLAUDE.md Z. 11-12 muss das deshalb schon heute per Absprache verhindern). |
| **Gleiches Wissen an zwei Orten** | Status: `server/src/domain/orderStatuses.ts` + Symbole/Texte in `client/src/lib/constants.ts` (laut `docs/ARCHITEKTUR.md:234` „beides ergänzen“) | Neue Status brauchen immer zwei Änderungen. |
| **Riesendateien mit mehreren Verantwortungen** | `server/src/storage/sqlite/SqliteRepositories.ts` (828 Z., 6 Repositories), `server/scripts/smoke-test.ts` (1.582 Z., alle Bereiche, gemeinsamer Zustand), `client/src/features/verwaltung/ItemEditPage.tsx` (1.175), `client/src/features/einstellungen/MasterDataPage.tsx` (926), `server/src/services/stammdatenImport.ts` (667) | Jede Änderung am Artikel und an Anfragen trifft dieselbe Datei; Tests nicht einzeln lauffähig. |
| **Fachlogik in HTTP-Handlern** | `server/src/routes/orders.ts:21-57`, `server/src/routes/items.ts:62-93`, `server/src/routes/settings.ts:84-144` | Regeln nur über HTTP testbar, nicht wiederverwendbar (z. B. Import prüft Artikel mit eigenem Code). |
| **Schichten importieren quer** | `server/src/seed/seed.ts:6` und `server/src/routes/misc.ts:9` importieren aus `routes/orders.ts` | Abhängigkeitsrichtung Route → Domain wird umgekehrt. |
| **Speicher-Abstraktion leckt** | `server/src/storage/repositories.ts:77-88` (`Storage.sqlite`, `FileStore` an `Db` gebunden), `server/src/services/stammdatenImport.ts:677, 696` (rohe Transaktion) | „Andere DB“ oder Tests mit In-Memory-Speicher praktisch unmöglich. |
| **API-Pfade als Strings in Seiten verstreut** | 39 direkte `api('/…')`-Aufrufe in 15 Dateien, z. B. `client/src/features/verwaltung/ItemEditPage.tsx` (7×), `client/src/features/katalog/MyOrdersPage.tsx` (5×) | Pfad-/Formänderung erfordert Suche über das ganze Frontend; kein Typbezug zwischen Pfad und Antwort. |
| **Ein Settings-Dokument für alles** | `server/src/domain/settings.ts`, `SqliteRepositories.ts:784` (`SETTING_KEYS`), `routes/settings.ts` | Jede neue Einstellung ändert drei gemeinsame Dateien; Stammdaten-Repository schreibt bei jeder kleinen Änderung alle Listen neu (`:850-881`). |

### 2. Zielstruktur (bewährt: Funktions-Module + gemeinsame Verträge)

Prinzipien:
- **Ein fachlicher Bereich = ein Modul** mit eigenem Router, Service (Regeln), Repository, Rechten, Migrationen, Tests – und dem passenden Frontend-Teil.
- **Verträge einmal**: zod-Schemas in `shared/` sind die einzige Quelle für Typen (`z.infer`) **und** Validierung, genutzt von Server und Client.
- **Registrierung statt zentraler Listen**: Jedes Modul exportiert ein `Modul`-Objekt (Routen, Rechte, Navigation, Einstellungen, Dateiarten). `app.ts`/`App.tsx` iterieren nur noch über `module = [...]`.
- **Abhängigkeitsrichtung fest**: `routes → service → repository → db`; Module sprechen miteinander nur über die öffentliche `index.ts` des anderen Moduls (z. B. `anfragen` fragt `katalog.findeVeroeffentlicht(id)`).

```
mosaik3lab/
├─ shared/                              # Workspace-Paket @mosaik3lab/shared (nur TS, keine Laufzeit-Abhängigkeit außer zod)
│  └─ src/
│     ├─ katalog/   schema.ts           # ItemSchema, ItemInputSchema, ITEM_KINDS → Typen per z.infer
│     ├─ anfragen/  schema.ts  status.ts # OrderSchema, OrderInputSchema, STATUS_KATALOG (Name, Phase, Farbe, Symbol-Schlüssel)
│     ├─ vorschlaege/ schema.ts
│     ├─ konten/    schema.ts  rechte.ts # Rollen, Rechte-Schlüssel je Modul zusammengeführt
│     ├─ stammdaten/ schema.ts
│     ├─ api/       routen.ts            # typisierte Endpunkt-Beschreibung: { method, path, input, output }
│     └─ index.ts
├─ server/src/
│  ├─ kern/                             # technisch, fachfrei
│  │  ├─ app.ts  config.ts  fehler.ts  http.ts  rateLimit.ts  log.ts
│  │  ├─ auth/        middleware.ts  sessionStore.ts  passwort.ts
│  │  ├─ db/          db.ts  migrate.ts  transaction.ts
│  │  ├─ dateien/     fileStore.ts  uploads.ts        # Upload-Prüfung, Ablage
│  │  ├─ mail/        mailer.ts  mailConfig.ts
│  │  └─ modul.ts                        # interface Modul { name, router, rechte, migrationen, einstellungen, dateiarten }
│  ├─ module/
│  │  ├─ katalog/
│  │  │  ├─ index.ts                     # export const katalogModul: Modul + öffentliche Service-Funktionen
│  │  │  ├─ katalog.routes.ts            # nur parsen → Service → antworten
│  │  │  ├─ katalog.service.ts           # Regeln (Stammdaten prüfen, Sichtbarkeit, Farbbereiche)
│  │  │  ├─ katalog.repository.ts        # Interface
│  │  │  ├─ katalog.repository.sqlite.ts # Implementierung (≤ 300 Z.)
│  │  │  ├─ katalog.rechte.ts            # catalog:view, catalog:manage, files:models
│  │  │  ├─ migrationen/ 001_artikel.sql …
│  │  │  └─ test/ katalog.service.test.ts  katalog.api.test.ts
│  │  ├─ anfragen/      (gleicher Aufbau, inkl. anfrage.mail.ts)
│  │  ├─ vorschlaege/
│  │  ├─ stammdaten/    (Kategorien, Materialien, Filamente, Statusschalter)
│  │  ├─ konten/        (Benutzer, Lehrkräfte, Anmeldung)
│  │  ├─ einstellungen/ (Registry: Module melden ihre Einstellungen an)
│  │  └─ datenaustausch/ (Export/Import, nutzt nur öffentliche Service-Funktionen der anderen Module)
│  ├─ module.ts                          # export const MODULE = [katalogModul, anfragenModul, …]  ← einzige Liste
│  └─ index.ts
├─ client/src/
│  ├─ kern/          api/ (typisierter Client aus shared/api), auth/, ui/ (heutiges ui.tsx aufgeteilt), layout/, modul.ts
│  ├─ module/
│  │  ├─ katalog/    index.ts (Routen + Navigation), api.ts, seiten/, komponenten/, test/
│  │  ├─ anfragen/   …   ├─ vorschlaege/ …   ├─ stammdaten/ …   ├─ konten/ …   └─ einstellungen/ …
│  └─ module.ts                          # Liste der Frontend-Module; App.tsx und Navigation bauen sich daraus
├─ manager/          (bleibt eigenständig; lib/ je Thema ist bereits gut geschnitten)
└─ e2e/              Playwright-Abläufe über Modulgrenzen hinweg (+ axe)
```

Datenbank: Migrationen bleiben **global nummeriert** (eine `schema_version`), liegen aber im Modul und werden von
`kern/db/migrate.ts` über alle Module gesammelt und nach Nummer sortiert – das hält Rückwärtskompatibilität mit den
vorhandenen `001…005` und dem Manager (`manager/lib/schema.mjs`), der die höchste Nummer liest. Polymorphe CHECKs
(`datei.objekttyp`, `benutzer.rolle`) beim nächsten ohnehin nötigen Neuaufbau durch Prüfung im Code oder eine
Nachschlagetabelle ersetzen, damit neue Objektarten/Rollen keine Tabellen-Neuaufbauten mehr brauchen.

### 3. Migrationsplan in kleinen, einzeln lauffähigen Schritten

Jeder Schritt: eigener Branch, `npm run check` + `npm run manager:test` grün, keine Verhaltensänderung der API
(außer wo genannt), Protokolleintrag. „Parallel“ = kann gleichzeitig in getrennten Sessions laufen, weil die
Dateimengen disjunkt sind.

| # | Schritt | Ergebnis / Tests grün durch | Aufwand | Parallel? |
|---|---|---|:-:|---|
| 0 | **Vorher:** kritische Befunde K1–K5 beheben (nicht strukturgebunden). | Sicherheit/Betrieb zuerst. | M–L | K4/K5 parallel zu K3; K1, K2 je eigene Session |
| 1 | Sicherheitsnetz: Smoke-Test auf `node:test` umstellen und je Bereich in eigene Dateien teilen (`test/katalog.api.test.ts` …) mit gemeinsamem Helfer `startServer()`; ESLint + CI-Workflow. | Alte Tests 1:1 übernommen, Anzahl gleich. | M | Allein (fasst alle Tests an) |
| 2 | `shared/`-Paket anlegen (Workspace), nur Rechte-Schlüssel und Rollen dorthin; Server und Client importieren, `client/src/lib/types.ts:6-23` entfällt. | typecheck beider Seiten. | S | Allein (Workspace-Änderung) |
| 3a | zod-Schemas **Katalog** nach `shared/katalog/schema.ts`; `Item`-Typen per `z.infer` in Server und Client. | typecheck; API-Tests Katalog. | M | 3a–3d parallel (je eigener Bereich), danach `validation.ts` in Schritt 3e auflösen |
| 3b | dito **Anfragen** (inkl. `STATUS_KATALOG` mit Symbol-Schlüssel → `constants.ts`-Doppel entfällt) | | M | parallel |
| 3c | dito **Vorschläge** (`proposalSchemas.ts` entfällt) | | S | parallel |
| 3d | dito **Konten/Stammdaten/Einstellungen** | | M | parallel |
| 3e | `server/src/validation.ts` und Rest von `client/src/lib/types.ts` löschen; Export/Import (`stammdatenImport.ts:97`) nutzt `ItemSchema`. | | S | Allein |
| 4 | `kern/modul.ts` + Registrierung: `app.ts` iteriert über `MODULE`; Rechte werden aus den Modulen zusammengeführt (`permissions.ts` wird zur Funktion statt Liste). Zunächst ein Modul je bestehender Route-Datei, Inhalte unverändert. | Rechte-Katalog-Test (`smoke`: „Rechte-Katalog“) prüft identische Ausgabe. | M | Allein |
| 5a–5e | Je Modul (Katalog, Anfragen, Vorschläge, Konten, Stammdaten): Ordner `module/<name>/` anlegen, Route-Datei verschieben, **Service extrahieren** (Regeln aus Handler), **Repository aus `SqliteRepositories.ts` herauslösen**, Migrationsdatei ins Modul verschieben (Nummer bleibt), Tests ins Modul. Danach Ladefehler aus W3 je Repository beheben. | API-Tests je Modul unverändert grün; neue Service-Unit-Tests. | je M | **5a–5e parallel**, sobald 4 fertig ist – jede Session fasst nur ihr Modul + eine Zeile in `module.ts` an (vorher Zeile reservieren) |
| 6 | Speicher-Abstraktion schließen: `Storage.sqlite` entfernen, Export/Import (`datenaustausch`) nur über Service-Funktionen + eine `kern/db/transaction`-Schnittstelle. | Export/Import-Test grün. | M | Allein, nach 5 |
| 7 | Frontend `kern/api`: typisierter Client aus `shared/api/routen.ts`; je Modul `api.ts` statt verstreuter `api('/…')`. | typecheck; keine Pfad-Strings mehr in Seiten. | M | Je Frontend-Modul parallel |
| 8 | Frontend-Module: `client/src/module/<name>/index.ts` liefert Routen + Navigation; `App.tsx` und `ADMIN_NAV` bauen sich aus `module.ts`; Riesenseiten aufteilen (ItemEditPage → 5 Abschnitt-Komponenten, MasterDataPage → je Liste). | Playwright-Kernabläufe (aus Schritt 1/W12) grün. | M–L | Je Modul parallel nach Grundgerüst |
| 9 | Einstellungen-Registry: Module melden Schlüssel + Schema + Standard an; `SETTING_KEYS` und Sammel-Route entfallen. | Einstellungs-Tests. | S | Allein |
| 10 | Aufräumen: Regeln in `CLAUDE.md` (unten), `docs/ARCHITEKTUR.md` auf Modulstruktur, Lint-Regel für Dateigröße und verbotene Querimporte (`eslint-plugin-boundaries` oder `no-restricted-imports`). | CI erzwingt die Regeln. | S | Allein |

Größenordnung gesamt: ca. 3–5 Wochen Einzelarbeit, durch Parallelisierung von 3, 5, 7, 8 deutlich weniger
Kalenderzeit. Jeder Schritt ist für sich nützlich; man kann nach Schritt 5 aufhören und hat bereits den Großteil des Nutzens.

### 4. Regeln für die Zukunft (Vorschlag für `CLAUDE.md`)

```
## Struktur-Regeln
- Neuer fachlicher Code gehört in genau ein Modul: server/src/module/<bereich>/ und client/src/module/<bereich>/.
  kern/ enthält nur Technik ohne Fachbegriffe. Neuer Bereich = neuer Modulordner + eine Zeile in module.ts.
- Typen und Validierung nur als zod-Schema in shared/src/<bereich>/schema.ts; Typen per z.infer. Keine Interfaces für
  API-Daten von Hand, nirgends.
- Abhängigkeiten: routes → service → repository → kern/db. Module importieren andere Module nur über deren index.ts.
  Routen enthalten keine Regeln, Repositories keine Regeln, Seiten keine API-Pfade (nur module/<bereich>/api.ts).
- Dateigröße: Ziel ≤ 300 Zeilen, harte Grenze 500 (Lint). Komponenten ≤ 250 Zeilen. Größer → aufteilen, bevor Neues dazukommt.
- Namen: Dateien kebab/Punkt-Schema <bereich>.<rolle>.ts (katalog.service.ts, katalog.routes.ts); Code-Bezeichner englisch
  ODER deutsch – je Modul einheitlich, Fachbegriffe laut Glossar (docs/ARCHITEKTUR.md); DB-Tabellen/Spalten deutsch, snake_case.
- Tests liegen im Modul (module/<bereich>/test/), Service-Regeln als Unit-Test, Endpunkte als API-Test, Kernabläufe in e2e/.

## Rezepte
- Neues Recht: in module/<bereich>/<bereich>.rechte.ts ergänzen (Schlüssel, Gruppe, Text, Standardrollen, requires);
  Schlüssel in shared/src/konten/rechte.ts erscheint automatisch; Route mit requirePermission schützen; API-Test
  „ohne Recht 403, mit Recht 200“.
- Neue Einstellung: im Modul registrieren (Schlüssel, zod-Schema, Standardwert); Oberfläche im Modul-Frontend; kein
  Eingriff in zentrale Dateien.
- Neue Objektart / Dateirolle: im Modul als dateiart registrieren; Ablagepfad bleibt <objekttyp>/<id>/<rolle>/;
  Backup/Export erkennen sie über die Registry.
- Neue Migration: nächste freie globale Nummer (höchste über alle Module + 1) im Ordner module/<bereich>/migrationen/,
  nur additiv (neue Spalte mit Default, neue Tabelle); destruktive Änderungen nur mit Datenübernahme in derselben
  Migration + Test mit Altdaten. Nie eine eingespielte Migration ändern.
- Parallelarbeit: Sessions bekommen je ein Modul. Gemeinsame Dateien (shared/, module.ts, kern/) ändert nur der Hauptchat.
```

## Was ausdrücklich gut ist (zur Einordnung)
- Rechteprüfung: Für **jede** Route in `server/src/routes/*.ts` gesichtet – alle verwaltenden Endpunkte haben `requirePermission`, öffentliche Endpunkte filtern selbst (Entwürfe, Druckdateien, Fotos nur Eigentümer/Team). Benutzer werden pro Anfrage frisch geladen; Sperrung wirkt sofort.
- Uploads: Endung **und** Magic Bytes, serverseitige Dateinamen, `absPath` gegen Pfadausbruch, Druckdateien nur als Download mit Sandbox-CSP.
- Daten: Migrationen mit automatischer Sicherung, jede in einer Transaktion; Import mit Vorschau in zurückgerollter Transaktion, DB-Sicherung vorher, Rollback inkl. verschobener Dateien.
- Manager: nur 127.0.0.1, Host-Header-Prüfung gegen DNS-Rebinding, CSRF-Token, scrypt, Login-Bremse; Update mit Downgrade-Sperre und DB-Rückspielung, per Test belegt.
- Barrierefreiheit: durchdachte Grundbausteine (`Field`, `Panel`, `FormSection` als `fieldset`, natives `dialog`, Fokus nach Seitenwechsel auf `main`, Atkinson Hyperlegible).
