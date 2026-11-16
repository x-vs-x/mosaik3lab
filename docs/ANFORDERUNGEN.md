# Wünsche des Nutzers – Abgleich (Stand 2026-10-31)

✔ fertig und geprüft · ◐ fertig, aber nur im Test/Probelauf geprüft · ○ offen

## Arbeitsweise
| Wunsch | Stand |
|---|---|
| Ein Hauptchat, Funktionen in Unterchats, parallel ohne Konflikte, danach archivieren | ✔ (Archivieren lehnt die App ab, solange ein Chat offen ist) |
| Aktuelle Version immer klickbar | ✔ `http://localhost/mosaik3lab`, im WLAN `http://10.0.0.26/mosaik3lab` |
| Agenten räumen auf, nachvollziehbar | ✔ `docs/PROTOKOLL.md` |
| Git mit eingetragenem Autor | ✔ |
| Remote Control, 5 Bereitschafts-Chats | ✔ |
| Verhältnismäßig bleiben (nur Schul-3D-Druck) | ✔ Regel in `CLAUDE.md` |

## App
| Wunsch | Stand |
|---|---|
| Logo mit Hochzahl ³ | ✔ |
| Login per E-Mail; Admin/Werkstatthelfer mit Passwort, bekannte Lehrkraft direkt | ✔ |
| Angemeldet bleiben per Cookie | ✔ 30 Tage |
| Unbekannte E-Mail → Konto anlegen oder E-Mail korrigieren | ✔ |
| Bestell-Hinweis auf der Anmeldeseite entfernen | ✔ |
| Alle 19 Ideen aus `docs/IDEEN.md` (Status an/aus, Filamente leer, Preis, Mehrfarbig, Personalisierung, Videos, Rollen/Rechte je Person, Bestell-Mail, Vorschläge + Umwandeln, Meine Anfragen + erneut anfragen, Export/Import, Lehrmittel-Texte, UI-Rahmen) | ✔ |
| Datenbank mit festen Tabellen, eigene ID je Datensatz, Dateien als eigene Datensätze, strukturierte Ablage | ✔ SQLite, plug & play |
| Handy/Tablet/Desktop, barrierefrei | ✔ gemessen 375/768/1280 px |

## Server-Manager / Betrieb
| Wunsch | Stand |
|---|---|
| Eigenständiges Admin-Tool, öffnet auch wenn Dienste nicht starten, schlichte GUI | ✔ |
| Nur lokal + Passwort | ✔ |
| Status der Dienste, Ports, benötigte Komponenten | ✔ |
| Firewall-Regel mit einem Klick | ◐ nur Probelauf (ändert das System) |
| Manager ist zugleich Installer, erkennt das System (Windows, Linux, Raspberry Pi) | ✔ Installer-Paket echt getestet auf GitHub Actions: Windows, Linux x64, Linux arm64 (wie Raspberry Pi OS 64 Bit); echter Pi noch nicht |
| Programmordner + Desktop-/Startmenü-Verknüpfung | ◐ nur Probelauf |
| Feste Ordner `C:\Mosaik3LAB\…` | ✔ |
| Pfade und E-Mail-Versand nur im Manager | ✔ |
| Updates einfach und sicher (Backup, automatisches Zurückrollen inkl. Datenbank) | ✔ echt getestet |
| Laufzeit (Node, Git, Dienst-Wrapper) im Admin-Center aktualisieren | ◐ nur Probelauf |
| Alle Einstellungen in der Datenbank, Backup → leeres System 100 % gleich | ✔ im Testordner geprüft |
| Backup „nur Daten & Einstellungen“ oder „komplett“ | ✔ |
| HTTPS optional, Zertifikat am Server erzeugen | ◐ im Test geprüft, im Betrieb noch nicht eingeschaltet |
| Eigenes Verzeichnis, Aufruf ohne Port (`/mosaik3lab`) | ✔ Entwicklung; im Betrieb über den Portal-Dienst |
| Claude kann alles selbst testen (CLI, JSON, Test-IDs) | ✔ |

## Offen
- ○ Struktur-Umbau Schritte 1–5 aus `docs/UMBAUPLAN.md` (verhältnismäßig).
- ○ Echte Einrichtung auf dem Zielrechner (Dienste, Firewall, Verknüpfungen) – braucht Admin-Bestätigung durch den Nutzer.
- ◐ Linux/Raspberry Pi einmal echt durchspielen (Ubuntu x64/arm64 im Installer-Test ✔, echter Raspberry Pi offen).
- Bewusst zurückgestellt: Lehrkraft-Login mit Nachweis (siehe `docs/BACKLOG.md`).
