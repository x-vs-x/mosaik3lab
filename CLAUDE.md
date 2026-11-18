# Arbeitsweise für Claude in diesem Projekt

## Ein Hauptchat, viele Unter-Sessions
- Der **Hauptchat** nimmt alle Wünsche entgegen, plant, verteilt und führt zusammen. Er baut selbst nur Kleinigkeiten
  (wenige Zeilen, Tippfehler, Fragen).
- Jede **eigenständige Funktion** bekommt eine eigene Unter-Session mit klarem Auftrag: Ziel, betroffene Dateien,
  „fertig“ heißt: `npm run typecheck` + `npm test` grün, Eintrag im Protokoll.
- **Keine Konflikte bei Parallelarbeit:**
  - Jede Unter-Session arbeitet in einem eigenen Git-Worktree/Branch (`feature/<kurzname>`), nie direkt im Hauptordner.
    Im neuen Worktree zuerst `npm install`. Kleine, sinnvolle Commits auf dem eigenen Branch.
  - Vor dem Start legt der Hauptchat fest, welche Dateien jede Session ändern darf. Zwei Sessions, die dieselben
    Dateien brauchen (z. B. ein Modul in `shared/src/`, `client/src/lib/api.ts`, `App.tsx`), laufen **nacheinander**.
  - Gemeinsame Verträge (Typen, API) werden zuerst im Hauptchat festgelegt, danach bauen Sessions dagegen.
- **Über Pull Requests (seit 2026-11-15):** Feature-Branch pushen und früh einen Pull Request gegen `main` öffnen
  (`gh pr create`, Beschreibung: was, warum, wie getestet; Entwurf, solange er nicht fertig ist). GitHub prüft jeden PR
  automatisch („Prüfen“: typecheck, Lint, alle Tests; bei Installer-/Manager-Änderungen zusätzlich „Installer-Test“ auf
  Windows, Linux und Pi). **Gemergt wird nur mit grünen Prüfungen**, per `gh pr merge --merge --delete-branch`, nie direkt
  auf `main` committen. Merge-Konflikte löst die Session in ihrem Worktree (`git merge main`), nie im Hauptordner.
  Danach lokal `git pull`, `git worktree remove` und Restordner (node_modules) entfernen, Session archivieren.
  Repo: **öffentlich** `x-vs-x/mosaik3lab` (seit 2026-11-16 ohne alten Verlauf, freie Actions-Minuten; voller Verlauf privat
  in `x-vs-x/mosaik3lab-archiv`). Commits nur mit der GitHub-noreply-Adresse, nie mit persönlichen Daten.
  Fertige Pakete öffentlich in `x-vs-x/mosaik3lab-pakete` (nur freigegebene Versionen).

## Ideen-Eingang
Neue Wünsche des Nutzers, die nicht sofort gebaut werden sollen, nur **wörtlich** in
[docs/IDEEN.md](docs/IDEEN.md) unter „Neu“ eintragen – nicht umsetzen, nicht planen. Das Abarbeiten
(prüfen, planen, verteilen oder nach `BACKLOG.md` zurückstellen) macht ein eigener Agent.

## Adresse – http://<IP>/mosaik3lab ist immer der aktuelle Stand
| Instanz            | Frontend | API  | Start                                                    |
| ------------------ | -------- | ---- | -------------------------------------------------------- |
| Installiert (Dienste, seit 2026-11-02) | **Port 80, Verzeichnis `/mosaik3lab`** (`http://localhost/mosaik3lab`, im WLAN `http://<IP>/mosaik3lab`) | 3001 (nur lokal) | Windows-Dienste `mosaik3lab-*` (Autostart), Installer-Paket (seit 2026-11-02 abends): Programm `C:\Program Files\Mosaik3LAB\current` (eigenes Node), Daten `C:\Mosaik3LAB`. Neuer Stand von `main` → `npm run paket` → Paket entpacken → `Installieren.cmd` (Update mit Sicherung und Rückfall; kein Git-Update). **Kein Entwicklungsserver auf 80/3001 mehr** (launch.json „mosaik3lab“ nur, wenn die Dienste gestoppt sind). |
| Unter-Session n    | 5180+n   | 3010+n | `$env:WEB_PORT=518n; $env:API_PORT=301n; npm run dev`  |

Für Unter-Sessions gibt es in `.claude/launch.json` feste Plätze **session-1 … session-3** (5181–5183 / 3011–3013,
eigener Datenordner mit Demo-Daten): `preview_start {name: "session-n"}`. Der Hauptchat teilt die Nummer im Auftrag zu.

## Feste Ordner – nichts im Temp-Verzeichnis
| Zweck | Pfad |
| --- | --- |
| Entwicklung: Quellcode (Hauptstand) | `C:\Entwicklung\mosaik3lab` – **nur Code, keine Daten** |
| Daten des Hauptstands (auch in der Entwicklung) | `C:\Mosaik3LAB\daten` (Datenbank), `C:\Mosaik3LAB\ablage` (Bilder, Videos, Druckdateien), `C:\Mosaik3LAB\backups` – Standard ohne `STORAGE_DIR`, überschreibbar mit `MOSAIK3LAB_ROOT` |
| Entwicklung: Arbeitskopie einer Session | `C:\Entwicklung\mosaik3lab-<name>` |
| Entwicklung: Testdaten einer Session | `C:\Entwicklung\_testdaten\<name>\` (STORAGE_DIR, Kopien, Test-Backups) |
| Installiert (Windows, Installer-Paket) | Programm `C:\Program Files\Mosaik3LAB\` (`releases\`, `current`, Dienstdateien, Node), Daten `C:\Mosaik3LAB\` mit `daten\`, `ablage\bilder\`, `ablage\druckdateien\`, `ablage\videos\`, `backups\`, `logs\` |
| Installiert (Linux/Raspberry Pi OS 64 Bit, Installer-Paket `…-linux-x64` bzw. `…-linux-arm64.tar.gz`) | Programm `/opt/mosaik3lab` (`releases/`, `current`, Node; gehört root), Daten `/var/lib/mosaik3lab` (`daten/`, `ablage/`, `manager/` mit Dienstdateien und Manifest), `/var/backups/mosaik3lab`, `/var/log/mosaik3lab` – Dienste systemd `mosaik3lab-*`, Benutzer `mosaik3lab` |

Alle installierten Pfade sind Vorgaben, im Server-Manager änderbar. Testdaten werden beim Aufräumen gelöscht,
der Ordner `_testdaten\<name>` mit.

**Token-sparend prüfen:** `node scripts/check.mjs [API-Port]` → eine Zeile ✔/✘ je Schritt (typecheck, test, health).
Für Seiten `read_page`/`find` statt Screenshots; Screenshots nur für Optik, dann verkleinert.

**Netzwerk schonen (Lehre vom 2026-11-01):** Dieser Windows-Rechner gibt beendete Verbindungen (TIME_WAIT) zeitweise nicht
mehr frei. Jede neue Verbindung belegt dann dauerhaft einen der rund 16.000 ausgehenden Ports, bis alles hängt
(`connect ETIMEDOUT`/`EADDRINUSE`, endlose Ladeanzeigen, wackelnde Tests).
- Keine Last- oder Massentests (keine hundert parallelen Anfragen).
- HTTP-Clients und Proxys mit Keep-Alive.
- Test-Server nach Gebrauch sofort stoppen.
- Höchstens 2–3 Sessions gleichzeitig mit eigenen Servern.
- Bei rätselhaften Hängern zuerst zählen: `netstat -ano -p tcp`, Zustand „WARTEND“ = TIME_WAIT. Mehr als 10.000 → Rechner neu starten.

Unter-Sessions starten **nie** einen Server auf 80/3001/5190. Jeder Worktree hat seinen eigenen `storage/` (git-ignoriert),
die Testdaten stören sich also nicht.

## Aufräumen – aber nachvollziehbar
Bevor eine Session „fertig“ meldet:
1. Eigene Server stoppen, temporäre Dateien/Skripte (Scratchpad, Test-Uploads, Debug-Ausgaben) löschen.
2. **Nichts löschen**, was der Nutzer angelegt hat oder was in `storage/` vom Hauptstand liegt.
3. Einen Eintrag in [docs/PROTOKOLL.md](docs/PROTOKOLL.md) oben ergänzen: was gebaut, welche Dateien, was aufgeräumt.

## Betriebsziele (Entscheidungen des Nutzers, 2026-10-31)
- Läuft vorerst auf dem eigenen Windows-Rechner, soll später auf anderem Betriebssystem laufen können → nichts
  Windows-Fest verdrahten, OS-Spezifisches kapseln.
- Betrieb als **Dienste** (Web-App, Backup, Server-Manager), Dienstkonto je Dienst konfigurierbar, automatischer Neustart.
- Zugriff später im **Schulnetz mit HTTPS**.
- Server-Manager (`manager/`): über `<Pfad>/manager` nur für App-Administratoren (Notzugang 127.0.0.1); erster Administrator
  nach der Installation über das Netz, ohne Einrichtungscode (Entscheidung des Nutzers, 2026-11-15).
- **Der Server-Manager ist zugleich der Installer** (Windows, Linux, Raspberry Pi OS, macOS): erkennt beim ersten Start
  die Plattform, richtet alles Nötige ein (Abhängigkeiten, Build, Ordner, Dienste, Firewall) und fragt nur die
  Grundeinstellungen ab. Außerhalb von Node nur zwei Mini-Starter (`mosaik3lab.cmd`/`.sh`, prüfen Node).
- **Aufgabenteilung:** Manager = Betrieb + Grundeinstellungen, **inklusive E-Mail-Versand** (SMTP + Empfänger für
  Bestell-Mails, gespeichert in der Datenbank, die App liest sie nur) **und aller Pfade** (Datenordner,
  Ablageordner `ABLAGE_DIR`, Backup-Ziel – die App zeigt sie höchstens lesend an). **Alles andere Fachliche über die App**
  (Verwaltung → Einstellungen). **Alle Einstellungen – auch Betrieb, Mail und Manager-Passwort – liegen in der Datenbank** (Tabelle `betrieb_einstellung`,
  `docs/DATENMODELL.md`); außerhalb bleibt nur die Startdatei `<Wurzel>/mosaik3lab.json` mit `{ dataDir, managerPort }`.
  Backup (Datenbank + Ablage, mit Backup-Passwort verschlüsselt) = vollständiger Stand; Wiederherstellen/„Aus Backup
  einrichten“ gleicht das System (Ports, Firewall, Dienste) an die Datenbank an. Nichts doppelt bauen. Keine nativen npm-Module, nichts x64-Spezifisches (Raspberry Pi).

## Versionen (seit 1.0.0, 2026-11-15)
- **SemVer, eine Nummer für alles** (oberste `package.json`, alle Teilpakete gleich): PATCH = Fehlerbehebung, MINOR = neue
  Funktion, MAJOR = große Umstellung (z. B. Bedienung oder Daten grundlegend anders).
- Jede Änderung, die bei der Schule ankommt, bekommt eine Zeile in `CHANGELOG.md` unter „Unveröffentlicht“.
- Freigeben: `npm run release -- patch|minor|major` (nur auf sauberem `main`), dann `git push origin main --follow-tags`.
  Das Tag startet den Installer-Test auf Windows, Linux und Pi; bestanden → Release `vX.Y.Z` mit allen drei Paketen.
- Für die Schule nur Pakete einer freigegebenen Version (`…-X.Y.Z-<system>`), nie `…-dev.<commit>-…`.
- Der Installer lehnt ältere Versionen über einer neueren ab (Versionsnummer und Datenbank-Schema, `manager/lib/paketupdate.mjs`).

## Verhältnismäßigkeit (Vorgabe des Nutzers)
Es geht immer nur um den **3D-Druck-Katalog innerhalb der Schule**. Jede Lösung so einfach wie möglich und so
gründlich wie nötig – keine Enterprise-Technik, keine Funktionen „für alle Fälle“. Im Zweifel die kleinere Lösung
wählen und im Bericht sagen, was man später ergänzen könnte.

## Struktur-Zielbild (Umbau läuft, siehe docs/UMBAUPLAN.md)
Neue Arbeit schon jetzt in diese Richtung: fachlicher Code je Bereich zusammen (Route → Service → Repository),
Typen/Validierung einmal als zod-Schema, keine neuen Riesendateien (Ziel ≤ 300, max. 500 Zeilen), keine neuen
zentralen Listen. Details und Rezepte: docs/BEWERTUNG-2026-10-31.md, Abschnitt „Regeln für die Zukunft“.

**Rezept „Neues Feld hinzufügen“** (z. B. am Druckteil oder an der Anfrage):
1. **Eine Stelle in `shared/src/<bereich>.ts`:** Feld ins Eingabe-Schema (z. B. `itemInputSchema`) – der Typ folgt per
   `z.infer` für Server und Client; reine Antwort-Felder ins passende `interface` dort. Keine Kopie in Server oder Client.
2. **DB-Migration:** `server/src/storage/sqlite/migrations/NNN_name.sql` (global nummeriert, Ort bleibt) + Abbildung im
   Repository des Bereichs `server/src/module/<bereich>/<bereich>.repository.ts` (bestehende Zeilen bekommen einen
   Standardwert); Regeln/Prüfungen in `<bereich>.service.ts`; bei Bedarf Export/Import (`module/datenaustausch/`).
3. **Oberfläche:** Eingabe/Anzeige in der Seite des Bereichs (`client/src/features/<bereich>/`).
Dazu ein Test in `server/test/<bereich>.test.ts`.

**Rezept „Neuer Endpunkt“:** Route in `module/<bereich>/<bereich>.routes.ts` (nur Eingabe parsen → Service → antworten),
Regel in `<bereich>.service.ts`, SQL nur im Repository – gezielt mit `WHERE`/Index, Zählungen per SQL. Technik ohne
Fachbegriff gehört nach `server/src/kern/`. Keine Modul-Registrierung: neue Router direkt in `app.ts` einhängen.

## Profi-Checkliste je Funktion
Vor „fertig“ kurz prüfen und im Bericht nennen, was davon zutrifft:
- **Sicherheit:** Rechte im Backend, Eingaben validiert, keine Geheimnisse im Repo/Log, Rate-Limits.
- **Daten:** Migration bestehender Daten ohne Verlust, Backup vorher, rückwärtskompatibel.
- **Stabilität:** Fehlerfälle behandelt (offline, Port belegt, Datei gesperrt), verständliche Fehlermeldung.
- **Tests:** automatischer Test für neue Logik, Klicktest im Browser (Desktop + Handy).
- **Barrierefreiheit:** Tastatur, Fokus, Kontraste, Beschriftungen (viele Nutzer mit motorischen Einschränkungen!).
- **Doku:** README/ARCHITEKTUR aktuell, Protokoll-Eintrag.

## Qualität
- Einfach vor clever. Bestehende Struktur nutzen (siehe [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md)), Stil der
  Umgebung übernehmen, deutsche Oberflächentexte.
- Neue Funktion = Backend-Recht (Prüfpunkt `PERMISSIONS` und passendes Häkchen in `BEREICHE`, `shared/src/konten.ts`) + Validierung + Test, nicht nur Frontend.
