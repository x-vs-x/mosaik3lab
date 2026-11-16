# Umbauplan: Struktur für Wachstum – verhältnismäßig

Freigegeben vom Nutzer am 2026-10-31 („Ja, schrittweise“), mit der Vorgabe: **Es geht nur um den 3D-Druck-Katalog
innerhalb der Schule – alles verhältnismäßig.** Grundlage: [BEWERTUNG-2026-10-31.md](BEWERTUNG-2026-10-31.md).

Maßstab: Ein Schritt kommt nur rein, wenn er künftige Änderungen spürbar einfacher macht oder einen echten Fehler
behebt. Kein Umbau um des Umbaus willen.

Regeln je Schritt: eigener Branch/Worktree, Verhalten unverändert, `npm run check` + `npm run manager:test` grün,
Sicherung vor dem Merge, Protokolleintrag.

## Wird gemacht
| # | Schritt | Nutzen | Parallel? | Stand |
|---|---|---|---|---|
| 0 | Echte Fehler: K3 erstes Admin-Konto bei der Einrichtung, K4/K5 Datenbestand übertragen, W1 App über `http://<IP>` im LAN, W2 Sitzungen nach Passwortwechsel, W4 Sicherung nachholen, W14 Shell-Injektion, W15 Sperrdatei, W16 Kontraste | Betrieb funktioniert sicher | K4/K5/W4/W14 in `einstellungen-db` | offen |
| 0b | **HTTPS optional** (Wunsch Nutzer): Zertifikat im Manager hinterlegen (PFX+Passwort oder PEM Zertifikat+Schlüssel, Prüfung Gültigkeit/Hostname/Ablaufdatum), App läuft dann per HTTPS, Cookie `secure`, HTTP→HTTPS-Weiterleitung, Firewall-Regel auf HTTPS-Port; ohne Zertifikat weiter HTTP (W1). Knopf **„Zertifikat erzeugen“** am Server (Rechnername + IP automatisch eingetragen, 5 Jahre gültig; Windows `New-SelfSignedCertificate`, Linux `openssl`) + Knopf „Zertifikat für Geräte herunterladen“ (.cer/.crt) mit kurzer Anleitung, wie man es einmal auf PCs/iPads/Handys als vertrauenswürdig einträgt. Ablauf-Warnung im `doctor`. Einstellungen in der DB, Zertifikat im Backup | nach `einstellungen-db` | **erledigt** (`portal-https`) |
| 0c | **Aufruf ohne Port: `http(s)://<IP>/mosaik3lab`** (Wunsch Nutzer). (1) App mit einstellbarem Basis-Pfad (Vite `base`, Router `basename`, API-Präfix, Cookie-Pfad, Weiterleitungen, Mail-Links). (2) Kleiner **Portal-Dienst** im Manager (reines Node, keine Abhängigkeiten): lauscht als einziger nach außen auf Port 80 (und 443, wenn HTTPS aktiv – TLS endet hier), leitet `/<pfad>` an die App auf `127.0.0.1:<interner Port>` weiter (inkl. Header `X-Forwarded-*`, Upload-Größen, Timeouts), `/` leitet auf das Modul um. Die App selbst ist dann nur noch lokal erreichbar; Firewall nur 80/443. Weitere Schul-Tools können später unter eigenem Pfad dazukommen. Erkennt, wenn Port 80/443 schon belegt ist (z. B. IIS) → Hinweis + Alternative (anderer Port oder Beispielkonfiguration für IIS/nginx). Linux: Bindung an 80/443 per systemd `AmbientCapabilities=CAP_NET_BIND_SERVICE`. | zusammen mit 0b | **erledigt** (`portal-https`) |
| 1 | Tests je Bereich in eigene Dateien (`node:test`), gemeinsamer Test-Helfer; einfacher Linter (ESLint) | Änderungen schneller prüfbar | allein | offen |
| 2 | Paket `shared/`: zod-Schemas als einzige Quelle für Typen und Validierung (Client + Server), Statusliste nur einmal | Neues Feld = 1 Stelle statt 3–4 | Bereiche parallel | **erledigt** (`umbau-shared`) |
| 3 | Server je Fachbereich ordnen (Katalog, Anfragen, Vorschläge, Konten, Stammdaten): Route → Service → Repository, `SqliteRepositories.ts` aufteilen, gezielte Abfragen statt ganzer Tabellen | Fachlogik findbar, kleine Dateien | je Bereich parallel | **erledigt** (`umbau-server`) |
| 4 | Riesenseiten im Frontend aufteilen (Artikel bearbeiten, Stammdaten) | Übersicht | parallel | offen |
| 5 | Regeln in `CLAUDE.md` + Dateigröße per Linter, ARCHITEKTUR aktualisieren | Struktur bleibt sauber | allein | offen |

## Bewusst nicht (unverhältnismäßig für die Schule)
- Modul-Registrierungssystem, Einstellungen-Registry, typisierter API-Generator, Modul-Grenzen per Lint-Plugin.
- Playwright-/E2E-Testsuite und CI-Pipeline (manuelle Abnahme + Backend-Tests reichen; bei Bedarf später).
- Verschlüsselung ist nur für Backups mit Passwörtern sinnvoll – als Option, nicht Pflicht.
