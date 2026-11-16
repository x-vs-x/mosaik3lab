# Mosaik³LAB Server-Manager

Kleines Programm für den Rechner, auf dem Mosaik³LAB läuft – gegliedert in **Reiter**: „Übersicht“ (Updates, Gesamtstatus,
Adresse, Dienste), „Sicherung“, „Netzwerk“, „E-Mail“ und „System“ (Version, Ordner, Abgleichen, Protokoll, Einrichten).
Hinweise passen sich dem Betriebssystem an. Was sich automatisieren lässt, läuft automatisch (siehe unten). Nur Node-Bordmittel, kein Build, keine Abhängigkeiten,
keine Imports aus `server/`/`client/` – der Manager startet daher auch, wenn die App kaputt ist.

Betrieb und Grundeinstellungen – **alle Pfade** (Datenordner, Ablageordner, Backup-Ziel) und der E-Mail-Versand –
stellt man nur hier ein. Fachliches (Stammdaten, Bestellformular …) in der **Web-App** (Verwaltung → Einstellungen);
die App zeigt die Pfade dort nur an.

## Starten

| | |
| --- | --- |
| Windows, neuer Rechner | Installer-Paket (`npm run paket`, mit Node.js) entpacken → `Installieren.cmd` – richtet mit festen Werten ein bzw. aktualisiert, siehe [docs/INSTALLATION.md](../docs/INSTALLATION.md) |
| Linux x64 / Raspberry Pi OS 64 Bit, neuer Rechner | Installer-Paket (`…-linux-x64.tar.gz` bzw. `…-linux-arm64.tar.gz`, gebaut auf GitHub Actions, mit Node.js) → `tar xzf …` → `sudo ./installieren.sh` – richtet mit festen Werten ein bzw. aktualisiert, siehe [docs/INSTALLATION.md](../docs/INSTALLATION.md#linux-und-raspberry-pi) |
| Windows | Doppelklick auf `manager/mosaik3lab.cmd` (nach der Einrichtung: Verknüpfung „Mosaik³LAB Server-Manager“) |
| Linux / Raspberry Pi | `sh manager/mosaik3lab.sh` (nimmt `node/node` aus dem Paket, sonst das installierte Node.js) |
| überall | `npm run manager` bzw. `node manager/server.mjs --open` |

Die Starter prüfen Node.js (≥ 24 LTS – die App nutzt das eingebaute SQLite, bieten sonst winget bzw. NodeSource an) und öffnen
**http://127.0.0.1:5190** als eigenes Fenster (Edge/Chrome im App-Modus). Beim ersten Start wird nur ein Passwort
festgelegt – alles andere ist schon sinnvoll eingestellt. Läuft der Manager schon, wird nur sein Fenster geöffnet.

## Bedienung (Reiter)

Die Adresse merkt sich den Reiter (`…/#sicherung`); Pfeiltasten wechseln zwischen den Reitern.

| Reiter | Inhalt |
| --- | --- |
| **Übersicht** | **Updates** ganz oben (Paket-Installation: immer, mit Stand, Änderungen und „Jetzt aktualisieren“; sonst nur, wenn etwas bereitliegt). **Status:** ein Satz („Alles in Ordnung.“ oder „1 Punkt braucht Aufmerksamkeit: …“) mit **einem Knopf zur Lösung**, weitere Punkte klein darunter, aktualisiert alle 5 s ohne den Tastaturfokus zu verlieren. **Mosaik³LAB öffnen** (Adresse zum Anklicken). **Dienste** (läuft / gestoppt, „Neu starten“, „Stoppen“ bzw. „Starten“). **Sicherung** in einer Zeile. |
| **Sicherung** | Letzte und nächste Sicherung, „Jetzt sichern“, Liste mit „Wiederherstellen“ je Zeile (deutliche Rückfrage; vorher wird der jetzige Stand gesichert) · Zeitplan und Speicherort · Passwortschutz (erzeugen/neu/aus) · Umzug auf einen anderen Rechner (auch zwischen Windows, Linux und Raspberry Pi). |
| **Netzwerk** | Im Schulnetz erreichbar · Adresse fest `http://<Server>/mosaik3lab` (nicht einstellbar) · HTTPS mit Zertifikat · Ports (Schulnetz 80, HTTPS 443, Web-App intern, Portal an/aus). Ein „Speichern“; gespeichert wird nur, was sich geändert hat. Was den Zugang kappen kann, fragt vorher nach und nennt den Notzugang. Firewall-Hinweis je System (Windows-Firewall, ufw/firewalld, keine Firewall). |
| **E-Mail** | E-Mails verschicken (an/aus) · Empfänger bei neuen Anfragen · Mailserver (SMTP) · Testmail (nutzt die gespeicherten Einstellungen). |
| **System** | Version und Betriebssystem, Laufzeit, npm audit · Datenordner, Ablageordner · „Jetzt abgleichen“ · Protokoll · Einrichten (mit Probelauf, „Aus Sicherung einrichten“; WinSW nur unter Windows, Admin-Konto nur vor der Einrichtung). |

Der Manager hört selbst nie im Netz (nur 127.0.0.1). „Im Schulnetz erreichbar“ öffnet in der Firewall nur private Netze/Domäne:
mit Portal dessen Ports (80/443), sonst den Port der App.

## Anmeldung = Admin-Konto der App, erreichbar überall

Ein eigenes Manager-Passwort gibt es nicht. In der App: **Verwaltung → Server-Manager** (nur Rolle Administrator, kein eigenes
Häkchen) öffnet `http://<Server>/mosaik3lab/manager/` – ohne zweite Anmeldung. Oben im Manager führt „← Zurück zu Mosaik³LAB“ zurück.

- **Über die App-Adresse** (`<Pfad>/manager`): Das Portal leitet an den Manager auf `127.0.0.1:<Manager-Port>` weiter (in der
  Entwicklung der Vite-Proxy, `MANAGER_PORT`, Standard 5190). Portal bzw. Vite-Proxy setzen den Kopf `X-Mosaik3lab-Manager:
  <Pfad>/manager` **immer selbst** (ein vom Browser mitgeschickter Wert wird überschrieben, an die App nie weitergegeben). Zugang hat,
  wer in der App als **Administrator** angemeldet ist: Der Manager fragt bei jeder Anfrage `GET <Pfad>/api/auth/me` bei der App mit
  dem Cookie des Browsers. Lehrkraft, Druck-Team oder abgemeldet → 403 („Nur für Administratoren …“). Alles ist einstellbar.
- **Notzugang direkt am Server** (`http://127.0.0.1:5190`, wenn die App nicht läuft): E-Mail + Passwort eines aktiven Administrators
  aus der Tabelle `benutzer` (bcrypt über `bcryptjs` der App – aus `node_modules` bzw. im Installer-Paket aus `server/dist/bcryptjs.cjs`; Demo-Konten nur, wenn erlaubt). Sitzung als
  Cookie `HttpOnly; SameSite=Strict`, 8 h; nach 5 Fehlversuchen 60 s Sperre.
- **Ersteinrichtung (noch kein Administrator):** Die App leitet jeden Aufruf auf `<Pfad>/manager/` um. Über das Netz sind dann nur
  Seite, `GET /api/auth` und `POST /api/auth/first` erreichbar (sonst 403), Anlegen ohne weiteren Code
  (Entscheidung des Nutzers; bis 1.1.3 gab es einen Einrichtungscode). Die Installer zeigen am Ende die Adressen
  (`cli.mjs erstzugang`). Mit vorhandenem Administrator (auch nach Updates) ändert sich nichts.
- **Bestätigen statt sperren:** Pfad/HTTPS, „nur noch auf diesem Rechner“, Ports/Portal und Web-App/Portal stoppen fragen vorher nach –
  mit Hinweis auf den Notzugang. CSRF wie bisher (`X-Manager-Token` + Origin = Adresse im Browser).
- **Umstellung:** Ein früheres Manager-Passwort (`manager.passwordHash`) und der Schalter „Über die App-Adresse erreichbar“
  (`manager.remote`) werden beim Start einmalig aus der Datenbank entfernt.

## Was automatisch läuft (`lib/auto.mjs`)

| Was | Wann |
| --- | --- |
| **Abgleichen** (Ordner, Manager-Port, Web-App mit den Werten aus der Datenbank, Firewall) | beim Start des Managers und **nach jeder Änderung** (Einstellungen, Pfad/HTTPS, Netzfreigabe, Wiederherstellen). Beim Start wird die **Firewall nur geprüft** – eine Abweichung erscheint oben mit Knopf „Abgleichen“, damit keine Windows-Bestätigung ungefragt aufgeht. Abweichungen werden außerdem alle 10 Minuten geprüft. |
| **Firewall-Regel** | folgt dem Schalter „Im Schulnetz erreichbar“ und den Ports (eine Windows-Bestätigung beim Speichern). Bei Portwechsel wird sie ohne Rückfrage mitgezogen. |
| **Backup-Zeitplan** | standardmäßig an (`backup.enabled`): täglich 02:00 eine vollständige Sicherung, 14 Sicherungen aufbewahren. Der Backup-Dienst wird beim Start des Managers gestartet, wenn er nicht läuft – außer man hat ihn ausdrücklich gestoppt. Verpasste Sicherungen werden nachgeholt. |
| **Update-Prüfung** | 10 s nach dem Start, dann alle 6 Stunden (nur in einer Installation; offline ist kein Fehler). Anzeige nur bei verfügbarer Version. |
| **Laufzeit-Prüfung** (Node.js, Git, WinSW) | 10 s nach dem Start, dann täglich. Neuere Version → Karte „Update verfügbar“; zu altes Node/fehlendes Git → Punkt im Status. **Aktualisiert wird nie automatisch**, nur auf Knopfdruck. |
| **Portal** | Standard bei neuen Einstellungen: an, Pfad `/mosaik3lab`, Port 80 → `http://<Server>/mosaik3lab` ohne Portnummer, die App hört intern nur auf 127.0.0.1. Einstellungen von früher ohne Portal-Werte bleiben unverändert (Portal aus). Geht außerdem automatisch an, sobald ein Pfad eingetragen wird. Ausschalten nur unter „Erweitert“ (wenn IIS/nginx davor sitzt). **Port 80 belegt:** Hinweis nennt Programm + PID und schlägt einen freien Port vor (8080, 8081, 8000, 8888) – Knopf „Port … verwenden“. |
| **Adresse in Bestell-Mails** | leer gelassen → automatisch die Adresse der App im Schulnetz (bzw. auf diesem Rechner). |
| **Hinweise verschwinden von selbst** | sobald die Ursache weg ist: ein Sicherungsfehler nach der nächsten erfolgreichen Sicherung (automatisch oder „Jetzt sichern“), Abweichungen spätestens nach einer Minute, Laufzeit/Update nach spätestens 10 Minuten. |
| **Neustart der Web-App** | nach Portwechsel, Pfad-/HTTPS-Änderung und Wiederherstellen von selbst. |
| **App außerhalb des Managers** (Entwicklung: `npm run dev:lan`) | Antwortet auf dem App-Port bzw. dem Portal-Port (80) eine Mosaik³LAB-App auf `/api/health` (eingestellter Pfad oder `/mosaik3lab`), ist das **kein** Portkonflikt: Status „läuft (außerhalb des Managers gestartet, z. B. Entwicklung)“, kein „Starten“, „Mosaik³LAB öffnen“ zeigt `http://<Server>/mosaik3lab`. Nur ein fremdes Programm auf dem Port bleibt rot. |
| **Status schnell** (Ziel < 1 s) | Abfragen laufen parallel; netstat/tasklist werden 10 s, `Get-NetFirewallRule` (PowerShell, ~2,5 s) 30 s gemerkt – nach Start/Stopp und Firewall-Änderung frisch. Auf die Abweichungsprüfung wartet der Status höchstens 0,5 s, das Ergebnis zeigt der nächste Status. |

**Probelauf für Tests:** `MOSAIK3LAB_SYSTEM_DRY_RUN=<datei.json>` ersetzt Windows-Bestätigung, Firewall, Betriebssystem-Dienste
und winget/apt durch eine Datei, in der nur vermerkt wird, welche Firewall-Regeln es „gäbe“ (`platform/index.mjs`).
`MOSAIK3LAB_NO_AUTOMATION=1` schaltet die Automatik beim Start ab.

## Einstellungen liegen in der Datenbank (eine Quelle der Wahrheit)

Alles, was man einstellen kann – Ports, Netzfreigabe, Ablage-/Backup-/Protokoll-Ordner, Backup-Zeitplan und Anzahl,
Update-Quelle samt Git-Pfad, **Mail (inkl. SMTP-Passwort), Session-Geheimnis** – steht in der
Datenbank der App (`<Datenordner>/mosaik3lab.db`, Tabelle `betrieb_einstellung`, Bereiche `betrieb` · `mail` ·
`manager`; die fachlichen Einstellungen der App bleiben in `einstellung`, siehe `docs/DATENMODELL.md`). Ein Backup der
Datenbank (+ Ablage) enthält deshalb **alles** – nach dem Zurückspielen ist das System genauso konfiguriert wie im
Backup.

- **Einzige Datei außerhalb:** die Startdatei `<Wurzel>\mosaik3lab.json` (Windows `C:\Mosaik3LAB\mosaik3lab.json`,
  Entwicklung `<Arbeitskopie>/mosaik3lab.json`) mit **nur** `{ "dataDir": …, "managerPort": … }` – man muss den Ort der
  Datenbank kennen, bevor man sie liest. Fehlt etwas in der Datenbank, gelten Standardwerte. (`MANAGER_CONFIG`
  überschreibt den Pfad der Startdatei, z. B. für Tests.)
- Der Manager liest/schreibt die Tabelle direkt über das eingebaute `node:sqlite` (keine npm-Abhängigkeit), mit kurzen
  Transaktionen, WAL und `busy_timeout` – App und Manager können gleichzeitig zugreifen. Ändert ein anderer Prozess
  die Datenbank (oder wird ein Backup zurückgespielt), lädt der Manager die Einstellungen innerhalb einer Sekunde neu.
  Legt der Manager die Tabelle vor dem ersten App-Start an, übernimmt die Migration 006 der App sie unverändert.
- Die App bekommt Ports und Pfade weiterhin als Umgebungsvariablen vom Manager (`API_PORT`, `HOST`, `STORAGE_DIR`,
  `ABLAGE_DIR` …); **Mail-Einstellungen und Session-Geheimnis liest sie selbst aus der Datenbank**
  (`MAIL_CONFIG_FILE` und `SESSION_SECRET` entfallen).
- **Einmalige Übernahme der Altdateien** (beim ersten Laden; die Dateien werden zu `*.vor-datenbank-<zeit>.bak`):
  alte `manager.config.json` (jetzt Startdatei, Inhalt → Datenbank), `config/mail.json`, `data/.session-secret` und –
  durch die App – die Mail-Felder aus `data/settings.json`. Bestehende Installationen bleiben ohne Backup-Passwort
  (unverschlüsselt), bis eins gesetzt wird.
- Fehlerhafte Werte in der Datenbank → Standardwerte + Fehlermeldung; Aktionen, die Daten schreiben, sind gesperrt, bis
  die Einstellungen gespeichert/repariert sind (der Ort der Datenbank bleibt dabei erhalten).

### Sicherungen: eine Art, je EINE Datei

Jede Sicherung ist eine einzelne Datei `<Backup-Ziel>/mosaik3lab-<Zeit>-komplett.m3lbackup` (Kopf mit Art, Zeit, App-Version +
Commit, Schema-Version, Rechnername; darin ein tar-Strom mit `manifest.json` und SHA-256-Prüfsummen) mit dem **ganzen System**:
Datenbank mit **allen** Einstellungen und Geheimnissen (Ports, Mail, Passwörter, Benutzer, Rechte, Anfragen, Domains …) **und** die
Ablage (Bilder, Videos, Druckdateien). Jede Sicherung wird nach dem Schreiben geprüft. Eine Art, damit Wiederherstellen und Umziehen nie
Bilder verlieren (bis 2026-11-02 gab es zusätzlich die kleine Art „Daten & Einstellungen“ ohne Ablage und einen eigenen „Komplett“-Zeitplan).

- **Zeitplan:** täglich zur eingestellten Uhrzeit, abschaltbar (`backup.enabled`). Aufbewahrt werden die neuesten `backup.keep`
  Sicherungen insgesamt (auch „vor Update“, „vor Wiederherstellung“); die gerade wiederhergestellte wird dabei nie gelöscht.
  `backup.full` wird nicht mehr benutzt.
- **Verpasste Sicherungen** (Rechner war zur Zeit aus) werden beim Start des Backup-Dienstes bzw. beim nächsten Prüfen
  **nachgeholt** (fällig, wenn die letzte Sicherung älter ist als der letzte planmäßige Zeitpunkt). Schlägt eine
  Sicherung fehl, wird nach 15 Minuten erneut versucht; bis dahin steht eine **Warnung** im Status (Dienstkarte/Hinweise).
- **Wiederherstellen** ersetzt Datenbank und Ablage. **Ältere Sicherungen** bleiben wiederherstellbar: Ordner-Sicherungen
  (`backup.json`), verschlüsselte und unverschlüsselte `.m3lbackup`-Dateien und die frühere Art „daten“ (nur Datenbank – lässt die
  vorhandene Ablage unberührt; fehlende Bilder zeigen einen Platzhalter, der `doctor` meldet sie als **Hinweis**; nur Fehlendes aus
  einer vollständigen Sicherung nachholen: `cli backup fill-files <id>`, jede Datei per SHA-256 geprüft).
- **Umziehen** auf einen anderen Rechner = Sicherungsdatei mitnehmen und dort „Aus Sicherung einrichten“ (bzw. `cli setup --from-backup`);
  läuft dort schon eine Installation: Datei in deren Backup-Ziel kopieren und wiederherstellen.

### Verschlüsselte Sicherungen

Weil Geheimnisse in der Datenbank stehen, sind Sicherungen bei neuen Einrichtungen standardmäßig **verschlüsselt**
(`backup.encrypt`, ein Passwortfeld, nicht Pflicht): die ganze Datei mit **AES-256-GCM** (`node:crypto`), Schlüssel aus dem
**Backup-Passwort** per scrypt; Salt und eine Passwortprobe stehen im Kopf der Datei, damit ein **falsches Passwort sofort
abgelehnt** wird, bevor etwas verändert wird. Das Passwort liegt **nicht** in der Datenbank und nicht im Backup,
sondern in `<Wurzel>/backup.key` (nur Administratoren, SYSTEM, Dienstkonto und Besitzer). Bei der Einrichtung wird es
erzeugt und **einmalig angezeigt – bitte notieren**; ohne Passwort lässt sich eine verschlüsselte Sicherung nicht
zurückspielen. Ändern: Karte „Sicherung“ → „Passwortschutz“ → „Passwort erzeugen“ / „Neues Passwort erzeugen“ oder `cli backup password set <pw>|generate|off`
(ältere Sicherungen brauchen ihr früheres Passwort). Unverschlüsselt ist möglich, wird aber im Status und im `doctor`
als Hinweis angezeigt.

### Wiederherstellen = gleicher Zustand („Abgleichen“)

Nach dem Zurückspielen – und nach jeder Änderung der Einstellungen – gleicht der Manager das System an die Datenbank an (von Hand: „Erweitert“ → **„Jetzt abgleichen“** bzw.
`cli reconcile [--dry-run]`, und als Prüfung im `doctor`: Abweichungen erscheinen dort als Hinweis):
Manager-Port (Datenbank → Startdatei), Ordner (anlegbar und beschreibbar?), Port frei?, **Firewall-Regel passend zu „Im
Netzwerk freigeben“**, Dienste eingerichtet?, Web-App läuft mit den Werten aus der Datenbank (sonst Neustart), Zeitplan
und Update-Quelle. Systemzustand (Dienste, Firewall) steht nie in der Datenbank, wird aber immer **aus ihr abgeleitet**.
**Abweichende Ordner** (z. B. ein Laufwerk, das es auf dem neuen Rechner nicht gibt) erkennt der Manager und **fragt
nach** (`needsInput`; CLI: `--path ablageDir=<ordner>`, Oberfläche: Rückfrage), statt zu raten.

### Aus Backup einrichten (leeres System)

Starter (`mosaik3lab.cmd`/`.sh`) → Manager → Einrichten → „Aus Backup einrichten“ → **Sicherungsdatei** (+ **Passwort**, falls
verschlüsselt) – mehr wird nicht abgefragt. Auch per CLI: `cli setup --from-backup <datei.m3lbackup> [--backup-password <pw>]
[--dry-run] [--system-dry-run]`. Alles Weitere liest der Manager aus der Sicherung: Ordner, Ports, Netzfreigabe, Firewall,
Dienste, Zeitpläne beider Backup-Arten, Update-Quelle, Mail, Konten (Anmeldung am Manager = Admin-Konto der App). Ablauf (Schritte wie bei „Einrichten“, ein Durchlauf,
jeder Schritt wiederholbar – bei einem Fehler einfach „Einrichten“ erneut): Ordner → Programm kopieren → Sicherung prüfen/auspacken →
Datenbank und Einstellungen zurückspielen (die App spielt neuere Migrationen beim Start ein) → `npm ci` → Build → Dienste →
Firewall → Verknüpfungen → Start + Health-Check; das Ergebnis steht als Schrittliste. **Nur** wenn auf dem neuen System etwas
nicht geht (Laufwerk fehlt, Ablage-Ordner nicht leer), wird genau dafür **mit Vorschlag** nachgefragt (`--path ablageDir=…`).
Das Backup-Passwort wird als neue `backup.key` übernommen, damit geplante Sicherungen weiterlaufen. Die Sicherung nennt die
App-Version; eingerichtet wird die Version dieses Programmordners (Hinweis im Ergebnis; danach ggf. Update auf die gewünschte
Version). Stammt die Sicherung aus einer **neueren** Version (Schema), wird das abgelehnt. Eine Sicherung „Daten & Einstellungen“ genügt:
Bilder fehlen dann zunächst (Platzhalter, `doctor`-Hinweis, siehe oben).

### Datenbestand übertragen („Datenordner ändern“, „Einrichten mit vorhandenen Daten“)

Beide Stellen benutzen dieselbe Funktion (`lib/transfer.mjs`): die **Datenbank** wird konsistent über `db:backup` kopiert (nicht als
Dateikopie), die früheren JSON-Reste (`data/`, `uploads/`, `config/`) und – wenn sie im Standardordner liegt – die **Ablage** ziehen
mit; danach werden **Zeilen je Tabelle** und **Dateianzahlen** verglichen (Abweichung → Fehler, halb fertiges Ziel wird entfernt, die
Quelle bleibt unverändert). Ein Ziel mit vorhandener Datenbank wird nie überschrieben.

## Erreichbarkeit: Portal, Pfad, HTTPS

Im Schulnetz soll die App ohne Portnummer erreichbar sein: `http://<Server>/mosaik3lab` (bzw. `https://…`). Dafür gibt es das
**Portal** (Pfad fest `/mosaik3lab`; Ports und „Portal verwenden“ unter „Netzwerk“ → „Ports“; Dienst „Mosaik³LAB Portal“, `runners/portal.mjs`, reines Node ohne Abhängigkeiten):

- Das Portal ist der **einzige Dienst nach außen**: Port **80** (bei HTTPS zusätzlich **443**; Port 80 leitet dann um). Es leitet
  `/<pfad>/…` an die App auf `127.0.0.1:<interner Port>` weiter (Streaming für große Uploads/Downloads, Zeitlimit 10 Minuten
  ohne Datenfluss, `X-Forwarded-For/-Proto/-Host` – von außen mitgeschickte Angaben werden verworfen); `/` leitet auf `/<pfad>/`; alles
  andere → freundliche 404-Seite; antwortet die App nicht → Seite „antwortet gerade nicht“ (502). Kein WebSocket, kein Caching.
- Die **App hört nur noch auf 127.0.0.1** (`trust proxy` nur für localhost); **Firewall** (`Im Netzwerk freigeben`) öffnet nur noch die
  Portal-Ports. Alte Regeln des früheren App-Ports werden beim „Abgleichen“ entfernt.
- **Pfad der App** (`portal.basePath`, Standard bei neuer Einrichtung `/mosaik3lab`, leer = unter `/`): Die App bekommt ihn als
  `BASE_PATH`. Das gebaute Frontend ist pfadunabhängig (relative Adressen, `<base href>` setzt der Server beim Ausliefern; Router,
  API-Aufrufe, Bild-/Datei-Links und das Sitzungs-Cookie benutzen den Pfad). **Links in Bestell-Mails** nehmen die „App-Adresse“ der
  Mail-Einstellungen: bitte mit Pfad eintragen, z. B. `http://<Server>/mosaik3lab`.
- Neue Einstellungen starten mit Portal an (`/mosaik3lab`, Port 80). Bestehende Einstellungen ohne Portal-Werte bleiben unverändert (Portal **aus**, App direkt auf ihrem Port), bis ein Pfad eingetragen wird (oder
  „Erweitert“ → „Portal verwenden“); neue Einrichtungen starten mit Portal an.
- **Belegter Port 80/443** (z. B. IIS, nginx, Skype): Der Manager erkennt es (Status, `doctor`, Start des Portals), nennt das
  Programm und die PID und schlägt vor: anderen Portal-Port einstellen (z. B. 8080/8443; dann `http://<Server>:8080/mosaik3lab`) oder
  IIS/nginx als Vorschaltdienst nutzen und das Portal ausschalten (Beispiele unten). Linux: Das systemd-Unit des Portals bekommt
  `AmbientCapabilities=CAP_NET_BIND_SERVICE` (Ports < 1024 ohne Root; im Installer-Test auf Ubuntu x64/arm64 geprüft).

**HTTPS (optional)** – ohne Zertifikat bleibt es bei HTTP (die HTTPS-Anweisungen `upgrade-insecure-requests`/HSTS werden nur bei aktivem HTTPS
gesetzt – sonst würde `http://<IP>` im Schulnetz brechen):
- „Zertifikat **erzeugen**“: selbstsigniert am Server, Rechnername + IP-Adressen, **5 Jahre** (Windows `New-SelfSignedCertificate` im
  Benutzerspeicher, direkt nach dem Export samt Schlüssel wieder entfernt; Linux `openssl`). Oder „Zertifikat **hinterlegen**“: PFX + Passwort
  oder PEM-Zertifikat + Schlüssel. Jedes Zertifikat wird geprüft (gültig, Schlüssel passt, **Rechnername/IP**, **Ablaufdatum**);
  `doctor` und Status **warnen 30 Tage vor Ablauf**.
- Zertifikat und Passwort liegen **in der Datenbank** (`portal.cert`, als geheim markiert) – also im Backup; „Abgleichen“ und „Aus Backup
  einrichten“ übernehmen Portal-Einstellungen und Zertifikat.
- **Für Geräte:** Die Seite `http://<Server>/zertifikat` (bleibt auch bei aktivem HTTPS über HTTP erreichbar) lädt das öffentliche
  Zertifikat (`.cer`, ohne Schlüssel) und erklärt in vier Zeilen, wie man es auf Windows, iPad/iPhone, Android und Mac **einmalig** als
  vertrauenswürdig einträgt (danach keine Warnung mehr). Im Manager: „Zertifikat für Geräte herunterladen“.
- HTTPS an: Sitzungs-Cookie `Secure`, HSTS, Port 80 → 301 auf HTTPS.

<details><summary>Beispiele: IIS / nginx statt Portal (Portal dann ausschalten)</summary>

nginx (`/etc/nginx/conf.d/mosaik3lab.conf`):

```
location /mosaik3lab/ {
  proxy_pass http://127.0.0.1:3001;          # Port der App, Pfad bleibt erhalten
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Forwarded-Proto $scheme;
  client_max_body_size 1100m;                # Stammdaten-Import bis 1 GB
  proxy_read_timeout 600s;
}
```

IIS: Module „URL Rewrite“ + „Application Request Routing“, Regel „Reverse Proxy“: Muster `^mosaik3lab/(.*)`, Aktion Rewrite auf
`http://127.0.0.1:3001/mosaik3lab/{R:1}`, Server-Variable `HTTP_X_FORWARDED_PROTO` setzen, Anfragelimit (`maxAllowedContentLength`) erhöhen.
In beiden Fällen in den Einstellungen den **Pfad** eintragen (gleich wie im Proxy) und das Portal ausgeschaltet lassen. Bei HTTPS am Vorschaltdienst
`X-Forwarded-Proto: https` setzen – die App (vertraut Weiterleitungen nur von localhost) markiert das Sitzungs-Cookie dann selbst als `Secure`; HSTS setzt der
Vorschaltdienst.
</details>

## Ablageordner

Bilder, Druckdateien und Videos legt die App unter einem Wurzelordner ab, den **nur der Manager** einstellt
(Standard `C:\Mosaik3LAB\ablage` bzw. `/var/lib/mosaik3lab/ablage`, in der Arbeitskopie `<Datenordner>/ablage`) und
der Web-App beim Start als `ABLAGE_DIR` übergibt. Die Unterstruktur legt die App selbst an
(`<objekttyp>/<objekt-id>/<rolle>/<datei-id>.<endung>`, siehe `docs/DATENMODELL.md`).
- Ändern nur bei **gestoppter Web-App**. Der neue Ordner wird geprüft (anlegbar, beschreibbar, mind. 200 MB frei).
- „Vorhandene Dateien … kopieren“ kopiert die alte Ablage in den neuen (leeren) Ordner und prüft die Anzahl; der alte
  Ordner bleibt als Sicherung liegen. Ohne Haken erscheint ein deutlicher Hinweis, dass die Dateien noch umziehen müssen.
- `doctor` prüft den Ablageordner (vorhanden, beschreibbar, freier Platz) und vergleicht ihn mit der Datenbank:
  Dateien, die laut Tabelle `datei` fehlen (Fehler), und Dateien ohne Datensatz (Hinweis).

## E-Mail bei neuen Anfragen

Wird **nur hier** eingestellt (nicht in der App): an/aus, SMTP-Server, Port, Verschlüsselung (STARTTLS/SSL),
Benutzer, Passwort, Absender, Empfänger (mehrere), App-Adresse für Links, „Testmail senden“.
Schnittstelle zur App: Der Manager schreibt die Werte in die Datenbank (Tabelle `betrieb_einstellung`, Bereich `mail`:
`enabled`, `smtp { host, port, secure, user, pass }` (als geheim markiert), `from`, `recipients[]`, `appBaseUrl`); die App
liest sie bei jedem Versand (Änderungen wirken ohne Neustart). Das Passwort wird nie angezeigt, protokolliert oder über
die API zurückgegeben („gesetzt“); leer lassen behält es. Testmail: CLI `mail test --to …` (ruft das Skript der App ohne Shell mit Argumentliste auf; Adressen werden streng geprüft, `& | ; \` $` u. Ä. werden abgelehnt). Hinweis: Das Passwort steht in der
Datenbank und damit in Sicherungen – deshalb Backup-Passwort (siehe oben) und Backup-Ziel schützen.

## Datenbank (kommt mit der App)

Die App speichert in SQLite (`node:sqlite`, in Node enthalten, `<Datenordner>/mosaik3lab.db`) und richtet Datenbank,
Tabellen und Ablage beim ersten Start selbst ein (frühere JSON-Daten werden dabei einmalig übernommen) – im Manager gibt es dafür **keinen** Einrichtungsschritt. Der Manager prüft nur Node ≥ 24,
zeigt den Zustand aus `/api/health` an und sichert die Datenbank im Backup konsistent über
`npm run db:backup -w server -- --ziel <datei> --quelle <db>` (die Datei wird nie einfach kopiert). Solange es noch keine
`mosaik3lab.db` gibt, entfällt dieser Schritt; liegt eine Datenbank vor, aber das Skript fehlt, bricht das Backup
lieber ab, als eine inkonsistente Kopie zu erzeugen.

## Einrichten – wie ein normal installiertes Programm

„Einrichten“ (Einstellungsdialog bzw. `cli setup --config <datei>`) kopiert Mosaik³LAB aus dem aktuellen Ordner
(Arbeitskopie/Download) an einen festen Ort und läuft danach von dort:

| | Windows | Linux / Raspberry Pi |
| --- | --- | --- |
| Programm | `C:\Program Files\Mosaik3LAB\releases\<version>` + Verweis `current` (Installer-Paket: mit `node\node.exe`) | `/opt/mosaik3lab/releases/<version>` + Verweis `current` (Installer-Paket: mit `node/node`; gehört root) |
| Daten (Datenbank `mosaik3lab.db` mit allen Einstellungen) | `C:\Mosaik3LAB\daten` | `/var/lib/mosaik3lab/daten` |
| Ablage (nur hier einstellbar, `ABLAGE_DIR`) | `C:\Mosaik3LAB\ablage` | `/var/lib/mosaik3lab/ablage` |
| Sicherungen | `C:\Mosaik3LAB\backups` | `/var/backups/mosaik3lab` |
| Protokolle | `C:\Mosaik3LAB\logs` | `/var/log/mosaik3lab` |
| Startdatei `mosaik3lab.json` (nur `dataDir`, `managerPort`) + `backup.key` | `C:\Mosaik3LAB` | `/var/lib/mosaik3lab` |
| Manager (install-manifest, Dienstdateien `dienste\`, WinSW `werkzeuge\`) | `C:\Program Files\Mosaik3LAB` (ältere Installationen: `C:\Mosaik3LAB\manager`, steht als `managerDir` in `install.json`) | `/var/lib/mosaik3lab/manager` |
| Dienste | WinSW (Konto „Lokaler Dienst“), Autostart, Neustart nach Absturz | systemd (`/etc/systemd/system/mosaik3lab-*.service`, Systembenutzer `mosaik3lab`, Autostart, Neustart nach Absturz; Portal mit `CAP_NET_BIND_SERVICE`; polkit-Regel: Manager darf die anderen Dienste steuern) |
| Verknüpfungen | Desktop + Startmenü „Mosaik³LAB“ (Server-Manager, Mosaik³LAB öffnen, deinstallieren) | `.desktop`: als root (Installer-Paket) unter `/usr/share/applications/mosaik3lab`, sonst `~/.local/share/applications` (+ Desktop) – ohne Desktop harmlos |

Schritte: System prüfen → Ordner → Programm kopieren → Einstellungen/Daten übernehmen → (aus Backup wiederherstellen) → `npm ci` → Build →
Dienste → Firewall (nur bei Netzfreigabe) → Verknüpfungen → Start. Jeder Schritt ist wiederholbar, der
**Probelauf** zeigt alles, ohne etwas zu ändern. Admin-Schritte fragen per Windows-Bestätigung bzw. sudo; wo das
nicht geht, wird der Befehl zum Kopieren angezeigt. Am Ende übernimmt der Manager-Dienst (gleiche Adresse).

Alle Pfade sind Vorgaben und im Einrichtungsdialog änderbar. Jede Systemänderung (Ordner, Dienst, Firewall-Regel,
Verknüpfung, Datei, Ordnerrechte) steht in `install-manifest.json` im Verwaltungsordner (Windows: Programmordner, sonst `<Wurzel>/manager`).
Unter Windows dürfen der einrichtende Benutzer (Deinstallieren) und „Lokaler Dienst“ (Updates nach `releases\`, WinSW-Tausch) den
Programmordner ändern; sonst schreibt im Betrieb nichts dorthin. Unter Linux richtet das Installer-Paket als root ein
(`sudo ./installieren.sh`): Das Setup legt den Systembenutzer `mosaik3lab` an und übergibt ihm Daten-, Ablage-, Sicherungs- und
Protokollordner (vor dem Start der Dienste noch einmal, damit nichts root gehört); `/opt/mosaik3lab` bleibt bei root. **Erneutes Einrichten** einer vorhandenen Installation = Update:
neue Version unter `releases\`, laufende Dienste stoppen, `current` umschalten, ältere Versionen aufräumen (aktuelle + vorige bleiben),
Einstellungen und Daten bleiben, Dienste starten. **Deinstallieren** (Startmenü-Eintrag oder `cli uninstall`) entfernt genau diese
Einträge und fragt, ob Daten/Sicherungen/Einstellungen bleiben sollen (Standard: ja).

WinSW 2.12.0 wird nur geladen, wenn man das im Einrichtungsdialog ankreuzt; geprüft wird die Dateigröße, die
Prüfsumme wird protokolliert (fester SHA-256-Wert noch einzutragen: `platform/windows.mjs`).

## Updates

**Paket-Installationen (ab 1.1.0): per Knopfdruck.** Quelle ist das öffentliche Repository `x-vs-x/mosaik3lab-pakete`
(nur freigegebene, auf Windows/Linux/Pi getestete Versionen, `npm run veroeffentlichen`). `lib/paketquelle.mjs` bietet nur
Versionen an, die neuer sind, ein Paket für genau dieses System und `SHA256SUMS.txt` haben (täglich und auf Knopfdruck,
offline = ruhiger Hinweis). „Jetzt aktualisieren“ (`lib/updates.mjs`): Paket herunterladen und prüfen → Auftrag in
`<Datenwurzel>/updates/auftrag.json` → Dienst **„Mosaik³LAB Update“** (`mosaik3lab-updater`, Windows: Konto System,
Linux: root – der Manager darf ihn per Dienst-Recht bzw. polkit starten) übernimmt (`lib/aktualisieren.mjs`):
- prüft **selbst** gegen die offizielle Prüfsumme und lehnt ältere/gleiche Versionen ab (dem Manager wird nicht vertraut),
- installiert mit dem Ablauf des Pakets (`cli.mjs setup`, wie `Installieren.cmd`): Sicherung „vor Update auf …“ (wird nie
  rotiert), Umschalten, Health, bei Fehler automatisch zurück inkl. Datenbank,
- bricht nach 45 Minuten ab und stellt den alten Stand her; antwortet die App danach nicht, setzt er selbst zurück,
- startet beim Hochfahren einmal: ein **unterbrochenes Update** (Stromausfall) wird erkannt, läuft die App nicht → zurück.
Fortschritt schreibt nur der Helfer: `<Programmordner>/update-status.json` (Phasen `läuft`, `fertig`, `zurueckgesetzt`,
`fehler`, Texte für Admins; „wartet“ leitet der Manager selbst ab, nach 10 min ohne Meldung = Fehler), Protokoll
`<Programmordner>/update-helfer.log` (im Manager unter Protokoll → „Update-Helfer“). Der Programmordner ist für das Dienstkonto
schreibgeschützt.
Einrichtung und Update laufen nie doppelt (`lib/sperre.mjs`, `<Programmordner>/.einrichtung.lock`). Versionen vor 1.1.0
haben den Helfer noch nicht → einmal per Paket aktualisieren.

**Installationen aus einer Arbeitskopie:** Quelle ist Git (Einstellung `update.repo` + `update.branch`, Standard nach der Einrichtung: die Arbeitskopie, aus
der installiert wurde, Branch `main`). Ablauf in einem eigenen Prozess: Backup → neue Version aus Git nach
`releases/<version>-<commit>` (entpacken, `npm ci`, Build) → Dienste stoppen → `current` umschalten → starten →
`/api/health`. Antwortet die neue Version nicht, wird **automatisch zurückgeschaltet**. Aktuelle und vorige Version
bleiben erhalten. In der Arbeitskopie gibt es keine Updates über den Manager – dort `git pull`.

**Git finden:** Der Manager sucht `git` zuerst am gemerkten Pfad (`update.gitPath`), dann im PATH, dann an den
Standardorten (Windows `C:\Program Files\Git\cmd\git.exe` u. a., Linux `/usr/bin/git`) und merkt sich den Treffer –
so klappt es auch als Dienst (Konto „Lokaler Dienst“ ohne Git im PATH). Fehlt Git ganz, steht das im `doctor`, in der
Einrichtung (`"installGit": true` installiert es per winget/apt) und als klare Meldung beim Update.

**Datenbank beim Update:** Vor jedem Update wird die Schema-Version der Datenbank gelesen (nur lesend) und gesichert.
Scheitert die neue Version nach dem Start und hat sich das Schema inzwischen geändert (Migrationen wurden eingespielt),
spielt der Rollback die **Sicherung von vorher zurück** – die alte Version läuft nie auf einem neueren Schema. Eine
Version, die ein **niedrigeres Schema** mitbringt als die Datenbank hat, wird nicht installiert (Downgrade verweigert).
Ohne Schema-Änderung bleibt die Datenbank beim Rollback unangetastet.

**Update per Installer-Paket** (`Installieren.cmd` / `sudo ./installieren.sh` erneut = `cli setup` über eine vorhandene
Installation) nutzt dieselben Bausteine (`lib/paketupdate.mjs`, aufgerufen aus `install()`): Downgrade-Prüfung im Schritt
`check` (vor jeder Änderung) → im Schritt `program` Dienste stoppen, Sicherung mit der **bisherigen** Version
(`current/manager/cli.mjs backup run`; scheitert sie, laufen die Dienste wie vorher weiter) → `current` umschalten → … →
`start` mit `/api/health`. Scheitert danach irgendein Schritt, meldet `install()` den Schritt `rollback`: Dienste stoppen,
`current` zurück, bei geändertem Schema nur die Datenbank aus genau dieser Sicherung zurückspielen (Schema danach geprüft),
kaputte Version löschen, Dienste starten, Health prüfen – und wirft eine Meldung „Update auf X fehlgeschlagen (…) –
automatisch auf Y zurückgeschaltet, Daten unverändert … Protokoll: …“ (Exit-Code ≠ 0). Alte Versionen räumt das Setup erst
nach Erfolg auf. Gleiches Paket noch einmal = Reparatur. Sitzungen im Manager-Dienst gehen beim Update verloren (neu anmelden).
Für den CI-Test wird nur die Testkopie des Pakets kaputtgemacht, einen Testschalter im Programm gibt es nicht.

## Laufzeit (Node.js, Git, Dienst-Wrapper)

„Erweitert“ → „Version und Laufzeit“ bzw. `runtime status|update`; geprüft wird automatisch (täglich), angezeigt wird oben nur, was zu tun ist. Je Zeile: installiert / aktuell / Ampel. Node.js wird mit der
aktuellen LTS von nodejs.org verglichen, Git (Windows) mit der neuesten Git-for-Windows-Version, der Wrapper mit der im
Manager hinterlegten WinSW-Version; ohne Internet steht „aktuelle Version unbekannt“ (kein Fehler). Installation aus dem
Installer-Paket (Node.js liegt im Programmordner, Windows und Linux): Node.js und Git zeigen nur „kommt mit dem Mosaik³LAB-Paket – Update über ein
neues Paket“ (`Installieren.cmd` bzw. `sudo ./installieren.sh`), `runtime update node` lehnt mit diesem Hinweis ab (kein winget, kein apt). **Nie automatisch,
nur auf Knopfdruck.** Ablauf: Sicherung → Dienste stoppen → aktualisieren (Windows: `winget upgrade`/`install` mit
Windows-Bestätigung, Linux: `apt` per sudo – **UNGETESTET**) → Dienste starten → `/api/health`. Scheitert etwas, laufen die
Dienste trotzdem wieder, die Meldung nennt die Sicherung und den Befehl zum Zurückgehen (z. B.
`winget install --id OpenJS.NodeJS.LTS -e --version <alt>`). Nach Node-/Wrapper-Updates startet der Manager kurz neu.
`runtime update <node|git|wrapper> --dry-run` zeigt nur den Befehl. Der Wrapper (WinSW) wird durch Umbenennen der
laufenden Dienst-`.exe` und Kopieren der gepinnten Version getauscht (wirksam beim nächsten Dienstneustart; nur Windows).
npm-Pakete aktualisiert das App-Update (`npm ci` aus der Lock-Datei); „Pakete auf bekannte Schwachstellen prüfen“ zeigt
`npm audit --omit=dev` als Information.

Hinweis GitHub: Das Repository hat derzeit kein Remote. Für Updates von GitHub `update.repo` auf die Repo-Adresse
setzen; bei privatem Repo braucht der Server einen Lesezugang (Deploy-Key/Token).

## Kommandozeile

`npm run manager:cli -- <befehl>` bzw. `node manager/cli.mjs <befehl>` – ohne Anmeldung, mit `--json`
maschinenlesbar. Exit-Codes: **0** ok · **1** Warnung · **2** Fehler · **3** Administratorrechte fehlen (Befehl
wird ausgegeben) · **4** falscher Aufruf.

```
status                       Gesamtstatus, Dienste, Hinweise
doctor                       alle Prüfungen mit „Was tun?“
start|stop <webapp|backup>
backup [list|run]  ·  backup restore <id> --yes
update [check|install]
runtime [status [--audit]]  ·  runtime update <node|git|wrapper> [--dry-run]
setup --config <datei.json> [--dry-run]
uninstall [--dry-run] [--delete-data] [--yes] [--data-root <ordner>]
logs [--which app|manager|backup|update] [--errors]
mail [test [--to <adresse>]]
reconcile [--dry-run] [--path ablageDir|backupDir|logDir=<ordner>]
backup restore <id> --yes [--password <pw>]  ·  backup password set <pw>|generate|off
setup --from-backup <ordner> [--backup-password <pw>] [--path …] [--system-dry-run]
config
```

Beispiel `setup.json`: `{ "programRoot": "C:\\Program Files\\Mosaik3LAB", "dataRoot": "C:\\Mosaik3LAB",
"appPort": 3001, "network": false, "admin": { "email": "…", "name": "…", "password": "…" }, "downloadWrapper": true }`
(optional `"services": false`, `"shortcuts": false`, `"copyDeps": true` = node_modules mitkopieren statt `npm ci`,
`"prebuilt": true` = Installer-Paket: gebündelter Server (`server/dist`, ältere Pakete: node_modules), fertige Oberfläche und `node\node.exe` (Linux: `node/node`)
direkt nach `releases/<version>` kopieren (kein Umbenennen), kein `npm ci`, kein Build; bei Paketen mit node_modules legt das Setup fehlende Verweise der npm-Workspaces an; die Dienste nutzen dann `<Programm>\current\node\node.exe` bzw. `<Programm>/current/node/node`). Gibt es im Datenordner schon Startdatei und Datenbank, bleiben deren
Einstellungen erhalten (erneutes Einrichten setzt nichts zurück). Der Schritt „start“ startet auch den Manager-Dienst.

## API

Die Seite nutzt nur diese JSON-API (`GET /api` listet sie). Alles außer `auth`-Aufrufen braucht die Anmeldung
(Cookie). POST braucht zusätzlich `X-Manager-Token` (aus `<meta name="csrf-token">`) und JSON.

| Endpunkt | Zweck |
| --- | --- |
| `GET /api/auth` · `POST /api/auth/first\|login\|logout` | Anmeldestatus `{ loggedIn, remote, needsAdmin, managerPort }`, ersten Administrator anlegen `{ email, name, password }` (nur solange es keinen gibt), `GET /api/auth/erstzugang` Adressen `{ managerUrls, localUrl, publicNetwork }` (nur direkt am Server, nur ohne Administrator), Anmelden direkt am Server `{ email, password }` mit dem Admin-Konto der App (5 Fehlversuche → 60 s Sperre), Abmelden. Über die App-Adresse genügt die Admin-Sitzung der App. |
| `GET /api/status` | Alles für die Seite: `summary { light, text, fix }`, Hinweise (`notes[]` mit `fix`), Dienste, Adressen, 10 Sicherungen, `updates { app, runtime[] }`, Version |
| `POST /api/services/:key/start\|stop\|restart` | `webapp` oder `backup` |
| `GET /api/firewall` · `POST /api/firewall { enabled, dryRun }` | Netzfreigabe anzeigen/umschalten |
| `POST /api/backup` · `POST /api/backup/restore { id, confirm, password?, paths?, autoStop? }` | sichern / wiederherstellen (danach automatisch abgleichen; `autoStop`: laufende Web-App dafür stoppen und danach wieder starten) |
| `POST /api/backup/password { password \| generate \| disable }` | Backup-Passwort setzen/erzeugen (einmalig angezeigt)/Verschlüsselung aus |
| `POST /api/reconcile { dryRun, paths }` | Abgleichen: Firewall, Ordner, Ports, Dienste aus der Datenbank |
| `POST /api/update/check\|install` · `GET /api/update` | Update suchen (sonst automatisch alle 6 h) / installieren, Fortschritt |
| `GET /api/runtime` · `POST /api/runtime/audit\|update { what }` · `GET /api/runtime/progress` | Laufzeit: Status, npm audit, Update (eigener Prozess), Fortschritt |
| `GET/POST /api/settings` | Einstellungen (danach automatisch abgleichen) |
| `GET/POST /api/portal` · `POST /api/portal/cert/generate|upload|remove` | Pfad, Ports, HTTPS (Pfad gesetzt → Portal an), Zertifikat |
| `GET/POST /api/mail` · `POST /api/mail/test` | E-Mail bei neuen Anfragen (Adresse in Mails leer = automatisch) |
| `GET /api/setup` · `POST /api/setup { input, dryRun }` | Einrichtung: Vorschlag, Fortschritt / starten |
| `GET /api/logs?which=app\|manager\|backup\|update\|portal\|helfer` | letzte 100 Zeilen |

Für Tests ohne Screenshots haben wichtige Elemente `data-testid` (z. B. `summary-text`, `summary-fix`, `overall-light`,
`webapp-light`, `webapp-start`, `network-switch`, `backup-run`, `restore-open`, `restore-run`, `settings-save`, `advanced`,
`backup-table`, `update-check`, `setup-dry-run`), Ampeln tragen
ihren Zustand als Text und in `data-state`.

## Aufbau

```
server.mjs          Seite + API (fest 127.0.0.1/::1, Host-Header-Prüfung, CSRF-Token, Login)
lib/remote.mjs      Zugang über die App-Adresse: Kopf erkennen, Admin der App prüfen, nur-lokale Aktionen
cli.mjs             Kommandozeile
lib/config.mjs      Startdatei + Einstellungen aus der Datenbank, Ordner, Betriebsart, Übernahme der Altdateien
lib/settingsdb.mjs  Tabelle betrieb_einstellung lesen/schreiben (node:sqlite, kurze Transaktionen)
lib/backupcrypto.mjs  Backup-Passwort, AES-256-GCM
lib/portalserver.mjs  Portal: Weiterleitung 80/443 → App (+ Zertifikat-Seite)
lib/portalcert.mjs  HTTPS-Zertifikat: hinterlegen, prüfen, erzeugen, für Geräte
lib/reconcile.mjs   Abgleichen: System (Firewall, Ordner, Dienste) aus der Datenbank ableiten
lib/auto.mjs        Automatik: Abgleich beim Start/nach Änderungen, Backup-Dienst, Update-/Laufzeit-/Abweichungs-Prüfung
lib/auth.mjs        Passwort (scrypt), Sitzungen
lib/services.mjs    Dienste starten/stoppen/Status, Netzfreigabe
lib/backup.mjs      Sichern mit SHA-256-Prüfsummen, prüfen, wiederherstellen, aufräumen
lib/update.mjs      Git-Update mit automatischem Rollback (inkl. Datenbank zurückspielen, Downgrade-Schutz)
lib/paketupdate.mjs Update per Installer-Paket: Downgrade-Schutz, Sicherung vor dem Umschalten, Rückfall (für setup.mjs)
lib/git.mjs         Git finden (gemerkter Pfad, PATH, Standardorte), klare Fehlermeldung
lib/schema.mjs      Schema-Version der Datenbank / einer Programmversion lesen
lib/appstart.mjs    Start von Web-App und App-Skripten: tsx (node_modules) oder Bündel server/dist (Installer-Paket)
lib/runtime.mjs     Laufzeit: Node.js, Git, WinSW prüfen und aktualisieren, npm audit
lib/setup.mjs       Einrichten, install-manifest, Verknüpfungen, Deinstallation
lib/status.mjs      Gesamtstatus (ein Satz + Knopf), Adressen der App und doctor
lib/mail.mjs        E-Mail bei neuen Anfragen: Einstellungen in der Datenbank, Testmail
lib/log.mjs, icon.mjs   Protokolle (Rotation 5 MB × 5), Programmsymbol (PNG/ICO aus dem Logo)
runners/            eigenständige Prozesse: webapp (Watchdog, Neustart mit Backoff), backup (Zeitplan), update
platform/           windows.mjs, linux.mjs (inkl. Raspberry Pi; Installer-Weg getestet), index.mjs (Auswahl + Probelauf)
public/             index.html, app.css, app.js
test/               remote.test.mjs (über die App-Adresse: Weiterleitung, 403 ohne Admin-Sitzung der App), erstzugang*.test.mjs
                    (erster Administrator über das Netz, Sperre), auto.test.mjs (Automatik, Statussatz, Probelauf), portal.test.mjs
                    (Portal, HTTPS, belegte Ports, echte App unter /mosaik3lab), manager.test.mjs (Unit), admin.test.mjs (Admin-Schritt,
                    Sperrdatei), appstart.test.mjs, workspaces.test.mjs, status-extern.test.mjs, updates.test.mjs (Git, Laufzeit,
                    Paketquelle), aktualisieren.test.mjs (Update-Helfer, Rückfall), paketupdate.test.mjs (Paket-Update, Versionen),
                    backup-versionen.test.mjs, fremde-pfade.test.mjs (Sicherung vom anderen Betriebssystem), settings-*.test.mjs
                    (Einstellungen in der Datenbank, Backup → Einrichten aus Backup, Übernahme der Altdateien), selftest.mjs (über HTTP)
                    →  npm run manager:test
                    (Testdaten unter C:\Entwicklung\_testdaten\server-manager\, werden danach gelöscht)
```

## Notfall

- Manager startet nicht: `node manager/cli.mjs doctor` und `… logs --which manager --errors`.
  Kaputte Konfiguration → Standardwerte + Hinweis, und alle Aktionen, die Daten schreiben oder Dienste starten,
  sind gesperrt (damit nichts in einem falschen Ordner landet), bis die Einstellungen repariert sind; die vorige
  Fassung der Startdatei liegt als `mosaik3lab.json.bak` daneben; die Einstellungen selbst stehen in der Datenbank (und in Sicherungen).
- Admin-Passwort vergessen: ein anderer Administrator setzt es in der App zurück (Verwaltung → Konten); gibt es keinen mehr,
  bei gestoppter App `npm run user:create-admin -w server -- --email <adresse> --name <name>` (Passwort über `M3L_ADMIN_PASSWORD`).
- Daten zurückholen: `cli stop webapp` → `cli backup list` → `cli backup restore <id> --yes` → `cli start webapp`.
  Ohne den Manager auf diesem Rechner: Programm von derselben Quelle auf einem anderen Rechner/Ordner holen und
  `cli setup --from-backup <datei.m3lbackup>` (bzw. `cli backup restore`) benutzen – die Datei ist ein tar-Strom mit Kopf (bei Passwort
  verschlüsselt) und von Hand nicht lesbar; ältere Ordner-Sicherungen (`backup.json`) lassen sich noch kopieren.
- Update kaputt: normalerweise erledigt das der automatische Rollback (inkl. Datenbank aus der Sicherung). Von Hand: Verweis `current` im Programmordner auf die vorige Version unter `releases/` setzen.
- Ohne Bildschirm (Raspberry Pi/Server): normal über `http://<server>/mosaik3lab/manager/`; Notzugang ohne laufende App:
  `ssh -L 5190:127.0.0.1:5190 <benutzer>@<server>`, dann http://127.0.0.1:5190 – oder die CLI per SSH. Windows-Server: Remotedesktop.
