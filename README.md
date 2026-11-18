# Mosaik³LAB

Schulinterner Katalog für 3D-gedruckte Hilfs- und Lehrmittel einer Schule. Lehrkräfte finden Druckteile und fragen sie an
– **ohne Anmeldung und ohne Passwort**: Im Anfrageformular werden nur die **Schul-E-Mail** und
**„Für welche Klasse?“** eingetragen. Unbekannte Adressen werden automatisch als Lehrkraft angelegt
(Verwaltung → „Lehrkräfte“); gespeichert werden nur ihre Anfragen, es gibt keine Profilseite.
Lehrkräfte sehen **keinen Bearbeitungsstand** – das Druck-Team bringt fertige Druckteile persönlich vorbei.

**Anmelden** (kleines Anmelde-Symbol unten in der Seitenleiste, auf dem Smartphone im „Menü“, oder `/login`)
geht mit der **E-Mail-Adresse**:
- **Druck-Team und Administration** haben ein Konto und geben danach ihr **Passwort** ein.
- **Bereits bekannte Lehrkräfte** (schon angefragt oder Zugang angelegt) sind **ohne Passwort** direkt angemeldet
  und sehen unter „Meine Anfragen“ ihre eigenen Anfragen – nichts aus der Verwaltung.
- **Unbekannte Adressen** sehen „Diese E-Mail ist noch nicht im System.“ mit der eingegebenen Adresse und zwei Wegen:
  **„Jetzt Konto anlegen“** (Lehrkraft-Zugang, nur mit erlaubter Schul-Domain, direkt angemeldet) oder
  **„E-Mail korrigieren“** (zurück zum Feld, Eingabe bleibt stehen).
- **Angemeldet bleiben:** Das Anmelde-Cookie gilt 30 Tage und verlängert sich bei jeder Nutzung; „Abmelden“ beendet es.

**In der Verwaltung (Administration):**
- **Stammdaten** (drei Tabs): Kategorien („Wofür?“, Farbe + Symbol aufklappbar), Einsatzbereiche („Wo?“), **Material & Farben** (Materialien + Farbrollen)
  (mit Import der hinterlegten Bambu-Lab-Farbpaletten). Die **Schritte im Ablauf der Anfragen** (Standard: Offen → Gedruckt) schaltet man unter Einstellungen an/aus.
- **Druckteile exportieren und einspielen** (Druckteile verwalten): Druckteile anhaken → „Exportieren“ ergibt **eine Datei** mit Bildern, Videos
  und Druckdateien; „Einspielen …“ zeigt erst eine Vorschau und fragt nur, ob vorhandene Druckteile übersprungen oder ersetzt werden. Alles oder
  nichts, vorher automatische Sicherung, fehlende Kategorien/Materialien/Farben werden angelegt. Ohne Anfragen, Lehrkräfte und Konten. Auch für das
  Druck-Team. Anleitung: [docs/ANLEITUNG-DRUCKTEILE-UND-SICHERUNG.md](docs/ANLEITUNG-DRUCKTEILE-UND-SICHERUNG.md). Größenlimit: `IMPORT_MAX_MB` (Standard 1024).
- **Einstellungen:** erlaubte E-Mail-Domains fürs Bestellformular, Ablauf der Anfragen, Schalter für spätere
  Funktionen (z. B. Statusanzeige für Lehrkräfte) und für Administratoren der Knopf zum Server-Manager. Mailserver,
  Ordner, Sicherungen und Updates stellt nur der Server-Manager ein.

Architektur und API-Vertrag: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md).

**Version:** siehe [CHANGELOG.md](CHANGELOG.md) (SemVer, eine Nummer für App, Server, Manager und Installer). Installation
und Updates: [docs/INSTALLATION.md](docs/INSTALLATION.md). Gedacht für den Betrieb **im Schulnetz**, nicht öffentlich im Internet
(siehe [Vor einem Produktivbetrieb](#vor-einem-produktivbetrieb)).

---

## Gestaltung

- Farben und Bildmarke:
  Mosaiksteine Hellblau `#3CCBFC`, Rot `#F23838`, Gelb `#F5F55A`, Orange `#FA9B4D`, Lila `#B85E99`, Grün `#56BC52`;
  Hauptfarbe Rot `#CF2E2E` / `#B3241F`, Kopfbereich `#AF2401`.
- Das Logo ist als Vektorgrafik umgesetzt (`client/src/components/Logo.tsx`). Eine eigene Logo-Datei (SVG/PNG)
  kann dort eingesetzt werden.
- Schrift: Atkinson Hyperlegible (lokal eingebunden, für gute Lesbarkeit entwickelt).

## Voraussetzungen

- **Node.js 24 oder neuer** (wegen der eingebauten Datenbank `node:sqlite`; getestet mit Node.js 26) inklusive npm
- Ein aktueller Browser (Edge, Chrome, Firefox, Safari)
- Kein Datenbankserver (SQLite steckt in Node), keine Cloud-Dienste, keine externen APIs

## Installation

**Auf einem Schul- oder Server-PC (Windows):** ZIP-Paket entpacken, `Installieren.cmd` doppelklicken – Anleitung in
[docs/INSTALLATION.md](docs/INSTALLATION.md). Das Paket baut man mit `npm run paket`.

**Auf Linux oder einem Raspberry Pi (64 Bit):** `.tar.gz`-Paket (von GitHub Actions) entpacken, `sudo ./installieren.sh` –
Anleitung im Abschnitt „Linux und Raspberry Pi“ von [docs/INSTALLATION.md](docs/INSTALLATION.md#linux-und-raspberry-pi).

**Für die Entwicklung:**

```bash
cd mosaik3lab
npm install
```

`npm install` installiert Frontend und Backend gemeinsam (npm-Workspaces).

## Start

```bash
npm run dev
```

Startet Backend und Frontend gleichzeitig:

| Dienst   | Adresse                   |
| -------- | ------------------------- |
| **App**  | **http://localhost:5173** |
| API      | http://127.0.0.1:3001/api |

### Im Heimnetz testen (Handy, Tablet)

```bash
npm run dev:lan
```

Öffnet nur das Frontend für Geräte im selben Netzwerk: `http://<IP-des-Rechners>:5173` (Vite zeigt die Adresse als
„Network“ an). Das Backend bleibt auf `127.0.0.1` und wird über das Frontend weitergeleitet. Beim ersten Start fragt
die Windows-Firewall nach einer Freigabe für Node.js. **Nur in vertrauenswürdigen Netzen (zu Hause) verwenden** –
in fremden oder öffentlichen Netzen und im Schulnetz immer `npm run dev` nutzen.

Beim allerersten Start werden automatisch Demo-Benutzer, 11 Beispiel-Druckteile und 5 Beispiel-Anfragen angelegt.
Beispieldaten sind in der Oberfläche mit **„Beispiel“** gekennzeichnet.

Weitere Befehle:

| Befehl                         | Zweck                                                                  |
| ------------------------------ | ---------------------------------------------------------------------- |
| `npm test`                     | Automatische Funktions-, Berechtigungs- und Speichertests (`server/test/*.test.ts`, je Fachbereich eine Datei; temporäre Datenordner, keine echten Mails). Einzeln: `cd server; node --import tsx --test test/konten.test.ts` |
| `npm run lint`                 | ESLint für `client/` und `server/` (nur Hinweise, ändert keinen Code) |
| `npm run typecheck`            | TypeScript-Prüfung für Frontend und Backend                            |
| `npm run backup`               | Sicherung von Datenbank (konsistent), Ablage und JSON-Altdaten nach `backups/` |
| `npm run db:backup -w server -- --ziel <datei>` | Nur die Datenbank konsistent kopieren (auch im laufenden Betrieb; eine Zeile Ausgabe, Exit 0/1 – nutzt der Server-Manager) |
| `npm run seed:reset -- --yes`  | Alle Daten löschen und Beispieldaten neu anlegen (vorher Server beenden; legt automatisch eine Sicherung an) |
| `npm start`                    | Frontend bauen und alles über einen Server auf http://127.0.0.1:3001 ausliefern (Produktivmodus: **Demo-Zugänge gesperrt**) |
| `npm run testpostfach`         | Testpostfach für die Entwicklung, siehe unten                          |

### Mailversand testen (Testpostfach)

```bash
npm run testpostfach
```

Ein kleiner SMTP-Fänger (`scripts/testpostfach.mjs`, ohne Abhängigkeiten): Er nimmt alle Mails an, **verschickt
nichts weiter** und legt sie als `.eml` in `C:\Mosaik3LAB\testpostfach\` ab (bzw. `<MOSAIK3LAB_ROOT>\testpostfach`).
Ansehen unter **http://127.0.0.1:2580** (neueste oben, HTML-Teil abgeschirmt angezeigt, „Alle löschen“).
Im Server-Manager unter E-Mail eintragen: Server `127.0.0.1`, Port `2525`, kein SSL/TLS, kein Benutzer/Passwort.
Beide Ports lauschen nur auf `127.0.0.1`. Beenden mit Strg+C.

## Demo-Zugänge

> **Nur für die lokale Entwicklung!** Im Produktivbetrieb (`NODE_ENV=production`, z. B. über `npm start`) oder
> mit `DISABLE_DEMO_ACCOUNTS=true` sind diese Konten automatisch gesperrt. Vor einem echten Einsatz müssen sie
> zusätzlich in der Benutzerverwaltung deaktiviert bzw. echte Konten angelegt werden.
>
> **Erstes Admin-Konto ohne Demo-Konten:** im Server-Manager beim Einrichten („Admin-Konto anlegen“) oder bei gestoppter App:
> `M3L_ADMIN_PASSWORD=<passwort> npm run --silent user:create-admin -w server -- --email <adresse> --name <name>`
> (Passwort mindestens 8 Zeichen; alternativ eine Zeile über stdin). Der `doctor` warnt, solange es keinen aktiven Administrator gibt.

| Rolle          | E-Mail (Anmeldung)                   | Passwort            |
| -------------- | ------------------------------------ | ------------------- |
| Administrator  | `demo.admin@schule.example`      | `Mosaik-Admin-2026` |
| 3D-Druck-Team  | `demo.druckteam@schule.example`  | `Mosaik-Druck-2026` |
| Lehrkraft      | `frau.beispiel@schule.example`   | – (kein Passwort)   |

Weitere bekannte Lehrkräfte aus den Beispiel-Anfragen: `herr.muster@…`, `frau.sonnenschein@schule.example`.
Ältere Datenstände werden beim Start automatisch ergänzt: Konten ohne E-Mail erhalten ihre Demo-Adresse bzw.
`<benutzername>@<erste erlaubte Domain>` (in „Personen“ sichtbar); das frühere Demo-Konto `lehrkraft`
wird zur bekannten Lehrkraft `demo.lehrkraft@schule.example` (ohne Passwort).

## Rollen und Rechte

Drei Rollen, wenige Häkchen – vergeben in **Verwaltung → Personen** mit „Rechte ändern“. Die Rechte prüft das
**Backend** bei jeder Anfrage (`shared/src/konten.ts` → `BEREICHE`, `server/src/domain/permissions.ts`); das Frontend
blendet Bedienelemente nur zusätzlich aus.

| Rolle / Häkchen | darf … |
| --- | --- |
| Ohne Anmeldung | Katalog ansehen (nur veröffentlichte Druckteile), Druckteile anfragen, Anfragen per Code sehen (falls eingeschaltet) |
| **Lehrkraft** (nur Schul-E-Mail, kein Passwort) | |
| ☑ Druckteile anfragen | Druckteile anfragen und die eigenen Anfragen sehen und ändern, solange sie offen sind |
| ☑ Druckteile vorschlagen | neue Druckteile vorschlagen und die eigenen Vorschläge sehen |
| **3D-Druck-Team** (mit Passwort; behält die Lehrkraft-Häkchen) | |
| ☑ Anfragen bearbeiten | alle Anfragen, Lehrkräfte-Liste und Übersicht sehen, Stand ändern |
| ☑ Druckteile pflegen | Druckteile samt Entwürfen, Bildern, Videos, Druckdateien anlegen, ändern, exportieren, einspielen |
| ☑ Vorschläge bearbeiten | Vorschläge sehen, beantworten, (mit „Druckteile pflegen“) umwandeln |
| ☑ Farbrollen leer/vorrätig | Farbrollen als leer oder vorrätig markieren |
| ☐ Stammdaten pflegen | Kategorien, Einsatzbereiche, Material und Farben pflegen |
| **Administrator** (mit Passwort) | alles, dazu Personen und Einstellungen (inkl. Ablauf der Anfragen) |

Wer mehr als Lehrkraft-Rechte bekommt, erhält automatisch eine E-Mail „Passwort festlegen“ (der Link läuft nicht ab; ohne
Mailversand zeigt die App den Link zum Weitergeben). Bis dahin meldet sich die Person weiter als Lehrkraft an. Passwörter
sind frei wählbar, mindestens 8 Zeichen. „Passwort vergessen?“ auf der Anmeldeseite und „Passwort zurücksetzen“ in
„Personen“ schicken einen neuen Link. Nach 10 falschen Passwörtern ist das Konto gesperrt; die Person bekommt eine Mail
zum Zurücksetzen. Änderungen wirken sofort. Niemand kann sich selbst die Adminrolle entziehen.

## Ordnerstruktur

```
mosaik3lab/
├─ package.json            Workspaces + gemeinsame Skripte (npm run dev …)
├─ client/                 Frontend: React + TypeScript + Vite + Tailwind CSS + Lucide
│  ├─ public/              Favicon
│  └─ src/
│     ├─ auth/             Login-Zustand (AuthContext)
│     ├─ components/       Layout (Sidebar, mobile Navigation), UI-Bausteine, Dialog, Toasts …
│     ├─ lib/              API-Client, Typen, Konstanten, Formatierung
│     └─ pages/            Katalog, Detail + Anfrageformular, Meine Anfragen, Konto
│        └─ admin/         Dashboard, Druckteile, Bestellungen, Benutzer
├─ shared/                 Gemeinsame Typen + Validierung (zod) für Server und Client, je Fachbereich ein Modul
├─ server/                 Backend: Node.js + Express + TypeScript
│  ├─ src/
│  │  ├─ domain/           Fachliche Typen, Wertelisten, Rechte-Matrix (speicherunabhängig)
│  │  ├─ module/           je Fachbereich Route → Service → Repository (katalog, anfragen, vorschlaege,
│  │  │                    konten, stammdaten, einstellungen, datenaustausch)
│  │  ├─ kern/             Technik: SQLite + Migrationen, Dateiablage, Anmeldung/Rechte/CSRF, Mail, Uploads, Rate-Limit
│  │  ├─ storage/          Speicher zusammenbauen, sqlite/migrations/NNN_name.sql, einmalige JSON-Übernahme
│  │  ├─ seed/             Beispieldaten
│  │  └─ app.ts / index.ts App-Aufbau und Start
│  ├─ test/                Tests je Fachbereich (node:test), gemeinsamer Helfer helfer.ts
│  └─ scripts/             Backup, Zurücksetzen, Admin-Konto, Testmail
├─ storage/                ← entsteht beim ersten Start, enthält ALLE Laufzeitdaten
│  ├─ mosaik3lab.db        SQLite-Datenbank (+ -wal/-shm im Betrieb)
│  ├─ ablage/              <objekttyp>/<objekt-id>/<rolle>/<datei-id>.<endung>
│  ├─ sicherungen/         automatische Sicherungen vor Datenbank-Migrationen
│  ├─ data/                .lock; frühere JSON-Dateien (nach der Übernahme nur Sicherung)
│  └─ uploads/             frühere Ablage (nach der Übernahme nur Sicherung)
└─ backups/                ← entsteht durch npm run backup
```

## Datenspeicherung

- **SQLite-Datenbank** `storage/mosaik3lab.db` über das in Node eingebaute Modul `node:sqlite` – kein
  Datenbankserver, keine nativen npm-Module (läuft auf Windows, Linux, Raspberry Pi). Feste Tabellen nach
  [docs/DATENMODELL.md](docs/DATENMODELL.md), Fremdschlüssel an, WAL-Modus, jede Änderung in einer Transaktion.
- **Plug & Play:** Beim Start legt die App Datenbank, Tabellen und Ablage selbst an und spielt ausstehende
  Migrationen (`server/src/storage/sqlite/migrations/NNN_name.sql`, Stand in `schema_version`) ein – bei einer
  vorhandenen Datenbank vorher mit automatischer Sicherung nach `storage/sicherungen/`.
- **Übernahme der früheren JSON-Daten:** Beim ersten Start mit Datenbank werden `storage/data/*.json` und die
  Upload-Ordner (auch früher in der App abweichend eingestellte, `mosaik3lab.config.json` – danach gesichert und
  entfernt) einmalig übernommen (Dateien in die neue Ablage kopiert und per SHA-256 geprüft, Anzahl der
  Datensätze verglichen, Bericht im Log). Schlägt etwas fehl, wird nichts eingetragen und die App startet nicht –
  die JSON-Dateien bleiben unberührt. Sie und die alte Ablage bleiben auch danach als Sicherung liegen.
- **Sperrdatei** `storage/data/.lock` verhindert, dass zwei Serverprozesse gleichzeitig mit denselben Daten arbeiten.
- **IDs:** Jeder Datensatz hat eine technische ID (UUID v7, neu angelegt; übernommene IDs bleiben). Lesbare Nummern
  aus Nummernkreisen: Anfragen `ANF-2026-0001` (frühere `M3L-…` bleiben gültig), Druckteile `ART-0001`.
- **Dateiablage:** jede Datei ist ein Datensatz (Tabelle `datei`) und liegt unter
  `ablage/<objekttyp>/<objekt-id>/<rolle>/<datei-id>.<endung>`; in der Datenbank steht nur der relative Pfad.
  Löschen eines Druckteils löscht seine Dateien mit. Ausgeliefert wird nur über die API mit Rechteprüfung.
- **Validierung** aller Eingaben im Backend; Farben/Größen einer Anfrage müssen zum Druckteil passen.
- **Uploads:** Bilder (JPG, PNG, WebP, max. 5 MB, max. 8 je Druckteil) und Druckdateien (STL, 3MF, max. 50 MB).
  Geprüft werden Dateiendung **und** Dateiinhalt (Magic Bytes / STL-Struktur). Dateien erhalten zufällige Namen.
  Druckdateien werden nur gespeichert und als Download (`Content-Disposition: attachment`) ausgeliefert –
  niemals ausgeführt, entpackt oder interpretiert.
- **Datenschutz:** Es werden **keine personenbezogenen Schülerdaten oder Diagnosen** erfasst. Anfragen enthalten
  die Schul-E-Mail der anfragenden Lehrkraft und die Klasse; das Formular weist ausdrücklich darauf hin, keine
  Schülernamen oder Diagnosen einzutragen. Das SMTP-Passwort liegt in der Datenbank (Tabelle `betrieb_einstellung`, pflegt der
  Server-Manager; Sicherungen sind deshalb verschlüsselbar) und wird nie an die Oberfläche ausgeliefert.
- **Hinweis:** Ohne Passwort kann grundsätzlich jede Person mit Zugriff auf die App eine Adresse der erlaubten Domain
  eintragen – die E-Mail dient der Zuordnung, nicht als Sicherheitsmerkmal. Das gilt auch für die Anmeldung von
  Lehrkräften: Wer eine bekannte Lehrkraft-Adresse kennt, sieht deren Anfragen (Druckteile, Klasse, Wünsche).
  Vor einem echten Einsatz z. B. durch einen Einmal-Link per Mail oder Schul-SSO absichern.
- **Ohne Anmeldung nutzbare Endpunkte** (Katalog lesen, Anfrage stellen, Abruf per Code) sind je IP-Adresse
  begrenzt (30 Anfragen pro Stunde, 120 Abrufe pro 10 Minuten). Anfragen lassen sich ohne Anmeldung nur mit dem
  zufälligen Code abrufen, nicht über die fortlaufende Nummer.

## Datensicherung

Alle Daten liegen im Datenordner (**`storage/`**, installiert `<daten>`) und in der Ablage (`ABLAGE_DIR`).
Im Dauerbetrieb sichert der **Server-Manager** (Karte „Sicherung“) täglich das ganze System in **eine Datei**: Datenbank konsistent
über `npm run db:backup` (SQLite `VACUUM INTO`, auch während die App läuft – die Datei nie einfach kopieren), dazu die Ablage und
die früheren JSON-Dateien, mit SHA-256-Prüfsummen. Wiederherstellen und Umziehen ebenfalls dort
([Anleitung](docs/ANLEITUNG-DRUCKTEILE-UND-SICHERUNG.md)). In der Entwicklung:

1. `npm run backup` ausführen → Kopie unter `backups/storage-<Datum>/` (`mosaik3lab.db`, `ablage/`, `data/`), **oder**
2. den Server beenden und den Ordner `storage/` komplett kopieren (dann gehören `mosaik3lab.db-wal` und `-shm` dazu).

**Wiederherstellen:** Server beenden, `mosaik3lab.db` (und `ablage/`) durch die Sicherung ersetzen, dabei
`mosaik3lab.db-wal`/`-shm` löschen, Server starten. Im Betrieb übernimmt das der Server-Manager.

Empfehlung: regelmäßig sichern und die Sicherungen nicht im selben Ordner aufbewahren.
`storage/` und `backups/` sind in `.gitignore` eingetragen und gehören nicht in ein Git-Repository.

## Konfiguration (Umgebungsvariablen)

| Variable                | Standard            | Bedeutung                                          |
| ----------------------- | ------------------- | -------------------------------------------------- |
| `API_PORT`              | `3001`              | Port des Backends                                  |
| `HOST`                  | `127.0.0.1`         | Netzwerkschnittstelle – bewusst nur localhost      |
| `BASE_PATH`             | leer (= `/`)        | Pfad der App, z. B. `/mosaik3lab` – setzt der Server-Manager (Portal) |
| `PUBLIC_HTTPS`          | `false`             | `true`, wenn die App über HTTPS erreicht wird (Portal mit Zertifikat): sichere Cookies, HSTS |
| `STORAGE_DIR`           | `./storage`         | Datenordner (Datenbank `mosaik3lab.db` mit allen Einstellungen, `data/`) – setzt der Server-Manager |
| `ABLAGE_DIR`            | `<STORAGE_DIR>/ablage` | Dateiablage (Bilder, Druckdateien, Videos) – setzt der Server-Manager |
| `SESSION_SECRET`        | zufällig, in der Datenbank (`betrieb_einstellung`) | nur für Tests; sonst legt die App das Geheimnis für Session-Cookies selbst in der Datenbank ab |
| `DISABLE_DEMO_ACCOUNTS` | `false`             | `true` sperrt alle Demo-Konten                     |
| `SEED_DEMO_DATA`        | `true`              | `false` legt beim ersten Start keine Beispieldaten an |

## Sicherheit im Prototyp

- Passwörter mit **bcrypt** (Kostenfaktor 12) gehasht, nie im Klartext gespeichert oder ausgeliefert
- **Serverseitige Sessions** (dauerhaftes HttpOnly-Cookie, `SameSite=Strict`, 30 Tage, bei Nutzung verlängert, neue Session-ID beim Login; gesperrte Konten fliegen bei der nächsten Anfrage raus)
- **CSRF-Schutz** über Pflicht-Header für alle ändernden Anfragen
- **Login-Bremse:** nach 5 Fehlversuchen 10 Minuten Sperre je E-Mail/IP; beide Anmeldeschritte (E-Mail prüfen,
  Passwort) sind zusätzlich auf 60 Versuche je 10 Minuten und IP begrenzt, Lehrkraft-Zugänge anlegen auf 20 je Stunde
- Sicherheits-Header über `helmet`, keine Ausführung hochgeladener Dateien, Schutz vor Pfadangriffen
- Gesperrte Konten werden bei der nächsten Anfrage abgemeldet

## Vor einem Produktivbetrieb

Mindestens erforderlich, bevor die Anwendung im Schulnetz genutzt wird:

- [ ] Sicherheitsprüfung durch die zuständige IT bzw. den Schulträger, Datenschutzprüfung (DSGVO, Verzeichnis von Verarbeitungstätigkeiten)
- [ ] Demo-Konten deaktivieren/löschen, echte Konten mit sicheren Passwörtern anlegen, `NODE_ENV=production`
- [ ] Betrieb hinter einem Reverse-Proxy mit **HTTPS**; dann `cookie.secure = true` und `trust proxy` setzen
- [ ] Festes `SESSION_SECRET` setzen, regelmäßige automatische Datensicherung einrichten
- [ ] Optional: Anbindung an die Schul-Anmeldung (z. B. SSO)
- [ ] Hochgeladene Dateien zusätzlich durch einen Virenscanner prüfen lassen
