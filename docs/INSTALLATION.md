# Mosaik³LAB installieren (Windows; Linux und Raspberry Pi weiter unten)

So kommt Mosaik³LAB auf einen neuen Rechner, z. B. den Server-PC in der Schule. Es installiert sich wie ein normales
Programm und läuft danach von selbst, auch nach einem Neustart des Rechners. **Alles Nötige ist im Paket, auch Node.js
und die Datenbank** (SQLite ist in Node.js eingebaut). Vorher muss nichts installiert werden, auch kein Git und kein
Entwicklungsordner. Man braucht Administratorrechte und beim ersten Mal Internet (für den Dienst-Baustein WinSW).

## 1. Paket holen

Das Installer-Paket ist **eine ZIP-Datei**, z. B. `Mosaik3LAB-Installer-0.1.0-abc1234-windows-x64.zip`. Sie kommt

- per **USB-Stick** von dem Rechner, auf dem sie gebaut wurde (Ordner `C:\Entwicklung\_pakete`), oder
- von **GitHub** (privates Repository `x-vs-x/mosaik3lab`, Bereich „Releases“, nur mit Zugang).

## 2. Entpacken

ZIP-Datei mit der rechten Maustaste anklicken → **„Alle extrahieren …“** → „Extrahieren“. Wohin, ist egal
(z. B. Downloads oder Desktop), nur nicht in einen sehr tief verschachtelten Ordner.

## 3. `Installieren.cmd` doppelklicken

Im entpackten Ordner **`Installieren.cmd`** doppelklicken.

- Windows fragt **einmal** nach Administratorrechten → **„Ja“**.
- „Jetzt starten?“ → **J** und Enter.

Eingerichtet wird mit festen Werten:

| Was | Wo |
| --- | --- |
| Programm (mit Node.js) | `C:\Program Files\Mosaik3LAB` |
| Daten: Datenbank, Bilder/Videos/Druckdateien, Sicherungen, Protokolle | `C:\Mosaik3LAB` (`daten`, `ablage`, `backups`, `logs`) |
| Dienste mit Autostart | Web-App, Portal, Backup, Server-Manager |
| Im Schulnetz erreichbar | Firewall: Port 80, nur private Netze/Domäne |

**Danach kann der entpackte Ordner gelöscht werden**, die ZIP-Datei auch. Nichts verweist mehr darauf.
Zum Ausprobieren ohne Änderungen: `Installieren.cmd probelauf` in einer Eingabeaufforderung.

**Backup-Passwort:** Am Ende steht im Fenster einmalig ein **BACKUP-PASSWORT**. Aufschreiben und sicher aufbewahren
(z. B. im Tresor der Schulleitung). Ohne dieses Passwort lassen sich die verschlüsselten Sicherungen nicht wiederherstellen.

> **Vorhandene Daten übernehmen?** (z. B. Umzug von einem anderen Rechner): **nicht** `Installieren.cmd` starten,
> sondern im entpackten Ordner `manager\mosaik3lab.cmd` → Einrichten → **„Aus Sicherung einrichten“** → Sicherungsdatei
> (`.m3lbackup`) und Backup-Passwort angeben (Schritt für Schritt: [ANLEITUNG-DRUCKTEILE-UND-SICHERUNG.md](ANLEITUNG-DRUCKTEILE-UND-SICHERUNG.md)).

## 4. Administrator anlegen – von jedem Gerät im Schulnetz

Es öffnet sich kein Browser – die App ist nach der Installation einfach im Netz erreichbar. Am Ende steht im Fenster die
**Adresse**. Den Administrator bitte gleich anlegen: Bis dahin kann jeder im Schulnetz, der die Seite öffnet, das Konto anlegen.

1. Im Browser `http://<Rechnername>/mosaik3lab/` öffnen. Solange es keinen Administrator gibt, kommt jede Adresse der App
   direkt zur Seite **„Willkommen“**.
2. **E-Mail**, Name und **Passwort** (mindestens 8 Zeichen, zweimal) eingeben → „Anlegen und anmelden“.
3. Fertig: angemeldet im Server-Manager (dort z. B. den E-Mail-Versand einstellen). Mit demselben Konto meldet man sich in
   der App an; Administratoren finden den Server-Manager dort immer unter **Verwaltung → Server-Manager**. Andere Konten
   sehen ihn nicht.

Im Netz nicht erreichbar? Meist ist das Netzwerk als „Öffentlich“ eingestuft (der Installer weist darauf hin) →
Windows-Einstellungen → Netzwerk und Internet → Eigenschaften → „Privat“ (im Schulnetz meist „Domäne“).

## 5. Adresse der App

- im Schulnetz: **`http://<Rechnername>/mosaik3lab/`** (der Rechnername steht im Fenster von `Installieren.cmd`;
  statt des Namens geht auch die IP-Adresse des Rechners)
- auf dem Rechner selbst: `http://localhost/mosaik3lab/` – oder Desktop-Verknüpfung „Mosaik³LAB öffnen“

## 6. Neue Version, Deinstallieren

- **Neue Version – ab 1.1.0 per Knopfdruck:** Der Server-Manager meldet freigegebene neue Versionen selbst (Karte „Updates“,
  täglich geprüft). **„Jetzt aktualisieren“** → bestätigen → fertig: Er lädt das Paket für dieses System, prüft es, sichert
  vorher und installiert über den Update-Helfer. Klappt etwas nicht, läuft automatisch die bisherige Version weiter. Danach
  zeigt „Was ist neu“, was sich geändert hat. Ohne Internet am Server: das neue Paket entpacken und wieder
  **`Installieren.cmd`** doppelklicken – einfach drüberinstallieren. **Updates gibt es ab Version 1.6.3** – ein älterer Stand
  kommt zuerst mit dem Paket 1.6.3 auf diesen Stand. Details: [Update per Paket](#update-per-paket-windows-und-linux).
- **Ganz entfernen:** Startmenü → Mosaik³LAB → **„Mosaik³LAB deinstallieren“**. Es fragt, ob die Daten bleiben sollen
  (Standard: ja). Mit „n“ ist auch `C:\Mosaik3LAB` mit allen Daten weg – vorher eine Sicherung auf einen USB-Stick kopieren.

Hilfe bei Problemen: Server-Manager → „Erweitert“ → Protokoll; Logs liegen in `C:\Mosaik3LAB\logs`.

> **Installation an einem anderen Ort** (Dienste da, aber kein `C:\Program Files\Mosaik3LAB\install.json`): `Installieren.cmd`
> meldet das und ändert nichts. Erst „Mosaik³LAB deinstallieren“ mit Daten **behalten**, dann `Installieren.cmd`.

## Update per Paket (Windows und Linux)

Ein neues Paket wird einfach über die vorhandene Installation installiert (`Installieren.cmd` bzw. `sudo ./installieren.sh`).
Das Update ist so abgesichert wie das Update im Server-Manager:

1. **Prüfen, bevor etwas geändert wird:** Ist das Paket **älter** als die Installation (kleinere Versionsnummer, z. B.
   1.1.0 über 1.2.0, oder niedrigeres Datenbank-Schema), bricht es sofort ab: „Älteres Paket abgelehnt …“ bzw. „Downgrade
   verweigert … Es wurde nichts verändert.“ Bewusst zurück (selten, vorher sichern): aus dem entpackten älteren Paket
   `manager/cli.mjs setup --config Installieren.json --aeltere-version`.
   Die installierte Version läuft ungestört weiter. Dasselbe Paket noch einmal ist erlaubt („Version … ist bereits
   installiert“) und repariert z. B. Dienste, Firewall-Regel oder Verknüpfungen.
2. **Dienste stoppen, Sicherung:** Die Dienste (Web-App, Backup, Portal, Server-Manager) werden kurz gestoppt, dann sichert
   die **bisherige** Version Datenbank und Einstellungen (Sicherung „manuell (CLI)“ im Backup-Ordner, bei eingeschalteter
   Verschlüsselung verschlüsselt). Klappt die Sicherung nicht, wird nicht umgestellt: die Dienste laufen wieder wie vorher,
   die Meldung nennt den Grund (z. B. Platz, Backup-Ziel).
3. **Umschalten und starten:** Die neue Version liegt neben der alten (`releases\<version>-<commit>`), `current` zeigt auf sie,
   die Dienste starten, `/api/health` muss innerhalb von 2 Minuten antworten. Danach bleiben die neue und die vorige Version
   liegen, ältere werden aufgeräumt.
4. **Wenn die neue Version nicht antwortet** (oder ein späterer Schritt scheitert): automatisch **zurück auf die vorige
   Version**. Hat die neue Version das Datenbank-Schema schon geändert (Migrationen), wird die Datenbank aus der Sicherung
   aus Schritt 2 zurückgespielt – die alte Version läuft nie mit einem neueren Schema. Die kaputte Version wird entfernt.
   Der Aufruf endet mit Fehler und der Meldung, z. B.:

   > Update auf 0.2.0-abc1234 fehlgeschlagen (Die Web-App antwortet nicht.) – automatisch auf 0.1.0-9f8e7d6 zurückgeschaltet,
   > Daten unverändert: Datenbank aus der Sicherung mosaik3lab-… von direkt vor dem Update zurückgespielt (Schema 11 → 10).
   > 0.1.0-9f8e7d6 läuft wieder. Protokoll: C:\Mosaik3LAB\logs\app.log

   Die App läuft dann mit der alten Version und den alten Daten weiter; mit dem Protokoll beim Hersteller des Pakets melden.
   Nur wenn auch der Rückfall scheitert, steht das ausdrücklich da („… und der automatische Rückfall … ebenfalls“), mit dem
   Namen der Sicherung von direkt vor dem Update – dann im Server-Manager unter „Sicherungen“ wiederherstellen.

Daten, Konten, Einstellungen, Backup-Passwort, Ablage und ältere Sicherungen bleiben bei allem unverändert. Wer gerade im
Server-Manager angemeldet ist, muss sich nach dem Update neu anmelden (der Manager-Dienst wird mit gestoppt und neu
gestartet, seine Sitzungen liegen nur im Speicher). Die App ist während des Updates einige Sekunden bis Minuten nicht erreichbar.

### Zeitlimits beim Update

Die Sicherung vor dem Update kann auf einem Raspberry Pi mit großer Ablage (viele Bilder und Videos) lange dauern. Damit
eine langsame, aber gesunde Sicherung nie von einem äußeren Limit abgebrochen wird, ist jedes Limit größer als alles,
was es umschließt (festgelegt an einer Stelle: `manager/lib/zeitlimits.mjs`):

| Was | Limit |
| --- | --- |
| Sicherung vor dem Update (mit der bisherigen Version) | 2 Stunden |
| einzelner Admin-Schritt (z. B. Datenordner dem Dienstbenutzer übergeben, `chown`/`icacls` über die Ablage) | 30 Minuten |
| Wächter des Update-Helfers um die ganze Installation („hat zu lange gedauert“ → alter Stand zurück) | 3 Stunden |
| ganzer Lauf des Update-Helfers – Linux: `TimeoutStartSec=14400` der Unit `mosaik3lab-updater` | 4 Stunden |
| Windows: WinSW kennt kein Start-Zeitlimit; der Helfer begrenzt sich selbst (Wächter) | – |

Im Server-Manager steht „Update ist geprüft und wird gleich installiert …“ höchstens 10 Minuten – meldet sich der
Update-Helfer bis dahin nicht, kommt „Der Update-Helfer hat nicht reagiert“. Hat er sich gemeldet, zeigt die Karte
„Updates“ seinen Stand (bei längerer Stille „läuft noch (seit …)“), bis er fertig ist. Während Sicherung und Umschalten
ist der Server-Manager selbst gestoppt; die Seite wartet von allein und nennt die Größenordnung. Erst wenn ein Lauf
länger als 4 Stunden „läuft“, ist der Helfer sicher beendet: Dann sagt die Karte, dass der Server neu gestartet werden
soll – beim Hochfahren prüft der Update-Helfer und stellt bei Bedarf die bisherige Version wieder her.
Die neuen Limits gelten ab dem Update **auf** diese Version: Unter Linux schreibt das Update auch die Unit des Helfers neu
(ohne ihn zu stoppen); der Lauf, der dieses Update installiert, nutzt noch den Wächter der bisherigen Version (45 Minuten).

### Wer darf was ändern (Sicherheit)

Der Update-Helfer und die Einrichtung laufen mit Adminrechten (Linux: root, Windows: Konto System); der Server-Manager und
die Web-App laufen eingeschränkt (Linux: Benutzer `mosaik3lab`, Windows: „Lokaler Dienst“). Damit ein übernommener
Manager nie Admin-Rechte bekommt, führt das Admin-Konto nichts aus, was das eingeschränkte Konto ändern konnte:

- **Linux:** Unit-Dateien (`/etc/systemd/system/mosaik3lab-*.service`) und die polkit-Regel
  (`/etc/polkit-1/rules.d/50-mosaik3lab.rules`) erzeugt die Einrichtung selbst und schreibt sie als root direkt dorthin
  (gehören root, Rechte 644) – nie über `/var/lib/mosaik3lab/manager/dienste` (gehört `mosaik3lab`).
  Programmordner `/opt/mosaik3lab` gehört root und ist nur für root beschreibbar.
- **Windows:** Dienstdateien (WinSW `.exe`/`.xml` in `dienste\`, WinSW in `werkzeuge\`) und `node.exe` liegen im
  Programmordner. Unter „Programme“ gelten die Windows-Standardrechte (nur Administratoren/System schreiben); liegt der
  Programmordner woanders, setzt die Einrichtung diese Rechte ausdrücklich. Besitzer: Administratoren.
- **Update-Pakete:** Der Manager lädt das Paket nach `<Daten>/updates` (für ihn beschreibbar). Der Helfer kopiert es zuerst
  in `<Programm>/.update` (nur Admin/root), prüft die **Kopie** gegen die SHA-256-Prüfsumme der offiziellen Veröffentlichung
  (`SHA256SUMS.txt`, vom Helfer selbst geholt – dem Manager wird nicht vertraut) und entpackt und installiert nur diese
  Kopie. Den Auftrag (`auftrag.json`) prüft er ebenfalls (Versionsnummer, Dateiname); seinen Status schreibt er in den
  Programmordner.
- **Deinstallieren** (mit Adminrechten) übernimmt aus `install-manifest.json` (Linux im Datenordner) nur Einträge, die zu
  Mosaik³LAB passen: bekannte Dienstnamen, gültige Ports, Verknüpfungsdateien, der Programmordner dieser Installation.

---

# Linux und Raspberry Pi

Genauso einfach wie unter Windows: ein Paket, ein Befehl, **alles Nötige ist dabei** (auch Node.js), kein `apt` nötig.
Die Linux-Pakete baut und testet GitHub („Installer-Test“) und legt sie nach bestandenem Test im Release
**„installer-pakete“** ab, immer nur den neuesten Stand. Es gibt zwei Pakete:

| Rechner | Paket |
| --- | --- |
| PC/Server mit Linux (Ubuntu, Debian, … 64 Bit, Intel/AMD) | `Mosaik3LAB-Installer-<version>-<commit>-linux-x64.tar.gz` |
| Raspberry Pi 4/5 mit **Raspberry Pi OS 64 Bit** (oder anderes Linux auf ARM 64 Bit) | `Mosaik3LAB-Installer-<version>-<commit>-linux-arm64.tar.gz` |

Welches passt? `uname -m` im Terminal: `x86_64` → x64, `aarch64` → arm64. (`armv7l` = Raspberry Pi OS 32 Bit – dafür gibt
es kein Paket; bitte Raspberry Pi OS 64 Bit installieren.) Empfohlen: **Raspberry Pi OS „Bookworm“ (Debian 12)** bzw.
Ubuntu 24.04 oder neuer – ältere Systeme (Bullseye, Ubuntu 22.04) haben ein zu altes polkit: Mosaik³LAB läuft, aber der
Server-Manager kann die Dienste nicht selbst steuern und „Jetzt aktualisieren“ geht nicht (Updates dann per Paket, der
Installer weist darauf hin). Vorausgesetzt: systemd (bei allen üblichen Systemen dabei) und ein
Benutzer mit `sudo`.

## Paket holen

Die Linux-Pakete baut GitHub Actions (Workflow „Installer-Test“, siehe unten). Herunterladen:

- im Browser: github.com/x-vs-x/mosaik3lab → **Actions** → „Installer-Test“ → letzter grüner Lauf → unten bei **Artifacts**
  `Mosaik3LAB-Installer-linux-x64` bzw. `…-linux-arm64` anklicken. GitHub liefert eine ZIP-Datei, in der die `.tar.gz` liegt
  (Artifacts bleiben 30 Tage).
- oder mit der GitHub-Kommandozeile (auch direkt auf dem Pi):

  ```bash
  gh run list --repo x-vs-x/mosaik3lab --workflow installer-test.yml --status success --limit 1   # Nummer des Laufs
  gh run download <nummer> --repo x-vs-x/mosaik3lab --name Mosaik3LAB-Installer-linux-arm64
  ```

Auf den Pi kommt die Datei z. B. per USB-Stick oder `scp Mosaik3LAB-Installer-….tar.gz pi@<pi-name>:`.

## Installieren

```bash
tar xzf Mosaik3LAB-Installer-0.1.0-abc1234-linux-arm64.tar.gz
cd Mosaik3LAB-Installer-0.1.0-abc1234-linux-arm64
sudo ./installieren.sh
```

„Jetzt starten?“ → Enter. Eingerichtet wird mit festen Werten:

| Was | Wo |
| --- | --- |
| Programm (mit Node.js) | `/opt/mosaik3lab` (`releases/…`, Verweis `current`) |
| Daten: Datenbank, Bilder/Videos/Druckdateien | `/var/lib/mosaik3lab` (`daten`, `ablage`) |
| Sicherungen | `/var/backups/mosaik3lab` |
| Protokolle | `/var/log/mosaik3lab` |
| Dienste mit Autostart (systemd, Benutzer `mosaik3lab`) | `mosaik3lab-webapp`, `-portal`, `-backup`, `-manager` |
| Im Schulnetz erreichbar | Port 80 (Portal) unter `/mosaik3lab`; Firewall-Freigabe, falls `ufw`/`firewalld` da ist |

Die App selbst hört nur auf `127.0.0.1:3001`, der Server-Manager auf `127.0.0.1:5190`; erreichbar sind beide über das
Portal. Den **ersten Administrator** legt man wie unter Windows (Schritt 4) von einem beliebigen Gerät im Netz an –
`http://<rechnername>/mosaik3lab/` öffnen und das Konto anlegen; kein Bildschirm am Pi nötig.
Das **Backup-Passwort** steht einmalig am Ende im Terminal – aufschreiben!

App-Adresse im Schulnetz: **`http://<rechnername>/mosaik3lab/`** (oder die IP-Adresse, `hostname -I`).
Ausprobieren ohne Änderungen: `./installieren.sh probelauf`. Der entpackte Ordner kann danach gelöscht werden.

Hat der Rechner einen Desktop, steht im Anwendungsmenü „Mosaik³LAB öffnen“, „Server-Manager“ und „Mosaik³LAB deinstallieren“.
Auf einem Server ohne Desktop schadet das nicht.

## Neue Version, Deinstallieren

- **Neue Version:** neues Paket entpacken, wieder `sudo ./installieren.sh` – einfach drüberinstallieren. Ablauf (Downgrade-Schutz,
  Sicherung, automatischer Rückfall) wie unter Windows: [Update per Paket](#update-per-paket-windows-und-linux); Programm unter
  `/opt/mosaik3lab/releases/`, Protokoll `/var/log/mosaik3lab/app.log`.
- **Ganz entfernen:**

  ```bash
  sudo /opt/mosaik3lab/current/node/node /opt/mosaik3lab/current/manager/cli.mjs uninstall
  ```

  Es fragt, ob die Daten bleiben sollen (Standard: ja – `/var/lib/mosaik3lab`, `/var/backups/mosaik3lab` und
  `/var/log/mosaik3lab` bleiben dann liegen). Dienste, Firewall-Regel, Menüeinträge und `/opt/mosaik3lab` sind danach weg.
  Der Systembenutzer `mosaik3lab` bleibt (ihm gehören die Daten); entfernen mit `sudo userdel mosaik3lab`, wenn auch die Daten weg sind.

Hilfe bei Problemen: `systemctl status mosaik3lab-webapp`, `journalctl -u mosaik3lab-webapp`, Logs in `/var/log/mosaik3lab`.

---

## Für Entwickler: Versionen und Pakete

**Versionen (SemVer, eine Nummer für alles):** MAJOR.MINOR.PATCH, also große Umstellung, neue Funktion oder Fehlerbehebung.
Änderungen kommen in `CHANGELOG.md` unter „Unveröffentlicht“. Freigeben:

```bash
npm run release -- minor          # patch | minor | major | 1.2.3 → Versionen, CHANGELOG, Commit, Tag v1.2.0
git push origin main --follow-tags  # Tag → GitHub testet Windows, Linux, Pi → Release v1.2.0 mit allen drei Paketen
```

Für die Schule nur Pakete einer **freigegebenen Version** verwenden (`…-1.2.0-windows-x64.zip`, Release `v1.2.0`). Pakete
eines Stands ohne Tag heißen `…-1.2.0-dev.<commit>-…` und sind Entwicklungsstände.

```bash
npm run paket                     # → C:\Entwicklung\_pakete\Mosaik3LAB-Installer-<version>-windows-x64.zip
npm run paket -- D:\ausgabe       # anderer Ausgabeordner
```

`scripts/paket.mjs` nimmt den **eingecheckten Stand** (`git archive HEAD`, also ohne `.git`, `storage/`, Logs, lokale
Einstellungen und Passwörter), führt darin `npm ci`, den Client-Build und **`npm run bundle -w server`** aus (esbuild:
Web-App und die Skripte für den Server-Manager je als eine ESM-Datei in `server/dist/`, Node-Bordmittel wie `node:sqlite`
bleiben extern). Ins Paket kommt **wie bei einem normalen Programm nur, was zum Betrieb nötig ist – keine `node_modules`,
keine Quellen, keine Tests**: `server/dist/`, die Migrationen `server/src/storage/sqlite/migrations/*.sql` (die App spielt
sie ein, der Manager liest daraus die Schema-Version für den Downgrade-Schutz), `client/dist/`, `manager/` (ohne `test/`),
die `package.json`-Dateien und `package-lock.json` (Version, `npm audit`). Dazu die offizielle **`node.exe`**
(win-x64, gleiche Version wie beim Bauen, SHA-256 gegen `SHASUMS256.txt` von nodejs.org geprüft, zwischengespeichert in
`<ausgabeordner>\.node`) in `node\`; gepackt mit `tar.exe` (Windows) als ZIP. Oben im Paket liegen
`Installieren.cmd`, `Installieren.json` (Standardwerte, Vorlage in `manager/`), `paket.json` (Version, Commit,
Node-Version und -Prüfsumme) und `README.txt` (Kurzanleitung für genau dieses Paket, Vorlagen je Ziel in
`scripts/paket-readme/`, Version und Commit werden eingesetzt).

Das Paket (Windows) hat rund 40 MB als ZIP und gut 120 Dateien (entpackt ≈ 100 MB, davon 96 MB `node.exe`) – schnell
entpackt und kopiert, kaum Arbeit für den Virenscanner. Das Setup kopiert das Programm **direkt** nach `releases\<version>`
(kein Umbenennen, das Virenscanner gern mit EPERM blockieren). `current` zeigt erst nach dem vollständigen Kopieren darauf.

Wie gestartet wird, entscheidet `manager/lib/appstart.mjs`: Liegt `node_modules/tsx` vor (Arbeitskopie in der Entwicklung),
läuft die App aus TypeScript; sonst aus dem Bündel `server/dist/` (Installer-Paket).

`Installieren.cmd` holt einmal Adminrechte und ruft `node\node.exe manager\cli.mjs setup --config Installieren.json` auf.
`"prebuilt": true` kopiert das fertige Programm (gebündelter Server, fertige Oberfläche)
und `node\node.exe` mit in die Version – kein `npm ci`, kein Build, kein systemweites Node. Die Dienste starten `C:\Program Files\Mosaik3LAB\current\node\node.exe`; ein
Zurückschalten nimmt so auch die passende Node-Version mit. Der Server-Manager zeigt bei Node.js „kommt mit dem
Paket“ statt winget anzubieten; Updates kommen nur als Paket (einen Git-Update-Weg gibt es nicht mehr).

Probelauf ohne Systemänderung: `Installieren.cmd probelauf` (nur Plan), oder echtes Kopieren in Testordner mit eigener
`Installieren.json` (`programRoot`/`dataRoot` unter `_testdaten`) und `MOSAIK3LAB_SYSTEM_DRY_RUN=<datei.json>` (keine Dienste,
Firewall, Verknüpfungen, kein Stoppen; siehe `manager/README.md`).

**Linux-Pakete** baut dasselbe Skript, wenn es **unter Linux** läuft – immer für die eigene Architektur (`linux-x64` bzw.
`linux-arm64`), denn das mitgelieferte Node.js passt nur dorthin (der gebündelte Server selbst ist reines JavaScript). Statt `node.exe` kommt `bin/node` aus dem
offiziellen `node-<version>-linux-<arch>.tar.gz` (SHA-256 geprüft) nach `node/node`; oben liegen `installieren.sh` (aus
`manager/`), `Installieren.json`, `paket.json`, `README.txt`, alles in einem Ordner `Mosaik3LAB-Installer-…-linux-<arch>/` im `.tar.gz`.
Unter Windows gibt es bewusst keinen Linux-Bau (keine Ausführungsrechte, falsches Node) – die Linux-Pakete
entstehen auf GitHub Actions (siehe unten) und liegen dort als Artifact. `installieren.sh` holt einmal `sudo`, macht bei einer
vorhandenen Installation zuerst `cli backup run` und ruft `node/node manager/cli.mjs setup --config Installieren.json` auf;
das Setup legt den Benutzer `mosaik3lab` an, übergibt ihm die Datenordner und richtet die systemd-Dienste ein.

### Echter Test auf frischen Rechnern (GitHub Actions)

**Aufbau (seit 2026-11-16 parallel):** Je System baut ein Job `…-paket` das Paket des getesteten Stands **einmal** und legt
es als Artifact ab (`Mosaik3LAB-Installer-windows-x64` bzw. `…-linux-<arch>`). Dann laufen die Runden auf je einem eigenen,
frischen Rechner gleichzeitig: **`neu`** (Neuinstallation, Update, Rückfall, Downgrade, Update per Knopfdruck,
Deinstallation) und **`v163`** (Update von 1.6.3, zweite Runde unten), daneben `npm run manager:test` auf einem Rechner ohne Installation (`manager-windows`, `linux-<arch> /
manager`). Erst wenn **alle** Jobs eines Systems bestanden sind, legt `windows-release` bzw. `linux-<arch> / release` genau das
gebaute Paket ins Release (nicht bei Pull Requests). Linux steht in `.github/workflows/installer-linux.yml`, das für x64 und
arm64 je einmal aufgerufen wird – jede Architektur veröffentlicht unabhängig von der anderen. Dauer insgesamt etwa 5–6 Minuten.

`.github/workflows/installer-test.yml` baut das Paket auf `windows-latest`, führt **`Installieren.cmd /still`** echt aus
(ohne Rückfragen, Pause und Browser; der Runner ist schon Administrator), prüft Dienste (laufen, Autostart, Node aus
`C:\Program Files\Mosaik3LAB`), Portal/App/Manager, Ordner und Firewall-Regel, legt ein Admin-Konto und eine Markerdatei an,
installiert eine zweite Paketkopie (anderer Commit in `paket.json`) als Update und prüft, dass Konto, Datei und Sicherung
bleiben. Dann der **Rückfall-Test**: eine dritte Kopie ist absichtlich kaputt (eine zusätzliche Migration `NNN_ci_kaputt.sql`,
und an `server/dist/server.mjs` ist ein Ende mit Code 3 nach dem Einspielen angehängt – nur in dieser Testkopie, im Programm gibt es dafür keinen Schalter).
Ihr Update muss mit Fehler enden, danach läuft wieder die vorige Version, die Datenbank hat ihr Schema (keine Tabelle
`ci_kaputt`), Konto und Datei sind da (`pruefen.ps1 zurueck`). Zum Schluss der **Downgrade-Test**: eine Kopie ohne die neueste
Migration muss mit „Downgrade verweigert“ abgelehnt werden, ohne etwas zu ändern. Danach `uninstall --yes` (Daten behalten) mit Prüfung.
**Zweite Runde `v163`:** das Paket aus dem Release `v1.6.3` von `x-vs-x/mosaik3lab-pakete` (genau das, was die Schule hat;
ältere Stände werden nicht mehr unterstützt) mit frischen Daten installieren, Admin-Konto, Markerdatei und ein Druckteil
mit Bildern anlegen (`bilder-pruefen.mjs --testdaten`, unter Linux auch die Mail-Einstellungen), Zeilen je Tabelle und alle
Dateien der Ablage merken (`daten-stand.mjs`), auf den neuen Stand aktualisieren und vergleichen: Konto, Datei, Sicherung,
fachliche Datensätze und Ablage (SHA-256) unverändert, danach Bildverarbeitung der neuen Version. `npm run manager:test` läuft im Job
`manager-windows` auf eigenem Rechner (auf einem Rechner mit echter Installation stoppt dieser Test Dienste) – das
Release-Paket kommt nur nach bestandenen Manager-Tests.
Die Prüfungen stehen in `.github/installer-test/pruefen.ps1`, bei Fehlern gibt es die Logs als Artifact
`installer-logs-windows-<runde>`. Das kaputte Update erkennt der Installer nach etwa 20 Sekunden (die Web-App hat sich
mehrmals hintereinander beendet, `manager/lib/startwache.mjs`) – früher wartete er jedes Mal die vollen 2 Minuten.
Ein neuer Push auf denselben Pull Request bricht den laufenden Test ab; Tags werden nie abgebrochen.

Genauso laufen die Jobs **`linux-x64`** auf `ubuntu-latest` und **`linux-arm64`** auf `ubuntu-24.04-arm` (ARM wie im
Raspberry Pi 4/5, Ubuntu statt Raspberry Pi OS): Paket bauen und als Artifact `Mosaik3LAB-Installer-linux-<arch>` hochladen
(7 Tage, ältere Läufe räumt `aufraeumen` weg), entpacken, `sudo ./installieren.sh --still`, Prüfungen aus `.github/installer-test/pruefen.sh` (zusätzlich: Dienste
laufen als `mosaik3lab`, Portal mit `CAP_NET_BIND_SERVICE`, App nur auf 127.0.0.1, keine root-Dateien in Daten/Sicherungen/
Protokollen, ufw-Regel, Menüeintrag), dieselben zwei Runden, `npm run manager:test`. Logs bei Fehlern: `installer-logs-linux-<arch>-<runde>`
(inkl. `journalctl` der Dienste). Steht `[nur-linux]` in der Commit-Nachricht (Push auf `installer-test/**`) oder im Titel des Pull Requests, entfallen die Windows-Jobs (spart Zeit beim
Arbeiten an Linux).

Der Test läuft nicht bei jedem Push auf main, sondern bei Pull Requests auf Installer/Manager/Workflows, bei Tags und

```bash
gh workflow run installer-test.yml                               # von Hand, Stand von main (geht erst, wenn die Datei in main ist)
git push origin <branch>:installer-test/<name>                   # oder einen Branch testen; danach: git push origin --delete installer-test/<name>
```

Ergebnis: `gh run watch` bzw. `gh run view --log-failed`.
