# Mosaik³LAB installieren (Windows; Linux und Raspberry Pi weiter unten)

So kommt Mosaik³LAB auf einen neuen Rechner, z. B. den Server-PC in der Schule. Es installiert sich wie ein normales
Programm und läuft danach von selbst, auch nach einem Neustart des Rechners. **Alles Nötige ist im Paket, auch Node.js
und die Datenbank** (SQLite ist in Node.js eingebaut). Vorher muss nichts installiert werden, auch kein Git und kein
Entwicklungsordner. Man braucht Administratorrechte und beim ersten Mal Internet (für den Dienst-Baustein WinSW).

## 1. Paket holen

Das Installer-Paket ist **eine ZIP-Datei**, z. B. `Mosaik3LAB-Installer-0.1.0-abc1234.zip`. Sie kommt

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

## 4. Administrator anlegen

Danach öffnet sich der **Server-Manager** (`http://127.0.0.1:5190`, nur auf diesem Rechner). Beim ersten Mal legt man dort
das **Administrator-Konto** an: E-Mail, Name, Passwort (mindestens 8 Zeichen). Mit diesem Konto meldet man sich auch in
der App an. Im Server-Manager stellt man außerdem den E-Mail-Versand ein.

## 5. Adresse der App

- im Schulnetz: **`http://<Rechnername>/mosaik3lab/`** (der Rechnername steht im Fenster von `Installieren.cmd`;
  statt des Namens geht auch die IP-Adresse des Rechners)
- auf dem Rechner selbst: `http://localhost/mosaik3lab/` – oder Desktop-Verknüpfung „Mosaik³LAB öffnen“

## 6. Neue Version, Deinstallieren

- **Neue Version:** das neue Paket entpacken und wieder **`Installieren.cmd`** doppelklicken – einfach drüberinstallieren,
  vorher nichts deinstallieren oder sichern. Was dabei passiert und was bei Fehlern passiert: [Update per Paket](#update-per-paket-windows-und-linux).
- **Ganz entfernen:** Startmenü → Mosaik³LAB → **„Mosaik³LAB deinstallieren“**. Es fragt, ob die Daten bleiben sollen
  (Standard: ja). Mit „n“ ist auch `C:\Mosaik3LAB` mit allen Daten weg – vorher eine Sicherung auf einen USB-Stick kopieren.

Hilfe bei Problemen: Server-Manager → „Erweitert“ → Protokoll; Logs liegen in `C:\Mosaik3LAB\logs`.

> **Ältere Installation** (Programm noch unter `C:\Mosaik3LAB\programm`): `Installieren.cmd` meldet das und ändert nichts.
> Erst „Mosaik³LAB deinstallieren“ mit Daten **behalten**, dann `Installieren.cmd` – die Daten in `C:\Mosaik3LAB`
> werden weiterverwendet. Danach kann der leere Ordner `C:\Mosaik3LAB\manager` gelöscht werden.

## Update per Paket (Windows und Linux)

Ein neues Paket wird einfach über die vorhandene Installation installiert (`Installieren.cmd` bzw. `sudo ./installieren.sh`).
Das Update ist so abgesichert wie das Update im Server-Manager:

1. **Prüfen, bevor etwas geändert wird:** Ist das Paket **älter** als die Installation (es kennt ein niedrigeres
   Datenbank-Schema, als die Datenbank schon hat), bricht es sofort ab: „Downgrade verweigert … Es wurde nichts verändert.“
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

---

# Linux und Raspberry Pi

Genauso einfach wie unter Windows: ein Paket, ein Befehl, **alles Nötige ist dabei** (auch Node.js), kein `apt` nötig.
Es gibt zwei Pakete:

| Rechner | Paket |
| --- | --- |
| PC/Server mit Linux (Ubuntu, Debian, … 64 Bit, Intel/AMD) | `Mosaik3LAB-Installer-<version>-<commit>-linux-x64.tar.gz` |
| Raspberry Pi 4/5 mit **Raspberry Pi OS 64 Bit** (oder anderes Linux auf ARM 64 Bit) | `Mosaik3LAB-Installer-<version>-<commit>-linux-arm64.tar.gz` |

Welches passt? `uname -m` im Terminal: `x86_64` → x64, `aarch64` → arm64. (`armv7l` = Raspberry Pi OS 32 Bit – dafür gibt
es kein Paket; bitte Raspberry Pi OS 64 Bit installieren.) Vorausgesetzt: systemd (bei allen üblichen Systemen dabei) und ein
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

Die App selbst hört nur auf `127.0.0.1:3001`, der Server-Manager auf `127.0.0.1:5190`. Ohne Bildschirm (typisch beim Pi)
erreicht man den Manager von einem anderen Rechner so: `ssh -L 5190:127.0.0.1:5190 <benutzer>@<pi-name>`, dann dort
`http://127.0.0.1:5190` öffnen. Dort beim ersten Mal das **Administrator-Konto** anlegen (wie unter Windows, Schritt 4).
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

## Für Entwickler: Paket bauen

```bash
npm run paket                     # → C:\Entwicklung\_pakete\Mosaik3LAB-Installer-<version>-<commit>.zip
npm run paket -- D:\ausgabe       # anderer Ausgabeordner
```

`scripts/paket.mjs` nimmt den **eingecheckten Stand** (`git archive HEAD`, also ohne `.git`, `storage/`, Logs, lokale
Einstellungen und Passwörter), führt darin `npm ci` und den Client-Build aus, legt die offizielle **`node.exe`**
(win-x64, gleiche Version wie beim Bauen, SHA-256 gegen `SHASUMS256.txt` von nodejs.org geprüft, zwischengespeichert in
`<ausgabeordner>\.node`) nach `node\` und packt alles mit `tar.exe` (Windows) als ZIP. Oben im Paket liegen
`Installieren.cmd`, `Installieren.json` (Standardwerte, Vorlage in `manager/`) und `paket.json` (Version, Commit,
Node-Version und -Prüfsumme). Die Verweise der npm-Workspaces fehlen im ZIP; das Setup legt sie neu an.

`Installieren.cmd` holt einmal Adminrechte und ruft `node\node.exe manager\cli.mjs setup --config Installieren.json` auf.
`"prebuilt": true` kopiert `node_modules`, die fertige Oberfläche und `node\node.exe` mit in die Version – kein `npm ci`,
kein Build, kein systemweites Node. Die Dienste starten `C:\Program Files\Mosaik3LAB\current\node\node.exe`; ein
Zurückschalten nimmt so auch die passende Node-Version mit. Der Server-Manager zeigt bei Node.js und Git „kommt mit dem
Paket“ statt winget anzubieten; seine Git-Updates gibt es auf solchen Rechnern nicht (`update.repo` ist leer).

Probelauf ohne Systemänderung: `Installieren.cmd probelauf` (nur Plan), oder echtes Kopieren in Testordner mit eigener
`Installieren.json` (`programRoot`/`dataRoot` unter `_testdaten`) und `MOSAIK3LAB_SYSTEM_DRY_RUN=<datei.json>` (keine Dienste,
Firewall, Verknüpfungen, kein Stoppen; siehe `manager/README.md`).

**Linux-Pakete** baut dasselbe Skript, wenn es **unter Linux** läuft – immer für die eigene Architektur (`linux-x64` bzw.
`linux-arm64`), denn `npm ci` holt dann die passenden nativen Teile (esbuild für tsx). Statt `node.exe` kommt `bin/node` aus dem
offiziellen `node-<version>-linux-<arch>.tar.gz` (SHA-256 geprüft) nach `node/node`; oben liegen `installieren.sh` (aus
`manager/`), `Installieren.json`, `paket.json`, alles in einem Ordner `Mosaik3LAB-Installer-…-linux-<arch>/` im `.tar.gz`.
Unter Windows gibt es bewusst keinen Linux-Bau (falsche native Pakete, keine Ausführungsrechte/Verweise) – die Linux-Pakete
entstehen auf GitHub Actions (siehe unten) und liegen dort als Artifact. `installieren.sh` holt einmal `sudo`, macht bei einer
vorhandenen Installation zuerst `cli backup run` und ruft `node/node manager/cli.mjs setup --config Installieren.json` auf;
das Setup legt den Benutzer `mosaik3lab` an, übergibt ihm die Datenordner und richtet die systemd-Dienste ein.

### Echter Test auf frischen Rechnern (GitHub Actions)

`.github/workflows/installer-test.yml` baut das Paket auf `windows-latest`, führt **`Installieren.cmd /still`** echt aus
(ohne Rückfragen, Pause und Browser; der Runner ist schon Administrator), prüft Dienste (laufen, Autostart, Node aus
`C:\Program Files\Mosaik3LAB`), Portal/App/Manager, Ordner und Firewall-Regel, legt ein Admin-Konto und eine Markerdatei an,
installiert eine zweite Paketkopie (anderer Commit in `paket.json`) als Update und prüft, dass Konto, Datei und Sicherung
bleiben. Dann der **Rückfall-Test**: eine dritte Kopie ist absichtlich kaputt (eine zusätzliche Migration `NNN_ci_kaputt.sql`,
und `server/src/index.ts` beendet sich nach dem Einspielen – nur in dieser Testkopie, im Programm gibt es dafür keinen Schalter).
Ihr Update muss mit Fehler enden, danach läuft wieder die vorige Version, die Datenbank hat ihr Schema (keine Tabelle
`ci_kaputt`), Konto und Datei sind da (`pruefen.ps1 zurueck`). Zum Schluss der **Downgrade-Test**: eine Kopie ohne die neueste
Migration muss mit „Downgrade verweigert“ abgelehnt werden, ohne etwas zu ändern. Danach `uninstall --yes` (Daten behalten) mit Prüfung und zum Schluss `npm run manager:test` – **nur dort**, auf
einem Rechner mit echter Installation stoppt dieser Test Dienste. Die Prüfungen stehen in `.github/installer-test/pruefen.ps1`,
bei Fehlern gibt es die Logs als Artifact `installer-logs`. Dauer etwa 6 Minuten.

Genauso laufen die Jobs **`linux (x64)`** auf `ubuntu-latest` und **`linux (arm64)`** auf `ubuntu-24.04-arm` (ARM wie im
Raspberry Pi 4/5, Ubuntu statt Raspberry Pi OS): Paket bauen und als Artifact `Mosaik3LAB-Installer-linux-<arch>` hochladen
(30 Tage), entpacken, `sudo ./installieren.sh --still`, Prüfungen aus `.github/installer-test/pruefen.sh` (zusätzlich: Dienste
laufen als `mosaik3lab`, Portal mit `CAP_NET_BIND_SERVICE`, App nur auf 127.0.0.1, keine root-Dateien in Daten/Sicherungen/
Protokollen, ufw-Regel, Menüeintrag), Update, Rückfall- und Downgrade-Test, Deinstallieren, `npm run manager:test`. Logs bei Fehlern: `installer-logs-linux-<arch>`
(inkl. `journalctl` der Dienste). Steht `[nur-linux]` in der Commit-Nachricht, entfällt der Windows-Job (spart Minuten beim
Arbeiten an Linux).

Der Test läuft nicht bei normalen Pushes (Windows-Minuten zählen im privaten Repo doppelt), sondern nur

```bash
gh workflow run installer-test.yml                               # von Hand, Stand von main (geht erst, wenn die Datei in main ist)
git push origin <branch>:installer-test/<name>                   # oder einen Branch testen; danach: git push origin --delete installer-test/<name>
```

Ergebnis: `gh run watch` bzw. `gh run view --log-failed`.
