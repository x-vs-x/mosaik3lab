# Änderungsprotokoll

Neueste Einträge oben. Jede Session trägt sich ein, bevor sie archiviert wird.

## 2026-11-17 – Export/Import vollständig geprüft (Hauptchat, Branch: feature/austausch-pruefung)
- **Anlass:** Frage des Nutzers, ob beim Export hier und Import in der Schule alle Stammdaten und jede Angabe ankommen.
- **Geprüft (Code):** Export nimmt alle Felder des Druckteils und die benutzten Kategorien (mit Farbe/Symbol),
  Einsatzbereiche, Materialien und Farbrollen (alle Angaben) mit; Import ergänzt Fehlendes, ändert Vorhandenes nie.
- **Gefunden und behoben:** Der Vergleich bei „Ersetzen“ (`fingerabdruck` in `datenaustausch.service.ts`) übersah
  Änderungen an Art und Farbgruppen. Gruppen-Rollen werden beim Vergleich herausgerechnet (füllt der Server ein).
- **Test:** `datenaustausch.test.ts` „Rundreise in eine frische Installation“: alle Felder, Personalisierung (alle drei
  Typen), leere Größen, „Alle Farben“, Linie und Materialart, eigene Farbrolle, neue Stammdaten; Gegenprobe ohne Korrektur rot.
- **Aufgeräumt:** keine Server, keine Restdateien.

## 2026-11-17 – Hinweis bei Personalisierung entfernt (Hauptchat, Branch: feature/personalisierung-hinweis)
- **Anlass:** Wunsch des Nutzers: Absatz „Bitte keine Namen von Schülerinnen und Schülern und keine Diagnosen eintragen.“
  im Abschnitt Personalisierung beim Anfragen entfernen.
- **Gebaut:** Absatz samt Symbol in `client/src/features/katalog/RequestDialog.tsx` entfernt (Hinweis bei
  „Anpassungswünsche“ und Feld-Hinweise bleiben). Im Browser als Lehrkraft geprüft.
- **Aufgeräumt:** Testserver gestoppt, `_testdaten/hinweis` gelöscht.

<!-- Vorlage:
## 2026-11-17 – Update-Rückfrage ohne Dialog (Hauptchat, Branch: feature/update-bestaetigung)
- **Anlass:** Über die Web-App auf dem iPad drehte „Jetzt aktualisieren“ endlos; am Server kam kein Auftrag an, die Seite
  fragte nur im 30-s-Takt nach → der Knopf wartete auf das (in Safari nicht sichtbare) Bestätigungsfenster.
- **Gebaut:** Rückfrage als Bereich in der Update-Karte (`#update-confirm`, Knöpfe „Ja, jetzt aktualisieren“/„Abbrechen“),
  nach Fehler wird der Knopf wieder angeboten. `confirmBox`: offen, aber nicht sichtbar → `window.confirm`.
  Geprüft in einer Test-Installation hinter dem Portal (App-Adresse wie vom iPad, Tablet-Größe).
- **Aufgeräumt:** Test-Installation `_testdaten/updknopf` gelöscht.

## 2026-11-17 – Installer: Klick ins Fenster hält nicht mehr an (Hauptchat, Branch: feature/installer-klick)
- **Anlass:** Update auf 1.6.0 per Installieren.cmd stand nach „Programm kopieren“ still – Windows-Markiermodus nach Klick.
- **Gebaut:** `manager/Installieren.cmd` startet `cli.mjs setup` innerhalb von PowerShell, das QuickEdit nur für dieses
  Fenster abschaltet (PowerShell stellt den Modus beim Beenden selbst wieder her). Exitcode und `probelauf` geprüft.
- **Aufgeräumt:** Testordner `_testdaten/installer-klick` gelöscht.

## 2026-11-17 – Update-Knopf: Download-Wächter und echter Test (Hauptchat, Branch: feature/update-knopf)
- **Anlass:** Lokal (1.5.0) drehte „Jetzt aktualisieren“ endlos; kein Download, kein Protokolleintrag. Der Installer-Test
  hatte den Weg des Managers nur nachgeahmt (Paket + Auftrag selbst abgelegt), Download und Start über den Manager waren
  nie geprüft.
- **Gebaut:** `downloadPaket` mit Wächter (90 s ohne Antwort/Daten → verständlicher Abbruch, Teildatei weg), Log-Eintrag
  beim Download-Start. Installer-Test: `knopf-manager.mjs` ruft `pruefen()`/`starten()` des installierten Managers auf
  (Linux als Dienstbenutzer). Neuer Test `manager/test/paketquelle-wache.test.mjs`.
- **Aufgeräumt:** Test-Installation unter `_testdaten/updknopf` gelöscht.

## 2026-11-17 – Größen freiwillig, Farbgruppen, Farbrollen löschen (Hauptchat, Branch: feature/farben-groessen)
- **Gebaut:** `sizes` am Druckteil freiwillig (Anfrage ohne Größe, wenn das Teil keine hat). Farbbereiche mit `gruppen`
  (`linie:<Marke Linie>`, `art:<Materialart>` = erstes Wort der Linie), Server füllt beim Lesen die passenden Rollen ein,
  speichert abgedeckte Rollen nicht einzeln. Picker: „Alle PLA/PETG/…“ und „Ganze Linie wählen (auch neue)“. Farbrolle
  löschen nimmt sie aus allen Druckteilen; leerer Bereich → „Alle Farben“. Export/Import tragen `gruppen` mit.
- **Dateien:** shared/src/katalog.ts, shared/src/anfragen.ts, Migration 017_farbbereich_gruppen.sql,
  module/katalog/katalog.repository.ts + katalog.service.ts, module/anfragen/anfragen.service.ts,
  module/stammdaten/stammdaten.service.ts, module/datenaustausch/*, client druckteil-bearbeiten/{FilamentPicker,ColorsSection,itemForm},
  einstellungen/stammdaten/{ListPanel,FilamentsPanel}, Tests farben/stammdaten.
- **Aufgeräumt:** Testserver gestoppt, Testdaten-Ordner gelöscht.

## JJJJ-MM-TT – <Funktion> (Session: <name>, Branch: feature/<kurzname>)
- **Gebaut:** …
- **Dateien:** …
- **Geprüft:** typecheck ✔ · test ✔ · im Browser ✔
- **Aufgeräumt:** …
-->

## 2026-11-17 – Server-Manager neu gestaltet (Unter-Session, Branch: feature/manager-design)
- **Gebaut:** Design nach freigegebenem Entwurf (`_testdaten/manager-entwurf/entwurf.html`, Apple-HIG-Grundsätze:
  Zurückhaltung, ein Akzent, Hierarchie über Schrift + Weißraum). `app.css` neu: Variablen für 5 Schriftstufen,
  4/8-Abstände, Radien, Farben hell/dunkel (WCAG AA gemessen), Federkurven 120–240 ms, `prefers-reduced-motion`,
  `prefers-contrast`, `prefers-reduced-transparency`, `forced-colors`; Kapsel-Knöpfe ≥ 44 px, Ampel = Punkt + Wort,
  Karten ohne Rand/Schatten, Glas nur an der festen Reiterleiste (Handy: wischbar mit Randverlauf), Dialoge mit festem
  Kopf/Fuß (Handy fast vollflächig). `index.html`: Texte gekürzt, Erklärungen in `<details>`, Umzug/Einrichten als
  aufklappbare Karten, Dialoge gegliedert (`.dlg-head/-body/-foot`), Symbole aus Überschriften entfernt.
  JS nur Darstellung: Reiter einblenden + ins Bild holen + Randverlauf (`app.js`), Sicherungen als Liste mit leerem
  Zustand, Kurzfassung Sicherung als Liste, Hinweise mit Ampelwort, „Stand HH:MM“; Testmail-Ergebnis und Mail-Status
  als Hinweisfeld/Ampel (`einstellungen.js`); Toast mit Schließen-Knopf, Trennlinie über Dialogknöpfen nur beim
  Scrollen (`ui.js`); kürzere Update-Texte (`update.js`); Einrichten aufgeklappt, solange nicht eingerichtet
  (`erweitert.js`). Alle `id`, `data-testid`, Formularnamen unverändert; Schulnetz-Hinweis aus PR #11 übernommen.
- **Dateien:** `manager/public/{app.css,index.html,app.js,ui.js,update.js,einstellungen.js,erweitert.js}`,
  `docs/ANLEITUNG-DRUCKTEILE-UND-SICHERUNG.md`, `CHANGELOG.md`.
- **Geprüft:** typecheck ✔ · lint ✔ · test ✔ · Klicktest mit isolierter Manager-Instanz (Port 5195, Probelauf-System,
  leere DB): Willkommen inkl. Domain-Abfrage + Zusammenfassung → Konto angelegt, Anmeldung (falsch/richtig), Speichern
  in Sicherung, E-Mail (mit Widerspruch-Warnung) und Netzwerk (mit Rückfrage), Hinweis-Knopf „E-Mail-Einstellungen
  öffnen“. Prüffunktion bei 320×568, 375×812, 667×375, 820×1180, 1180×820, 1366×900, hell und dunkel: alle Reiter
  (Ausklappbares offen), Anmeldung, Willkommen, Zusammenfassung, Rückfrage, Was ist neu, Toasts – 0 Befunde
  (kein waagrechtes Scrollen, nichts abgeschnitten, Tippflächen ≥ 44 px, Kontrast AA, Dialog-Fuß sichtbar).
- **Aufgeräumt:** Testinstanz gestoppt, `_testdaten/manager-design` gelöscht, Hilfsskripte im Scratchpad gelöscht.

## 2026-11-17 – Kleinigkeiten Handy (Unter-Session session-2, Branch: fix/kleinigkeiten-handy)
- **Gebaut:** untere Leiste: neues Feld `tinyLabel` (nur „Vorschläge“ → „Ideen“, sichtbar unter 390 px; „Vorschläge“ bleibt
  als `sr-only` der Name des Links, die Zahl neuer Vorschläge bleibt im Namen). Katalogsuche: Platzhalter „Suchen, z. B.
  „Stift““ (Label „Druckteile suchen“ unverändert). Dialog „Rechte ändern“: `Haekchen` als eine `<label>`-Zeile (min. 44 px,
  Hover, Fokusrahmen per `has-focus-visible` um die ganze Zeile), `input` mit `id`/`htmlFor` und `aria-describedby` wie bisher.
- **Dateien:** `client/src/components/Layout.tsx`, `client/src/features/katalog/CatalogPage.tsx`,
  `client/src/features/verwaltung/PersonDialogs.tsx`, `CHANGELOG.md`.
- **Gemessen (Admin, 5 Einträge):** kleinster Abstand zwischen Beschriftungen bei 320 px 9,3 px (vorher 3,9), 360 px 11 px
  (vorher 4,9), 375 px 14 px, 820 px 41 px; Links 64–75 px breit, 60 px hoch. Platzhalter bei 320 px 126 von 211 px (vorher
  215 px, abgeschnitten). Häkchen-Zeilen 75–113 px (320 px) bzw. 57–77 px (820 px) hoch. Kein waagrechtes Scrollen.
- **Geprüft:** typecheck ✔ · lint ✔ (0 Fehler) · test ✔ · im Browser ✔ (320, 360, 375, 820, 1366 px)
- **Aufgeräumt:** Dev-Server (5182/3012) gestoppt, `C:\Entwicklung\_testdaten\session-2` gelöscht.

## 2026-11-17 – Mails neu gestaltet, Hinweis „nur im Schulnetz“ (Unter-Session, Branch: feature/mails-neu)
- **Gebaut:** gemeinsames Mail-Layout `server/src/kern/mail/layout.ts` (Tabellen, Inline-Styles, max. 600 px, Handy-Regeln,
  kugelsicherer Knopf, Link als Text, Preheader, Fuß mit Grund); alle Mailarten umgestellt (`anfragen.mail.ts`,
  `vorschlaege.mail.ts`, `passwortlink.ts`; Sperre mit eigenem Text). Vorschau-Skript `npm run mail:vorschau -w server`.
  Schulnetz-Hinweis: Regeln einmal in `manager/lib/erreichbarkeit.mjs` (App importiert sie, esbuild bündelt), Einstellung
  `erreichbarkeit` im Bereich „mail“ (Standard/alt/unbekannt = auto), Server-Manager: Auswahl, Erkennung, Warnung +
  Hinweis in der Übersicht; automatische Link-Adresse ohne Docker/VM/VPN-Schnittstellen.
- **Tests:** `mail-smtp.test.ts` (echter Versand an SMTP-Fänger, MIME, UTF-8), `erreichbarkeit.test.ts`
  (Erkennung, Entscheidungstabelle, Schnittstellen-Listen Windows/Ubuntu/Pi, alte Einstellungen), bestehende Mail-Tests
  erweitert; Installer-Test Linux: Mailversand mit alter Version einrichten → nach Update unverändert, Testmail + App-Mail
  kommen an (`smtp-faenger.mjs`, `mail-pruefen.mjs`, `pruefen.sh mail-*`).
- **Geprüft:** typecheck ✔ · lint ✔ · test ✔ · Vorschau bei 375/768/1280 px ✔
- **Aufgeräumt:** Vorschau-Ordner `_testdatenmail-vorschau`, Test-Manager-Ordner gelöscht.

## 2026-11-17 – Ansichten-Prüfung (Unter-Session session-2, Branch: fix/ansichten-pruefung)
- **Geprüft:** alle Seiten und Dialoge der Web-App in 320×568, 375×812, 667×375, 820×1180, 1180×820 und 1366×900, als
  Besucher, Lehrkraft, Druck-Team und Administrator – inklusive leerer Zustände, Fehler (Pflichtfelder, falsches Passwort,
  Server nicht erreichbar, Sitzung abgelaufen, Cookies blockiert), langer Namen/Adressen/Dateinamen, Neuigkeiten, Toasts,
  „Datei ist bereit“ (iOS-Teilen nachgestellt) und Menü/untere Leiste. Gemessen per Skript in sechs gleichzeitigen iframes
  (Seitenbreite, Dialog-Überlauf, Knöpfe in Karte/Dialog, Tippflächen ≥ 40 px, abgeschnittene Texte), Optik per Screenshot.
- **Behoben (nur Tippflächen und eine Anordnung):** `LoginPage.tsx`/`PasswortPage.tsx` (Knöpfe im Feld volle Feldhöhe),
  `Toast.tsx` (× 41 px), `ItemsAdminPage.tsx` (Export-Häkchen mit 41-px-Label; „Beispieldatensatz“ vor die Aktionsleiste),
  `ProposalFormPage.tsx` („Foto entfernen“ 41 px), `proposals.tsx` (Links mit Polster).
- **Offene Gestaltungsfragen** im PR beschrieben (untere Leiste unter 360 px eng, Platzhalter der Katalogsuche auf 320 px
  abgeschnitten, Häkchen im Dialog „Rechte ändern“ nur über das Label groß).
- **Geprüft:** typecheck ✔ · lint ✔ (0 Fehler) · test ✔ · im Browser ✔
- **Aufgeräumt:** Dev-Server (5182/3012) gestoppt, `C:\Entwicklung\_testdaten\session-2` gelöscht, Hilfsskripte im Scratchpad entfernt.

## 2026-11-17 – Filter Druckteile, Stammdaten-Kopf und Farbrollen-Spalten (Unter-Session, Branch: feature/filter-stammdaten)
- **Druckteile verwalten:** Filter „Alle · Veröffentlicht · Entwurf“ (Knöpfe mit `aria-pressed`, Zahlen folgen der Suche),
  `?ansicht=` und `?q=` in der Adresse, Export-„Alle auswählen“ auf die gefilterte Liste, leerer Zustand mit „Alle
  Druckteile anzeigen“. Reine Funktionen in `druckteilFilter.ts` mit Test.
- **Stammdaten (`ListPanel`):** „… hinzufügen“ als Hauptknopf im Kopf (rechts neben der Überschrift, Handy volle Breite
  darunter), Zusatzknöpfe (Bambu-Import) daneben; Erklärung darunter. Neue Zeile wird oben eingefügt und fokussiert
  (gespeichert wird die angezeigte Reihenfolge – wer sie weiter unten will, schiebt sie mit den Pfeilen).
- **Farbrollen:** Zeilen als Raster (ab md: Farbe | Name | Herkunft 10rem | vorrätig 9.5rem; Handy: Farbe + Name, darunter
  Schalter + Herkunft), Schalter-Beschriftung fest „vorrätig“ (Name nur für Screenreader), „Druckteilen zuordnen …“
  rechtsbündig. Kategorien: Vorschau mit fester Breite, damit das Namensfeld überall gleich breit ist.
- **Marke/Linie-Vorschläge:** `vorschlaege.ts` (eindeutig, alphabetisch, Linien der Marke zuerst) mit Test; `VorschlagFeld.tsx`
  zeigt passende Werte als Knöpfe unter dem Feld (kein `<datalist>`, das auf iPad/iPhone kaum bedienbar ist). Nummer,
  Farbname und Farbwert bleiben normale Felder.
- **Herunterladen ohne Wegnavigieren (iPad-Web-App):** neu `client/src/lib/herunterladen.ts` (fetch mit Sitzung und
  `X-Requested-With` → Blob → auf iOS `navigator.share({ files })`, sonst Blob-URL + unsichtbares `<a download>`;
  Dateiname aus `Content-Disposition`; AbortError still; NotAllowedError – Safari erlaubt Teilen nach langem Laden nicht
  mehr – → Dialog „Datei ist bereit“ mit zweitem Tippen) und Knopf `client/src/components/DateiLaden.tsx` (Ladeanzeige,
  Fehler als Toast). Eingesetzt beim Export und bei Druckdateien (`ModelFilesSection.tsx`). Weitere Stellen geprüft:
  Fotos bei Vorschlägen und Video-Links öffnen mit `target="_blank"` (eigenes Fenster mit „Fertig“), Server-Manager-Link
  ist eine Seite, kein Download – unverändert. Entscheidung teilen/herunterladen getestet (`client/test/herunterladen.test.ts`).
  Nicht testbar hier: echtes iPad – im Browser simuliert (iPad-Kennung, canShare/share ersetzt).
- **Dateien:** `client/src/features/verwaltung/{ItemsAdminPage.tsx,druckteilFilter.ts}`,
  `client/src/features/einstellungen/stammdaten/{ListPanel,FilamentsPanel,CategoriesPanel,VorschlagFeld}.tsx`,
  `client/src/features/einstellungen/stammdaten/vorschlaege.ts`, `client/src/lib/herunterladen.ts`,
  `client/src/components/DateiLaden.tsx`, `client/src/features/verwaltung/druckteil-bearbeiten/ModelFilesSection.tsx`,
  `client/test/{druckteilFilter,vorschlaege,herunterladen}.test.ts`, `CHANGELOG.md`.
- **Geprüft:** typecheck ✔ · lint ✔ · test ✔ · im Browser (375, 768, 820, 1180, 1366 px): kein waagrechtes Überlaufen,
  Schalter, Entfernen und Pfeile je Liste in allen Zeilen auf gleicher x-Position (getBoundingClientRect).
- **Aufgeräumt:** Testserver (5182/3012) gestoppt, `C:\Entwicklung\_testdaten\session-2` gelöscht.

## 2026-11-17 – Zeitlimits beim Update und Härtung der Admin-Schritte (Unter-Session, Branch: fix/manager-haertung)
- **Zeitlimits angeglichen:** neu `manager/lib/zeitlimits.mjs` – eine Stelle, von innen nach außen jeweils größer:
  Sicherung vor dem Update 2 h (vorher 60 min), Admin-Schritt (`elevate`, z. B. chown/icacls über die Ablage) 30 min
  (vorher 10), Wächter des Helfers 3 h (vorher 45 min – kleiner als die Sicherung!), ganzer Helfer 4 h (Linux
  `TimeoutStartSec=14400`, vorher 3600; Windows/WinSW ohne Start-Limit). Anzeige-Entscheidung `laufAnzeige()`: „wartet“
  max. 10 min bis zur ersten Meldung, danach Status des Helfers, bei Stille „läuft noch (seit …)“, nach 4 h „nicht
  beendet – Server neu starten“ (sperrt neue Updates bis zur Notfall-Prüfung). Seite: Wartetext, solange der Manager
  während des Updates gestoppt ist, mit den Limits aus `GET api/update` (`zeitlimits`). Linux: Update per Knopfdruck
  schreibt jetzt auch die Unit des Helfers neu (daemon-reload stoppt ihn nicht), damit neue Limits ankommen.
- **Härtung Linux:** Unit-Dateien und polkit-Regel stehen als Text im Admin-Skript, root schreibt sie per Temp-Datei +
  `mv` direkt nach `/etc` (root:root 644) – nicht mehr erst nach `/var/lib/mosaik3lab/manager/dienste` (gehört
  mosaik3lab: Austausch vor `install` → root-Code; Verweis dort → root schreibt beliebige Datei). Reste dort werden entfernt.
  Deinstallieren prüft `install-manifest.json` (liegt unter Linux im Datenordner) mit `lib/manifestpruefung.mjs`: nur
  bekannte Dienstnamen (vorher Shell-Einschleusung als root möglich), gültige Ports, Verknüpfungsdateien, Programmordner
  der Installation; Dienstname im Skript zusätzlich gequotet.
- **Härtung Windows:** `protectProgramScript` – unter „Programme“ wie bisher Standardrechte (+ Besitzer Administratoren),
  an anderem Ort ausdrücklich nur Administratoren/System schreiben (Benutzer/Lokaler Dienst lesen). Vorher bekam ein
  Programmordner außerhalb von „Programme“ (z. B. unter `C:\Mosaik3LAB`, das Lokaler Dienst „Ändern“ vererbt) keinen Schutz.
- **Geprüft (unverändert gut):** Update-Paket wird in `<Programm>/.update` kopiert und die Kopie gegen die offizielle
  SHA-256 (vom Helfer selbst geholt) geprüft; Auftrag wird validiert; Status nur im Programmordner. Offen (klein, im Bericht):
  der Helfer liest Pfade (Backup-Ziel, Datenordner) aus der vom Manager beschreibbaren Datenbank bzw. Startdatei.
- **CI:** `pruefen.sh installiert`: Unit-Dateien/polkit-Regel root:root 644, nicht von mosaik3lab beschreibbar (auch
  ihre Ordner), keine Unit-Dateien mehr im Datenordner, `TimeoutStartSec=14400`. `pruefen.ps1 installiert`: Programmordner,
  `dienste\`, `werkzeuge\`, WinSW-Dateien, node.exe, Helfer-Skript und alle Dienst-Programme ohne Schreibrecht für Lokaler
  Dienst, Netzwerkdienst, Benutzer, Authentifizierte Benutzer, Jeder, Interaktiv; alle Dienste starten aus dem Programmordner.
- **Dateien:** manager/lib/{zeitlimits (neu),manifestpruefung (neu),aktualisieren,paketupdate,updates,setup}.mjs,
  manager/platform/{linux,windows}.mjs, manager/public/update.js, manager/test/haertung.test.mjs (neu), manager/README.md,
  .github/installer-test/{pruefen.sh,pruefen.ps1}, docs/INSTALLATION.md, CHANGELOG.md.
- **Geprüft:** `node --test manager/test/haertung.test.mjs` ✔ · `aktualisieren.test.mjs` ✔ · typecheck ✔ · lint ✔ ·
  `npm test` ✔ · Installer-Test (Windows, Linux, Pi) auf dem PR.
- **Aufgeräumt:** keine Server gestartet; nichts an der installierten Version geändert.

## 2026-11-17 – Anfrage-E-Mail fest, Stammdaten-Meldung, Sicherheitshinweise (Session: anfrage-mail, Branch: fix/anfrage-mail)
- **Gebaut:** Angemeldet (Lehrkraft oder Konto) ersetzt `createOrder` eine abweichende `requesterEmail` still durch die
  Sitzungsadresse (Konto: `user.email`, sonst Lehrkraft), ohne Domänenprüfung; das Formular zeigt sie nur lesend, Entwurf und
  Geräte-Vorbelegung überschreiben sie nicht, die Gast-Vorbelegung wird angemeldet nicht mehr mit der eigenen Adresse
  überschrieben. Stammdaten: `saveList` meldet „Zeile n: Feld fehlt“ bzw. „Zeile n: Feld: Meldung“, `fields` je Zeilenindex;
  `ListPanel` markiert die Zeile bis zur nächsten Änderung. Druckteil-Seite: Sicherheitshinweise nur mit Inhalt (sonst nirgends
  angezeigt – Mail/Export geben nur Daten weiter); Datenschutz-Warnung im Personalisierungs-Editor entfernt. ARCHITEKTUR: Login-Beschreibung korrigiert (keine „Login-Bremse“, sondern
  Rate-Limit 60/10 min je IP + Kontosperre nach 10 falschen Passwörtern für 1 Stunde).
- **Dateien:** server/src/module/anfragen/anfragen.service.ts, server/src/module/stammdaten/stammdaten.service.ts,
  server/test/{anfragen,stammdaten}.test.ts, client/src/lib/anfrageEmail.ts (neu),
  client/src/features/katalog/{RequestDialog,ItemDetailPage}.tsx, client/src/features/verwaltung/druckteil-bearbeiten/CustomFieldsSection.tsx,
  client/src/features/einstellungen/stammdaten/{ListPanel.tsx,listRows.ts}, client/test/anfrageformular.test.ts,
  docs/ARCHITEKTUR.md, CHANGELOG.md.
- **Geprüft:** typecheck ✔ · lint ✔ · test ✔ (kein Browser-Klicktest).
- **Aufgeräumt:** kein Server gestartet, Scratchpad-Datei gelöscht.

## 2026-11-17 – Prüfung Server-Manager, Installation, Update, Sicherung (Session: manager-pruefung, Branch: fix/manager-pruefung)
- **Gebaut:** Firewall-Schalter ohne Adminrechte (Einstellung gespeichert, Befehl zum Kopieren, vorhandene Regeln ohne
  Adminrechte; auch im „Abgleichen“); „Einrichten/Reparieren“ bei Paket-Installationen → Hinweis aufs Installer-Paket (UI +
  `POST /api/setup` lehnt ab); Wiederherstellen fragt bei fremdem Passwort nach; polkit < 0.106 (Bullseye, Ubuntu 22.04)
  wird bei Einrichtung, im Status und beim Update-Knopf gemeldet; CLI als root gibt Daten dem Dienstbenutzer zurück, ohne
  sudo klare Ablehnung; Notzugang-Text mit SSH-Tunnel (Linux); Installer zeigt den Beginn jedes Schritts mit Uhrzeit.
  CI: Zeitlimit je Installationsschritt (`.github/installer-test/zeitlimit.sh`: bei Hänger Prozessbaum, Dienste, Protokolle,
  dann Abbruch), `timeout-minutes` je Schritt, Logs auch nach Abbruch, Knopfdruck-Test wartet 10 statt 25 Minuten, neue
  Prüfung „kommandozeile“ (Linux). Wackelige Start-Wartezeit in `remote.test.mjs`/`erstzugang.test.mjs` (10 s → bis 60 s).
- **Dateien:** manager/cli.mjs, server.mjs, installieren.sh, lib/{services,reconcile,setup,status,updates}.mjs,
  platform/{linux,index}.mjs, public/{ui,app,einstellungen,erweitert}.js, test/{rechte (neu),remote,erstzugang}.test.mjs,
  .github/workflows/installer-{linux,test}.yml, .github/installer-test/{zeitlimit.sh (neu),pruefen.sh,knopfdruck.mjs},
  CHANGELOG.md, docs/INSTALLATION.md.
- **Geprüft:** typecheck ✔ · lint ✔ · `node --test manager/test/rechte.test.mjs` ✔ · remote/erstzugang ✔ · Klicktest
  isolierter Manager (Port 5195, Probelauf) ✔ · Installer-Test auf dem PR.
- **Aufgeräumt:** Test-Manager gestoppt, `C:\Entwicklung\_testdaten\manager-pruefung` gelöscht.

## 2026-11-17 – Fehlersuche in der ganzen App (Unter-Session, Branch: fix/app-pruefung)
- **Gebaut (nur Fehlerbehebungen):**
  - Server: Vorschlag mit Entwurf im Katalog kann nicht mehr auf einen anderen Status als „umgesetzt“ gesetzt werden (409,
    Feld `status`); nach dem Löschen des Entwurfs wieder frei.
  - Client: Fokus auf die erste fehlerhafte Auswahl im Anfrageformular (`lib/fokus.ts`), E-Mail der angemeldeten Lehrkraft
    nach dem Laden der Anmeldung, Farbwahl aus Vorlagen auf die angebotene gleichnamige Rolle (`aufAngeboteneFarben`),
    Konfiguration nach dem Einspielen neu laden, Hinweis „ohne vorrätige Farbe“ je Farbbereich (`ohneVorraetigeFarbe`),
    Ziel nach der Anmeldung für Einzelrechte (`lib/anmeldeZiel.ts`), doppelter „Vorschläge“-Eintrag in der Handy-Leiste,
    Dialog schließt nur bei Klick, der auf dem Hintergrund begann, Screenreader-Name der Veröffentlichen-Schalter
    (`Switch srLabel`), Vorschlags-Karte (Status gesperrt bei Entwurf, Fehlerfeld, „Speichern“ nach Erfolg aus, Link auf
    Anfragen nur mit `orders:view`), Filter „Meine Anfragen“ als Umschaltknöpfe statt Tabs ohne Tab-Verhalten.
  - Leere, versehentlich eingecheckte Datei `konten.repository.ts` in der Projektwurzel entfernt.
- **Dateien:** `server/src/module/vorschlaege/vorschlaege.service.ts`, `server/test/vorschlaege.test.ts`,
  `client/src/components/{Dialog,Layout,ui}.tsx`, `client/src/features/katalog/{RequestDialog,MyOrdersPage}.tsx`,
  `client/src/features/konto/LoginPage.tsx`, `client/src/features/verwaltung/{FilamentsPage,ItemsAdminPage,ProposalsAdminPage}.tsx`,
  `client/src/lib/{colors,fokus,anmeldeZiel}.ts`, `client/test/anfrageformular.test.ts`, `CHANGELOG.md`
- **Geprüft:** typecheck ✔ · lint ✔ (nur alte Warnungen) · test ✔ · API-Stichproben je Rolle (Rechte aller Verwaltungsrouten,
  Selbst-Entfernen/-Herabstufen, Stammdaten-Dubletten) · im Browser: Fokus im Anfrageformular, Vorschlagskarte, Handy-Breite 375 px
- **Aufgeräumt:** Dev-Server (5182/3012) gestoppt, `C:\Entwicklung\_testdaten\session-2` gelöscht, Prüfskript im Scratchpad gelöscht.

## 2026-11-16 – Texte anonymisiert, Schul-Domain bei der Ersteinrichtung (Unter-Session, Branch: feature/anonymisieren)
- **Gebaut:**
  - Anonymisiert (nur Texte/Kommentare): Ort, Website-Link, interne IP und die Beschreibung der konkreten Schule aus README,
    CLAUDE.md (`http://<IP>/mosaik3lab`), docs/ANFORDERUNGEN.md, docs/ARCHITEKTUR.md, docs/PROTOKOLL.md, package.json,
    client/index.html, manifest.webmanifest und Code-Kommentaren (Logo.tsx, index.css, main.tsx, shared/einstellungen.ts);
    Test-IP in migration.test.ts neutral. Logo, Icons, sichtbare App-Texte, Standard-Domain, Demo-Daten und Tests bleiben.
  - Ersteinrichtung: Willkommen-Dialog im Server-Manager fragt „Ist @<domain> die E-Mail-Domain Ihrer Schule?“ (Ja/Nein,
    bei Nein Pflichtfeld „Domain der Schule“), danach Zusammenfassung „Stimmen alle Angaben?“ (Zurück / Ja, anlegen).
    `auth/first` und Einrichten nehmen optional `schulDomain`, Skript `user:create-admin` `--domain`. Der erste aktive
    Administrator setzt die erlaubte Domain (sonst die seiner Adresse) – nur wenn die Anfrage-Einstellungen noch nie
    gespeichert wurden (neue Markierung `orderFormGesetzt` in `einstellung`, gesetzt beim Speichern in der Verwaltung)
    und noch dem Code-Standard entsprechen.
- **Dateien:** `shared/src/einstellungen.ts` (`emailDomainSchema`), `server/src/module/einstellungen/einstellungen.service.ts` (neu),
  `einstellungen.routes.ts`, `konten/konten.service.ts`, `server/scripts/create-admin.ts`, `manager/lib/admin.mjs`, `auth.mjs`,
  `setup.mjs`, `manager/server.mjs`, `manager/public/index.html`, `app.js`, `app.css`, Tests `server/test/einstellungen.test.ts`,
  `manager/test/admin.test.mjs`, `CHANGELOG.md`
- **Geprüft:** typecheck ✔ · lint ✔ (nur alte Warnungen) · test ✔ · `node --test manager/test/admin.test.mjs` ✔ · Dialog im Browser
  (statisch, 300 px breit): Frage, Nein → Feld mit Fokus, Zusammenfassung, Zurück ✔
- **Aufgeräumt:** Hilfsskripte im Scratchpad, statischer Testserver gestoppt.

## 2026-11-16 – Installer-Test parallel, schneller Rückfall (Unter-Session, Branch: feature/installer-test-schneller)
- **Gebaut:**
  - Installer-Test: je System ein Paket-Job (einmal bauen → Artifact), ein Altpaket-Job (Cache/Bau, parallel), drei
    Testrunden auf eigenen Rechnern gleichzeitig (`neu`, `altformat`, `v100`), Manager-Tests auf eigenem Rechner, Release
    erst nach allen Tests des Systems (Windows-Upload jetzt auf Ubuntu). Linux als wiederverwendbarer Workflow
    `installer-linux.yml` je Architektur. Alle Prüfungen unverändert.
  - Produkt: `waitHealthy` (Einrichten/Update/Rückfall) gibt auf, sobald sich die Web-App 4-mal hintereinander beendet hat
    (`restarts` in `webapp.state.json`, nur Zustand ab dem Dienststart) – sonst weiter bis 2 Minuten. Meldung nennt den Grund.
- **Dateien:** `.github/workflows/installer-test.yml`, `.github/workflows/installer-linux.yml` (neu), `manager/lib/startwache.mjs` (neu),
  `manager/lib/setup.mjs`, `manager/test/startwache.test.mjs` (neu), `docs/INSTALLATION.md`, `CHANGELOG.md`
- **Gemessen:** vorher (Tag v1.2.0) Windows 11,6 min, Linux x64 7,1 min, arm64 7,3 min, Rückfall-Tests je 126–171 s.
  Nachher (PR #1, ohne Cache): ganzer Lauf 5,1 min; längster Weg Windows altpaket 1,4 + Runde altformat 3,4 min;
  Linux fertig nach 2,0–2,3 min; Rückfall-Tests 23–55 s („4-mal hintereinander beendet“).
- **Geprüft:** typecheck ✔ · lint ✔ · test ✔ · `node --test manager/test/startwache.test.mjs` ✔ · Installer-Test im PR
- **Aufgeräumt:** nichts angelegt außer dem Worktree.

## 2026-11-16 – Neues öffentliches Code-Repository (Hauptchat)
- **Warum:** Private Repositories haben nur 2.000 Actions-Minuten im Monat (Windows doppelt); der Installer-Test hatte sie fast
  aufgebraucht. Öffentlich sind sie frei – aber ohne den alten Verlauf, damit keine persönlichen Daten (Commit-E-Mail) sichtbar sind.
- **Gemacht:** Altes Repository privat und umbenannt in `x-vs-x/mosaik3lab-archiv` (voller Verlauf). Neues öffentliches
  `x-vs-x/mosaik3lab` mit dem Stand 1.2.0 als erstem Commit, Autor mit GitHub-noreply-Adresse. Zweig `altformat` = Stand des
  früheren Commits ALTFORMAT (für die zweite Installer-Runde). Paket 1.0.0 für die dritte Runde kommt aus `mosaik3lab-pakete`.
  Updates der Schulen unverändert (`mosaik3lab-pakete`).
- **Hinweis:** Lokal `git config user.email` auf die noreply-Adresse gestellt; alte Tags v1.0.0–v1.1.5 nur noch im Archiv.

## 2026-11-16 – Personen entfernen, Server-Manager in Reitern, Firewall unter Linux/Pi (Hauptchat, Branch: manager-gliederung)
- **Gebaut:**
  - Verwaltung → Personen → „Entfernen“ (`POST /api/personen/entfernen`, E-Mail im Rumpf). Konto und Lehrkraft-Eintrag werden
    als entfernt markiert (Migration 016 `entfernt_am`), die E-Mail durch `entfernt-<id>` ersetzt (Adresse wieder frei),
    Rechte/Links/Sitzungen weg. Anfragen, Vorschläge und Verlauf bleiben (Schnappschüsse von Name/E-Mail). Nicht sich selbst;
    der letzte Administrator mit Passwort bleibt.
  - Server-Manager: Reiter Übersicht (Updates oben) · Sicherung · Netzwerk · E-Mail · System statt „Einstellungen“ und
    eingeklapptem „Erweitert“. Formulare je Reiter, Hinweise je Betriebssystem (`status.system`).
  - Linux: `firewall.active()`/`available()`. Ohne aktive Firewall keine Warnung „Regel fehlt“, „Im Schulnetz erreichbar“
    ohne sudo; ufw nicht lesbar (Manager läuft als mosaik3lab) → „nicht prüfbar“ statt Dauerwarnung. Einrichtung legt die
    Regel an, sobald ufw/firewalld installiert ist (auch ausgeschaltet).
- **Dateien:** server/src/module/konten/*, migrations/016_person_entfernt.sql, server/test/konten.test.ts, client/src/features/verwaltung/Person*.tsx,
  manager/public/*, manager/lib/{services,status,reconcile,setup}.mjs, manager/platform/linux.mjs, manager/README.md, CHANGELOG.md
- **Geprüft:** typecheck ✔ · lint ✔ · test ✔ · Klicktest Manager mit eigener Testinstanz (Port 5195, Probelauf-Plattform):
  alle Reiter, Port ändern + Speichern, Handy-Breite ✔. Manager-Tests und Linux/Pi laufen auf GitHub.
- **Aufgeräumt:** Testinstanz gestoppt, `_testdaten/manager-ui` gelöscht, launch.json unverändert.

## 2026-11-16 – GitHub-Prüfungen schneller (Unter-Session, Branch: feature/ci-schneller, PR #8)
- **Gebaut:** „Prüfen“: `manager:test` als eigener Job parallel. „Installer-Test“: `concurrency` für PRs (Tags nie
  abgebrochen), Windows-`manager:test` bei PRs im parallelen Job `manager-windows` (bei Tags weiter im Job, Release nur nach
  bestandenem Test), Paket 1.0.0 aus dem Release statt neu gebaut, Paket im alten Format aus dem Actions-Cache, kürzere `timeout-minutes`.
- **Gemessen:** Prüfen 2–3 min → knapp 2 min; Installer-Test 12–17 min → gut 10 min (erster Lauf, ohne Cache).
  Größter Rest: Rückfall-Test wartet je System zweimal 2 Minuten auf die Web-App (Produktverhalten, nicht geändert).
- **Dateien:** `.github/workflows/pruefen.yml`, `.github/workflows/installer-test.yml`, `docs/INSTALLATION.md`
- **Geprüft:** typecheck ✔ · test ✔ · beide Workflows im PR grün
- **Aufgeräumt:** nur Scratchpad-Dateien, keine Server gestartet

## 2026-11-16 – Export/Import und Sicherungen zwischen Systemen, Stammdaten-Fälle, Tests aufgeräumt (Hauptchat, Branch: fix/import-szenarien)
- **Frage des Nutzers:** Funktioniert Export unter Windows → Import unter Linux mit den Dateien? Was passiert, wenn Stammdaten
  fehlen oder anders heißen?
- **Befund:** Format ist systemneutral (JSON, LF, Dateien als Base64; Ablage-Pfade immer mit „/“, Dateiname = ID + kleine Endung,
  Originalname nur als Angabe). Stammdaten: fehlende werden angelegt, andere Schreibweise zugeordnet, Farben über Katalog-ID/Nummer
  erkannt, nicht beschriebene Farben gemeldet – war schon da und getestet.
- **Behoben:** Datei mit Byte-Order-Mark (im Windows-Editor gespeichert) wurde als „keine Export-Datei“ abgelehnt
  (`leseKopf`, Gegenprobe ohne Korrektur schlägt fehl).
- **Neu getestet** (`server/test/datenaustausch-plattform.test.ts` mit unter Windows erzeugter `test/fixtures/export-windows.json`):
  frisches Ziel, Ziel ganz ohne Stammdaten, BOM/CRLF, andere Schreibweise, nochmal einspielen (nichts doppelt), unvollständige
  Angaben (Grund genannt), Umlaute in Namen und Dateinamen, Großbuchstaben-Endungen, Inhalt bitgenau, Anfrage auf das eingespielte Teil.
  „Prüfen“ führt die Austausch-Tests jetzt unter Linux **und** Windows aus (Job `austausch-windows`).
- **Sicherungen systemübergreifend:** Sicherungsdatei selbst ist neutral (tar mit „/“-Namen, Prüfsummen). Aber Ordner aus der
  Datenbank einer Sicherung vom anderen System: Linux lehnte Windows-Pfade ab (Einrichtung brach ab), Windows nahm „/var/…“ als
  „C:\var\…“. Jetzt `fremderPfad()` in `manager/lib/config.mjs`: fremde Ordner gelten nicht (Standardordner), auch nicht als
  Eingabe. Test `manager/test/fremde-pfade.test.mjs` (läuft unter Windows und Linux → beide Richtungen).
- **Tests aufgeräumt (Prüfung durch Helfer):** keine echten Reste des Einrichtungscodes; behoben: Test, der immer bestand
  (admin.test: Sicherung fehlte), altes Manager-Passwort in Testaufrufen, doppelter Client-Test, „gleiche Version“ jetzt wirklich
  geprüft, ohne Netz/Git „übersprungen“ statt still bestanden, genauere Prüfung der Erstzugangs-Antwort; manager/README (API,
  Protokollarten, Testliste) und Meldung in `pruefen.sh` aktualisiert. Keine unbenutzten Skripte/Module gefunden.
- **Geprüft:** check ✔ (lokal Windows), Manager-Tests 93/93; CI Linux + Windows + Installer-Test.

## 2026-11-15 – Einrichtungscode entfernt (Hauptchat, Branch: fix/ohne-einrichtungscode)
- **Wunsch des Nutzers:** Der Einrichtungscode für den ersten Administrator wird nicht gebraucht.
- **Gebaut:** `lib/einrichtungscode.mjs` gelöscht; `firstAdmin` ohne Code (CSRF-/Origin-Schutz und „nur solange kein Admin“
  bleiben); `GET /api/auth/code` → `GET /api/auth/erstzugang` (nur Adressen, nur direkt am Server); `cli.mjs erstzugang` zeigt
  Adressen und den Hinweis, das Konto gleich anzulegen; Codefeld aus dem Willkommen-Dialog entfernt; alte
  `einrichtungscode.txt` wird beim Start des Managers gelöscht. READMEs, INSTALLATION, ARCHITEKTUR, manager/README, CLAUDE.md angepasst.
- **Abwägung:** Bis zum Anlegen des ersten Administrators kann jeder im Schulnetz die Willkommen-Seite nutzen – in den Anleitungen
  steht deshalb „gleich nach der Installation erledigen“.
- **Geprüft:** Manager-Tests 90/90 (erstzugang neu: ohne Code, CSRF, kein zweiter Admin, alte Code-Datei entfernt) · check ✔ ·
  lokale Installation 1.1.3 vorher geprüft (Dienste, Schreibschutz, Netz).

## 2026-11-15 – Restpunkte: drei Optimierungen, Browser- und Mail-Prüfung (Hauptchat, Branch: fix/rest)
- **Gebaut:** `GET /api/proposals/anzahl-neu` (Zähler per SQL, `countByStatus`) statt ganzer Liste je Seitenwechsel; Mail-Status per
  `setSetting('mailStatus')` statt `settings.update` (schrieb alle Stammdaten); Personenliste: Bereiche aller Konten in einer Abfrage.
- **Im Browser bestätigt:** Lösch-Rückfrage (Abbrechen löscht nichts, Knopf gesperrt), Kopieren ohne Zwischenablage („Strg+C“),
  Abmelden bei Verbindungsfehler (Meldung, angemeldet bleiben, danach normal abmelden).
- **E-Mail Ende-zu-Ende:** lokaler Mini-SMTP-Server (nur Test, 127.0.0.1:2525): Anfrage-Mail (Absender, Empfänger, Antworten-an,
  Umlaute, Links, Text + HTML) und Passwort-Link-Mail kamen über den echten nodemailer-Weg an; Mail-Server nicht erreichbar → Anfrage
  trotzdem sofort angenommen, Fehler im Mail-Status.
- **Dateien:** vorschlaege.{routes,repository}.ts, anfragen.mail.ts, vorschlaege.mail.ts, konten.repository.ts, Layout.tsx, Tests.
- **Geprüft:** typecheck ✔ · lint ✔ · test ✔ (neu: Zähler, Recht auf den Zähler).
- **Offen (nicht von hier lösbar):** Ordner `mosaik3lab-handy` (vollständig gemergt) entfernen – braucht Freigabe des Nutzers.

## 2026-11-15 – Feinschliff: kleine Funktionen, Ansichten, Optimierungen (Hauptchat + 3 Helfer, Branch: fix/feinschliff)
- **Vorgehen:** Klicktest aller Seiten (Desktop/Handy, Demo-Daten in `_testdaten/feinschliff`, Port 5181/3011), zwei Code-Durchsichten
  (Client; Server + Manager-Oberfläche), Behebung aufgeteilt (Client: Helfer; Server/Manager: Hauptchat).
- **Fehler behoben:** Manager-Einstellungen brachen ab bei „nur dieser Rechner“ (`status` statt `ctx.status`); doppelter Eintrag in der
  Bild-Reihenfolge löschte ein Bild; Statusabfrage für Lehrkräfte gab interne Felder heraus (jetzt `toOwnOrder`); `/index.html` ohne
  Basis-Pfad; ungespeicherte Listen-Eingaben gingen verloren; Löschen von Bildern/Dateien/Videos ohne Rückfrage; Admin-Hinweis „nur intern“
  trotz Statusanzeige für Lehrkräfte; Kopieren ohne HTTPS; ausgeschaltete Status nicht filterbar.
- **Kleinigkeiten:** gemeinsame Suche `shared/src/suche.ts` (Umlaute, ß, mehrere Wörter) in Katalog und allen Verwaltungslisten; Fokus aufs
  erste fehlende Feld; Fokus nach Entfernen; Doppelklick-Schutz; „vor 3 Tagen“; Testmail-Fehler; 401-Meldungen im Manager; Sperr-Text ohne
  Mail; 401 statt 403 bei Vorschlagsfoto; Umlaute in Upload-Fehlern; Passwort max. 72 Byte; „Zurück zum Katalog“ behält Filter.
- **Optimierungen:** Verwaltungsseiten werden nachgeladen (Hauptpaket 193 → 153 KB gzip); Bild-Auslieferung 1 statt ~9 Abfragen;
  `/assets` ein Jahr zwischenspeicherbar.
- **Bewusst gelassen:** Zähler neuer Vorschläge (lädt Liste), Mail-Status schreibt alle Stammdaten, N+1 bei Personenliste – bei Schulgröße
  unerheblich.
- **Geprüft:** typecheck ✔ · lint ✔ · test ✔ (neue Tests: Umlaut-Suche, doppelte Bildliste, Statusabfrage ohne interne Felder) · Browser
  Desktop + Handy ✔.

## 2026-11-15 – Prüfung und Härtung Update-Helfer, Oberflächen-Durchsicht (Hauptchat, PR #3, Branch: test/mehr-szenarien)
- **Unabhängige Durchsicht** (Helfer) des Update-Wegs, Funde behoben: Version im Paket „unbekannt“ (`kern/version.ts` sucht die oberste
  `package.json`); Windows-Programmordner war für LocalService beschreibbar (Paket-Setup setzt Rechte per `icacls /reset`); Linux-chown
  nur noch in eigenen Ordnern ohne Verknüpfungen; Status/Protokoll des Helfers im Programmordner (`update-status.json`,
  `update-helfer.log`, Manager liest nur); Protokoll ohne Verknüpfungen schreiben; Rückfall-Fehler abgefangen; verwaiste Sperre nach
  Neustart; „wartet“ endet nach 10 min mit Meldung; `systemctl --no-block`; Prozessbaum beim Abbruch beenden; Setup stoppt den Helfer
  nicht mehr; keine Verknüpfungen im System-Profil; Doppelstart aus zweitem Tab.
- **Installer-Test:** dritte Runde (v1.0.0 installieren → aktualisieren → Daten erhalten), Knopfdruck über den echten Dienst, Prüfung
  Versionsanzeige und Schreibschutz des Programmordners. Stromausfall-Test auf Wunsch entfernt.
- **Oberflächen:** alle App-Seiten auf Desktop, Tablet, Handy ohne Anzeigefehler; im Manager Häkchen (`flex-shrink`) und Sie-Form.
- **Geprüft:** Manager-Tests ✔ · check ✔ · Installer-Test Windows/Linux/Pi (CI).

## 2026-11-15 – Sicherheit Update-Helfer: Paket nur aus geschütztem Ordner (Hauptchat, Branch: fix/update-geschuetzter-ordner)
- **Gefunden** bei der Linux-Prüfung vor der Freigabe von 1.1.0 (Tag zurückgezogen, nichts veröffentlicht): Der Helfer (root/System) prüfte
  und entpackte das Paket im Ordner `updates`, den auch der Manager (eingeschränktes Konto) beschreiben darf – zwischen Prüfen und
  Installieren hätte ein übernommener Manager die Datei austauschen können.
- **Behoben:** Kopie in `<Programmordner>/.update` (nur Helfer schreibbar), Prüfsumme der Kopie, Entpacken und Installieren nur von dort,
  danach gelöscht. Test mit Austausch der Datei während des Updates; Installer-Test prüft, dass `.update` aufgeräumt ist.

## 2026-11-15 – Version 1.1.0: Updates per Knopfdruck, „Was ist neu“, Schutz für Sicherungen (Hauptchat + 2 Helfer, PR #1, Branch: feature/updates)
- **Arbeitsweise:** ab jetzt über Pull Requests (Workflow „Prüfen“ bei jedem PR; Installer-Test bei Installer-/Manager-/Migrations-Änderungen;
  aus PRs wird nie veröffentlicht). Öffentliches Repo `x-vs-x/mosaik3lab-pakete` (nur Pakete) + `npm run veroeffentlichen` (nur Tag mit
  grünem Installer-Test auf allen Systemen); 1.0.0 dort veröffentlicht.
- **Sicherungen:** neuere Sicherung in älterer Version abgelehnt (`refuseNewerBackup`), neueres Sicherungsformat abgelehnt, App startet
  nie mit neuerer Datenbank (`db.ts migrate`), jüngste Sicherung „vor Update auf …“ nie rotiert.
- **Updates:** `lib/paketquelle.mjs` (nur freigegeben, passendes System, SHA256SUMS), `lib/updates.mjs` (Prüfen, Download, Auftrag),
  Dienst `mosaik3lab-updater` (Windows System / Linux root; Manager darf ihn starten) mit `lib/aktualisieren.mjs`: eigene Prüfsummen-
  und Versionsprüfung, Installation mit dem Ablauf des Pakets (Sicherung, Rückfall), Abbruch nach 45 min, Notfall-Prüfung beim Hochfahren.
  `lib/sperre.mjs`: Einrichtung/Update nie doppelt. Bei „eigene Dienste stoppen“ wird der Update-Helfer ausgenommen (stoppte sich sonst selbst).
- **Was ist neu (Helfer A):** `/api/neuigkeiten` (+`/gelesen`), Migration 015 `benutzer.neuigkeiten_gesehen`, Version beim Start in
  `betrieb_einstellung` (`version.aktuell/vorherige`), Dialog in App; im Manager über die App-Adresse.
- **Manager-Oberfläche (Helfer B):** Karte „Updates“ neu (ein Satz, ein Knopf, eine Bestätigung, Fortschritt, Neustart-Erkennung,
  Ergebnis), Dialog „Was ist neu“, Sicherungen mit Version, Inline-SVG-Icons, Hell/Dunkel, Handy.
- **Tests:** Unit (Paketquelle, Sperre, Update-Helfer inkl. Rückfall/Notfall, Sicherungen, Neuigkeiten); Installer-Test Ende zu Ende
  „Update per Knopfdruck“ auf Windows/Linux/Pi (`knopfdruck.mjs`), Prüfungen des Update-Helfers; zweite Runde mit frischen Daten der
  alten Version. Gefunden und behoben: polkit-Ordner nur für root lesbar (Prüfung mit sudo).
- **Bestehende Installationen:** 1.0.0 und älter einmal per Paket auf 1.1.0, danach per Knopfdruck.

## 2026-11-15 – Versionierung, Version 1.0.0 (Hauptchat, Branch: feature/versionierung)
- **Gebaut:** SemVer mit einer Nummer für alles (oberste `package.json`, alle Teilpakete gleich). `npm run release -- patch|minor|major`
  (`scripts/release.mjs`): prüft sauberen `main`, setzt Versionen + `package-lock.json`, macht aus „Unveröffentlicht“ in `CHANGELOG.md`
  (neu) den Abschnitt der Version, Commit „Version x.y.z“ + Tag `vx.y.z`. **Installer lehnt ältere Versionen ab** (Versionsnummer,
  zusätzlich zum Schema-Schutz; `paketupdate.mjs` `refuseOlderVersion`, bewusst zurück nur mit `cli.mjs setup --aeltere-version`).
  Paketnamen: freigegeben `Mosaik3LAB-Installer-1.0.0-windows-x64.zip` / `…-linux-x64|arm64.tar.gz`, ohne Tag `…-1.0.0-dev.<commit>-…`.
  GitHub: Tag `v*` startet den Installer-Test; jeder Job legt sein getestetes Paket per `.github/installer-test/release.sh` im Release
  `vX.Y.Z` ab (sonst „installer-pakete“). Version in der App (Seitenleiste statt „Lokaler Prototyp“, über Vite `define`) und in `/api/health`.
- **Dateien:** `scripts/release.mjs`, `CHANGELOG.md`, `client/src/lib/version.ts` (neu), `.github/installer-test/release.sh` (neu),
  `scripts/paket.mjs`, `manager/lib/paketupdate.mjs`, `manager/lib/setup.mjs`, `manager/cli.mjs`, `client/vite.config.ts`,
  `client/src/components/Layout.tsx`, `server/src/app.ts`, Workflow, Paket-READMEs, `docs/INSTALLATION.md`, `README.md`, `CLAUDE.md`,
  Test in `manager/test/paketupdate.test.mjs`.

## 2026-11-15 – Ersteinrichtung über das Schulnetz (Hauptchat, Branch: feature/erstzugang)
- **Gebaut:** Nach der Installation ist alles im Netz erreichbar, kein Browser öffnet sich mehr. Solange es keinen aktiven Administrator gibt,
  leitet jede Adresse der App auf `<Pfad>/manager/` → „Willkommen“: Einrichtungscode, E-Mail, Name, Passwort (zweimal). Danach meldet
  sich der Browser selbst in der App an (gleiches Konto) und ist im Server-Manager. Über das Netz nur mit **Einrichtungscode** (zeigen
  `Installieren.cmd`/`installieren.sh` am Ende über `cli.mjs erstzugang`; gebremst wie die Anmeldung; wird danach gelöscht), direkt
  am Server ohne Code. Solange kein Admin da ist, ist über das Netz nichts anderes erreichbar; mit Admin ist die Seite nie wieder
  da (Prüfung je Anfrage; unlesbare Datenbank hält sie zu; kein doppelter „erster“ Admin). Menüpunkt **Verwaltung → Server-Manager**
  nur für die Rolle Administrator (kein eigenes Häkchen). Hinweis auf „Öffentliches“ Netzwerkprofil im Installer.
- **Dateien:** `manager/lib/einrichtungscode.mjs` (neu), `manager/lib/auth.mjs`, `manager/server.mjs`, `manager/cli.mjs`, `manager/public/*`,
  `manager/Installieren.cmd`, `manager/installieren.sh`, `manager/lib/setup.mjs`/`status.mjs` (Hinweistexte), `client/src/lib/ersteinrichtung.ts`
  (neu), `client/src/main.tsx`, `client/src/components/Layout.tsx`, Paket-READMEs (Windows, Linux x64, Raspberry Pi), `docs/INSTALLATION.md`,
  `manager/README.md`, `docs/ARCHITEKTUR.md`, `CLAUDE.md`; Tests `manager/test/erstzugang.test.mjs`, `erstzugang-sperre.test.mjs` (neu).
- **Geprüft:** typecheck ✔ · Server-/Client-Tests ✔ · Manager-Tests ✔ (ohne `selftest.mjs`, der echte Dienste steuert) · Browser ✔ mit den echten
  Runnern (Portal + gebaute Web-App + Manager im Probelauf) über die Netzwerk-IP: Umleitung, falscher/richtiger Code, Anlegen, Auto-Anmeldung,
  danach 403 und keine Umleitung; Handy-Menü zeigt „Server-Manager“. Bestehende Installation (Admin vorhanden) unverändert.
- **Aufgeräumt:** Testdaten `_testdaten\erstzugang`, Test-Einträge in `C:\Entwicklung\.claude\launch.json` zurückgesetzt, Server gestoppt.

## 2026-11-06 – Handy/iPad/Desktop, Runde 3: kein seitliches Scrollen, jede Seite abgehakt, Funktionsabgleich (Session: handy, Branch: feature/handy-ansicht)
- **Seitliches Scrollen – Ursache:** Mit Testdaten war nichts zu breit; mit langen Wörtern (E-Mail-Adressen, zusammengesetzte Wörter,
  Links wie im echten Betrieb) waren **alle 17 Seiten** breiter als der Bildschirm (Stresstest: jeder Text durch ein 80-Zeichen-Wort ersetzt).
  `break-words` hilft in Flex/Grid nicht. Behoben: `overflow-wrap:anywhere` am `body`, `break-words` → `wrap-anywhere`, Chips ohne
  `shrink-0`, Plaketten auf dem Katalogbild begrenzt; waagrecht wischbare Leisten (Kategorien, Status-Filter, Stammdaten-Reiter,
  Bilderleiste) brechen jetzt um. Danach 17/17 Seiten bei 320 px ohne Überbreite – **ohne** die Absicherung `overflow-x: clip`, die
  zusätzlich gesetzt ist. Nebenwirkung abgefangen: Knöpfe brechen nur zwischen Wörtern (`wrap-break-word`), „Std./Min.“ `shrink-0`.
- **Handy-Struktur:** Katalog-Filter (Art, Einsatzbereich, Kategorien) hinter „Filter (n aktiv)“; Stammdaten-Reiter als Liste; lange
  Listen-Erklärungen als „Erklärung“ zum Aufklappen; Farbzeile in Anfragen bricht um; Symbolwahl zweispaltig mit Silbentrennung;
  Hauptaktionen volle Breite (Konto, Einspielen); untere Leiste unter 360 px etwas kleiner (sonst „Verwaltun-g“).
- **iPad/Desktop (Apple-Leitfaden, nur gelesen):** Karten ohne Schatten (Hierarchie über Schrift und Abstand), Seitenleiste 1024–1279 px
  schmaler mit Kurzname „Katalog“, Kopf-Aktionen behalten ihre Breite, Übersicht-Kacheln füllen die Reihe (`auto-fit`), Erklärungen
  mit Lesebreite (`max-w-prose`). Navigation: Handy und iPad hoch untere Leiste, ab 1024 px Seitenleiste.
- **Prüfwerkzeuge (nur im Browser, nicht im Repo):** Inventar aller Knöpfe/Links/Felder je Seite und Breite, Vergleich mit dem Stand
  `main` (e4f9b72, eigener Worktree `mosaik3lab-basis`) als Admin, Lehrkraft und ohne Anmeldung; Überbreite-, Wort- und Stresstest.
- **Geprüft:** typecheck ✔ · lint ✔ · test ✔ (keine Tests angepasst) · Funktionsabgleich ohne fehlendes Element · Überbreite bei
  320/360/375/390/393/412/430/768/844/932/1024/1280/1440 px: keine · alle Dialoge und Aufklapper bei 375 px.
- **Aufgeräumt:** Testserver gestoppt, Basis-Worktree entfernt.
- **Nachtrag E-Mail-Adressen:** wurden mit `break-all` mitten im Wort zerrissen („frau.beispiel@mosaik / schule-lu.de“). Neuer Baustein
  `Email` (`components/ui.tsx`, `<wbr>` vor dem @) statt `break-all` in Übersicht, Anfragen, Vorschläge, Personen, Lehrkräfte, Konto,
  Anmelden, Passwort festlegen; Übersicht: E-Mail in eigener Zeile unter Nummer · Menge · Klasse. Geprüft bei 320/390 px: kein Wortteil
  einer Adresse mehr umbrochen (Umbruch nur am @ oder Bindestrich), mit überlanger Adresse keine Überbreite.

## 2026-11-06 – Handy-Ansicht, Runde 2: Zucken beim Scrollen, Schriftraster, Seiten aufgeräumt (Session: handy, Branch: feature/handy-ansicht)
- **Zucken beim schnellen Scrollen:** Ursache vor allem der Abstand unten mit `env(safe-area-inset-bottom)` aus Runde 1 – der Wert
  springt, wenn Safari unten die Adressleiste ein-/ausblendet, damit änderte sich die Seitenhöhe genau beim Ankommen unten. Jetzt fester
  Abstand (`pb-36`), `min-h-svh` statt `min-h-dvh`, `overscroll-behavior-y: none` (kein Gummiband, kein versehentliches Neuladen),
  Kopfzeile/untere Leiste/Speichern-Leiste ohne `backdrop-blur`. Speichern-Leiste beim Druckteil sitzt über Leiste + Home-Balken.
- **Schriftraster** in `index.css` (`@theme`): `text-titel` (Seitentitel), `text-abschnitt` (Abschnitt/Kartentitel), `text-base`
  (Text), `text-hinweis` (Hinweise, Metadaten). 15 Einzelgrößen → 4; ab `sm` bleiben die bisherigen Desktop-Größen. Ausnahmen:
  Zahlen-Kacheln, Zähler, Beschriftung der unteren Leiste.
- **Aufgeräumt (nur unter sm):** Oberzeile („VERWALTUNG“ …) ausgeblendet; `SectionCard` mit Symbol neben dem Titel und Erklärung
  über die volle Breite; Hinweise/Alerts in Hinweisgröße; Anfrage-Details einspaltig (Bezeichnung über Wert); kurze Beschriftungen
  über neues `KurzLang` (Personen: „Team“, „Rechte“, „Passwort“); kürzere Suchtexte (Katalog, Druckteile); Zählerzeile bei
  Druckteilen ausgeblendet; engere Ränder in Stammdaten, Konto, Lehrkräften, Farbrollen.
- **Fehler aus Runde 1 behoben:** `ItemImage` hatte `sm:p-5shadow-sm` (Schatten und Desktop-Innenabstand fehlten).
- **Dateien:** `client/src/index.css`, `components/{Layout,ui,ItemImage}.tsx` und Seiten unter `client/src/features/` (Schriftgrößen mechanisch).
- **Geprüft:** typecheck ✔ · lint ✔ · test ✔ · 375 px: 14 Hauptseiten ohne waagrechtes Überlaufen und ohne Tippziel < 40 px,
  Schriftgrößen nur aus dem Raster, Menü, Anfrage-Details, Druckteil-Formular · Desktop 1440 px wie vorher.
  Das Zucken selbst nur am echten iPhone prüfbar.
- **Aufgeräumt:** Testserver gestoppt.

## 2026-11-06 – Handy-Ansicht: App-Icon, Safe-Area, kompaktere Seiten (Session: handy, Branch: feature/handy-ansicht)
- **Gebaut:**
  - App-Icon für den Home-Bildschirm: `apple-touch-icon.png` (180 px, weißer Grund, keine Transparenz), `manifest.webmanifest`
    (Name „Mosaik³LAB“, standalone, Theme `#af2401`, Icons 192/512 + eigenes `maskable`-Icon mit Schutzzone).
    Erzeugt aus den Mosaiksteinen von `favicon.svg`. Links in `index.html` werden beim Bau relativ (passt zu `<base href>`).
  - `viewport-fit=cover` → `env(safe-area-inset-*)` greift jetzt: Icon-Leiste unten über dem Home-Balken (auch im
    Home-Bildschirm-Modus), Notch im Querformat links/rechts (Leiste, Kopfzeile, `body`); Inhalt und Toasts rechnen die Safe-Area mit ein.
  - Icon-Leiste auf dem Handy etwas größer: Icons 22,5 px, Tippflächen 75 × 60 px.
  - Kompakter nur unter `sm` (Desktop unverändert): Seitentitel, Übersicht (Kennzahlen als Zeilen), Katalog-/Detailbild flacher,
    Detail-Fakten zweispaltig, Export-Erklärung bei „Druckteile verwalten“ erst ab Tablet.
  - Tab-Titel (Zusatzauftrag): Alle Seiten setzen ihn schon über den gemeinsamen Hook `useDocumentTitle`
    (`client/src/lib/useApi.ts`, keine zentrale Liste), Muster „Seite · Mosaik³LAB“. Verbessert: „Katalog“ statt des langen
    Titels, Bearbeiten-Seite „„<Druckteil>“ bearbeiten“ (beim Laden „Druckteil bearbeiten“ statt „Bearbeiten: “),
    Starttitel in `index.html` kurz „Mosaik³LAB“ (Beschreibung als `meta description`). 17 Routen im Browser geprüft.
- **Dateien:** `client/index.html`, `client/public/{apple-touch-icon,icon-192,icon-512,icon-maskable-512}.png`,
  `client/public/manifest.webmanifest`, `client/src/index.css`, `client/src/components/{Layout,Toast,ui,ItemImage}.tsx`,
  `client/src/features/katalog/{CatalogPage,ItemDetailPage}.tsx`, `client/src/features/verwaltung/{DashboardPage,ItemsAdminPage}.tsx`
- **Geprüft:** typecheck ✔ · lint ✔ · test ✔ · im Browser 375 × 812 alle 14 Hauptseiten ohne waagrechtes Überlaufen und ohne
  Tippziel < 40 px, Anfrage-Dialog, Desktop 1440 px unverändert. Safe-Area selbst nur am echten iPhone prüfbar.
- **Aufgeräumt:** Testserver (5181/3011) gestoppt; Probe-Build nur im Scratchpad.

## 2026-11-06 – README.txt in jedem Installer-Paket (Hauptchat)
- **Gebaut:** `scripts/paket.mjs` legt oben ins Paket eine `README.txt` für genau dieses Ziel (Windows mit CRLF), Vorlagen
  `scripts/paket-readme/README-win-x64.txt`, `-linux-x64.txt`, `-linux-arm64.txt` (`{{version}}`, `{{commit}}` werden eingesetzt).
- **Dateien:** `scripts/paket.mjs`, `scripts/paket-readme/*`, `docs/INSTALLATION.md`
- **Geprüft:** Windows-Paket gebaut, README.txt oben im ZIP; Linux-Pakete kommen beim nächsten CI-Lauf.

## 2026-11-02 – Installer-Paket gebündelt „wie ein normales Programm“ (Session: buendeln, Branch: feature/paket-buendeln)
- **Anlass:** Paket mit ~18.500 Dateien in `node_modules`; beim Update blockierte ein Virenscanner das Umbenennen des frischen Ordners (EPERM).
- **Gebaut:**
  - `server/scripts/bundle.ts` (`npm run bundle -w server`, esbuild als devDependency): `server/dist/server.mjs` + `create-admin`,
    `db-backup`, `mail-test` (ESM, gemeinsamer Code in `chunk-*.mjs`) und `bcryptjs.cjs` für den Manager. Node-Bordmittel extern.
  - Pfade über `ROOT_DIR`: `MIGRATIONS_DIR` (db.ts) und `appVersion()` (Export; las bisher die nicht vorhandene `server/src/package.json` → „0“).
  - `manager/lib/appstart.mjs`: tsx, wenn `node_modules/tsx` da ist (Arbeitskopie, Git-Update, alte Pakete), sonst das Bündel.
    Genutzt von Web-App-Runner, Admin anlegen, DB-Sicherung, Testmail, Notzugang (bcrypt), Status, Setup-Schritt „deps“.
  - `scripts/paket.mjs`: baut in einem eigenen Ordner, ins Paket nur eine Positivliste (`server/dist`, Migrationen, `client/dist`,
    `manager/` ohne Tests, package-Dateien, `docs/INSTALLATION.md`, Node); `.claude`, `CLAUDE.md`, Tests, Quellen, TS/ESLint/Vite-Konfiguration
    oder `node_modules` im Paket brechen den Bau ab.
  - Setup kopiert direkt nach `releases/<version>` (kein `.unfertig` + Umbenennen mehr); `current` erst danach.
  - CI: kaputtes Testpaket hängt an `server/dist/server.mjs` an; zweite Runde altes Paketformat (Commit 38823bb, mit node_modules)
    über behaltene Daten → kaputtes gebündeltes Update fällt aufs alte Format zurück → Update alt → gebündelt → deinstallieren.
- **Gemessen (Windows-ZIP):** vorher 95,4 MB / 18.538 Dateien (18.205 in node_modules), entpackt ≈ 300 MB · nachher 40,4 MB / 126 Dateien, entpackt ≈ 100 MB (96 MB node.exe).
- **Geprüft:** `npm run check` ✔ · `appstart.test.mjs` ✔ (einzeln) · gebündelter Server ohne node_modules lokal auf Testport 3097 mit Testdaten
  (Migrationen, Seed, Health, Oberfläche, Skripte) · Installer-Test Windows + Linux x64 + arm64 grün (Lauf 41504536499), Endstand mit Dateiprüfung Linux x64 + arm64 grün (Lauf 41506936918; Linux-Paket 44 MB, 126 Dateien).
- **Aufgeräumt:** `_testdaten\buendeln` (Testpakete, Testdaten), Remote-Branch `installer-test/buendeln`.
- **Offen:** Git-Update (Entwickler-Installationen) baut weiter mit `npm ci` und tsx – bewusst unverändert.

## 2026-11-02 – Update aus Git repariert, Sperre zeitlich begrenzt (Hauptchat)
- **Fehler (echt, auf diesem PC):** Update 17e77d9 → 0ab2c58 über `cli update install`: Die Web-App startete nicht
  („Cannot find package '@mosaik3lab/shared'“). `npm ci` legt die Workspace-Junctions in `releases/<id>.unfertig` mit
  absolutem Pfad an; nach dem Umbenennen in `releases/<id>` zeigten sie ins Leere. Der automatische Rückfall auf
  17e77d9 hat gegriffen (Daten unverändert, App nach ~2 min wieder erreichbar).
- **Behoben:** `linkWorkspaces()` (setup.mjs, jetzt exportiert) ersetzt Verweise, die woandershin zeigen; `update.mjs`
  ruft es nach dem Umbenennen auf. `removeTree()` löscht auch Junctions ins Leere (Windows: `lstat` meldet ENOENT,
  der Eintrag steht aber im Ordner). Test `manager/test/workspaces.test.mjs`.
- **Sperre:** Nach 10 falschen Passwörtern ist ein Konto nur noch **eine Stunde** gesperrt (`benutzer.gesperrt_seit`,
  Migration 014, `istGesperrt()` in shared/konten.ts); vorher konnte jeder mit der Adresse ein Konto dauerhaft aussperren.
- **Geprüft:** `npm run check` ✔ · workspaces.test.mjs ✔ (einzeln, steuert keine Dienste).
- **Offen:** Jede Admin-Aktion beim Update öffnet ein eigenes Administrator-Fenster (6× beim Update) – sammeln.

## 2026-11-02 – Handy-Ansicht kompakter, nichts abgeschnitten (Session: handy, Branch: feature/handy-kompakt)
- **Auftrag:** „Handy-Auflösung besser machen! Alles noch etwas bisschen kleiner, dass man mehr sieht! Keine Sachen abgeschnitten etc.“ – nur Oberfläche.
- **Gebaut (zentral):**
  - Grundschrift überall 15 px (`index.css`; bisher 16 px unter 768 px). Eingabefelder auf Touch-Geräten bleiben 16 px (kein iOS-Zoom).
  - `ui.tsx`: Knöpfe md/lg auf dem Handy niedriger (≈ 41/45 px statt 48/56), Eingabefelder ≈ 41 px, Seitenkopf (h1 24 px statt 30 px, weniger Abstand),
    Panel/Card/Alert/EmptyState/Stack mit weniger Innenabstand und kleineren Ecken/Icons unter 640 px. Ab `sm` alles wie bisher.
  - `Dialog.tsx`: auf dem Handy schmalerer Rand (8 px), Kopf/Inhalt 16 px Innenabstand, Titel umbricht, Inhalt scrollt innen (`min-h-0`).
  - `Layout.tsx`: Kopfzeile flacher, Seitenrand 12 px, Menü-Einträge enger; untere Leiste 52 px statt 64 px. **Fehler behoben:** bei 360 px ragte
    „Konto“ für Admin/Team aus dem Bild (6 Einträge). Wer Team-Vorschläge sieht, hat „Meine Vorschläge“ jetzt nur im Menü.
  - Kleinste Schrift `0.8rem` → `0.85rem` (≈ 13 px), damit Nebentext nicht unter ~13 px fällt (auch am PC minimal größer).
- **Gezielt je Seite:** Katalog (Filterkasten, Karten mit Bild 2:1 statt 4:3 auf dem Handy), Druckteil-Detail, Anfrage-Dialog und Farbvarianten,
  Meine Anfragen/OrderCard, Druckteile verwalten (Bild 56 px, Text nutzt volle Breite), Anfragen-Verwaltung, Übersicht, Personen, Anmeldung, Passwort festlegen,
  Abschnitte im Druckteil-Editor. **Fehler behoben:** Farbwahl im Druckteil-Editor war bei 360 px breiter als der Bildschirm (`fieldset` ohne `min-w-0`);
  abgeschnittene Namen/Zusammenfassungen (`truncate`) brechen jetzt um (Farbwahl, „Druckteilen zuordnen“, Bambu-Import, Abschnitts-Zusammenfassung,
  Druckdateien, Videos, E-Mail im Menü). Feste Fußleiste in „Druckteilen zuordnen“/Bambu-Import saß nicht ganz unten (Inhalt schien darunter durch)
  und hing am alten Dialog-Rand – jetzt bündig, Knöpfe auf dem Handy nebeneinander.
- **Dateien:** `client/src/index.css`, `components/{ui,Dialog,Layout,Logo}.tsx`, `features/katalog/*`, `features/konto/{LoginPage,PasswortPage}.tsx`,
  `features/verwaltung/{DashboardPage,ItemsAdminPage,OrdersAdminPage,PersonenPage,PersonDialogs}.tsx`, `features/verwaltung/druckteil-bearbeiten/*`,
  `features/einstellungen/stammdaten/{BambuImportDialog,FarbeZuordnenDialog,KeyPickers,ListPanel,MasterDataPage}.tsx`. Keine Server-Änderung.
- **Geprüft:** `npm run check` ✔ (typecheck, lint, test, health). Headless-Chrome-Lauf über 31 Seiten/Dialoge × 360×740, 390×844, 768×1024, 1280×800
  als Lehrkraft, Druck-Team, Admin: `scrollWidth ≤ innerWidth` überall, keine über den Rand ragenden Elemente, Dialoge passen in die Höhe,
  keine Konsolenfehler. Screenshots `C:\Entwicklung\_screenshots\handy\vorher-*` / `nachher-*` (+ `*-bericht.json` mit Messwerten).
  Server-Manager nicht geprüft (nur lokal, Port 5190 tabu).
- **Aufgeräumt:** Dev-Server 5184/3014 gestoppt, `C:\Entwicklung\_testdaten\handy` gelöscht, Prüfskripte im Scratchpad gelöscht.

## 2026-11-02 – Sicherheitsprüfung (Session: sicherheit, Branch: feature/sicherheit)
- **Pakete:** `nodemailer` 6.10.1 → 10.3.1 (22 Advisories, u. a. SMTP-/Header-Injection, addressparser-DoS; bringt eigene Typen,
  `@types/nodemailer` entfernt, Aufruf unverändert, echter SMTP-Versand gegen das Testpostfach geprüft). `zod` 3.25 → 4.6.7 in `shared`
  und `server` (GHSA-mrhx-c7xc-m3w5): Umstieg war klein – nur die deutsche Fehlerkarte (`shared/src/basis.ts`, jetzt `z.config({ customError })`)
  und `ZodIssueCode` in `katalog.ts`. Fehlertexte gleich geblieben (gezielt geprüft: Pflichtfeld, Mindestens/Höchstens, Format, Auswahl).
  `npm audit --omit=dev`: 0 Funde. Übrig: 12 mittlere nur in Entwicklungswerkzeugen (eslint/minimatch), nicht im Betrieb.
- **Code geprüft:** Passwort-Links (256-Bit-Token, nur SHA-256 gespeichert, Token im `#`, neue Sitzung mit `regenerate`, andere Sitzungen enden),
  Anmeldung (bcrypt 12, Dummy-Hash, Rate-Limit), Einspielen (nur `daten:import`, Größenlimit, IDs als Dateinamen, SHA-256 + Magic Bytes,
  Transaktion, erneute Prüfung über `itemInputSchema`), Downloads/Uploads (nur Dateien aus Tabelle `datei`, Pfad-Prüfung, feste MIME-Typen,
  Druckdateien als Download mit Sandbox-CSP), Sitzungs-Cookie (HttpOnly, SameSite=Strict, Secure bei HTTPS), CSRF (eigener Header),
  helmet (CSP, nosniff, frame-ancestors), Fehler ohne Stacktrace, SQL parametrisiert, HTML-Escaping in Mails, Portal (fremde
  `X-Forwarded-*`/Manager-Kopf werden verworfen), Server-Manager (nur 127.0.0.1/::1, Host-Prüfung gegen DNS-Rebinding, Token + Origin bei POST).
- **Behoben (mit Test):** Passwort-Link konnte bei zwei gleichzeitigen Anfragen zweimal eingelöst werden (niedrig) · „Passwort vergessen“ verriet
  über die Antwortzeit (SMTP), ob es ein Konto gibt – Versand läuft jetzt im Hintergrund (niedrig) · Video-Links aus Exportdateien wurden nicht auf
  http(s) geprüft (`javascript:`-Link im Katalog möglich; React 19 und CSP blocken das zusätzlich, niedrig).
- **Offen / bewusst so (Bericht an den Hauptchat):** Sperre nach 10 Fehlversuchen ist von jedem im Schulnetz, der die Adresse eines Kontos kennt,
  auslösbar (mittel, Verfügbarkeit; Designentscheidung, nicht geändert – Vorschlag: Sperre zeitlich begrenzen). Lehrkräfte melden sich nur mit der E-Mail an
  (Design). Kleinere Punkte siehe Bericht.
- **Dateien:** `package.json`s, `package-lock.json`, `shared/src/{basis,katalog}.ts`, `server/src/module/konten/{konten.routes,passwortlink}.ts`,
  `server/src/module/datenaustausch/datenaustausch.paket.ts`, Tests `server/test/{konten,datenaustausch}.test.ts`.
- **Geprüft:** `npm run check` ✔ (typecheck, lint, test), `npm run build -w client` ✔, `npm audit --omit=dev` ✔.
- **Aufgeräumt:** Testmails in `C:\Entwicklung\_testdaten\sicherheit` gelöscht. Kein Dev-Server gestartet. Das Testpostfach
  (`npm run testpostfach`, 127.0.0.1:2525/2580, PID 20760) konnte die Session nicht beenden (Rechte) – bitte beenden.

## 2026-11-02 – „Alle Farben“ je Farbbereich, einfache Farbwahl, Farbe vielen Druckteilen zuordnen (Session: bambu, Branch: feature/bambu-filamente)
- **Auftrag:** Zusatzwünsche über den Hauptchat (dynamisches „Alle Farben“, einfache Farbwahl, Farbrollen auf einen Blick, Massenzuordnung).
- **Gebaut:**
  - Farbbereich mit `alleFarben` (shared `colorAreaSchema`, Migration `013_farbbereich_alle_farben.sql`): Bereiche, die heute alle vorhandenen
    Farbrollen enthalten, werden umgestellt (ihre Einzelverweise entfallen). Beim Lesen füllt das Repository alle Farbrollen ein, darum verstehen
    Anfrage-Dialog, Prüfung der Anfrage, Mail und Verwaltung das ohne Änderung; nur vorrätige werden angeboten. Export schreibt `alleFarben` ohne Farbliste,
    Import übernimmt es. Neue Druckteile starten mit „Alle Farben“. Auf Material/Linie eingeschränktes „Alle“ bewusst weggelassen (später möglich).
  - Druckteil bearbeiten: je Bereich oben „Alle Farben“ / „Nur bestimmte Farben“ (große Auswahlkarten), bei „Alle“ eine Vorschau der gerade
    angebotenen Farben, bei „bestimmte“ die bisherige Auswahl mit „nicht vorrätig“-Kennzeichen, Suche auch nach Nummer, „Alle dieser Linie wählen“.
  - Farbrollen: je Rolle „Bei N Druckteilen ausgewählt, dazu M mit ‚Alle Farben‘“ und „Druckteilen zuordnen …“. Dialog `FarbeZuordnenDialog.tsx`
    (öffnet sich nach neuer/übernommener Farbe von selbst): Schnellwahl gleiche Linie, alle wählen, Suche, Bereichswahl bei mehrfarbigen Teilen.
    Endpunkt `POST /api/items/farbe-zuordnen` (Recht `catalog:manage`, eine Transaktion, `module/katalog/farbeZuordnen.ts`). Rechte-Definitionen unverändert.
- **Dateien:** `shared/src/katalog.ts`, Migration 013, `server/src/module/katalog/{katalog.repository,katalog.service,katalog.routes,farbeZuordnen}.ts`,
  `server/src/module/datenaustausch/{datenaustausch.export,datenaustausch.paket,datenaustausch.service}.ts`, `server/src/domain/types.ts`;
  Client `druckteil-bearbeiten/{FilamentPicker,ColorsSection,itemForm}`, `stammdaten/{FilamentsPanel,FarbeZuordnenDialog}.tsx`;
  Tests `server/test/farben.test.ts` (neu: Migration, „Alle“ nimmt neue Farbe mit, leere wird nicht angeboten, Massenzuordnung/Transaktion/„Alle“ unberührt),
  `migration.test.ts`; Doku `ANLEITUNG-FARBROLLEN.md`, `DATENMODELL.md`, `ARCHITEKTUR.md`.
- **Geprüft:** `npm run check` ✔. Browser (5182/3012): Bereich auf „Alle Farben“ umgestellt und gespeichert, Farbe importiert → Dialog öffnet sich,
  „Alle mit PLA-Basic-Farben (4)“ → „bei 4 Druckteilen ergänzt“, neue Farbe erscheint im „Alle“-Bereich, Handy-Ansicht.
  Screenshots `C:Entwicklung_screenshotsambuorher-*` / `nachher-*`.
- **Aufgeräumt:** Dev-Server gestoppt, Eintrag „bambu“ aus `C:Entwicklung.claudelaunch.json` entfernt, `_testdatenambu` gelöscht.

## 2026-11-02 – Bambu-Lab-Farbrollen mit Nummer und Originalname, Abgleich bei Updates (Session: bambu, Branch: feature/bambu-filamente)
- **Quelle der Daten:** offizielle Farbliste von Bambu Studio (Bambu Lab), GitHub `bambulab/BambuStudio`,
  `resources/profiles/BBL/filament/filaments_color_codes.json`, Stand 2026-09-22 (Commit 804d93bb). Daraus je Farbe Bambu-Nummer
  (`fila_color_code`, z. B. 10101), englischer Originalname, **deutscher Name von Bambu Lab** (`fila_color_name.de`), Linie und Hex.
  Nichts erfunden: Alle 128 Farben haben eine Nummer aus der Quelle. Zwei Anpassungen: Bei Verläufen gilt die erste Farbe als Hex
  (Kennzeichen „Verlauf“), und „PETG Translucent Clear“ (in der Quelle ganz durchsichtig) wird als #FFFFFF angezeigt.
- **Linien:** PLA Basic, PLA Matte, PLA Silk+, PETG HF, PETG Translucent, ABS, TPU 95A HF, TPU for AMS (`LINIEN` in
  `scripts/bambu-katalog.mjs`, erweiterbar). Alle 56 bisherigen Palettenfarben wurden zugeordnet (IDs bleiben), keine ist weggefallen.
- **Gebaut:**
  - Katalog als Datendatei `server/src/domain/bambuKatalog.json` (+ `bambuKatalog.ts`), erzeugt mit `node scripts/bambu-katalog.mjs`
    (feste Katalog-IDs, Zuordnung über Nummer bzw. Linie + Name, fehlende Farben bleiben als `weggefallen`). Ersetzt `bambuPalette.ts`.
  - Migration `012_filament_katalog.sql`: `katalog_id`, `hersteller_nummer`, `hersteller_name`, `weggefallen`; vorhandene `bambu-…`-Rollen
    gehören zum Katalog. Druckteil-Verweise unverändert.
  - Abgleich bei jedem Start (`module/stammdaten/bambuAbgleich.ts`): übernimmt Name, Nummer und Farbe, markiert weggefallene Farben (nie löschen),
    legt neue nicht an, sondern merkt sie als „neu“ für den Import vor. „Vorrätig“, Reihenfolge und eigene Rollen bleiben. Hinweis für den Admin
    in `einstellung.bambuAbgleichHinweis` (ausblendbar).
  - **Entscheidung:** Katalog-Rollen sind schreibgeschützt (Server erzwingt das in `saveList`). Der Admin schaltet nur „vorrätig“, ändert die
    Reihenfolge oder entfernt sie. Eigene Rollen bleiben frei editierbar, neu mit optionaler eigener Nummer, Abzeichen „eigene“.
  - Folge bei bestehenden Installationen: Anzeigenamen werden zu den deutschen Namen von Bambu Lab (z. B. „Weiß“ → „Jade-Weiß“,
    „Bambu-Grün“ → „Bambusgrün“), dazu einige Hex-Werte (z. B. PETG HF Grau). Der Hinweis listet das auf. Alte Anfragen behalten ihren Farbnamen.
  - Oberfläche: Farbrollen-Liste (Nummer, Originalname, Herkunft, „nicht mehr bei Bambu Lab“), Import mit Suche (Name/Nummer), Linien-Filter,
    „Alle angezeigten Farben wählen“ und „neu“-Kennzeichen, Hinweis nach Update. Bambu-Nummer zusätzlich in der Team-Mail
    („Cyan (Bambu Lab PLA Basic, Nr. 10603)“), in der Anfragen-Verwaltung, unter Verwaltung → Farbrollen und in der Farbwahl am Druckteil.
    Lehrkräfte sehen weiter nur den Farbnamen.
  - Druckteile einspielen: Farbrollen werden über die Katalog-ID bzw. die Bambu-Nummer erkannt.
- **Dateien:** `shared/src/stammdaten.ts`; `server/src/domain/{bambuKatalog.ts,bambuKatalog.json,settings.ts}` (− `bambuPalette.ts`);
  `server/src/module/stammdaten/{bambuAbgleich.ts,stammdaten.service.ts,stammdaten.routes.ts,stammdaten.repository.ts}`; `server/src/app.ts`;
  `server/src/module/anfragen/anfragen.mail.ts`; `server/src/module/datenaustausch/{datenaustausch.paket.ts,datenaustausch.service.ts}`;
  Migration 012; `scripts/bambu-katalog.mjs`; Client `stammdaten/{FilamentsPanel,BambuImportDialog,BambuHinweis}.tsx`,
  `verwaltung/{FilamentsPage,OrdersAdminPage}.tsx`, `druckteil-bearbeiten/FilamentPicker.tsx`, `lib/types.ts`; Tests `server/test/bambu.test.ts` (neu),
  `datenaustausch`, `stammdaten`, `katalog`, `produktdaten`; Doku `docs/ANLEITUNG-FARBROLLEN.md` (neu), `DATENMODELL.md`, `ARCHITEKTUR.md`,
  `ANLEITUNG-DRUCKTEILE-UND-SICHERUNG.md`.
- **Geprüft:** `npm run check` ✔ (typecheck, lint, test). Im Browser (eigener Dev-Server 5182/3012, Daten `_testdaten\bambu`): Neuinstallation,
  simuliertes Update (Hinweis mit Änderungen, weggefallener und 16 neuen Farben), Import mit Filter/Suche, eigene Rolle mit Nummer, Anfragen-Ansicht,
  Handy-Ansicht. Screenshots: `C:\Entwicklung\_screenshots\bambu\`.
- **Aufgeräumt:** Dev-Server gestoppt, Test-Eintrag „bambu“ aus `C:\Entwicklung\.claude\launch.json` wieder entfernt, `_testdaten\bambu` und
  Scratchpad gelöscht. Rechte, Konten und Dienste nicht angefasst.
- **Später möglich:** weitere Linien (PETG Basic, PLA Translucent …) über `LINIEN`, Admin-eigene Anzeigenamen für Katalogfarben.

## 2026-11-02 – Rechte einfach: 3 Rollen, Häkchen, Passwort per Link (Session: rechte-einfach, Branch: feature/rechte-einfach)
- **Prüfung (Phase 1):** Neuer Test `server/test/rechte.test.ts` ruft jeden geschützten Endpunkt je Rolle bzw. Häkchen auf
  (ohne Anmeldung 401, ohne Recht 403, mit Recht fachliche Antwort) und vergleicht mit `/api/auth/me`, wonach der Client
  ein- und ausblendet. Gefunden und behoben: „Vorschläge umwandeln“ blieb ohne „Vorschläge sehen“ wirksam (Abhängigkeit nur
  eine Stufe tief geprüft). Unstimmigkeit „Ablauf der Anfragen“: Server erlaubte es mit Stammdaten-Recht, der Client nur dem Admin
  → gehört jetzt zu den Einstellungen (Admin).
- **Gebaut (Phase 2, Wünsche des Nutzers):**
  - Drei Rollen (Lehrkraft / 3D-Druck-Team / Administrator) mit Häkchen statt 17 Einzelrechten: Lehrkraft „anfragen“,
    „vorschlagen“ (je Person abschaltbar, ohne „anfragen“ auch keine Anfragen ohne Anmeldung); Druck-Team „Anfragen bearbeiten“,
    „Druckteile pflegen“, „Vorschläge bearbeiten“, „Farbrollen leer/vorrätig“, „Stammdaten pflegen“. Interne Prüfpunkte der
    Routen unverändert.
  - Seite **Personen** ersetzt „Benutzer & Rollen“ (Lehrkräfte und Konten in einer Liste, Suche, Filter, ein Knopf „Rechte ändern“).
    „Lehrkräfte“ bleibt fürs Druck-Team, ist beim Admin ausgeblendet.
  - Mehr als Lehrkraft-Rechte → automatisch Mail „Passwort festlegen“ (Link läuft nicht ab, Einmal-Link, nur Hash gespeichert);
    ohne Mailversand zeigt die App den Link zum Kopieren. Bis dahin Anmeldung weiter als Lehrkraft.
  - „Passwort zurücksetzen“ (Admin, Link läuft nicht ab), „Passwort vergessen?“ (selbst, 24 h, verrät keine Adressen),
    Seite `/passwort`. Nach 10 falschen Passwörtern gesperrt + Mail; neues Passwort hebt die Sperre auf (ersetzt die alte
    10-Minuten-Bremse im Speicher). Passwörter frei, mindestens 8 Zeichen (auch Server-Manager beim ersten Admin).
  - Konten behalten ihre Lehrkraft-Funktionen (Meine Anfragen/Vorschläge).
  - Migration `011_rechte_einfach.sql` (additiv): Lehrkraft-Häkchen (Standard an), `benutzer_bereich` aus alten Einzelrechten
    (Bereich an, wenn das Kernrecht nicht abgeschaltet war → niemand verliert etwas), `fehlversuche`, `passwort_link`;
    ruhende Konten werden Lehrkräfte ohne „vorschlagen“. Echter Bestand: nur Demo-Konten, keine Einzelrechte → keine Änderung.
- **Dateien:** `shared/src/konten.ts`, `shared/src/anfragen.ts`, `server/src/domain/permissions.ts`, `server/src/kern/auth/middleware.ts`,
  `server/src/module/konten/*` (neu: `personen.service.ts`, `passwortlink.ts`), `anfragen.routes/service`, `vorschlaege.routes`,
  `stammdaten.routes`, `einstellungen.routes`, `seed.ts`, `importJson.ts`, Migration 011; Client `PersonenPage.tsx`, `PersonDialogs.tsx`,
  `konto/PasswortPage.tsx`, `LoginPage.tsx`, `AuthContext.tsx`, `Layout.tsx`, `App.tsx`, `SettingsPage.tsx`, `AccountPage.tsx`
  (entfernt: `UsersAdminPage`, `UserDialogs`, `PermissionEditor`); `manager/lib/admin.mjs` + Test + `public/index.html` (8 Zeichen);
  Tests `rechte`, `konten` (neu geschrieben), `anfragen`, `vorschlaege`, `datenaustausch`, `uebernahme`; Doku README, ARCHITEKTUR,
  DATENMODELL, INSTALLATION, CLAUDE.md.
- **Geprüft:** typecheck ✔ · test ✔ (Server + Client) · im Browser ✔ (Testserver 5183/3013: Passwort vergessen, Personen, Rechte ändern
  → Link ohne Mailversand → Passwort festlegen → als Druck-Team angemeldet mit „Meine Anfragen“; Personen am Handy).
  Manager-Tests nicht ausgeführt (Vorgabe), nur `checkAdminInput` direkt geprüft.
- **Aufgeräumt:** Testserver gestoppt, `C:\Entwicklung\_testdaten\rechte` gelöscht, Skripte im Scratchpad entfernt.

## 2026-11-02 – Sicherung, Export und Import aufgeräumt (Session: export-import-einfach, Branch: feature/export-import-einfach)
- **Bestandsaufnahme (vorher):**
  - App, Verwaltung → Stammdaten → „Export & Import“ (`ExportImportPanel`): Voll-Export „mit/ohne Dateien“, Import mit
    „zusammenführen“ oder „ersetzen“ (alle Druckteile und Stammdaten löschen, doppelte Bestätigung), dazu eine **zweite** Karte
    „Ausgewählte Druckteile exportieren“ (`ArtikelExportCard`) mit eigener Liste – und in „Druckteile verwalten“ ein **drittes**
    Export-Symbol je Druckteil. Import nur über die Stammdaten-Seite. Nur Administration.
  - Server `module/datenaustausch/`: ein Format, aber zwei Paketarten (voll/Teilpaket) mit unterschiedlichen Regeln (Teilpaket nur
    ergänzen, Ersetzen gesperrt; Vollpaket ändert vorhandene Stammdaten und Anfragestatus). Gleichnamige Druckteile anderer Installationen
    wurden doppelt angelegt.
  - Server-Manager: Karte „Backup“ (Jetzt sichern, Wiederherstellen mit Auswahlliste), Backup-Ziel + Uhrzeit unter „Einstellungen“,
    Aufbewahrung und „Komplett“-Zeitplan (Wochentag, eigene Anzahl) unter „Erweitert“, dort eine **zweite** Sicherungsliste mit
    „Fehlende Dateien holen“ und „Komplett sichern“, Passwort-Knöpfe an zwei Stellen. Zwei Arten: täglich „Daten & Einstellungen“
    **ohne Bilder** (Falle beim Umzug), optional „Komplett“. Umzug = „Aus Backup einrichten“ tief in „Erweitert → Einrichten“.
  - Dazu: Datenbank-Sicherung vor jedem Import (`<daten>/sicherungen`), `npm run backup`/`db:backup` (Entwicklung bzw. intern),
    `transfer.mjs` (Datenordner wechseln – kein Backup-Weg, bleibt). BambuImport ist ein Filament-Import, gehört nicht dazu (unverändert).
- **Gebaut – Druckteile (App):** genau ein Weg in „Druckteile verwalten“: Häkchen je Druckteil + „Alle auswählen“ → „Exportieren“
  (eine Datei mit Bildern, Videos, Druckdateien, nur gebrauchte Stammdaten); „Einspielen …“ → Datei → Vorschau („5 Druckteile, davon gibt es
  2 hier schon“) → nur bei vorhandenen die Wahl **überspringen** (Standard) / **ersetzen** → Ergebnis in Klartext. Vorhanden = gleiche ID oder
  eindeutig gleicher Name. Kategorien, Einsatzbereiche, Materialien, Farben werden zugeordnet oder angelegt, nie geändert; fehlende Farben
  als Hinweis. Alles oder nichts (Transaktion), vorher DB-Sicherung, deutsche Fehlermeldungen (auch „Download abgebrochen“, „neuere Version“).
  Ältere Exporte (voll, mit Anfragestatus, auch ohne Dateien) bleiben lesbar. Rechte `daten:export`/`daten:import` jetzt auch für das
  Druck-Team (je Konto abschaltbar, brauchen „Katalog sehen“ bzw. „bearbeiten“). Entfernt: `ExportImportPanel`, `ArtikelExportCard`,
  Export-Symbol je Druckteil, Endpunkte `/export/info` und `/export/artikel`, „Export ohne Dateien“, „ganzen Katalog ersetzen“,
  Import der Anfragestatus. Auf der Stammdaten-Seite steht nur noch ein Hinweis.
- **Gebaut – Sicherung (Manager):** eine Karte „Sicherung“: Jetzt sichern · „Jeden Tag automatisch sichern“ (neu: an/aus, `backup.enabled`)
  mit Uhrzeit, Anzahl, Speicherort · Liste mit „Wiederherstellen“ je Zeile (deutliche Rückfrage) · Passwortschutz · „Auf einen anderen Rechner
  umziehen“ (3 Schritte → „Aus Sicherung einrichten“). **Eine Art:** neue Sicherungen sind immer vollständig (Datenbank + Ablage), auch
  „vor Update“ und „vor Wiederherstellung“; alte „daten“-Sicherungen, Ordner-Sicherungen und verschlüsselte bleiben wiederherstellbar.
  Aufbewahrung gemeinsam (`backup.keep`); **Fehler behoben:** das Aufräumen nach der Sicherung „vor Wiederherstellung“ konnte die gerade
  wiederhergestellte Sicherung löschen (jetzt geschützt). Entfernt aus der Oberfläche: Backup-Felder unter „Einstellungen“/„Erweitert“,
  „Komplett“-Zeitplan, zweite Liste, „Komplett sichern“, „Fehlende Dateien holen“ (Web-Route weg, `cli backup fill-files` bleibt für alte
  Sicherungen). Ohne automatische Sicherung keine Warnung „Backup-Dienst läuft nicht“.
- **Schnittstellen für `setup.mjs`/`update.mjs`/`runtime.mjs` (nicht geändert):** `openBackup`, `applyBackup`, `restoreBackup(id, confirm, opts)`,
  `createBackup(reason[, { kind }])` unverändert aufrufbar; `createBackup` ohne Art ergibt jetzt „komplett“ (Sicherung vor Update dauert dadurch
  so lange wie eine vollständige). `backup.full` bleibt in `config.mjs` gültig, wird aber nicht mehr benutzt. Keine DB-Migration.
- **Dateien:** `shared/src/konten.ts`, `server/src/module/datenaustausch/*`, `server/test/{datenaustausch,konten}.test.ts`,
  `client/src/features/verwaltung/{ItemsAdminPage,DruckteileAustausch}.tsx`, `client/src/features/einstellungen/stammdaten/MasterDataPage.tsx`
  (`ExportImportPanel.tsx`, `ArtikelExportCard.tsx` gelöscht), `manager/lib/{backup,config,status,reconcile}.mjs`, `manager/runners/backup.mjs`,
  `manager/{server,cli}.mjs`, `manager/public/{index.html,app.js,app.css}`, `manager/test/{manager,settings-backup}.test.mjs`,
  Doku `docs/ANLEITUNG-DRUCKTEILE-UND-SICHERUNG.md` (neu, für Laien), `README.md`, `docs/{ARCHITEKTUR,INSTALLATION}.md`, `manager/README.md`.
- **Geprüft:** `npm run check` ✔ (typecheck, lint, test) · `datenaustausch.test.ts` 10 Tests (einer/mehrere/alle, mit Bildern/Video/Druckdatei,
  überspringen/ersetzen, Name-Zuordnung, Bezüge anlegen, kaputte/abgeschnittene/fremde Datei, Rückabwicklung, altes Format) · Manager einzeln
  `manager.test.mjs`, `settings-backup.test.mjs`, `auto.test.mjs`, `status-extern.test.mjs` ✔ (kein `manager:test`, kein selftest), danach
  `Get-Service mosaik3lab-*` alle „Running“ · Browser: App auf 5184/3014 mit Testdaten (Team-Konto: anhaken → exportieren → löschen → einspielen
  mit Vorschau/ersetzen, Fehlerdatei, Handy-Ansicht), Manager-Oberfläche nur mit einer **Attrappe** auf 5185 (feste Beispieldaten), weil ein
  echter Test-Manager die echten Windows-Dienste `mosaik3lab-*` abfragt und steuern würde.
- **Nicht getestet:** echte Wiederherstellung/„Aus Sicherung einrichten“ über die Manager-Oberfläche gegen laufende Dienste (Logik per
  Unit-Tests geprüft), Export/Import sehr großer Dateien (> 100 MB), Installer-Lauf (CI).
- **Nachtrag (Präzisierung Nutzer):** Die Vorschau nennt neu angelegte Stammdaten mit Namen („Wird neu angelegt: Kategorie ‚Werkzeug‘,
  Farbrolle ‚Gelb (Bambu PLA Basic)‘“), Hinweise und Gründe fürs Überspringen stehen sichtbar unter „Bitte beachten“. Farben, die die Datei
  nur als ID nennt (nicht beschrieben, also nicht anlegbar), werden genannt statt still verworfen; leere Farbbereiche entfallen, ein Druckteil
  ganz ohne beschriebene Farbe wird mit Grund übersprungen (sonst nie). Tests dazu: neue Farbrolle, Großschreibung, vorhandene Farbrolle unter
  fremder ID bleibt unverändert, nicht zu rettendes Druckteil. Verschlüsselung der Sicherungen bleibt (Wunsch widerrufen), nur der Text ist
  klarer: „Ohne dieses Passwort lässt sich eine Sicherung nicht zurückspielen“. `main` (Stammdaten einfacher, Mail) gemergt.
- **Aufgeräumt:** Dev-Server und Attrappe gestoppt, `C:\Entwicklung\_testdaten\export` gelöscht, eigene Einträge aus
  `C:\Entwicklung\.claude\launch.json` wieder entfernt, Scratchpad geleert. Worktree bleibt.

## 2026-11-02 – Benachrichtigungs-Mail zu Anfragen verfeinert (Session: mail-schoener, Branch: feature/mail-schoener)
- **Gebaut:** Kopf mit Kurzfassung („7 × Kabelhalter – 3 × Blau, 4 × Gelb · Größe M · Klasse 7b“) und Kennzeichen
  „Neue Anfrage“/„Geänderte Anfrage“, unsichtbarer Preheader (Vorschautext im Postfach), Menge im Betreff.
  **Reply-To = Lehrkraft** (nur gültige Adresse, nie bei Beispiel-/Demo-Anfragen) plus Hinweis „Mit Antworten …“.
  Geänderte Anfrage: Kasten „Was hat sich geändert?“ (vorher → jetzt) und gelb markierte Zeilen – dafür übergibt
  `updateOwnOrder` den Stand vor der Änderung (`notifyNewOrder(…, previous)` statt `changed = true`). „Farbe egal“ als
  Kennzeichen „Team wählt die Farbe“. Leere Angaben (Größe, Bemerkungen, Personalisierung) fehlen statt „—“.
  Reihenfolge: erst das Druckteil (was/wie viel/Farbe), dann Klasse, Lehrkraft, Nummer, Eingang. HTML Outlook-/Handy-tauglich:
  Tabellen-Layout mit MSO-Rahmen 600 px, Button als Tabellenzelle, nur Inline-Styles, keine Bilder. Testmail: Beispiel mit
  7 Stück in drei Varianten (Türkis, Gelb, Farbe egal), Beschriftung und lila Hinweis „Testnachricht …“ oben, auch in der Textversion.
  `sendMail` reicht `replyTo` durch.
- **Dateien:** `server/src/module/anfragen/anfragen.mail.ts`, `server/src/kern/mail/mailer.ts`,
  `server/src/module/anfragen/anfragen.service.ts` (eine Zeile), `server/test/anfragen-mail.test.ts` (neu),
  `server/test/einstellungen.test.ts` (Betreff, Reply-To).
- **Vorschau (ohne Versand):** `C:\Entwicklung\_berichte\Mail-Vorschau-vorher.html` und `Mail-Vorschau-neu.html`
  (neue Anfrage mit zwei Farben, „Farbe egal“ mit wenig Angaben, geänderte Anfrage, Testmail; je Desktop, Handy, Text).
- **Geprüft:** `npm run check` ✔ (typecheck, lint, test) · Vorschau im Browser (Desktop + 360 px) ✔ · echtes Outlook nicht getestet.
- **Aufgeräumt:** Vorschau-Skript nur im Scratchpad, keine Server gestartet, keine Mails versendet.

## 2026-11-02 – Stammdaten einfacher (Session: stammdaten-einfach, Branch: feature/stammdaten-einfach)
- **Gebaut (nur Oberfläche, Daten/Schema/API unverändert):** Stammdaten mit **3 statt 5 Tabs** – Kategorien, Einsatzbereiche,
  **Material & Farben** (Materialien und Farbrollen untereinander, alter Link `?liste=filaments` springt zu den Farbrollen).
  Kategorien: Farbe und Symbol hinter „Farbe und Symbol ändern“ eingeklappt. Farbrollen: sichtbar nur Farbfleck, Farbname,
  Schalter „vorrätig“; Marke, Linie, Farbwähler und Hex-Feld hinter „Marke, Linie und Farbe ändern“ (neue Einträge offen).
  **Anfragestatus** → Einstellungen, Abschnitt „Ablauf der Anfragen“ (nur Schalter mit Erklärung, ohne Phasen-Spalte und
  An/Aus-Abzeichen; sichtbar mit Recht `masterdata:manage`). Menü „Filamente“ heißt jetzt **„Farbrollen“**. Einleitungen
  geschärft: Kategorie = „Wofür?“, Einsatzbereich = „Wo?“, Material = „Woraus?“. Seitenlänge Kategorien ~5 100 → ~3 300 px
  (davon ~1 500 px Export & Import), Farbrolle je Zeile ~270 → ~115 px.
- **Dateien:** `client/src/features/einstellungen/stammdaten/{MasterDataPage,CategoriesPanel,FilamentsPanel,SimplePanel,Aufklappen}.tsx`,
  `client/src/features/einstellungen/{AnfrageAblaufSection (aus StatusesPanel),SettingsPage}.tsx`, `components/Layout.tsx`,
  `verwaltung/{FilamentsPage,DashboardPage}.tsx`, `shared/src/konten.ts` (Rechte-Texte), README, ARCHITEKTUR.
- **Geprüft:** `npm run check` ✔ (typecheck, lint, test) · im Browser ✔ (Desktop + Handy 375 px: Tabs, Aufklappen, neue Farbrolle
  speichern, alter Link, Status an/aus in Einstellungen). Screenshots vorher/nachher: `C:\Entwicklung\_screenshots\stammdaten\`.
- **Nicht angefasst:** Export & Import (eigene Session) – der Block hängt weiterhin unter jedem Stammdaten-Tab.
- **Aufgeräumt:** Testserver 5183/3013 gestoppt, Testdaten `C:\Entwicklung\_testdaten\stammdaten` gelöscht.
## 2026-11-02 – Update per Installer-Paket abgesichert (Session: paket-update, Branch: feature/paket-update-sicher)
- **Gebaut:** Erneutes `Installieren.cmd` / `sudo ./installieren.sh` über eine vorhandene Installation ist jetzt so sicher wie
  das Git-Update, mit denselben Bausteinen (neu `manager/lib/paketupdate.mjs`, aufgerufen aus `install()`):
  - **Downgrade-Schutz** im Schritt `check`, vor jeder Änderung: Paket mit niedrigerem Schema als die Datenbank → „Downgrade
    verweigert … Es wurde nichts verändert.“ Gleiches Paket = Reparatur.
  - **Sicherung im Setup** statt in den beiden Skripten: bei gestoppten Diensten mit der bisherigen Version
    (`current/manager/cli.mjs backup run`) – gleich auf beiden Plattformen, der Rückfall nutzt genau diese Sicherung;
    scheitert sie, wird nicht umgestellt und die Dienste laufen wie vorher.
  - **Automatischer Rückfall**, wenn nach dem Umschalten irgendein Schritt scheitert (meist: keine Antwort auf `/api/health`):
    Dienste stoppen, `current` zurück, bei geändertem Schema nur die Datenbank aus der Sicherung (Schema danach geprüft),
    kaputte Version löschen, Dienste starten (Linux: Daten wieder dem Dienstbenutzer), Health. Meldung für die IT:
    „Update auf X fehlgeschlagen (…) – automatisch auf Y zurückgeschaltet, Daten unverändert … Protokoll: …“, Exit ≠ 0.
  - Alte Versionen werden erst nach Erfolg aufgeräumt (wie beim Git-Update), damit der Rückfall die vorige immer hat.
  - Server-Manager-Dienst: wird vor dem Umschalten gestoppt und danach (auch nach dem Rückfall) wieder gestartet; Sitzungen
    liegen nur im Speicher → nach dem Update neu anmelden. Oberfläche „Einrichten“ zeigt den Schritt `rollback` nur bei Bedarf.
- **Dateien:** `manager/lib/paketupdate.mjs` (neu), `manager/lib/setup.mjs`, `manager/server.mjs`, `manager/Installieren.cmd`,
  `manager/installieren.sh`, `manager/test/paketupdate.test.mjs` (neu: Downgrade, Rückfall ohne/mit Schema-Änderung mit echter
  Sicherung, Sicherung scheitert), `.github/workflows/installer-test.yml`, `.github/installer-test/pruefen.ps1|.sh` (Phase
  `zurueck`), `.github/installer-test/schema-pruefen.mjs` (neu), `docs/INSTALLATION.md` (Abschnitt „Update per Paket“), `manager/README.md`.
- **Geprüft:** `npm run check` ✔ · neue Unit-Tests ✔ (einzeln lokal, ohne Dienste) · Installer-Test auf GitHub Actions grün
  (https://github.com/x-vs-x/mosaik3lab/actions/runs/41466653420): Windows, Linux x64, arm64 jeweils Installieren, Update,
  **Rückfall-Test** (Testkopie mit Migration `011_ci_kaputt.sql` + `process.exit(3)` nach dem Start → Exit 1, „Schema 11 → 10“
  zurückgespielt, vorige Version aktiv, Konto/Datei da), **Downgrade-Test** (Testkopie ohne `010_…` → abgelehnt, nichts
  verändert), Deinstallieren, `npm run manager:test`. Kein Testschalter im Programm.
- **Nicht getestet:** Rückfall, wenn auch die vorige Version nicht startet (nur als Unit-Test), Sicherung scheitert auf dem
  echten Rechner (nur Unit-Test), Update aus der Oberfläche „Einrichten“ des Managers (gleicher Code, nur per CLI geprüft).
- **Aufgeräumt:** Remote-Branch `installer-test/update` gelöscht, Testdaten `_testdaten/manager-paketupdate` entfernt, Scratchpad leer.

## 2026-11-02 – Installer-Paket für Linux x64 und Raspberry Pi (arm64) (Session: installer-linux, Branch: feature/installer-linux)
- **Gebaut:** `scripts/paket.mjs` baut jetzt für das System, auf dem es läuft: Windows wie bisher (ZIP), Linux
  `Mosaik3LAB-Installer-<version>-<commit>-linux-<x64|arm64>.tar.gz` (Ordner im Archiv, `node/node` aus dem offiziellen
  `node-<v>-linux-<arch>.tar.gz`, SHA-256 gegen SHASUMS256.txt; native node_modules passen, weil auf dem Ziel-System gebaut wird –
  kein Linux-Bau unter Windows). Neues `manager/installieren.sh` (Gegenstück zu `Installieren.cmd`: einmal sudo, Update mit
  `backup run` vorher, `probelauf`, `--still`). CI: Job `linux` (Matrix `ubuntu-latest` x64 + `ubuntu-24.04-arm` arm64 – im privaten
  Repo verfügbar) baut, lädt das Paket als Artifact hoch (30 Tage), installiert echt, prüft (`.github/installer-test/pruefen.sh`),
  aktualisiert, deinstalliert, `npm run manager:test`. `[nur-linux]` in der Commit-Nachricht überspringt den Windows-Job.
- **Gefundene Fehler (behoben):**
  - Als root eingerichtet (sudo) legte das Setup weder den Dienstbenutzer `mosaik3lab` an noch übergab es ihm die Ordner (alles
    war „beschreibbar“) → Dienste hätten nicht starten bzw. nicht in die Datenbank schreiben können. `platform.ownsDataDirs`:
    Ordner-Schritt legt Benutzer an, vor dem Start werden Daten/Ablage/Sicherungen/Protokolle (inkl. Manifest) noch einmal übergeben.
  - polkit-Regel: `/etc/polkit-1/rules.d` wird bei Bedarf angelegt (fehlt ohne polkit, z. B. Pi OS Lite).
  - Verknüpfungen als root landeten in `/root/.local/…` → jetzt `/usr/share/applications/mosaik3lab` (ohne Desktop harmlos).
  - `mosaik3lab.sh` nahm immer das System-Node (Paket hat keins) → nimmt `node/node`, Deinstallieren mit sudo.
  - Laufzeit-Hinweis nannte unter Linux `Installieren.cmd` → `sudo ./installieren.sh`.
  - Manager-Test „Abgleichen“ nutzte einen Windows-Pfad und scheiterte unter Linux → plattformneutral (jetzt auch dort geprüft;
    unbrauchbarer Ordner = Pfad unter einer Datei – `mkdir -p` unter `/proc` hing).
  - Portal-Test (Windows, sporadisch): Aufräumen löschte den Testordner, bevor die gestartete App beendet war → `EPERM` auf der
    Datenbank, der ganze Testlauf hing. Wartet jetzt auf das Ende der App und wiederholt das Löschen kurz.
  - CI: `manager:test` mit Zeitlimit (Linux 3 min, Windows 5 min), damit ein Hänger keine Minuten frisst.
- **Dateien:** `scripts/paket.mjs`, `manager/installieren.sh` (neu), `manager/mosaik3lab.sh`, `manager/platform/linux.mjs`
  (Kennzeichen „ungetestet“ entfernt), `manager/lib/setup.mjs`, `manager/lib/runtime.mjs`, `manager/test/settings-backup.test.mjs`,
  `manager/test/portal.test.mjs`, `.github/workflows/installer-test.yml`, `.github/installer-test/pruefen.sh` (neu), `docs/INSTALLATION.md`, `manager/README.md`,
  `README.md`, `docs/ANFORDERUNGEN.md`, `CLAUDE.md` (Zeile Linux-Installation präzisiert).
- **Nicht testbar:** echter Raspberry Pi und Raspberry Pi OS (getestet: Ubuntu 24.04 auf ARM64), Raspberry Pi OS 32 Bit (kein
  Paket), Neustart (Autostart nur als „enabled“ geprüft), Menüeinträge auf einem echten Desktop, firewalld, Zugriff aus dem Schulnetz,
  Steuern der Dienste aus dem Manager-Dienst über polkit.
- **Geprüft:** Installer-Test grün auf GitHub (https://github.com/x-vs-x/mosaik3lab/actions/runs/41462637360): Linux x64 und arm64
  je 82 Prüfungen + manager:test 71/71, Windows 66 Prüfungen + 71/71; `npm run check` ✔. Pakete als Artifacts in diesem Lauf (30 Tage).
- **Aufgeräumt:** Remote-Branches `installer-test/arm-probe` und `installer-test/linux` gelöscht, Downloads im Scratchpad gelöscht;
  hier lokal nichts installiert, keine Dienste angefasst.

## 2026-11-02 – Installer-Test auf GitHub Actions (Session: installer-ci, Branch: feature/installer-ci)
- **Gebaut:** `.github/workflows/installer-test.yml` (nur `workflow_dispatch` und Push auf `installer-test/**`): auf `windows-latest`
  Paket bauen, entpacken, `Installieren.cmd /still` echt ausführen, prüfen (`.github/installer-test/pruefen.ps1`: 4 Dienste laufen mit
  Autostart und Node aus `C:\Program Files\Mosaik3LAB`, Portal/App/Manager antworten, Datenordner ohne Programm, Firewall-Regel),
  Admin-Konto über den Manager + Markerdatei anlegen, zweite Paketkopie (anderer Commit) als Update installieren, Konto/Anmeldung/
  Markerdatei/Sicherung prüfen, `uninstall --yes` (Daten behalten) prüfen, danach `npm run manager:test`. Bei Fehlern Logs als Artifact.
  `Installieren.cmd /still`: ohne Rückfragen, Pause und Browser (bricht ab statt UAC zu zeigen; Update ohne Sicherung bricht ab).
- **Gefundene Fehler (behoben):**
  - Ersten Administrator im Server-Manager anlegen (der dokumentierte Schritt nach jeder Installation) scheiterte, weil die Dienste
    schon laufen und die App den Datenbestand sperrt → `lib/auth.mjs` hält die Web-App dafür kurz an und startet sie wieder.
  - `powershell.exe` aus einem PowerShell-7-Fenster gestartet erbt dessen `PSModulePath` → kein `Cert:`-Laufwerk, HTTPS-Zertifikat
    erzeugen scheitert → `platform/windows.mjs` lässt die Variable weg.
- **Nur Runner:** Das Runner-Abbild hat IIS auf Port 80; der Workflow stoppt ihn vorher. Das Setup prüft Port 80 nicht vorab, das Portal
  meldet die Belegung aber verständlich im Log und in der Statusanzeige (später ggf. Vorabprüfung).
- **Nicht testbar:** UAC-Abfrage (Runner ist schon Admin), Verknüpfungen per Klick, Umzug einer älteren Installation, Neustart des Rechners
  (Autostart nur als Starttyp geprüft), Zugriff aus dem Schulnetz.
- **Geprüft:** Installer-Test grün auf GitHub (https://github.com/x-vs-x/mosaik3lab/actions/runs/41450803348, 66 Prüfungen, manager:test 71/71), `npm run check` ✔. Hier lokal nichts installiert, keine Dienste angefasst.
- **Aufgeräumt:** Remote-Branch `installer-test/lauf` gelöscht, Logs/Downloads im Scratchpad gelöscht.

## 2026-11-02 – Installer-Paket für Windows: ZIP + Installieren.cmd (Session: installer-zip, Branch: feature/installer-zip)
- **Gebaut:** `npm run paket` (`scripts/paket.mjs`) baut aus `git archive HEAD` + `npm ci` + Client-Build + offizieller `node.exe`
  (win-x64, gleiche Version, SHA-256 gegen `SHASUMS256.txt`, Zwischenspeicher `_pakete\.node`) ein ZIP
  `C:\Entwicklung\_pakete\Mosaik3LAB-Installer-<version>-<commit>.zip` (Ausgabeordner per Argument). Gepackt wird mit `tar.exe` von Windows,
  ohne neues npm-Paket. Es prüft, dass keine Startdatei, kein `backup.key`, keine Manager-Konfiguration, kein `storage/`, keine Logs und kein `.git` drin sind.
  Oben im Paket: `Installieren.cmd` (holt einmal Adminrechte, nutzt `node\node.exe` aus dem Paket, ruft `cli setup --config
  Installieren.json` auf; erkennt eine vorhandene Installation → Update mit Sicherung vorher; erkennt eine ältere Installation an
  anderem Ort und ändert dann nichts; zeigt Backup-Passwort-Hinweis, Adresse, „entpackter Ordner kann weg“; öffnet den Server-Manager
  zum Anlegen des Admins; `probelauf` = nur Plan), `Installieren.json` (Standardorte, Netz an, WinSW laden, `prebuilt`), `paket.json`.
- **Neue Aufteilung unter Windows:** Programm (Versionen, `current`, Node, Dienstdateien `dienste\`, WinSW `werkzeuge\`,
  `install-manifest.json`) in `C:\Program Files\Mosaik3LAB`; in `C:\Mosaik3LAB` nur `daten`, `ablage`, `backups`, `logs`, Startdatei,
  `backup.key`. `layout()` + `platform/windows.mjs` (`defaults()`, `serviceFilesInProgram`); `install.json` merkt sich `managerDir`,
  ältere Installationen ohne den Eintrag behalten `<Daten>\manager` (dieser Rechner unverändert). Programmordner unter Programme:
  Ändern-Recht für Benutzer (Deinstallieren) und Lokaler Dienst (Updates, WinSW-Tausch), im Manifest als `acl`. Erneutes Einrichten
  = Update: Dienste stoppen (nicht bei `--system-dry-run`), `current` umschalten, alte Versionen aufräumen (`prune`), WinSW nur bei
  Änderung kopieren. Dienste starten `<Programm>\current\node\node.exe`, `mosaik3lab.cmd` ebenso. Laufzeit-Anzeige: Node/Git bei
  Paket-Installation „kommt mit dem Paket“, `runtime update node` lehnt ab. Deinstallieren kopiert das mitgelieferte node.exe zum
  Löschen in den Temp-Ordner und wiederholt, solange der Ordner belegt ist; CLI `uninstall --manager-dir`.
- **Setup (`manager/lib/setup.mjs`):** neuer Schalter `prebuilt` (node_modules + `client/dist` mitkopieren, kein `npm ci`/Build),
  fehlende npm-Workspace-Verweise werden neu angelegt (ZIP kennt keine Junctions), Version/Commit aus `paket.json` statt Git.
  **Fixes:** Erneutes Einrichten auf vorhandene Startdatei + Datenbank setzt die Einstellungen nicht mehr auf Standard zurück
  (z. B. Mail). Der Schritt „start“ startet jetzt auch den Manager-Dienst (vorher war 5190 nach `cli setup` erst nach Neustart da).
  `MOSAIK3LAB_SYSTEM_DRY_RUN` legt keine Verknüpfungen mehr an (`manager/platform/index.mjs`) und trägt sie nicht ins Manifest ein.
- **Panne beim Test (behoben):** Der Probelauf mit `MOSAIK3LAB_SYSTEM_DRY_RUN` (ohne `--system-dry-run`) hat die 5 echten Desktop- und
  Startmenü-Verknüpfungen auf den Testordner umgebogen. Sie wurden sofort mit der Plattform-Funktion der installierten Version
  neu angelegt (Ziel `C:\Mosaik3LAB\programm\current`, geprüft). Dienste waren nicht betroffen (alle 4 „Running“).
- **Dateien:** `scripts/paket.mjs`, `manager/Installieren.cmd`, `manager/Installieren.json`, `manager/mosaik3lab.cmd`,
  `manager/lib/{setup,config,runtime,update}.mjs`, `manager/cli.mjs`, `manager/platform/{index,windows}.mjs`,
  `manager/test/manager.test.mjs`, `package.json` (Skript `paket`), `.gitattributes` (`*.cmd` mit CRLF), `docs/INSTALLATION.md`,
  `README.md`, `manager/README.md`, `CLAUDE.md` (Tabelle Ordner).
- **Geprüft:** typecheck ✔ · test ✔ · lint ✔ (0 Fehler) · Manager-Tests einzeln ✔ (manager, admin, settings-backup, updates, auto;
  `selftest.mjs` bewusst nicht). Paket gebaut (~90 MB mit Node, ~18.000 Dateien, längster Pfad 116 Zeichen), Inhalt geprüft.
  Mit `Expand-Archive` entpackt, `Installieren.cmd probelauf` gegen die Standardwerte (Plan: Program Files + C:\Mosaik3LAB, Node aus
  dem Paket). `Installieren.cmd` mit Testordnern + `MOSAIK3LAB_SYSTEM_DRY_RUN`: Daten-Ordner enthält nur das Erlaubte, Dienst-XML
  zeigt auf `current\node\node.exe`, kein Verweis auf den entpackten Ordner; zweiter Lauf mit neuer Version = Update (neue Version,
  `current` umgeschaltet, vorige bleibt, Einstellungen unverändert). Echte Dienste nach jedem Test „Running“, echte Verknüpfungen
  unverändert. Nicht real getestet: Windows-Abfrage (UAC) und Selbst-Neustart als Admin, echte Dienste/Firewall/Rechte auf frischem
  PC, Öffnen des Managers und Admin-Anlage danach, Sicherung vor dem Update, Deinstallieren aus Program Files.
- **Umzug dieses Rechners (später, Hauptchat):** erneutes `Installieren.cmd` erkennt die alte Installation und bricht ab. Weg:
  „Mosaik³LAB deinstallieren“ mit Daten behalten → `Installieren.cmd`. Übrig bleibt `C:\Mosaik3LAB\manager\werkzeuge\WinSW-*.exe`
  (+ leerer `dienste\`), von Hand löschen.
- **Aufgeräumt:** `C:\Entwicklung\_testdaten\installer-zip` gelöscht; ZIP bleibt in `C:\Entwicklung\_pakete`.

## 2026-11-02 – Installation als Windows-Dienste mit Autostart (Hauptchat)
- **Gebaut:** `manager/cli.mjs setup` auf dem Entwicklungsrechner ausgeführt: Programm in `C:\Mosaik3LAB\programm`, Daten bleiben in
  `C:\Mosaik3LAB\daten`. Die Dienste `mosaik3lab-webapp`, `-backup`, `-portal` und `-manager` (WinSW, Lokaler Dienst) starten automatisch mit
  Verzögerung. Firewall für Port 80, Verknüpfungen auf Desktop und Startmenü. Nach einem Neustart laufen alle vier Dienste, und 80, 3001 und 5190 antworten.
- **Fix:** Setup-Schritt „start“ startete die Dienste ohne Adminrechte (Windows: Fehler 5, „Die Web-App antwortet nicht“). Jetzt
  startet er nicht startbare Dienste gesammelt in einer Admin-Aktion (`manager/lib/setup.mjs`).
- **Bekannt:** Auf einem Rechner mit installierten Diensten schlagen 2 Selbsttests in `manager/test/selftest.mjs` fehl. Sie steuern dann
  die echten Windows-Dienste statt eines Hintergrundprozesses (69/71 grün).
- **Dateien:** `manager/lib/setup.mjs`, `CLAUDE.md`, `docs/PROTOKOLL.md`.

## 2026-11-01 – Mehrere Farben je Anfrage + Anfrage nachträglich ändern (Session: farbvarianten, Branch: feature/farbvarianten)
- **Gebaut:**
  1. *Mehrere Farben:* `orderInputSchema.variants` (1–10 Zeilen „Anzahl + Farbe je Bereich“), Summe ≤ 20; erste Variante gilt als
     bisherige Farbe, `color` enthält die Aufteilung („3 × Blau, 4 × Gelb“) – alte Listen, Suche, Exporte bleiben lesbar.
     Migration 010 (`anfrage.farbvarianten`, JSON, Standard `[]`). Formular: „+ Weitere Farbe“, je Zusatzzeile „Entfernen“,
     „Gesamt: N Stück“, Fokus auf die neue Zeile bzw. zurück zum Button. Bei nur einer Zeile sendet der Client wie bisher ohne `variants`.
     Anzeige in „Meine Anfragen“, Verwaltung (Liste + Detail) und Bestell-Mail (eine Zeile je Farbe).
  2. *Ändern:* `PUT /api/orders/:id` (`orders:own`): nur eigene Anfrage (sonst 404) mit Status `offen` (sonst 409, erneut in der
     Transaktion geprüft), gleiche Prüfung wie beim Anlegen, Druckteil fest; Verlauf „Von der Lehrkraft geändert“; Mail
     „Geänderte Anfrage …“ ans Team (gleiche Vorlage, andere Überschrift). `OwnOrder.editable` vom Server. Button „Anfrage bearbeiten“
     öffnet den vorhandenen Dialog vorbelegt (`/vorlage`, jetzt mit `variants`); bei 409 Meldung, Speichern gesperrt, Liste lädt
     beim Schließen neu. Hinweis „Wird bearbeitet – Änderungen bitte direkt beim Druck-Team“ nur bei sichtbarem Status.
  3. *„Farbe egal“ (Zusatzwunsch):* In jedem Farbbereich zusätzlich wählbar, bei jedem Druckteil, auch in Farbzeilen, beim
     Bearbeiten und „Erneut anfragen“. Gespeichert als Sonderwert `EGAL_FARBE = 'egal'` (`shared/src/anfragen.ts`), Schnappschuss
     „Farbe egal“ ohne Farbwert; Anzeige/Mail zeigen den Text. Später möglich: Schalter je Druckteil.
     `PUT` hat jetzt ein eigenes Rate-Limit (60/h) statt das Limit fürs Anlegen mitzuzählen.
  4. *Nebenbei behoben:* Dialog „Erneut anfragen/Bearbeiten“ wird bei jedem Öffnen neu aufgebaut (vorher blieb der Stand vom
     letzten Öffnen stehen).
- **Dateien:** `shared/src/anfragen.ts`; `server/src/module/anfragen/anfragen.{service,routes,repository,mail}.ts`,
  `server/src/storage/sqlite/migrations/010_farbvarianten.sql`, `server/src/seed/seed.ts`, `server/src/storage/sqlite/importJson.ts`;
  `client/src/features/katalog/{RequestDialog,AnfrageFelder (neu, Felder aus dem Dialog ausgelagert),OrderCard,MyOrdersPage}.tsx`,
  `client/src/features/verwaltung/OrdersAdminPage.tsx`; Tests `server/test/anfragen.test.ts` (+5), `speicher.test.ts` (Feld ergänzt);
  `docs/ARCHITEKTUR.md`, `docs/DATENMODELL.md`. Datenaustausch enthält keine Anfragen → unverändert.
- **Geprüft:** typecheck ✔ · test ✔ · lint ✔ (0 Fehler) · Klicktest session-1 ✔ (Desktop + 375 px): 3 × Blau + 4 × Grau angefragt,
  bearbeitet (→ 5 × Grau), Status als Druck-Team geändert → 409-Meldung im offenen Dialog, danach kein Bearbeiten-Button.
- **Hinweis:** `preview_start {name:"session-1"}` las die `launch.json` aus `C:\Entwicklung` (nur „mosaik3lab“) und startete
  kurz den Hauptstand auf Port 80 – nach 6 s gestoppt; session-1 dann selbst mit 5181/3011 gestartet.
- **Aufgeräumt:** Testserver gestoppt, Browser-Tab geschlossen, Scratchpad-Dateien gelöscht. Testdaten in `_testdaten\session-1`
  (jetzt Schema 10, drei Klicktest-Anfragen) bleiben für den Platz session-1.

## 2026-11-01 – Port-Knappheit untersucht (Hauptchat)
- **Befund:** Rund 26.700 Verbindungen standen auf „WARTEND“ (TIME_WAIT) und wurden von Windows nicht abgebaut: Über 60 s blieb die Zahl exakt gleich, Einträge zu Port 5173 waren seit gestern unbenutzt. Dazu kamen rund 2.600 „ZULETZT_ACK“ der Claude-Programme (claude.exe) zu ihrem Server. Damit waren die 16.384 Ports für ausgehende Verbindungen belegt.
- **Mitverursacht durch die Entwicklung:**
  - Lasttests des Hauptchats (3×200 parallele Anfragen);
  - der Vite-Proxy ohne Keep-Alive (behoben);
  - viele Testserver der Sessions.
- **Abhilfe:** Rechner neu starten, das leert die Tabelle. Neue Regel „Netzwerk schonen“ in `CLAUDE.md`: keine Massentests, Keep-Alive, Testserver sofort stoppen, höchstens 2–3 Sessions mit Servern gleichzeitig.
- **Offen:** Bleibt die Tabelle nach dem Neustart wieder liegen, liegt es an Windows bzw. einem Netzwerk- oder Sicherheitstreiber (VPN, Virenschutz). Das wäre ein Fall für die IT.
- Die Tests nach dem Merge von `feature/gesamtpruefung` hingen deshalb und wurden abgebrochen. Sie werden nach dem Neustart wiederholt.

## 2026-11-01 – Gesamtprüfung Netzwerk und Zugang (Session: gesamtpruefung, Branch: feature/gesamtpruefung)
- **Geprüft (Code gelesen):** `server/src/app.ts`, `config.ts`, `index.ts`, `kern/auth/*`, `rateLimit.ts`, alle `module/*/*.routes.ts`
  (jede Route hat Rechteprüfung oder ist bewusst öffentlich + Rate-Limit), Dateiauslieferung (`files.ts`, `uploads.ts`),
  `client/src/auth/*`, `lib/api.ts`, `lib/config.tsx`, `App.tsx`, `vite.config.ts`, `manager/server.mjs`, `lib/auth.mjs`,
  `lib/remote.mjs`, `lib/portalserver.mjs`, `runners/portal.mjs`, `runners/webapp.mjs`, Firewall (`platform/*`).
- **Behoben:**
  1. *Demo-Regel ungleich (mittel):* installiert setzt der Manager `NODE_ENV=production` + `DISABLE_DEMO_ACCOUNTS=false`
     beim Schalter „Demo-Konten“ – die App sperrte bei production aber immer, der Notzugang ließ Demo-Admins zu. Jetzt
     gleiche Regel (`server/src/config.ts`), Test in `betrieb.test.ts`.
  2. *Endlose Ladeanzeigen (hoch, Ursache der heutigen „Hänger“):* `api()` hatte nur bei der Anmeldung eine Zeitgrenze;
     bei hängender Verbindung (erschöpfte Ports) drehte jede Seite ewig. Jetzt Standard 30 s (Uploads/Import ohne).
     `/api/config` mit Wiederholung; scheitert sie, Hinweis im Layout mit „Erneut versuchen“ (vorher leere Stammdaten,
     „Meine Anfragen“ drehte endlos). Tests in `client/test/sitzung.test.ts`.
  3. *Netzwerkprofil „Öffentlich“ (hoch für den Zugang im Schulnetz):* Die Firewall-Regel gilt bewusst nur für
     Privat/Domäne. Dieses WLAN ist als „Öffentlich“ eingestuft – „Im Schulnetz erreichbar“ wirkte dann nicht, ohne Hinweis.
     Jetzt Warnung im Manager-Status und in `doctor` mit Abhilfe (Test in `auto.test.mjs`).
  4. *Manager-Oberfläche:* keine Zeitgrenze (Status blieb bei hängender Verbindung stehen), leere Seite, wenn der erste
     Aufruf scheiterte. Jetzt 20 s für Abfragen und verständliche Meldung.
  5. *Kleinere:* Port belegt beim App-Start → deutsche Meldung statt Stacktrace; fehlende `/assets/*` → 404 statt
     Startseite (leere Seite nach Update); Vite-Proxy zeigt bei gestopptem Manager eine deutsche Seite, Umleitung behält
     die Query; Notzugang verrät über die Antwortzeit nicht, ob eine E-Mail ein Admin ist; Login-Bremse räumt alte Einträge
     auf; Karte „Server-Manager“ in Sie-Form mit vollständiger Adresse und Zeitgrenze; veralteter „Prototyp“-Hinweis ersetzt.
- **Ohne Befund:** Cookie (`Path=/mosaik3lab`, HttpOnly, SameSite=Strict, Secure nur bei HTTPS), HSTS/upgrade-insecure
  nur mit HTTPS, CSRF-Kopf, trust proxy loopback + X-Forwarded-For (Portal überschreibt, Vite hängt an – rechts zählt),
  Kopf `X-Mosaik3lab-Manager` nicht fälschbar (direkt → trotzdem App-Admin nötig), fremder Host → 403, Manager nur auf
  127.0.0.1/::1, Logout/Passwortwechsel/Deaktivieren beenden Sitzungen, Rechte je Route, Pfadprüfung der Dateiablage.
- **Geprüft:** `node scripts/check.mjs` ✔ (typecheck, lint, test – ein erster Lauf hatte einen einmaligen Ausfall, zwei
  Wiederholungen grün; vermutlich die knappen Ports), `npm run manager:test` ✔ 71/71 (nacheinander). Klicktest auf eigener
  Instanz (Vite 5185 `--host ::`, API 3021, Manager 5195, `BASE_PATH=/mosaik3lab`): Umleitungen `/`, `/mosaik3lab`,
  `?query`; localhost, 127.0.0.1, `[::1]`, LAN-IP; Admin (Deep-Link nach Login, Reload auf Unterseite, Manager über
  Einstellungen-Knopf, nach Abmelden 403), Druck-Team (Einstellungen/Benutzer/Manager 403), Lehrkraft, unbekannte E-Mail
  (korrigieren + Konto anlegen) bei 375 px, API gestoppt → Hinweis → Neustart → „Erneut versuchen“ (Anmeldung blieb),
  Notzugang 127.0.0.1:5195 (falsches/richtiges Passwort).
- **Offen (bewusst):** HTTPS/Portal nicht im Browser getestet (nur die Manager-Tests); TIME_WAIT-Flut selbst ist kein
  App-Fehler. Firewall-Regel bleibt auf Privat/Domäne (für einen Laptop im fremden WLAN sicherer) – im Schulbetrieb das
  Netz als „Privat“ einstufen.
- **Aufgeräumt:** Test-Server (3021/5185/5195) gestoppt, `C:\Entwicklung\_testdaten\gesamtpruefung` gelöscht,
  `client/dist` und vorübergehende Einträge in `.claude/launch.json` entfernt. Live-Server (80/3001/5190) nicht angefasst.

## 2026-11-01 – Manager-Tests stabil (Session: manager-tests, Branch: feature/manager-tests-stabil)
- **Ursache:** Auf diesem Rechner waren alle 16 384 dynamischen Ports (49152–65535) belegt (~30 000 Verbindungen im Zustand TIME_WAIT, vor allem von parallelen Test- und Entwicklungsservern anderer Sessions und Anfragen an `::1:80`). Jede neue ausgehende Verbindung konnte daher zufällig mit `connect EADDRINUSE` scheitern. Betroffen waren:
  1. **Produktionscode `portalcert.mjs`:** Die PFX-Prüfung startete einen lokalen TLS-Server und verband sich mit ihm. Scheiterte die Verbindung, kam „Die PFX-Datei enthält kein verwendbares Zertifikat …“. Folgen: Ein gültiges Zertifikat galt als ungültig, `generateCert` warf, und die Prüfung meldete „gilt nicht für diesen Rechner“ nicht. → Der TLS-Handshake läuft jetzt im Speicher (`stream.duplexPair`), ohne Port.
  2. **Tests:** `freePort()` (listen(0) → close → später belegen) gab Ports aus dem dynamischen Bereich zurück. Die konnte eine fremde ausgehende Verbindung dazwischen wegnehmen. Feste Ports 3020 (selftest) und 3022 (portal) kollidierten mit parallelen Läufen in anderen Arbeitskopien (portal übersprang den App-Test dann stillschweigend). Die Zertifikat-Prüfung zählte *alle* „Mosaik3LAB*“-Zertifikate im Speicher, sodass ein paralleler Lauf das Ergebnis verfälschte.
  3. **Produktionscode `backup.mjs` (beim Prüfen gefunden):** Beim Wiederherstellen mit autoStop schlug das Löschen der Datenbank gelegentlich mit `EBUSY` fehl, weil Windows die Datei nach dem App-Ende kurz gesperrt hält. → `fs.rm` jetzt mit `maxRetries` (wie `renameRetry`).
- **Gebaut:** `manager/test/helpers/net.mjs` (neu) mit `freePort()` im Bereich 20000–32767, außerhalb der dynamischen Bereiche von Windows und Linux, sowie `retryConnect()`: wiederholt nur Fehler beim Verbindungsaufbau (EADDRINUSE/EADDRNOTAVAIL/ENOBUFS – die Anfrage kam nie an). Diese Helfer nutzen portal, remote, selftest, manager und updates. App-Ports von selftest/portal sind jetzt frei gewählt. Der Speichertest prüft genau den Fingerabdruck des eben erzeugten Zertifikats.
- **Dateien:** `manager/lib/portalcert.mjs`, `manager/lib/backup.mjs`, `manager/test/helpers/net.mjs` (neu), `manager/test/{portal,remote,manager,updates}.test.mjs`, `manager/test/selftest.mjs`.
- **Geprüft:** `npm run manager:test` 5× hintereinander grün (je 70/70), während die Live-Server auf 80/3001/5190 liefen und andere Sessions parallel testeten. Ein Zwischendurchgang vor Fix 3 war 4×/5 grün, der eine Fehlschlag war das EBUSY. Ausgangslage: portal.test allein 2 von 3 Läufen rot. `node scripts/check.mjs` ✔ (typecheck, lint, test).
- **Offen:** Die TIME_WAIT-Flut selbst (viele Verbindungen auf `::1:80`, also den Vite-Hauptstand) ist nicht untersucht. Live-Server wurden bewusst nicht angefasst.
- **Aufgeräumt:** Lauf-Ausgaben und Hilfsskripte im Scratchpad gelöscht; Testdaten räumen die Tests selbst weg (`_testdaten\server-manager\*`).

## 2026-11-01 – Anmeldung und Sitzungen robust (Session: login-robust, Branch: feature/login-robust)
- **Ursachen + Behebung:**
  1. *Altes Cookie gleichen Namens* (`m3l.sid` mit `Path=/` aus Versionen vor dem Basis-Pfad, oder von einer Test-Instanz auf demselben Rechner): express-session liest nur das **erste** `m3l.sid` – stand das alte vorn, war man trotz frischem Login „abgemeldet“. Neu `kern/auth/sessionCookie.ts`: bei mehreren nur das gültig signierte weiterreichen, das alte unter `Path=/` löschen.
  2. *Abmelden* löschte das Cookie unter `Path=/` statt unter `/mosaik3lab` – jetzt mit dem Pfad der Sitzung.
  3. *Jede 401 meldete sofort ab* („Ihre Sitzung ist abgelaufen“), auch von einer einzelnen Hintergrundabfrage oder einem Endpunkt, der für die Rolle 401 liefert (z. B. Passwort ändern als Lehrkraft). Jetzt erst `/auth/me` fragen (viele 401 → eine Prüfung); „abgelaufen“ nur, wenn der Server bestätigt.
  4. *Startprüfung*: Netzfehler/Neustart (Vite-Proxy liefert 500/502 ohne JSON) galt als „nicht angemeldet“ → Umleitung zur Anmeldung; eine hängende Verbindung ließ „Anmeldung wird geprüft …“ ewig stehen. Jetzt 8 s Zeitlimit, drei Versuche, danach Hinweis „Server antwortet gerade nicht – Anmeldung bleibt erhalten“ + „Erneut versuchen“. Anmeldeschritte haben 20 s Zeitlimit.
  5. *Wettlauf im Client*: kam die Startprüfung erst nach dem Login zurück („nicht angemeldet“), überschrieb sie den Login. Zähler für An-/Abmeldungen verwirft späte Antworten.
  - Geprüft ohne Befund: Login speichert die Sitzung vor der Antwort (`regenerate` + `save`), Sitzungen überleben einen Neustart (Geheimnis in der DB), `secure:'auto'` setzt über http kein Secure, Demo-Regel (`canUseAccount`) konsistent, CSRF-Header.
- **Dateien:** `server/src/kern/auth/sessionCookie.ts` (neu), `server/src/app.ts` (nur Session-Aufbau), `server/src/module/konten/konten.routes.ts` (Logout), `client/src/lib/api.ts` (`timeoutMs`, `isConnectionProblem`, Meldung bei 5xx ohne JSON), `client/src/auth/AuthContext.tsx`, `client/src/auth/sitzungPruefen.ts` (neu), `client/src/auth/SessionPending.tsx` (neu), `client/src/App.tsx`, `client/src/features/konto/LoginPage.tsx`; Tests `server/test/sitzung.test.ts`, `client/test/sitzung.test.ts` (neu).
- **Geprüft:** `node scripts/check.mjs` ✔ (typecheck, lint, test). Klicktest auf eigener Instanz (127.0.0.1:5183/mosaik3lab, API 3013): Admin mit altem `Path=/`-Cookie anmelden (Cookie danach entfernt), Neuladen, API gestoppt → Hinweis + „Erneut versuchen“, API neu gestartet → weiter angemeldet, Abmelden, Druck-Team, Sitzung serverseitig gelöscht → „abgelaufen“, Lehrkraft per E-Mail ✔.
- **Offen (nicht in meinen Dateien):** Der API-Proxy in `client/vite.config.ts` setzt kein `X-Forwarded-For` (`xfwd: true` fehlt) → hinter Vite haben alle Geräte die IP 127.0.0.1, die Anmelde-Begrenzung (60 je 10 min) und die Fehlversuchssperre je E-Mail gelten dann für die ganze Schule gemeinsam. Das Portal des Managers setzt den Kopf bereits.
- **Aufgeräumt:** eigene Server (5183/3013) gestoppt, `C:\Entwicklung\_testdaten\login-robust` gelöscht, temporärer Eintrag in `.claude/launch.json` zurückgenommen, Log im Scratchpad gelöscht.
## 2026-11-01 – Server-Manager: ein Login (Admin-Konto der App), überall erreichbar (Session: manager-status, Branch: feature/manager-status)
- **Gebaut:** Eigenes Manager-Passwort entfällt. Über `<Pfad>/manager` genügt die Admin-Sitzung der App (keine zweite Anmeldung); direkt am Server (Notzugang `127.0.0.1:<Manager-Port>`) Anmeldung mit E-Mail + Passwort eines aktiven App-Administrators (Tabelle `benutzer`, bcrypt über `bcryptjs` der App per `createRequire`, Demo-Konten nur wenn erlaubt, 5 Fehlversuche → 60 s Sperre). Gibt es noch keinen Administrator, legt man ihn dort an (Skript der App). Schalter „Über die App-Adresse erreichbar“ und alle „Nur direkt am Server möglich“-Sperren entfernt; stattdessen Bestätigung mit Notzugang-Hinweis bei Pfad/HTTPS, „nur noch auf diesem Rechner“, Ports/Portal, Web-App/Portal stoppen. `manager.passwordHash`/`manager.remote` werden beim Start einmalig aus der Datenbank entfernt. App: Verwaltung → Einstellungen → Karte „Server-Manager“ (nur Admins) mit „Server-Manager öffnen“ und Notzugang-Satz (Port vom Manager, sonst 5190); Manager: „← Zurück zu Mosaik³LAB“, gleicher Satz auf der Login-Seite. Außerdem: eine einzelne langsame `/api/health`-Antwort einer schon erkannten App macht keinen Fehlalarm mehr (PID gemerkt).
- **Dateien:** `manager/lib/auth.mjs` (neu geschrieben), `manager/lib/remote.mjs`, `manager/lib/config.mjs`, `manager/lib/setup.mjs`, `manager/lib/status.mjs`, `manager/lib/services.mjs`, `manager/server.mjs`, `manager/public/{index.html,app.js,app.css}`, `manager/manager.config.example.json`, Tests `remote.test.mjs` (neu gefasst), `selftest.mjs`, `manager.test.mjs`, `settings-backup.test.mjs`, `settings-migration.test.mjs`, `status-extern.test.mjs`, `client/src/features/einstellungen/SettingsPage.tsx`, Doku `manager/README.md`, `docs/ARCHITEKTUR.md`, `docs/DATENMODELL.md`. `server/` unverändert.
- **Geprüft:** `npm run manager:test` ✔ (Admin-Sitzung über die App-Adresse → drin; Lehrkraft/Druck-Team/abgemeldet → 403; lokaler Login mit App-Admin ✔, Druck-Team/deaktiviert/Demo → 401, 5 Fehlversuche → 429; erster Admin; alte Schlüssel entfernt) · `node scripts/check.mjs` ✔ · Klicktest (App-API 3014, Vite 5184, Manager 5194): als Admin in der App → Einstellungen → Karte mit Notzugang „127.0.0.1:5194“ → „Server-Manager öffnen“ ohne zweite Anmeldung → Uhrzeit der Sicherung geändert und gespeichert → Pfad ändern zeigt Bestätigung mit Notzugang (abgebrochen, nichts geändert) → „Zurück zu Mosaik³LAB“ ✔; Notzugang 127.0.0.1:5194: Login-Seite mit Hinweis, falsches Passwort abgelehnt, App-Admin angemeldet ✔.
- **Offen:** Ist das Portal aus und läuft die App direkt (ohne Portal/Vite davor), gibt es `<Pfad>/manager` nicht – dann führt der Knopf ins Leere; dafür müsste der App-Server selbst weiterleiten (`server/`, bewusst nicht angefasst). Auf diesem Rechner stauen sich ~25 000 TCP-Verbindungen im Zustand TIME_WAIT (viele Entwicklungsserver); dadurch hängen lokale Verbindungen sporadisch ~5 s (auch der Vite-Proxy).
- **Aufgeräumt:** eigene Testserver (3014, 5184, 5194) gestoppt, `_testdaten\manager-status` und Mess-Skripte gelöscht.

## 2026-11-01 – Server-Manager: keine Fehlalarme in der Entwicklung, Status schnell (Session: manager-status, Branch: feature/manager-status)
- **Ursache Langsamkeit (gemessen):** `GET /api/status` wartete auf die Abweichungsprüfung (`refreshStale` → `reconcile` dry-run), die einmal pro Minute die Firewall per PowerShell `Get-NetFirewallRule` abfragt (~2,4 s je Port, mehrere Ports nacheinander) – dazu netstat (~0,4 s) + tasklist (~0,15 s) für jeden Port nacheinander, bei belegtem Port 80 noch vier weitere. Ergebnis: mehrere Sekunden, die Seite blieb so lange leer; währenddessen startete alle 5 s eine weitere Abfrage.
- **Gebaut:** App-/Portal-Port, auf dem unsere App `/api/health` beantwortet (eingestellter Pfad oder `/mosaik3lab`), gilt nicht als Konflikt → „läuft (außerhalb des Managers gestartet, z. B. Entwicklung)“, kein „Starten“, kurzer Info-Hinweis; „Mosaik³LAB öffnen“ zeigt `http://<Server>/mosaik3lab` (Vite auf 80) bzw. `http://127.0.0.1:<App-Port><Pfad>`. Fremdes Programm bleibt rot. Systemabfragen gemerkt (Ports 10 s, Firewall 30 s, verworfen nach Start/Stopp/Admin-Aktion), alles parallel, Status wartet höchstens 0,5 s auf die Hintergrundprüfung, Health-Timeout 1,5 s. Oberfläche: „Status wird geladen …“, klare Fehlermeldung statt leerer Seite, keine überlappenden Abfragen.
- **Dateien:** `manager/lib/services.mjs`, `manager/lib/status.mjs`, `manager/lib/reconcile.mjs`, `manager/public/app.js`, `manager/test/status-extern.test.mjs` (neu), `manager/test/auto.test.mjs`, `manager/README.md`
- **Geprüft:** `npm run manager:test` 70/70 ✔ (neu: externe App → kein Alarm, fremdes Programm → Alarm, langsame Systemabfrage → zweiter Status < 300 ms) · `node scripts/check.mjs` ✔ · Klicktest Test-Manager 5194 + Test-App 3014 (außerhalb gestartet): grün, Status ~50 ms, Link mit `/mosaik3lab`, Fehleranzeige bei gestopptem Manager ✔ · nur lesend gegen die laufende Entwicklung (3001/80, Einstellungen des Hauptstands): kein Alarm, Adresse `http://<IP>/mosaik3lab/`, 0,6 s kalt / 22 ms danach ✔
- **Aufgeräumt:** Test-Manager, sein Backup-Runner und Test-App gestoppt, `_testdaten\manager-status` und Mess-Skripte gelöscht. Server auf 80/3001/5190 nicht angefasst.

## 2026-11-01 – Testpostfach für den Mailversand (Session: testpostfach, Branch: feature/testpostfach)
- **Gebaut:** `npm run testpostfach` startet einen SMTP-Fänger ohne Abhängigkeiten auf `127.0.0.1:2525` (EHLO/HELO, MAIL, RCPT, DATA, RSET, NOOP, QUIT; kein STARTTLS/AUTH angeboten, AUTH wird trotzdem angenommen) und eine Web-Ansicht auf `http://127.0.0.1:2580` (Liste neueste oben, Mail anzeigen – HTML in `sandbox`-iframe, sonst Text –, „Alle löschen“). Mails als `.eml` in `<Wurzel>\testpostfach` (Wurzel wie `dataRoot()`). Dekodiert multipart, quoted-printable, base64 und RFC-2047-Betreffzeilen. Startzeile nennt die Werte für den Manager; belegter Port → verständliche Meldung, Exit 1. Nichts wird zugestellt.
- **Dateien:** `scripts/testpostfach.mjs` (neu, 177 Zeilen), `package.json` (Skript), `README.md` (Abschnitt „Mailversand testen“)
- **Geprüft:** nodemailer (`secure:false`) mit Umlauten im Betreff/Text/HTML ✔, mit `auth` ✔, Punkt-Zeile (Dot-Stuffing) ✔, `.eml` geschrieben ✔, Ansicht im Browser: Liste, HTML-Mail (Skript im iframe blockiert), Text-Mail ✔, „Alle löschen“ ✔, Port belegt → Meldung ✔ · `node scripts/check.mjs` ✔
- **Aufgeräumt:** eigener Prozess gestoppt, Testmails und `C:\Entwicklung\_testdaten\testpostfach` gelöscht, Sende-Skript im Scratchpad gelöscht. `server/` und `manager/` unverändert; Mail-Einstellungen im Manager setzt der Hauptchat.

## 2026-11-01 – Anfragende sehen nur Farben, nicht das Filament (Hauptchat, Branch: feature/farben)
- **Gebaut:** Katalog, Produktseite, Anfrageformular und „Meine Anfragen“ zeigen nur noch Farbname + Farbfeld, keine Marke/Linie. Gleichnamige Rollen eines Druckteils (z. B. zweimal „Schwarz“) erscheinen nur einmal. Anfragen speichern als Farbe nur den Farbnamen; die Verwaltung (Anfrage-Details) und die Team-Mail zeigen zusätzlich die Rolle über `colorId`. Stammdaten „Farbrollen“: Marke/Linie als „intern“ beschriftet. Migration `009_anfrage_nur_farbname.sql` kürzt alte Schnappschüsse „Farbe · Marke Linie“ auf den Farbnamen (auch mehrfarbige Anfragen).
- **Dateien:** `server/src/module/anfragen/anfragen.service.ts`, `anfragen.mail.ts`, `server/src/seed/seed.ts`, `server/src/storage/sqlite/migrations/009_anfrage_nur_farbname.sql`, `client/src/lib/filaments.ts`, `client/src/features/katalog/ItemDetailPage.tsx`, `RequestDialog.tsx`, `client/src/features/verwaltung/OrdersAdminPage.tsx`, `client/src/features/einstellungen/stammdaten/FilamentsPanel.tsx`, Tests `anfragen.test.ts`, `produktdaten.test.ts`
- **Geprüft:** typecheck ✔ · test ✔ · Migration an Beispielzeilen im alten Format ✔ · im Browser (5181): Lehrkraft sieht nur „Weiß/Blau/Schwarz“, Anfrage gespeichert als „Weiß“, Team sieht „Weiß · Bambu Lab PETG HF“ ✔
- **Offen:** Das Feld „Material“ (z. B. PLA/PETG) wird Lehrkräften weiter angezeigt – bewusst gelassen, da es Hinweise wie „lebensmittelgeeignet“ trägt.
- **Aufgeräumt:** Testserver gestoppt, `_testdaten\farben` gelöscht.

## 2026-11-01 – Einzelne Druckteile exportieren/importieren (Session: artikelexport, Branch: feature/artikel-export)
- **Gebaut:** Teil-Export auf dem bestehenden Datenaustausch: `GET /api/admin/daten/export?artikel=id1,id2` liefert nur diese Druckteile samt Bildern, Videos, Druckdateien und den Stammdaten, auf die sie verweisen (keine Anfragestatus), Kopf `auswahl: true` (Format sonst unverändert, Version 1, ältere Pakete lesen weiter). `GET /export/artikel` liefert die Auswahlliste. Import eines Teilpakets: nur Zusammenführen, vorhandene Stammdaten werden wiederverwendet und nicht verändert, Status bleibt; Aktualisierung eines vorhandenen Druckteils und gleichnamige Teile mit anderer ID stehen als Hinweis in der Vorschau. Oberfläche: Karte „Ausgewählte Druckteile exportieren“ (Häkchen, Suche, alle/keine, Größe, max. 200) unter Export & Import; Einzel-Export-Knopf je Druckteil in der Druckteil-Verwaltung. Rechte: `daten:export` / `daten:import` wie bisher.
- **Dateien:** `server/src/module/datenaustausch/` (`export.ts`, `paket.ts`, `routes.ts`, `service.ts`, neu `abgleich.ts`), `server/test/datenaustausch.test.ts`, `client/src/features/einstellungen/ArtikelExportCard.tsx` (neu), `ExportImportPanel.tsx`, `client/src/features/verwaltung/ItemsAdminPage.tsx`, `docs/ARCHITEKTUR.md`
- **Geprüft:** typecheck ✔ · test ✔ (2 neue Tests: Teil-Export, Teil-Import/Re-Import) · im Browser (5182/3012): Auswahl/Suche/Export-Link ✔, Export eines Druckteils mit Bild + STL, Druckteil gelöscht, Teilpaket über die Import-Karte eingespielt → Druckteil mit gleicher Nummer zurück, Dateien byteidentisch (SHA-256) ✔, Handybreite ohne Querscrollen ✔. Die Datei wurde im Klicktest per Skript in das Dateifeld gelegt (kein echter Datei-Dialog).
- **Aufgeräumt:** eigener Server gestoppt, `C:\Entwicklung\_testdaten\artikelexport` und Temp-Dateien gelöscht.
## 2026-11-01 – Klicktest aller Seiten nach Umbau 3 (Session: umbau-server, Branch: feature/klicktest-fix)
- **Geprüft:** Stand `main` (c9b926a) mit eigenen Testdaten auf 5188/3018. Alle Seiten für Gast, Lehrkraft, Druck-Team und Admin in 360, 768, 1280 und 1920 px Breite (132 Aufrufe): kein Querscrollen, nichts ragt heraus, keine kaputten Bilder, keine JS- oder Serverfehler. Speichern über die Oberfläche mit Gegenprobe über die API: Anfrage stellen, Vorschlag mit Foto einreichen, Status + Notiz, Vorschlag beantworten und in Druckteil umwandeln, Druckteil anlegen/bearbeiten/veröffentlichen/löschen, Bild- und STL-Upload, Kategorien anlegen/umbenennen/löschen (benutzte → verständliche 409-Meldung), Filament leer/vorrätig, Benutzer anlegen, Rolle, sperren, Einzelrechte, Passwort setzen, Einstellungen (Domains, Bearbeitungsstand), Export + Import (Zusammenführen, Sicherung vorher). Server-Log: 0 × 5xx.
- **Behoben:** Nach dem Hochladen von Bildern/Druckdateien meldete die Seite immer „0 Dateien hochgeladen.“ (die Dateiliste ist „live“ und wurde vor der Meldung geleert; der Upload selbst klappte). Anzahl wird jetzt vorher gemerkt.
- **Dateien:** `client/src/features/verwaltung/druckteil-bearbeiten/FilePicker.tsx`
- **Offen (klein):** In den Stammdaten ist das Namensfeld am Handy (360 px) schmal, längere Namen werden im Feld abgeschnitten (bleibt bedienbar).
- **Aufgeräumt:** Testinstanz gestoppt, `_testdaten\umbau-server` und Test-Skripte gelöscht.

## 2026-11-01 – Zusammenführung Login robust + Manager mit App-Login (Hauptchat)
- **Gemergt:** `feature/login-robust` und `feature/manager-status` (ein Login für App und Manager, Karte „Server-Manager“ in den Einstellungen, kein Fehlalarm bei laufender Dev-App).
- **Nachgezogen:**
  - `client/vite.config.ts`: API-Proxy mit `xfwd: true`, damit die Login-Bremse je Gerät gilt und nicht für alle als 127.0.0.1.
  - `manager/lib/auth.mjs`: Der Notzugang nutzt dieselbe Demo-Regel wie die App (Entwicklung erlaubt Demo-Konten, `DISABLE_DEMO_ACCOUNTS`). Vorher lehnte er den Demo-Admin ab, obwohl die App ihn erlaubt.
  - Anmeldeseite: Text „Lehrkräfte kommen danach direkt in den Katalog“.
- **Geprüft:**
  - Backup vorher. typecheck ✔ · lint ✔ · test ✔.
  - Manager-Tests 69/70: Bei jedem Lauf scheitert zufällig ein anderer Zertifikat- oder Portal-Test (Windows-Zertifikatspeicher), einzeln grün. Das ist nicht durch diese Änderungen entstanden.
  - Über die WLAN-Adresse (`<IP>`): 60/60 Anfragen ✔. Admin, Druck-Team und Lehrkraft ✔, Manager nur für Admin ✔, Notzugang 127.0.0.1:5190 mit App-Admin ✔.
  - Im Browser: Admin-Login → Einstellungen → „Server-Manager öffnen“ → ohne zweite Anmeldung „Alles in Ordnung“ → „Zurück zu Mosaik³LAB“ ✔.
- **Aufgeräumt:** Worktrees `mosaik3lab-login-robust` und `mosaik3lab-manager-status` samt Branches entfernt, Sessions archiviert.

## 2026-11-01 – „Sitzung abgelaufen“ / hängende Seiten: Vite-Proxy mit Keep-Alive (Hauptchat)
- **Ursache:** Der Vite-Entwicklungs-Proxy hat für jede API-Anfrage eine neue Verbindung zu 127.0.0.1:3001 geöffnet. Unter Windows blieben dabei etwa 10–40 % der Verbindungsaufbauten hängen (`connect ETIMEDOUT 127.0.0.1:3001`). Anmeldung und Laden wirkten dadurch zufällig kaputt. Direkt auf 3001 war alles in Ordnung. Das Portal im Betrieb ist nicht betroffen, weil es den Node-Standard-Agent mit Keep-Alive nutzt.
- **Behoben:** In `client/vite.config.ts` nutzen API- und Manager-Proxy einen gemeinsamen `http.Agent({ keepAlive: true })`.
- **Geprüft:** Vorher scheiterten 9 von 90 Anfragen nacheinander. Nachher kommen 120 von 120 Anfragen über localhost, ::1 und die WLAN-Adresse durch, zusammen in 0,4 s. Admin-API, Manager über die App-Adresse und Login im Browser ✔. Bei 200 gleichzeitig geöffneten Verbindungen scheitern einzelne auch direkt auf 3001; das ist eine Windows-Grenze und für Browser mit höchstens etwa 6 Verbindungen nicht relevant.
- **Aufgeräumt:** Liegengebliebene Dev-Server der Umbau-3-Session (aus `mosaik3lab-umbau-server`) beendet und den Ordner gelöscht.

## 2026-11-01 – Startseite = Anmeldung, danach Katalog (Hauptchat)
- **Gebaut:** `/` führt ohne Anmeldung zur Anmeldeseite, angemeldet in den Katalog. Lehrkräfte kommen nach der Anmeldung in den Katalog statt zu „Meine Anfragen“. Team und Admin kommen weiter in die Verwaltung.
- **Dateien:** `client/src/App.tsx`, `client/src/features/konto/LoginPage.tsx`
- **Geprüft:** typecheck ✔ · im Browser: abgemeldet `/` → Anmeldung, Lehrkraft angemeldet → Katalog ✔

## 2026-11-01 – Zusammenführung Umbau 3 + Manager über App-Adresse (Hauptchat)
- **Gemergt:** `feature/umbau-server` (Server je Fachbereich) und `feature/manager-app` (Manager unter `/mosaik3lab/manager`).
- **Behoben:** Der Entwicklungsserver stürzte bei hart abgebrochenen Verbindungen ab (`read ECONNRESET`, z. B. Handy im WLAN). Ein Fehler-Handler je Verbindung in `client/vite.config.ts` fängt das jetzt ab.
- **Geprüft:** Vor dem Merge gesichert (`C:\Mosaik3LAB\backups\storage-2026-11-01T06-21-44`). typecheck ✔ · lint ✔ · test ✔ · Manager 66/66 ✔ · alle Admin-API-Aufrufe 200 ✔. Im Browser: `/mosaik3lab/manager` ohne App-Anmeldung → 403, als App-Admin → Manager-Anmeldung ✔.
- **Aufgeräumt:** Worktrees `mosaik3lab-umbau-server` und `mosaik3lab-manager-app` samt Branches entfernt, Session archiviert.

## 2026-11-01 – Umbau Schritt 3: Server je Fachbereich (Session: umbau-server, Branch: feature/umbau-server)
- **Gebaut:** Server-Code neu geordnet, API-Verhalten unverändert. Je Fachbereich `server/src/module/<bereich>/` mit
  `.routes.ts` (nur parsen → Service → antworten), `.service.ts` (Regeln), `.repository.ts` (SQLite): katalog, anfragen,
  vorschlaege, konten, stammdaten, einstellungen (ohne Service – keine Regeln), datenaustausch (Export, Paket lesen/prüfen,
  Import; nutzt die Repositories von Katalog/Einstellungen). Technik ohne Fachbegriffe nach `server/src/kern/` verschoben
  (db, files, lock, betrieb, auth inkl. Sitzungen, mail, uploads, rateLimit, errors, http). `SqliteRepositories.ts` (898)
  und `stammdatenImport.ts` (715) aufgeteilt; größte Datei jetzt 493 Zeilen (`datenaustausch.service.ts`), sonst ≤ 318.
  **W3:** Einzelzugriffe/Filter lesen Kindzeilen und Dateien nur für die gefundenen Datensätze (`WHERE … IN`), öffentlicher
  Katalog nur veröffentlichte Druckteile, Statusabfrage per Code, Status-/Lehrkraft-Zählungen, Übersicht, „letzter Admin“
  und Stammdaten-Verwendung per SQL; Migration `008_indizes.sql` (nur Indizes). **W9:** Seed importiert nichts mehr aus
  Routen (`createTrackingCode` im Anfragen-Service). Interfaces in `storage/repositories.ts` entfallen – `Storage` nennt
  die Repository-Klassen direkt. Migrationen bleiben unter `server/src/storage/sqlite/migrations/`.
- **Dateien:** `server/src/{module,kern}/**` (neu/verschoben), `server/src/{app.ts,storage/*,seed/seed.ts}`, Importpfade in
  `server/test/*.ts`, `server/scripts/*.ts`, `manager/test/helpers/app-db.ts` (Testinhalte unverändert), Kommentare in
  `shared/src/{anfragen,katalog}.ts`, `manager/lib/backup.mjs`; Doku: ARCHITEKTUR, README, DATENMODELL, UMBAUPLAN, CLAUDE.md.
- **Geprüft:** `node scripts/check.mjs` ✔ (typecheck, lint 0 Fehler, Tests) · Server-Tests 134/134 vorher und nachher ·
  Client 5/5 · `npm run manager:test` 60/60 · `user:create-admin`, `db:backup` (Schema 8), `mail:test` per Hand mit Testdaten.
- **Aufgeräumt:** `C:\Entwicklung\_testdaten\umbau-server` gelöscht; Worktree bleibt für den Merge.
## 2026-11-01 – Server-Manager über die App-Adresse (Session: manager-app, Branch: feature/manager-app)
- **Gebaut:** `http://<IP>/mosaik3lab/manager` ohne eigenen Port. Portal (Betrieb) und Vite-Proxy (Entwicklung, `MANAGER_PORT`,
  Standard 5190) leiten `<Pfad>/manager…` ohne Präfix an den Manager auf 127.0.0.1 weiter und setzen immer selbst den Kopf
  `X-Mosaik3lab-Manager` (Browser-Wert wird überschrieben bzw. nie an die App gegeben). Der Manager hört weiter nur auf 127.0.0.1;
  Oberfläche mit relativen Adressen + `<base href>`. Über das Netz: Schalter „Über die App-Adresse erreichbar“ (`manager.remote`,
  Standard an, in `betrieb_einstellung` → im Backup, abschaltbar nur direkt) + Admin-Sitzung der App (`GET <Pfad>/api/auth/me`,
  `user.role === 'admin'`) + Manager-Passwort. Eigene Sitzungen (Cookie `Path=<Pfad>/manager`, HttpOnly, SameSite=Strict),
  Bremse je IP (10/min, 5 Fehlversuche → 15 min; lokale Anmeldung bleibt frei), CSRF wie bisher (Token + Origin).
  Nur direkt am Server (403 + Hinweis „Nur direkt am Server möglich“): Portal/Pfad/HTTPS/Zertifikat, Ports, Netzfreigabe, der
  Schalter, Einrichten, erstes Passwort, Web-App/Portal stoppen. `server/` unverändert.
- **Dateien:** `manager/lib/remote.mjs` (neu), `manager/lib/{auth,config,portalserver}.mjs`, `manager/server.mjs`,
  `manager/runners/portal.mjs`, `manager/public/{index.html,app.js,app.css}`, `manager/test/remote.test.mjs` (neu, 6 Tests),
  `client/vite.config.ts`, `manager/README.md`, `docs/ARCHITEKTUR.md`.
- **Geprüft:** `npm run manager:test` ✔ (66) · `node scripts/check.mjs` ✔ (typecheck, lint, test) · Browser über den
  Vite-Proxy (5182/3012, Manager 5192): ohne App-Anmeldung 403-Seite → als Demo-Admin angemeldet → `/mosaik3lab/manager` →
  Manager-Passwort → Seite mit Sperrhinweisen, „Jetzt sichern“ über das Netz ✔, 375 px ohne Querscrollen ✔; direkt auf
  127.0.0.1:5192 unverändert (`<base href="/">`, keine Sperren).
- **Aufgeräumt:** Test-Server (5182/3012/5192) gestoppt, `C:\Entwicklung\_testdaten\manager-app` gelöscht.

## 2026-10-31 – Admin-Center Nacharbeiten (Session: admin-center, Branch: feature/admin-center-2)
- **Gebaut:** (1) Hinweise verschwinden, sobald die Ursache weg ist: „automatische Sicherung fehlgeschlagen“ nur noch,
  solange es danach keine erfolgreiche Sicherung gibt (auch „Jetzt sichern“); gemerkte Prüfungen (Abweichungen ≤ 1 min,
  Laufzeit/Update ≤ 10 min) werden vor dem Status aufgefrischt (`refreshStale`). (2) Standard-Adresse
  `http://<Server>/mosaik3lab`: neue Standardwerte Portal an, Pfad `/mosaik3lab`, Port 80, App intern 127.0.0.1; Karte
  „Mosaik³LAB öffnen“ zeigt die Adresse ohne Port/Schrägstrich. Bestehende Einstellungen ohne Portal-Werte bleiben
  (`keepLegacyPortal`, auch bei Übernahme alter Konfiguration und Einrichten aus Backup). Port 80 belegt → Hinweis mit
  Programm/PID, freiem Ausweich-Port und Knopf „Port … verwenden“.
- **Dateien:** `manager/lib/{config,status,services,auto}.mjs`, `manager/public/app.js`, `manager/test/auto.test.mjs`, `manager/README.md`.
- **Geprüft:** `npm run manager:test` ✔ (3 neue Tests) · `node scripts/check.mjs` ✔ · Browser auf frischer Instanz (5196,
  Probelauf, Port 80 durch den Hauptstand belegt): Standard `/mosaik3lab`, Hinweis + „Port 8080 verwenden“ → Hinweis weg, Adresse `:8080`.
- **Aufgeräumt:** `C:Entwicklung_testdatenadmin-center-2` gelöscht, Test-Manager gestoppt.

## 2026-10-31 – Admin-Center aufgeräumt (Session: admin-center, Branch: feature/admin-center)
- **Gebaut:** Server-Manager als ruhige Seite: oben **ein Satz** („Alles in Ordnung.“ / „1 Punkt braucht Aufmerksamkeit: …“)
  mit **einem Lösungsknopf**, Adresse der App, Dienste, Backup (letzte Sicherung, Jetzt sichern, Wiederherstellen), Karte
  „Update verfügbar“ nur bei Bedarf, **wenige Einstellungen** (Im Schulnetz erreichbar, Pfad, E-Mail, Backup-Ziel/Uhrzeit,
  Manager-Passwort, HTTPS eingeklappt) – je mit einem Satz „wofür“. Alles andere unter **„Erweitert“** (eingeklappt);
  nichts Funktionales entfernt, CLI unverändert. Ersteinrichtung fragt nur noch das Passwort.
  **Automatik** (`lib/auto.mjs`): Abgleich beim Start (Firewall dort nur prüfen) und nach jeder Änderung, Firewall folgt
  „Im Schulnetz erreichbar“ und Ports, Backup-Dienst startet von selbst (außer ausdrücklich gestoppt), Update alle 6 h und
  Laufzeit täglich geprüft, Abweichungen alle 10 min, Portal an sobald ein Pfad gesetzt ist, Mail-Adresse automatisch,
  Wiederherstellen stoppt/startet die Web-App selbst (`autoStop`). Probelauf-Plattform (`MOSAIK3LAB_SYSTEM_DRY_RUN`) für
  Tests ohne Firewall/UAC/Dienste/winget. Nebenbei behoben: Schalter-Darstellung (Knopf überlappte den Text), Fokusverlust
  durch das 5-s-Neuzeichnen (jetzt nur bei Änderung), Neustart-Schleife der Web-App wurde als „Alles in Ordnung“ gezeigt.
- **Dateien:** `manager/lib/auto.mjs` (neu), `manager/lib/status.mjs`, `manager/lib/reconcile.mjs`, `manager/lib/services.mjs`,
  `manager/server.mjs`, `manager/platform/index.mjs`, `manager/public/{index.html,app.js,app.css}`,
  `manager/test/auto.test.mjs` (neu), `manager/test/selftest.mjs`, `manager/README.md`.
- **Geprüft:** `npm run manager:test` ✔ (inkl. 6 neue Automatik-Tests + Selbsttest „Wiederherstellen bei laufender Web-App“) ·
  `node scripts/check.mjs` ✔ · Klicktest auf eigener Instanz (Manager 5194, App 3024, Portal 8081, Probelauf, Kopie der
  Daten) bei 1280 und 768 px: Ersteinrichtung, Anmelden, Status-Knopf „Web-App starten“, Einstellungen speichern (Pfad →
  Portal an, Netzfreigabe an/aus → Regel gesetzt/entfernt, Mail, Uhrzeit), Backup-Passwort, Jetzt sichern, Wiederherstellen
  bei laufender App, Dienst stoppen → Status-Knopf startet ihn wieder, Erweitert auf/zu + Speichern, Abgleichen,
  Nach Updates suchen · CLI `status` (Exit 0) und `doctor` (erkennt übrig gebliebene Firewall-Regel, Exit 1).
- **Aufgeräumt:** Testordner `C:\Entwicklung\_testdaten\admin-center` gelöscht, Test-Manager/-App/-Portal gestoppt.

## 2026-10-31 – Formular-Entwürfe im Browser (Session: entwuerfe, Branch: feature/entwuerfe)
- **Gebaut:** Formulare merken sich ihren Zustand automatisch im Browser, damit nach einem Neuladen (Handy wechselt
  zur Kamera, Tab im Hintergrund) nichts verloren ist. Hook `useEntwurf(key, value, apply, { ready, enabled, omit })`:
  speichert 500 ms verzögert (und sofort bei `pagehide`/Tab versteckt) unter `mosaik3lab:entwurf:<formular>:<benutzer|gast>:<id|neu>`,
  stellt beim Öffnen wieder her, löscht nach Speichern/Absenden (`clear()`) oder „Verwerfen“; nur echte Änderungen
  gegenüber dem Ausgangszustand werden gemerkt; Entwürfe > 7 Tage verfallen; jeder Speicherzugriff in try/catch.
  Hinweis-Leiste `EntwurfHinweis` „Entwurf von <Uhrzeit> wiederhergestellt“ + „Verwerfen“. Rückfrage beim Verlassen
  mit ungespeicherten Änderungen (Tab schließen/neu laden über `beforeunload`, Link-Klicks in der App per Capture-Listener,
  da `BrowserRouter` keinen Blocker hat; Zurück-Taste wird nicht abgefangen – der Entwurf bleibt aber erhalten).
  Eingesetzt in: Druckteil anlegen/bearbeiten (Bilder/Videos/Druckdateien laden dort schon sofort hoch, also kein
  Verlust), Anfrage-Dialog (öffnet sich nach Neuladen auf der Detailseite von selbst wieder), Vorschlag (Fotos werden
  erst beim Absenden hochgeladen → Hinweis „Fotos … bitte erneut auswählen“), Benutzer anlegen (Startpasswort wird nie
  gespeichert, Hinweis dazu).
- **Dateien:** `client/src/lib/entwurfSpeicher.ts`, `client/src/lib/useEntwurf.ts`, `client/src/components/EntwurfHinweis.tsx` (neu);
  `druckteil-bearbeiten/useItemForm.ts`, `ItemEditPage.tsx`, `katalog/RequestDialog.tsx`, `katalog/ItemDetailPage.tsx`,
  `vorschlaege/ProposalFormPage.tsx`, `verwaltung/UserDialogs.tsx`; Client-Tests `client/test/entwurfSpeicher.test.ts`
  (`npm test` läuft jetzt Server + Client), `package.json`, `client/package.json`.
- **Geprüft:** `node scripts/check.mjs` ✔ · Klicktest auf 5181/3011 (375 + 1280 px): ausfüllen → neu laden → Inhalt + Hinweis
  da; Verwerfen → leer, Entwurf weg; Speichern/Absenden → Entwurf weg, keine Rückfrage mehr; Link-Klick mit Änderungen → Rückfrage;
  Passwort nicht im localStorage.
- **Später möglich:** echte Navigationssperre inkl. Zurück-Taste (Umstieg auf `createBrowserRouter` + `useBlocker`);
  Stammdaten-Seite auf `useVerlassenWarnung` umstellen (hat eigenes `beforeunload`).
- **Aufgeräumt:** Server 5181/3011 gestoppt, `_testdaten/entwuerfe` gelöscht, Test-Entwürfe verworfen; Worktree bleibt für den Merge.

## 2026-10-31 – Umbau Schritt 2: Paket shared/ – Typen und Validierung einmal (Session: umbau-shared, Branch: feature/umbau-shared)
- **Gebaut:** Neues Workspace-Paket `shared/` (`@mosaik3lab/shared`, nur TypeScript + zod, kein Build; `exports "./*" → ./src/*.ts`,
  `tsx` und Vite lesen die Quellen direkt). Je Fachbereich ein Modul: `katalog`, `anfragen` (inkl. fester `STATUS_CATALOG`
  mit Erklärungstexten), `vorschlaege`, `konten` (Rollen, Rechte-Matrix), `stammdaten`, `einstellungen`, dazu `basis`
  (deutsche Fehlerkarte, `zodFieldErrors`, Bausteine). Typen per `z.infer` aus den Eingabe-Schemas.
  Server: `validation.ts` und `proposalSchemas.ts` entfallen; `domain/types.ts`, `settings.ts`, `proposals.ts`,
  `permissions.ts`, `orderStatuses.ts` importieren/re-exportieren aus `shared/` und behalten nur Server-Internes
  (Passwort-Hash, Ablagename, Prüf- und Migrationslogik). Export/Import nutzt `itemInputSchema`/`masterDataSchemas` aus `shared/`.
  Client: `lib/types.ts` nur noch Sammel-Export; `ROLE_LABELS`, `COLOR_KEYS`, `ICON_KEYS`, Status-Erklärungen und
  Vorschlags-Listen kommen aus `shared/` (Doppel in `constants.ts`/`proposals.tsx` entfallen). Formularlogik unverändert.
- **Verhalten gleich:** Tests vorher/nachher **134/134**. Fehlermeldungen alt (main) vs. neu mit 8 fehlerhaften
  Eingaben (Druckteil, Anfrage, Konto, Vorschlag, Domains, Farbrollen, Codes) Zeichen für Zeichen identisch.
- **Hinweis:** zod ist jetzt auch im Client-Bundle (≈ +60 KB roh / ≈ 15 KB gzip). Status-Symbole bleiben im Client
  (Lucide-Komponenten), fehlt eins, gilt das Symbol der Phase. `filamentLabel` gibt es weiter zweimal mit leicht
  unterschiedlicher Ausgabe (Server/Client) – bewusst nicht vereinheitlicht (wäre Verhaltensänderung).
- **Dateien:** `shared/**` (neu), `package.json` (Workspace `shared`, Lint), `server/package.json`, `client/package.json`,
  `package-lock.json`, `server/src/{app.ts,domain/*,routes/*,services/adminAccount.ts,services/stammdatenImport.ts}`,
  `client/src/lib/{types,constants}.ts`, `client/src/features/vorschlaege/proposals.tsx`, `docs/ARCHITEKTUR.md`,
  `docs/UMBAUPLAN.md`, `CLAUDE.md` (Rezept „Neues Feld hinzufügen“), `README.md`.
- **Geprüft:** typecheck Server + Client ✔ · lint ✔ (133 Hinweise statt 134) · test 134/134 ✔ · `vite build` ✔ ·
  `node scripts/check.mjs` ✔ · `npm run manager:test` ✔.
- **Aufgeräumt:** `_testdaten/umbau-shared` (Vergleichsskript) gelöscht, `client/dist` des Worktrees entfernt; Worktree bleibt für den Merge.

## 2026-10-31 – Umbau Schritt 1: Tests je Fachbereich, ESLint (Session: umbau-tests, Branch: feature/umbau-tests)
- **Gebaut:** (1) `server/scripts/{smoke,storage,export-import}-test.ts` (2.700 Z.) auf `node:test` umgestellt und nach
  Fachbereich in `server/test/*.test.ts` geteilt (katalog, anfragen, vorschlaege, konten, stammdaten, einstellungen,
  produktdaten, migration, betrieb, speicher, uebernahme, datenaustausch; jede ≤ 370 Z.), gemeinsamer Helfer
  `server/test/helfer.ts` (`startServer()` mit Temp-Ordner, `Client`, `anmelden()`, Mail-Testtransport, Speicher-Helfer).
  Jede Datei startet ihren eigenen Server und stellt den nötigen Vorlauf selbst her; Testkörper wortgleich übernommen.
  **Vorher/nachher: 134/134 Tests (+1 optional mit `MOSAIK3LAB_ECHTDATEN`), 856/856 `assert`-Aufrufe**, Testnamen identisch.
  `npm test` = `node --import tsx --test --test-reporter=dot test/*.test.ts` (Dateien laufen parallel, ~30 s statt ~50 s);
  einzeln: `cd server; node --import tsx --test test/konten.test.ts`. (2) ESLint 9 (flat config `eslint.config.mjs`):
  typescript-eslint recommended, react-hooks (rules-of-hooks, exhaustive-deps), jsx-a11y recommended; `npm run lint`,
  Schritt „lint“ in `scripts/check.mjs`. Heute verletzte Regeln auf „warn“ (134 Hinweise, Liste mit Anzahl in der Config),
  kein Autofix.
- **Dateien:** `server/test/*` (neu), `server/scripts/*-test.ts` (entfernt), `server/package.json`, `server/tsconfig.json`,
  `eslint.config.mjs` (neu), `package.json`/`package-lock.json`, `scripts/check.mjs`, `README.md`.
- **Geprüft:** `node scripts/check.mjs` ✔ (typecheck, lint, test) · `npm run manager:test` ✔.
- **Später möglich:** Warnungen abbauen und Regeln wieder auf „error“; React-Compiler-Regeln von react-hooks 7.
- **Aufgeräumt:** `_testdaten/umbau-tests` gelöscht; Worktree bleibt für den Merge.

## 2026-10-31 – Umbau Schritt 4: Riesenseiten im Frontend aufgeteilt (Session: umbau-seiten, Branch: feature/umbau-seiten)
- **Gebaut:** Reine Strukturänderung, kein Verhalten/keine Optik geändert (JSX/Klassen/Texte 1:1 verschoben).
  `verwaltung/ItemEditPage.tsx` (1.230 Z.) → Ordner `verwaltung/druckteil-bearbeiten/` (15 Dateien, größte 173 Z.): Seite,
  Hook `useItemForm`, Helfer `itemForm.ts` (inkl. lokaler Prüfung `validateLocal`), `Section`, je Abschnitt eine Komponente.
  `einstellungen/MasterDataPage.tsx` (984 Z.) → `einstellungen/stammdaten/` (9 Dateien, größte 256 Z.): Tabs-Seite, generischer
  `ListPanel`, je Liste ein Panel, Bambu-Import als eigene Datei. Zusätzlich (klare Schnitte, sonst > 400 Z.): `OrderCard.tsx` aus
  `katalog/MyOrdersPage.tsx` (486 → 297), `UserDialogs.tsx` aus `verwaltung/UsersAdminPage.tsx` (477 → 189).
  Bewusst nicht aufgeteilt (≤ 500, ein Zweck je Datei): `components/ui.tsx`, `katalog/RequestDialog.tsx`, `einstellungen/ExportImportPanel.tsx`.
- **Dateien:** obige Ordner/Dateien, `client/src/App.tsx` (2 Importpfade), `docs/ARCHITEKTUR.md`.
- **Geprüft:** typecheck ✔ · test ✔ · health ✔ (`node scripts/check.mjs 3012`). Browser auf eigener Instanz (5182/3012, Kopie der
  echten Daten): Druckteil angelegt (leeres Absenden → lokale Fehler, Abschnitt klappt auf), alle Abschnitte ausgefüllt
  (mehrfarbig, Größe, Personalisierungsfeld, Druckdauer, Hinweis, veröffentlicht), Bild + STL hochgeladen, Video-Link,
  geändert + gespeichert, neu geladen → alles da (API-Abgleich); Video/STL entfernt. Stammdaten: Kategorie, Einsatzbereich,
  Material (inkl. Doppelname-Fehler), Farbrolle (Hex, „leer“) gespeichert, Bambu-Import 1 Farbe, Anfragestatus an/aus, Tab-Tastatur.
  Benutzer: alle 4 Dialoge öffnen. Meine Anfragen (Lehrkraft): Karten + „Erneut anfragen“. Ohne Querscrollen bei 375 und 1280 px.
- **Aufgeräumt:** eigener Dev-Server gestoppt, `C:\Entwicklung\_testdaten\umbau-seiten` gelöscht. `docs/UMBAUPLAN.md`-Status
  nicht angefasst (macht der Hauptchat).

## 2026-10-31 – Zusammenführen und Aufräumen (Hauptchat)
- **Zusammengeführt:** alle Branches in `main` (zuletzt `portal-https`, `admin-sicherheit`, `import-fix`); keine offenen
  Branches/Worktrees mehr. Prüfung: typecheck ✔ · test ✔ · Manager-Tests 50/50 ✔ · Admin- und Lehrkraft-Login per API ✔ ·
  Bilder aus der Ablage ✔.
- **Server:** alle alten Node-Prozesse beendet (alter Dev-Server aus einem anderen Chat, liegengebliebene Test-Prozesse);
  Hauptstand neu gestartet über `.claude/launch.json` „mosaik3lab“ (5173/3001). Client neu gebaut (`client/dist`), damit
  auch 3001 den aktuellen Stand ausliefert.
- **Aufgeräumt:** Altdaten vor SQLite (`storage/data/*.json`, `.bak`, `storage/uploads/`) in
  `backups/altdaten-vor-sqlite-2026-10-31.zip` archiviert und aus `storage/` entfernt; ältere Sicherungen gelöscht
  (in `backups/` die letzten 3, in `storage/sicherungen/` die letzten 2 behalten); `_testdaten/` geleert;
  Entwicklungs-Reste `manager/logs/` und `manager/manager.config.json` entfernt.

## 2026-10-31 – Portal (Aufruf ohne Port unter /mosaik3lab), Basis-Pfad, optionales HTTPS (Session: portal-https, Branch: feature/portal-https)
- **Gebaut:** (1) **Basis-Pfad der App** (`BASE_PATH`, leer oder z. B. `/mosaik3lab`): Server hängt API, Dateien und Frontend darunter ein, setzt `<base href>` beim
  Ausliefern (Frontend mit relativen Adressen gebaut – ein Build für jeden Pfad), Cookie-Pfad, `/mosaik3lab` → `/mosaik3lab/`, `/` → App; Client: `BASE_PATH` aus `<base>`
  für Router-`basename`, API, Bilder/Videos/Druckdateien/Fotos, Export/Import. `trust proxy` nur für Loopback. (2) **Portal-Dienst** (`manager/lib/portalserver.mjs`,
  `runners/portal.mjs`, reines Node): Port 80 (+443), leitet `/<pfad>` an `127.0.0.1:<App-Port>` weiter (Streaming, 10 Min. Zeitlimit ohne Datenfluss,
  `X-Forwarded-*` nur vom Portal), `/` → Weiterleitung, 404-/502-Seiten; belegter Port → Meldung mit Programm/PID + Alternativen; Firewall nur Portal-Ports (alte Regeln
  werden beim Abgleichen entfernt); Linux-Unit mit `CAP_NET_BIND_SERVICE`; Portal als vierter Dienst (WinSW/systemd), Status, `doctor`, Abgleichen. (3) **HTTPS optional**
  (`portalcert.mjs`): PFX+Passwort oder PEM hinterlegen, Prüfung (gültig, Schlüssel passt, Rechnername/IP, Ablauf – Warnung 30 Tage vorher), **„Zertifikat erzeugen“**
  (5 Jahre, Rechnername + IPs; Windows `New-SelfSignedCertificate` im Benutzerspeicher und danach wieder entfernt, Linux `openssl`), Seite `/zertifikat` + Download für
  Geräte mit Kurzanleitung; Cookie `Secure`, HSTS, HTTP → 301 HTTPS; Zertifikat und alle Portal-Einstellungen in der Datenbank (Backup, Aus-Backup-Einrichten).
  (4) **W1:** Helmet setzt `upgrade-insecure-requests`/HSTS nur noch bei aktivem HTTPS; getestet über die LAN-IP. (5) Oberfläche: Abschnitt „Erreichbarkeit“ im Einstellungsdialog,
  Karte „Portal“ bei den Diensten, Portal-Zeile nur wenn eingeschaltet.
- **Dateien:** `server/src/{app,config,basePath}.ts`, `server/scripts/smoke-test.ts`; `client/{index.html,vite.config.ts}`, `client/src/lib/{basePath,api}.ts`, `main.tsx`,
  `features/{vorschlaege/proposals,einstellungen/ExportImportPanel}.tsx`; `manager/lib/{portalserver,portalcert,config,services,status,reconcile,setup}.mjs`,
  `runners/{portal,webapp}.mjs`, `platform/{common,windows,linux}.mjs`, `server.mjs`, `public/*`, `manager/test/{portal,settings-backup}.test.mjs`; Doku `manager/README.md`,
  `docs/{ARCHITEKTUR,DATENMODELL,UMBAUPLAN}.md`, `README.md`.
- **Geprüft:** Smoke-Tests (Basis-Pfad `/` und `/mosaik3lab`, Cookie-Pfad, HTTPS-Header, LAN-IP) ✔ · `portal.test.mjs` (Weiterleitung, Spoofing von X-Forwarded-*,
  40 MB Upload + 20 MB Download mit Prüfsumme, 502, belegter Port, HTTPS mit erzeugtem Zertifikat, `/zertifikat`, echte App hinter dem Portal mit Anmeldung/Bild-Upload/-Abruf,
  Zertifikat-Prüfung) ✔ · Backup → Einrichten aus Backup übernimmt Portal, Ports und Zertifikat ✔ · echter Durchlauf im Browser: gebauter Client unter `/mosaik3lab`,
  Einstellungen → Zertifikat erzeugen → HTTPS an → Portal/App starten neu, HTTP → HTTPS, HSTS ✔.
- **Aufgeräumt:** Dienste gestoppt, Test-Manager beendet, `_testdaten\portal-https` gelöscht; im Windows-Zertifikatspeicher (Benutzer) bleibt nichts zurück (geprüft: 0 Einträge).
## 2026-10-31 – Import-Fix: Rennen beim Aufräumen (Session: import-fix, Branch: feature/import-fix)
- **Ursache:** `POST /import/ausfuehren` antwortete, bevor der Temp-Ordner `ablage/.import-tmp/<id>` gelöscht war. Wer danach die Ablage las (Test, Backup), konnte den verschwindenden Ordner treffen (`ENOENT scandir`).
- **Behoben:** erst aufräumen, dann antworten; Löschen mit `maxRetries` (Windows-Dateisperren); Aufräumfehler werden geloggt statt den Import zu kippen.
- **Dateien:** `server/src/routes/daten.ts`.
- **Geprüft:** `export-import-test.ts` 20× hintereinander grün, `node scripts/check.mjs` grün.

## 2026-10-31 – Erstes Admin-Konto, Sitzungen beenden, robuste Sperrdatei (Session: admin-sicherheit, Branch: feature/admin-sicherheit)
- **Gebaut:** (K3) App-Skript `npm run --silent user:create-admin -w server -- --email … --name …` (Passwort nur über `M3L_ADMIN_PASSWORD` oder stdin, Regeln wie in der App); Einrichten-Schritt „Admin-Konto anlegen“ im Manager (übersprungen bei „Aus Backup“ oder wenn schon ein Admin existiert); `doctor` warnt ohne aktiven Admin. (W2) Migration 007: `sitzung.benutzer_id`; Passwortwechsel beendet alle anderen Sitzungen, Reset durch den Admin und Sperren alle Sitzungen des Kontos. (W15) Sperrdatei enthält „PID Systemstart“; nach einem Rechnerneustart gilt eine Sperre mit wiederverwendeter PID als veraltet (App-Start und Wiederherstellung).
- **Dateien:** server/src/services/adminAccount.ts, server/scripts/create-admin.ts, server/src/storage/lock.ts (+index.ts), migrations/007_sitzung_benutzer.sql, SqliteRepositories.ts/repositories.ts, routes/auth.ts, routes/users.ts, manager/lib/admin.mjs, manager/lib/setup.mjs, status.mjs, backup.mjs, manager/public/index.html + app.js, Tests (smoke, storage, manager/test/admin.test.mjs), README.
- **Geprüft:** typecheck ✔ · test ✔ · manager:test ✔.
- **Aufgeräumt:** Testdaten `_testdaten/admin-sicherheit` gelöscht.

## 2026-10-31 – Alle Einstellungen in der Datenbank, verschlüsselte Backups, Abgleichen, Einrichten aus Backup (Session: einstellungen-db, Branch: feature/einstellungen-db)
- **Gebaut:** (1) Migration 006 `betrieb_einstellung` (Bereiche `betrieb`/`mail`/`manager`, `geheim`-Flag): Ports, Netzfreigabe, Ordner,
  Backup-Plan, Update-Quelle/Git-Pfad, **Mail inkl. SMTP-Passwort**, **Manager-Passwort-Hash**, **Session-Geheimnis** stehen jetzt in der
  Datenbank – ein Backup (DB + Ablage) rekonstruiert alles. Außerhalb nur die Startdatei `<Wurzel>/mosaik3lab.json` `{ dataDir,
  managerPort }`. (2) App liest Mail-Konfiguration und Session-Geheimnis aus der Datenbank (`MAIL_CONFIG_FILE`/`SESSION_SECRET`
  entfallen), übernimmt `config/mail.json`, `data/.session-secret` und die Mailfelder aus `settings.json` einmalig (Dateien → `.bak`).
  (3) Manager liest/schreibt die Tabelle direkt über `node:sqlite` (kurze Transaktionen, WAL, busy_timeout, Neuladen bei Änderung
  durch andere Prozesse), übernimmt die alte `manager.config.json` einmalig. (4) Sicherungen mit **Backup-Passwort**
  (AES-256-GCM, scrypt, je Datei `.enc`, Passwortprobe in `backup.json`; Passwort in `backup.key`, bei neuer Einrichtung erzeugt und
  einmalig angezeigt); falsches Passwort wird vor jeder Änderung abgelehnt. (5) **Abgleichen** (`reconcile`, Knopf/CLI/nach
  Wiederherstellen/`doctor`): Manager-Port, Ordner (mit Rückfrage bei unpassenden), Port, Firewall-Regel, Dienste, Web-App-Neustart.
  (6) **Aus Backup einrichten** (`setup --from-backup`, Dialog „Aus Backup einrichten“): alle Werte aus der Sicherung, Rückfrage bei
  abweichenden Ordnern, `--system-dry-run` für Tests. (7) Oberfläche: Backup-Passwort, Abgleichen, Passwortabfrage beim Wiederherstellen.
- **Dateien:** `server/src/storage/sqlite/{betrieb.ts,migrations/006_…sql}`, `server/src/services/{mailConfig,mailer,proposalMail}.ts`,
  `server/src/{app,config}.ts`, `routes/{orders,proposals,settings}.ts`, `server/scripts/{mail-test,smoke-test}.ts`;
  `manager/lib/{settingsdb,backupcrypto,reconcile}.mjs` (neu), `config`, `backup`, `mail`, `setup`, `status`, `manager/{cli,server}.mjs`,
  `runners/webapp.mjs`, `public/*`, `manager/test/{settings-backup,settings-migration}.test.mjs` + `helpers/app-db.ts`;
  Doku `manager/README.md`, `docs/{DATENMODELL,ARCHITEKTUR}.md`, `README.md`, `CLAUDE.md`, `.gitignore`.
- **Geprüft:** `check.mjs` (typecheck + test) ✔ · `manager:test` ✔ · neue Tests: Einstellungen ändern → verschlüsseltes Backup (kein
  Klartext, falsches Passwort abgelehnt) → frische Einrichtung „aus Backup“ → Ports, Netzfreigabe, Ordner, Mail inkl. Passwort,
  Manager-Passwort, Domains/Status-Schalter, Ablagedatei identisch; Firewall/Dienste nur angezeigt; Migration der Altdateien (Manager
  und App); Rückfrage bei unpassenden Ordnern · Oberfläche im Browser (Backup-Passwort, Abgleichen, Backup) ✔. Keine echten
  Dienste/Firewall/winget. Nicht getestet: echter Umzug auf anderen Rechner, Linux-Wege.
- **Nachtrag (Präzisierung des Nutzers + Bewertung):** (a) **Sicherung = eine Datei** `.m3lbackup` (Kopf + tar mit Manifest/SHA-256, ganze Datei optional AES-256-GCM), zwei Arten **Daten & Einstellungen** (Standard, täglich) und **Komplett** (mit Ablage, eigener Zeitplan/Anzahl); `lib/{tar,backup,backupcrypto}.mjs`, UI: zwei Knöpfe, Art/Schloss in der Liste, Zeitplan der Komplett-Sicherung in den Einstellungen. (b) **Leeres System:** „Aus Backup einrichten“ braucht nur Datei (+ Passwort), alles andere aus der Sicherung, Rückfrage nur bei unpassenden Ordnern (mit Vorschlag); neuere Schema-Version der Sicherung wird abgelehnt. (c) **Ohne Dateien:** Platzhalter „Datei nicht vorhanden“ (Bilder/Fotos, Header `X-Datei-Fehlt`), `doctor`-Hinweis, „Fehlende Dateien holen“ (`backup fill-files`, nur Fehlendes, SHA-256). (d) **K4/K5** `lib/transfer.mjs`: „Datenordner ändern“ und „Einrichten mit vorhandenen Daten“ übertragen jetzt Datenbank (db:backup) + Dateien + Standard-Ablage und vergleichen Zeilen/Dateien. (e) **W14** Testmail ohne Shell (Argumentliste, `node --import tsx scripts/mail-test.ts`) + strenge Adressprüfung; auch `db:backup` ohne Shell. (f) **W4** verpasste Sicherungen werden nachgeholt, Wiederholung nach 15 Min., Warnung im Status bei Fehlschlag (Mail bei Fehlschlag: nicht umgesetzt).
- **Aufgeräumt:** Test-Manager gestoppt, `_testdaten\einstellungen-db` und Testordner unter `server-manager` entfernt.

## 2026-10-31 – UI-Feinschliff aus dem Abnahmetest (Session: ui-feinschliff, Branch: feature/ui-feinschliff)
- **Gebaut (nur `client/`):** M1 Knöpfe dürfen umbrechen (`buttonClass`: kein `nowrap`, `max-w-full`); M2 Katalog-Filter bei 768 px: Suche eigene Zeile, Auswahlfelder nebeneinander (Zeile erst ab xl);
  N1 Schalter mit 64×44-Trefferfläche (Optik unverändert), Namen-Links in Druckteil-Liste/Meine Anfragen, Entfernen-Knöpfe der Listen (44 px), Logo-Link;
  N2 „Kein Zugriff“ mit `h1` (`EmptyState.headingLevel`); N3 `--color-stone-500` dunkler (≥ 4,5:1 auch auf der Seitenleiste), Zwischenüberschrift/Fußnote der Seitenleiste dunkler, Anmelde-Symbol → beschriftete Schaltfläche „Anmelden“ (≥ 44 px).
- **Dateien:** `components/ui.tsx`, `Layout.tsx`, `ListEditor.tsx`, `StatusPages.tsx`, `index.css`, `CatalogPage.tsx`, `ItemsAdminPage.tsx`, `MyOrdersPage.tsx`.
- **Geprüft:** typecheck ✔ · test ✔ · Messung per JS (Rollen × 375/768/1280/1920): kein horizontales Scrollen, genau eine `h1`, kein Text unter Kontrast-Grenze; übrig nur Checkbox/Radio (in großer beschrifteter Zeile) und ein Fließtext-Link.
- **Aufgeräumt:** Server 5184/3014 gestoppt.

## 2026-10-31 – Texte vereinheitlichen + klar gerahmte Oberfläche (Session: texte-ui, Branch: feature/texte-ui)
- **Gebaut:** (1) **Begriffe:** Oberbegriff „Druckteil“, Titel/Werbetexte „Hilfs- und Lehrmittel“, „Anfrage“ statt „Bestellung“
  (Oberfläche, Fehlermeldungen, Rechte-Texte, Mail, README, ARCHITEKTUR, Seed); Glossar in `docs/ARCHITEKTUR.md`.
  (2) **Feld „Art“** (Hilfsmittel · Lehrmittel · beides) am Druckteil: Migration `004_artikel_art.sql`, `Item.kind`, Editor-Feld,
  Katalogfilter „Alle Arten“ (`GET /api/items?kind=`), Anzeige in Detail/Verwaltung, Export/Import, Demo-Daten, Smoke-Test.
  (3) **UI-Bausteine** in `client/src/components/ui.tsx`: `Panel` (Titel, Beschreibung, Aktionen, Fußleiste, Ton „danger“),
  `ActionBar` (primäre Aktion eindeutig), `DangerZone`, `FormSection` (fieldset), `Stack`; umgestellt: Einstellungen,
  Vorschlagsformular (4 nummerierte Panels), Benutzer, Export/Import, Sichtbarkeit im Editor, Löschdialog, Anfragen-Filter.
  (4) **Fehler behoben:** Benutzer-Seite bei 1280 px zerquetscht; waagerechtes Scrollen in „Anfragen“ bei 375 px (`sr-only` im
  Scroller ohne `relative`); Druckteil-Liste bis xl gestapelt; kleine Buttons jetzt ≥ 44 px.
- **Nachtrag (Handy-Test):** deutsche Farbnamen der Bambu-Palette (`GERMAN_COLOR_NAMES`, Migration `005_farbnamen_deutsch.sql` benennt nur noch englische Standardnamen um, auch gespeicherte Farbtexte älterer Anfragen; IDs unverändert, Name im Filamente-Editor änderbar);
  Übersicht auf dem Handy 2-spaltig/kompakt; untere Navigation: Verwaltung mit Schraubenschlüssel statt gleichem Symbol, „Vorschläge“ direkt erreichbar, Plakette mit Zahl neuer Vorschläge (auch im Menü); lange Seitenkopf-Texte auf dem Handy gekürzt (`PageHeader.shortDescription`). „Klasse doppelt“ nicht reproduzierbar (Kopfzeile + Detailzeile zeigen sie je einmal).
- **Dateien:** `client/src/components/ui.tsx`, Seiten unter `client/src/features/*`, `server/src/domain/types.ts`, `validation.ts`,
  `routes/items.ts`, `storage/sqlite/SqliteRepositories.ts`, `migrations/004_artikel_art.sql`, `services/stammdatenImport.ts`,
  Seed, README, ARCHITEKTUR.
- **Checkliste:** Daten (Migration additiv, Standard „hilfsmittel“, alte Exportpakete importierbar) · Sicherheit (Art per zod-Enum
  validiert, Schreibrecht `catalog:manage`) · Tests (Smoke-Test Art/Filter) · Barrierefreiheit (Überschriften je Panel,
  fieldset/legend, Klickflächen ≥ 44 px, kein horizontales Scrollen 375–1920).
- **Geprüft:** typecheck ✔ · test ✔ · Browser 375/1280 je Rolle ✔ (Screenshots `_testdaten\texte-ui\screens`).
- **Aufgeräumt:** Dev-Server 5184/3014 gestoppt; Screenshots bleiben bis zur Prüfung liegen.
- **Hinweis Hauptchat:** „Klasse doppelt“ ist kein Anzeigefehler – Anfrage …-0006 hat im Feld `klasse` den Wert
  „Klasse 3bKlasse 3b“ gespeichert (Eingabe so übernommen).

## 2026-10-31 – Manager: Git-Suche, Update-Sicherheit mit Datenbank, Laufzeit-Karte (Session: manager-updates, Branch: feature/manager-updates)
- **Gebaut:** (1) `git` wird zuverlässig gefunden (gemerkter Pfad `update.gitPath` → PATH → Standardorte), klare Meldung samt
  Installationsbefehl statt leerer Fehlermeldung; `doctor` und Einrichtung prüfen Git (`"installGit": true` installiert es
  per winget/apt). (2) Update-Rollback spielt die Datenbank aus der Sicherung vor dem Update zurück, wenn sich das Schema
  geändert hat; Version mit niedrigerem Schema als die Datenbank wird verweigert (Downgrade). (3) Karte „Laufzeit“:
  Node.js (vs. aktuelle LTS, offline → unbekannt), Git, WinSW je Zeile Ampel + „Aktualisieren“; nur auf Knopfdruck, Ablauf
  Sicherung → Dienste stoppen → winget/apt → starten → Health-Check, bei Fehler Hinweis zum Zurückgehen; `npm audit` als
  Info; CLI `runtime status|update <node|git|wrapper> [--dry-run]`; `doctor` zeigt die Laufzeit. (4) Kommentar/Doku zu den
  Standardpfaden (`C:\Mosaik3LAB\…`) angeglichen.
- **Dateien:** `manager/lib/{git,schema,runtime}.mjs` (neu), `update.mjs`, `setup.mjs`, `status.mjs`, `config.mjs`,
  `manager/platform/{common,windows,linux}.mjs`, `manager/runners/runtime.mjs` (neu), `server.mjs`, `cli.mjs`,
  `manager/public/{index.html,app.js,app.css}`, `manager/test/updates.test.mjs` (neu), `manager/README.md`.
- **Geprüft:** Unit-Tests (Git ohne PATH, Laufzeit-Ablauf mit Attrappen, Update mit Migration + Rollback + Downgrade mit
  echter Datenbank/Sicherung) ✔ · End-to-End mit Einrichtung in `_testdaten` (Port 3021): Git ohne PATH gefunden ✔, gutes
  Update mit Migration ✔, kaputtes Update mit Migration → alte Version, Schema 5→4, Daten unverändert ✔ · Karte im Browser ✔ ·
  `runtime update … --dry-run`. Keine echten winget/apt-Aufrufe. Linux-Wege (apt) und Wrapper-Tausch **ungetestet**.
- **Aufgeräumt:** Test-Webapp gestoppt, `_testdaten\manager-updates` gelöscht, temporäre Branches nur im Testklon (mit gelöscht).
- **Merge (Hauptchat):** texte-ui + manager-updates in `main`, vorher Sicherung `backups/storage-2026-10-31T16-11-20`.

## 2026-10-31 – Meine Anfragen übersichtlich + „Erneut anfragen“ (Session: meine-bestellungen, Branch: feature/meine-bestellungen)
- **Gebaut:** `MyOrdersPage` neu: jede Anfrage als gerahmte Karte (Bild, Name, Nummer, Datum, Menge, Klasse, Größe, Farbe je
  Bereich mit Farbfeld, Personalisierung, Wünsche), Filter Offen/Erledigt/Alle (nur bei eingeschalteter Statusanzeige,
  Status/Fortschritt/Verlauf bleiben daran gebunden), Suche, neueste zuerst, leere Zustände mit Hinweis, große Klickflächen.
  Knopf „Erneut anfragen“ je Karte (angemeldete Lehrkraft): `GET /api/orders/:id/vorlage` (nur eigene Anfrage) liefert die
  geprüfte Vorbelegung, `RequestDialog` öffnet vorausgefüllt (alles änderbar) mit Hinweisfeld für nicht mehr gültige Angaben;
  nicht mehr veröffentlichtes Hilfsmittel → Hinweis auf der Seite. Neue Anfrage = neuer Datensatz/Nummer, optional
  `repeatOf` → Migration `003_anfrage_wiederholung.sql` (`anfrage.wiederholt_von`).
- **Dateien:** `client/src/features/katalog/MyOrdersPage.tsx`, `RequestDialog.tsx`, `client/src/lib/types.ts`,
  `server/src/routes/orders.ts`, `validation.ts`, `domain/types.ts`, `storage/sqlite/SqliteRepositories.ts`,
  `migrations/003_anfrage_wiederholung.sql`, `server/scripts/smoke-test.ts`, Docs (ARCHITEKTUR, DATENMODELL).
- **Checkliste:** Sicherheit (Vorlage nur für eigene Anfrage, `repeatOf` nur bei eigener, normale Validierung beim Anlegen) ·
  Daten (Migration additiv, rückwärtskompatibel) · Tests (Vorlage fremd/Gast/Team, neue Nummer, leere Farbe → Hinweis) ·
  Barrierefreiheit (Tabs/Suche beschriftet, Knopf mit Artikel+Nummer im Namen, 48 px Flächen).
- **Geprüft:** typecheck ✔ · test ✔ (92 + 11) · im Browser (Port 5182, schmale Ansicht) ✔: Karte, Vorbelegung, Absenden → neue Nummer.
- **Aufgeräumt:** Server 5182/3012 gestoppt, `_testdaten\meine-bestellungen` gelöscht.

## 2026-10-31 – Export & Import der Stammdaten (Session: export-import, Branch: feature/export-import)
- **Gebaut:** Administration kann Katalog, Stammdaten (Kategorien, Einsatzbereiche, Materialien, Farbrollen inkl. vorrätig, Bestellstatus an/aus), alle Artikel
  (Farbbereiche, Personalisierungsfelder, Preis, Videolinks) und alle Dateien (Bilder, Videos, Druckdateien als Base64, mit Rolle, Name, MIME, Größe, SHA-256)
  als eine Datei `mosaik3lab-stammdaten-<Datum>.json` exportieren („mit/ohne Dateien“, Größenanzeige) und importieren: Vorschau (neu/geändert/gleich/übersprungen),
  Modus „zusammenführen“ oder „ersetzen“ (Häkchen + Wort ERSETZEN), vorher automatische DB-Sicherung, alles in einer Transaktion, Dateien erst in den Temp-Bereich
  der Ablage, dann verschoben; Fehler = alles zurück. Prüfung von Format/Version, SHA-256 und Größe jeder Datei, Typ/Magic Bytes wie bei Uploads, Größenlimit
  (`IMPORT_MAX_MB`, Standard 1024), neue IDs/Nummern bei Kollision, Verweise (Farbrollen) umgeschrieben. Streaming: nie mehr als eine Datei im Speicher.
  Rechte `daten:export` / `daten:import` (nur Admin). Oberfläche: Verwaltung → Stammdaten → „Export & Import“.
- **Dateien:** `server/src/services/stammdatenExport.ts`, `stammdatenImport.ts`, `routes/daten.ts`, `scripts/export-import-test.ts` (neu); `domain/permissions.ts`,
  `config.ts`, `app.ts`, `storage/{index,repositories}.ts`, `storage/sqlite/SqliteRepositories.ts` (`load`/`read` öffentlich), `package.json` (Test); Client:
  `features/einstellungen/ExportImportPanel.tsx` (neu), `MasterDataPage.tsx` (eine Zeile), `lib/types.ts`; `docs/ARCHITEKTUR.md`, `README.md`.
- **Profi-Checkliste:** Sicherheit ✔ (Rechte im Backend, Zod-Prüfung, keine Konten/Geheimnisse im Paket, Rate-Limit, Pfade nur über FileStore, Uploadregeln) ·
  Daten ✔ (Sicherung vorher, Transaktion, Rückabwicklung, wiederholbar ohne Dubletten) · Stabilität ✔ (abgeschnittene/manipulierte Dateien, zu große Datei 413, Nummernkonflikte) ·
  Tests ✔ (10 Tests inkl. Rundreise mit SHA-Vergleich, Manipulation, Rechte, Rollback) + Klicktest Desktop/Handy · Barrierefreiheit ✔ (Labels, Fieldset/Legende, aria-live, Tabelle mit Überschriften) · Doku ✔.
- **Geprüft:** typecheck ✔ · test ✔ · im Browser ✔ (Vorschau, Ersetzen-Bestätigung, Import, mobile Ansicht).
- **Aufgeräumt:** eigener Server (5183/3013) gestoppt, Testdaten `_testdaten\export-import` entfernt.
- **Merge (Hauptchat):** Welle 2 + Export/Import in `main`, vorher Sicherung `backups/storage-2026-10-31T15-22-33`.

## 2026-10-31 – Vorschläge der Lehrkräfte „Etwas vorschlagen“ (Session: vorschlaege, Branch: feature/vorschlaege)
- **Gebaut:** Lehrkräfte reichen Vorschläge für fehlende Hilfsmittel ein (Titel, Beschreibung, Einsatz, bis 5 Links,
  bis 5 Fotos, Menge, Dringlichkeit, Datenschutz-Hinweis + Bestätigung „keine Namen/Diagnosen/Kinderfotos“) und sehen
  Status und Antwort unter „Meine Vorschläge“. Druck-Team/Admin: eigene Seite **Verwaltung → Vorschläge** (Filter, Suche,
  Status, Antwort, Fotos, Links) und Knopf **„In Produkt umwandeln“** → Artikel-Entwurf (unveröffentlicht, Fotos als
  Artikelbilder kopiert, Verknüpfung Vorschlag ↔ Artikel, öffnet die Hilfsmittel-Bearbeitung; nur einmal möglich).
  Neue Vorschläge lösen die Bestell-Mail an die Empfänger aus `mail.json` aus. Rechte `vorschlaege:eigene/sehen/bearbeiten/umwandeln`.
  Einstiege: „Etwas vorschlagen“ im Katalog-Kopf, „Nicht gefunden? Vorschlag machen“ bei leerer Suche, Knopf in „Meine Anfragen“.
- **Dateien:** `server/src/storage/sqlite/migrations/002_vorschlag.sql`, `…/SqliteProposalRepository.ts`, `domain/proposals.ts`,
  `proposalSchemas.ts`, `routes/proposals.ts`, `services/proposalMail.ts` (neu); `domain/permissions.ts`, `storage/{index,repositories}.ts`,
  `app.ts`, `scripts/smoke-test.ts`; Client: `features/vorschlaege/*`, `features/verwaltung/ProposalsAdminPage.tsx` (neu), `App.tsx`,
  `components/Layout.tsx`, `lib/types.ts`, `features/katalog/{CatalogPage,MyOrdersPage}.tsx` (je nur Knopf/Link); `docs/{ARCHITEKTUR,DATENMODELL}.md`.
- **Profi-Checkliste:** Sicherheit ✔ (Rechte im Backend, Zod-Validierung, Links nur http/https, Fotos per Magic Bytes, Rate-Limit 15/h,
  Foto-Auslieferung nur Eigentümer/Team, Links in Mails nur als Text) · Daten ✔ (Migration 002 additiv, automatische Sicherung vorher, Vorschlag
  überlebt Löschen von Lehrkraft/Artikel) · Stabilität ✔ (halb fertige Einreichung/Umwandlung wird zurückgerollt) · Tests ✔ (+9 Smoke-Tests) ·
  Barrierefreiheit ✔ (Labels, Fehlermeldungen mit role=alert, Tastaturbedienung, Alt-Texte) · Doku ✔.
- **Geprüft:** typecheck ✔ · test ✔ · im Browser ✔ (Lehrkraft: Formular inkl. Validierung, Einreichen; Team: Liste, Umwandeln → Bearbeitung).
- **Aufgeräumt:** eigener Server (5181/3011) gestoppt, Testdaten `_testdaten\vorschlaege` entfernt.
- **Offen/Hinweis:** Lehrkraft erhält keine Mail bei Statusänderung (nicht gefordert). Zusätzliches Recht `vorschlaege:eigene` für Lehrkräfte.

## 2026-10-31 – Datenmodell: SQLite statt JSON, Dateiablage, Übernahme der Altdaten (Session: datenmodell, Branch: feature/datenmodell)
- **Gebaut:** Speicherschicht auf **SQLite** (`node:sqlite`, keine npm-Pakete) nach `docs/DATENMODELL.md`: Schema
  `migrations/001_grundschema.sql` (22 Tabellen, Fremdschlüssel, WAL, `schema_version`), Migrationslauf beim Start
  mit automatischer Sicherung vorher (`<STORAGE_DIR>/sicherungen/`). Technische IDs UUID v7 (`domain/ids.ts`),
  Nummernkreise `ANF-JJJJ-NNNN` / `ART-NNNN` / `VOR-JJJJ-NNNN` (`domain/objekttypen.ts`), alte `M3L-…` bleiben.
  Tabelle `datei` für alle Dateien, Ablage `<ablage>/<objekttyp>/<objekt-id>/<rolle>/<datei-id>.<endung>`
  (nur relativer Pfad in der DB), Löschen entfernt Dateien mit (erst DB, dann Datei), Auslieferung nur über die API.
  Repositories hinter den bestehenden Schnittstellen; Routen nur bei Datei-Uploads/-Auslieferung angepasst.
  **Plug & Play:** DB, Tabellen, Ablage entstehen beim Start; **einmalige Übernahme** der JSON-Dateien und Uploads
  (idempotent, Anzahl + SHA-256 geprüft, alles oder nichts, Bericht im Log und in `einstellung` „json_uebernahme“;
  JSON und alte Ablage bleiben liegen). `npm run db:backup -w server -- --ziel <datei> [--quelle <db>]`
  (VACUUM INTO, eine Zeile, Exit 0/1), `/api/health` liefert `db { vorhanden, schemaVersion, groesseBytes }`.
  Server-Manager angeschlossen (`backup.mjs`: db:backup mit `--quelle`, Ablage immer gesichert; `status.mjs`: DB-Status).
  Pfade in Verwaltung → Einstellungen nur noch lesend (`PUT /api/admin/settings/paths` entfernt, Vorgabe CLAUDE.md).
  Node-Mindestversion 24 (`engines`, README).
- **Echte Daten (Kopie):** 3 Benutzer, 6 Lehrkräfte, 11 Hilfsmittel (ART-0001…0011), 7 Anfragen, 13 Statuseinträge,
  2 Bilder (SHA-256 geprüft), 7 Kategorien, 6 Einsatzbereiche, 5 Materialien, 16 Filamente, 2 Sitzungen – alle 1:1,
  keine Hinweise. Bild-URLs unverändert.
- **Dateien:** `server/src/storage/{index,files,repositories}.ts`, `server/src/storage/sqlite/*` (neu),
  `server/src/storage/json/legacyJson.ts` (neu; `JsonFile.ts`, `json/JsonRepositories.ts` entfernt),
  `server/src/domain/{ids,objekttypen}.ts` (neu), `server/src/domain/{settings,types}.ts`, `server/src/{app,config,bootstrapConfig,validation}.ts`,
  `server/src/routes/{items,misc,settings,auth,orders,users}.ts`, `server/src/seed/seed.ts`, `server/src/services/mailer.ts`,
  `server/scripts/{db-backup,storage-test}.ts` (neu), `server/scripts/{backup,reset-data,smoke-test}.ts`,
  `client/src/features/einstellungen/SettingsPage.tsx`, `client/src/lib/types.ts`, `manager/lib/{backup,status}.mjs`,
  `package.json` (alle drei), `README.md`, `docs/{ARCHITEKTUR,DATENMODELL}.md`.
- **Geprüft:** typecheck ✔ · test ✔ (Smoke 91 + Speicher 10, mit echten Daten 11) · manager:test ✔ 16 · im Browser
  ✔ (Desktop + Handy: Katalog mit Bildern, Bestellungen, Hilfsmittel, Lehrkräfte, Einstellungen; neue Anfrage → ANF-2026-0001) ·
  Manager-Sicherung mit laufender App: DB-Kopie vollständig (inkl. WAL), integrity_check ok.
- **Nachtrag Ablageordner nur im Server-Manager:** Manager-Einstellung „Ablageordner“ (Standard `C:\Mosaik3LAB\ablage` /
  `/var/lib/mosaik3lab/ablage`, Arbeitskopie `<Datenordner>/ablage`) wird immer als `ABLAGE_DIR` übergeben; Ändern nur bei
  gestoppter Web-App, Prüfung anlegbar/beschreibbar/≥ 200 MB frei, optional „Dateien kopieren“ (alter Ordner bleibt),
  sonst deutlicher Hinweis. `doctor`: Ablage-Zustand + Waisen-Prüfung gegen Tabelle `datei`. App: frühere Pfade aus
  `mosaik3lab.config.json` (dort lagen sie, nicht in `settings.json`) sind Quelle der Übernahme, danach wird die Datei
  gesichert und entfernt. Dateien: `manager/lib/{config,status}.mjs`, `manager/runners/webapp.mjs`, `manager/server.mjs`
  (`saveSettings`), `manager/public/{index.html,app.js}`, `manager/test/{manager.test,selftest}.mjs`, `manager/README.md`,
  `server/src/{app,bootstrapConfig}.ts`, `server/scripts/storage-test.ts`, Doku. manager:test ✔ 17.
- **Offen:** Tabelle `vorschlag` (Welle 2); CLAUDE.md nennt noch `ablage\bilder\…` als installierte Unterordner.
- **Aufgeräumt:** Testserver 5181/3011 gestoppt, `C:\Entwicklung\_testdaten\datenmodell` und `…\datenmodell-backups` gelöscht,
  Scratchpad-Hilfsskripte gelöscht. Original-`storage/` des Hauptstands nur gelesen (kopiert), nie verändert.

## 2026-10-31 – Produktdaten: Preis, Mehrfarbig, Personalisierung, Videos, Bearbeitungsseite (Session: produktdaten, Branch: feature/produktdaten)
- **Gebaut:** Druckteile haben jetzt einen optionalen **Preis** (freier Text), **Farbbereiche** (1..8 benannte
  Bereiche mit eigenen erlaubten Farben; einfarbig = ein Bereich „Farbe“), **Personalisierungsfelder** (Text/Zahl/
  Auswahl, Pflicht, max. Länge, Hinweis – serverseitig geprüft) und **Videos** (Upload MP4/WebM bis 50 MB mit
  Magic-Byte-Prüfung oder http(s)-Link, max. 4; Anzeige mit `<video controls>` ohne Autoplay). Anfrageformular:
  Farbauswahl je Bereich, Personalisierungsfelder mit Datenschutzhinweis. Bestellung speichert `colorChoices` und
  `personalization` (Admin sieht „Farbe Griff“, „Beschriftung …“); `color` bleibt lesbarer Gesamttext (für Liste,
  Suche, Mail). Bearbeitungsseite in klar gerahmte, **einklappbare Abschnitte** (Grunddaten, Farben & Bereiche,
  Bilder & Videos, Personalisierung, Material & Druck, Druckdateien, Sicherheit & Hinweise) mit Kurzinfo im Kopf;
  Abschnitte mit Fehlern klappen auf. Produktseite blendet leere Angaben aus (Preis, Beschreibung,
  Materialinfos, Farben, Personalisierung, Videos); die Beschreibung wiederholt nicht mehr die Kurzbeschreibung.
  Zentrale Farbauswahl-Hilfe `client/src/lib/colors.ts` (`itemColorAreas`) – dort lässt sich „nur verfügbare
  Farben“ einhängen. Demo-Lineal ist zweifarbig mit Preis und Beschriftungsfeld.
- **Migration:** `seed/migrateProductData.ts` (bei jedem Start, nur ergänzend): Hilfsmittel → ein Bereich „Farbe“
  mit den bisherigen Farben, Preis leer, keine Felder/Videos; Anfragen → `colorChoices` aus bisheriger Farbe,
  `personalization` leer. An Kopie von `storage/data` getestet: 11 Hilfsmittel, 7 Anfragen ohne Verlust ergänzt.
- **Dateien:** `server/src/domain/types.ts`, `server/src/validation.ts`, `server/src/routes/{items,orders,misc}.ts`,
  `server/src/uploads.ts`, `server/src/storage/files.ts`, `server/src/app.ts`, `server/src/seed/{seed,demoData,migrateProductData}.ts`,
  `server/scripts/smoke-test.ts`, `client/src/lib/{types,api,colors}.ts`,
  `client/src/features/verwaltung/{ItemEditPage,OrdersAdminPage}.tsx`,
  `client/src/features/katalog/{ItemDetailPage,RequestDialog,MyOrdersPage}.tsx`, `docs/ARCHITEKTUR.md`.
- **Geprüft:** typecheck ✔ · test ✔ (72, davon 6 neu) · im Browser ✔ (Bearbeiten, Produktseite, Anfrage, Admin, Handy 375 px).
- **Nachtrag (nach Merge von main):** Rechte-Matrix übernommen – Videos fallen unter `catalog:manage` (Beschreibung
  ergänzt), Entwurfs-Videos sieht `catalog:view`. Videos liegen jetzt in einem **eigenen Ablageordner** `videosDir`
  (Standard `<storage>/uploads/videos`, Installation `ablage\videos`), einstellbar unter Einstellungen → Ablagepfade,
  wird beim Umzug mitkopiert; Speicherung weiter über `FileStore` (keine Sonderwege). Zusätzliche Dateien:
  `server/src/{bootstrapConfig,config,index}.ts`, `server/src/storage/index.ts`, `server/src/routes/settings.ts`,
  `server/src/domain/permissions.ts` (nur Beschreibung), `client/src/features/einstellungen/SettingsPage.tsx`.
  Geprüft: typecheck ✔ · test ✔ (79 gesamt) · Migration an Kopie in `C:\Entwicklung\_testdaten\produktdaten` ✔ ·
  Browser ✔ (Video-Upload, Player ohne Autoplay, Range 206, Ablagepfad „Videos“ in den Einstellungen).
- **Nachtrag 2 (Merge Status & Filamente):** Farbbereiche zeigen je Bereich nur vorrätige Farben (`lib/colors.ts`
  nutzt `availableFilaments` aus `lib/filaments.ts`); ist ein Bereich ganz leer, nennt das Anfrageformular ihn
  („Für „Griff“ ist gerade keine Farbe vorrätig“). Server lehnt leere Farbrollen je Bereich ab (`color.<Bereich-ID>`).
  Geprüft: typecheck ✔ · test ✔ (84 gesamt, 1 neu) · Migration und Klicktest an Datenkopie in `_testdaten` ✔.
- **Nachtrag 3 (Merge Bestell-Mail, Datenmodell):** Bestell-Mail zeigt bei mehrfarbigen Drucken eine Zeile je
  Farbbereich (mit Farbtupfer) und die Personalisierungsangaben (`services/orderMail.ts`, `sampleOrder` ergänzt).
  Geprüft: typecheck ✔ · test ✔ (93 gesamt) · Start mit Datenkopie in `_testdaten` ✔.
- **Aufgeräumt:** Testserver 5182/3012 gestoppt, Testdatenordner `_testdaten\produktdaten` und Hilfsskripte gelöscht.

## 2026-10-31 – Bestell-Mail (Session: bestell-mail, Branch: feature/bestell-mail)
- **Gebaut:** Benachrichtigung zu neuen Anfragen als gut lesbare HTML-Mail + Text-Alternative (alle Werte HTML-escaped,
  keine Anhänge), Betreff „Neue Anfrage M3L-… – <Hilfsmittel>“. Inhalt: Nummer, Eingang, Lehrkraft (mailto), Klasse,
  Hilfsmittel (Link in die Verwaltung), Menge, Farbe (mit Farbfeld), Größe, Bemerkungen, Knopf „Anfrage in der Verwaltung
  öffnen“. Erzeugt von `buildOrderMail(order, item, settings)` – Felder als generische Liste in `orderMailFields`.
  **Konfiguration nur im Server-Manager** (Entscheidung des Nutzers): Betriebsdatei `mail.json` (Pfad `MAIL_CONFIG_FILE`,
  sonst `<STORAGE_DIR>/config/mail.json`, Schema `{ enabled, smtp: { host, port, secure, user, pass }, from, recipients[],
  appBaseUrl }`, zod-validiert, mtime-Cache, wirkt ohne Neustart; fehlt/ungültig → Versand aus + Logeintrag). Die App
  schreibt die Datei nie. Einmalige Übernahme beim Start: alte `mail`-Daten aus `settings.json` → `mail.json` (nur wenn
  noch keine existiert), danach aus `settings.json` entfernt; vorher Sicherung `settings.json.vor-mail-umzug-<zeit>.bak`.
  Verwaltung → Einstellungen zeigt nur noch den Zustand („aktiv an N Empfänger · eingerichtet im Server-Manager“ /
  „nicht eingerichtet“ / „fehlerhaft“) und den letzten Versand; Mail-Endpunkte `PUT /mail`, `POST /mail/test` entfernt,
  Zugangsdaten verlassen den Server nie. Testmail-Skript für den Manager:
  `npm run mail:test -s -w server -- --config <pfad> [--to <adresse>]` → eine Zeile `OK: …`/`FEHLER: …`, Exit 0/1 (2 = Aufruf).
  Versand weiterhin asynchron, Fehler → Log + „Letzter Versand fehlgeschlagen: …“.
- **Dateien:** `server/src/services/orderMail.ts`, `services/mailConfig.ts` (neu), `services/mailer.ts`,
  `server/scripts/mail-test.ts` (neu), `server/package.json` (`mail:test`), `config.ts` (`mailConfigFile`), `app.ts`
  (Übernahme beim Start, Pfad an Bestellrouten), `routes/orders.ts` (Aufruf), `routes/settings.ts`, `domain/settings.ts`
  (`mail` entfernt), `validation.ts` (Mail-Schemas entfernt), `server/scripts/smoke-test.ts` (+10 Tests),
  `client/src/lib/types.ts` (`MailInfoView`), `client/src/features/einstellungen/SettingsPage.tsx`, `docs/ARCHITEKTUR.md`.
- **Geprüft:** typecheck ✔ · test ✔ (75) · health ✔ · Start mit Kopie der echten Daten ✔ (verlustfrei, Sicherung angelegt) ·
  echte Anfrage mit nicht erreichbarem SMTP ✔ (Anfrage angelegt, Fehler sichtbar) · im Browser (Desktop + Handy) ✔.
- **Aufgeräumt:** Server 5184/3014 gestoppt, `C:\Entwicklung\_testdaten\bestell-mail` und Vorschau-Dateien gelöscht.

## 2026-10-31 – Feste Bestellstatus, Filamente leer/vorrätig (Session: status-filamente, Branch: feature/status-filamente)
- **Gebaut:** Bestellstatus sind eine feste Liste (Offen, In Prüfung, In Druck, Gedruckt, Abholbereit, Übergeben,
  Abgelehnt, Storniert) mit Farbe und Symbol; in den Stammdaten nur noch Schalter (sofort gespeichert). „Offen“ immer
  an, Standard zusätzlich nur „Gedruckt“ („In Druck“ aus). Übersicht zeigt je eingeschaltetem Status eine Kachel;
  Status-Auswahl, Filter, Fortschritt und „Weiter zu …“ nur mit eingeschalteten Status. Migration: frei angelegte
  Status → feste Status (ID/Name/Phase), Anfragen behalten ihren Stand. Neue Seite **Filamente** (Admin + Druck-Team,
  handytauglich): Rollen als leer/vorrätig schalten, gruppiert nach Produktlinie, Filter „Leer“, Warnung für
  Hilfsmittel ohne vorrätige Farbe. Katalog/Produktseite/Anfrageformular zeigen nur vorrätige Farben; Server lehnt
  Anfragen mit leerer Farbe ab. Farbrollen-Stammdaten mit Schalter „vorrätig“, Editor markiert „(leer)“.
- **Dateien:** `server/src/domain/{orderStatuses.ts (neu),settings.ts,permissions.ts}`, `server/src/routes/{settings,orders}.ts`,
  `server/src/{app,validation}.ts`, `server/src/seed/seed.ts`, `server/scripts/smoke-test.ts`,
  `client/src/lib/{filaments.ts (neu),constants.ts,types.ts}`, `client/src/features/verwaltung/FilamentsPage.tsx (neu)`,
  `client/src/features/{einstellungen/MasterDataPage,verwaltung/DashboardPage,verwaltung/OrdersAdminPage,katalog/*}.tsx`
  (in `ItemEditPage`, `ItemDetailPage`, `RequestDialog`, `CatalogPage` nur 1–3 Zeilen), `client/src/{App.tsx,components/{Layout,StatusBadge}.tsx}`, Doku.
- **Geprüft:** typecheck ✔ · test ✔ (inkl. Migrationstest) · Migration an Kopie der echten Daten ✔ (7 Anfragen, Status
  unverändert) · im Browser ✔ (Stammdaten-Schalter, Übersicht, Filamente am Handy, Produktseite/Anfrageformular).
- **Aufgeräumt:** Testserver 5181/3011 gestoppt, Temp-Datenordner gelöscht.

## 2026-10-31 – Rollen & Einzelrechte (Session: rollen-rechte, Branch: feature/rollen-rechte)
- **Gebaut:** Zentrale Rechte-Liste in `server/src/domain/permissions.ts` (`PERMISSION_DEFS`: Schlüssel, Gruppe,
  Beschriftung, Beschreibung, Standard-Rollen, `customizable`, `requires`). Sehen/Bearbeiten getrennt:
  neu `catalog:view`, `orders:view`, `masterdata:manage` (Stammdaten, bisher Teil von `settings:manage`).
  Je Druck-Team-Konto Einzelrechte (`User.permissionOverrides`, nur Abweichungen gespeichert); Admin-Rechte
  (`users:manage`, `settings:manage`) nicht vergebbar. Wirksam bei jeder Anfrage (`requirePermission`/`userCan`,
  Konto wird frisch geladen). „Bearbeiten“ wirkt nur mit „Sehen“. Rollenwechsel setzt Einzelrechte zurück.
  API: `GET /api/users/permissions` (Rechte-Katalog), `permissionOverrides` in POST/PATCH `/api/users`, Antworten
  mit `permissionOverrides` + wirksamen `permissions`. Frontend: „Rollen im Überblick“ mit Rechten aus der API,
  Rechte-Vorschau/-Auswahl beim Anlegen, Dialog „Rechte“ je Konto (Kontrollkästchen, Hinweis „entzogen“/„zusätzlich
  erlaubt“, „Standard der Rolle“), Badge „Eigene Rechte“. Navigation/Seiten nutzen die neuen Rechte (Bestellungen
  nur sehen → Statusformular ausgeblendet; Katalog nur sehen → keine Bearbeiten-/Löschen-Knöpfe).
  Neues Recht ergänzen = ein Eintrag in `PERMISSION_DEFS` + Typ in `client/src/lib/types.ts`.
- **Migration:** keine Datenänderung nötig – Konten ohne `permissionOverrides` haben exakt die bisherigen Rechte
  (geprüft an einer Kopie der echten Daten: `users.json` unverändert, Druck-Team = vorherige Rechte + neue Sehen-Rechte).
- **Dateien:** `server/src/domain/{permissions,types}.ts`, `server/src/auth/middleware.ts`,
  `server/src/routes/{auth,items,misc,orders,settings,users}.ts` (nur Rechteprüfungen), `server/src/validation.ts`,
  `server/scripts/smoke-test.ts` (6 neue Tests), `client/src/lib/types.ts`, `client/src/{App.tsx,components/Layout.tsx}`,
  `client/src/features/verwaltung/{UsersAdminPage,PermissionEditor,ItemsAdminPage,OrdersAdminPage,ItemEditPage}.tsx`,
  `client/src/features/{katalog/ItemDetailPage,konto/LoginPage}.tsx`, `docs/ARCHITEKTUR.md`.
- **Geprüft:** typecheck ✔ · test ✔ (72, davon 6 neu) · im Browser ✔ (Desktop + Handy: Rechte entziehen/zusätzlich geben,
  Druck-Team sieht danach nur freigegebene Seiten, Stammdaten-API 200, Einstellungen 403).
- **Aufgeräumt:** Testserver 5183/3013 gestoppt, Temp-Datenordner gelöscht, Scratchpad-Skripte gelöscht.

## 2026-10-31 – Server-Manager, vereinfachte Version (Session: server-manager)
- **Gebaut:** Lokales Admin-Tool `manager/` (nur 127.0.0.1 + Passwort, ohne npm-Abhängigkeiten): eine Seite mit
  Diensten (Web-App, Backup), Firewall-Schalter, Backup/Wiederherstellen, Update mit Rollback, Einstellungen inkl.
  E-Mail bei neuen Anfragen (`mail.json`), Ersteinrichtung/Installer (feste Ordner `C:\Mosaik3LAB\…`, Verknüpfungen,
  install-manifest), Plattformschicht Windows + Linux/Raspberry Pi, CLI (`status`, `doctor`, `backup`, `update`,
  `setup` mit `--json`), Starter `mosaik3lab.cmd`/`.sh`.
- **Geprüft (Hauptchat):** `npm run manager:test` 10/10 ✔, Selbsttest ✔, `manager:cli -- doctor` läuft
  (Exit 2 im Entwicklungsbetrieb erwartbar: kein Passwort gesetzt, App läuft als Dev-Server statt Dienst).
  Nicht real getestet: Dienst-Installation, Firewall-Regeln, Linux.
- **Aufgeräumt:** laut Session Testordner gelöscht; zwei Temp-Testordner ließen sich nicht löschen (gesperrt).

## 2026-10-31 – Logo mit Hochzahl ³ (Session: logo-hoch3, archiviert)
- **Gebaut:** Wortmarke zeigt echtes „³“ statt „3“ in `<sup>`.
- **Dateien:** `client/src/components/Logo.tsx`.
- **Geprüft:** typecheck ✔ · auf 5173 im Browser ✔ (Login-Seite, Kopfzeile).
- **Aufgeräumt:** eigener Worktree `mosaik3lab-logo-hochzahl` und Branch `feature/logo-hochzahl` gelöscht.

## 2026-10-31 – Testbarkeit für Claude (Hauptchat)
- **Gebaut:** `.claude/launch.json` im Projekt mit „mosaik3lab“ (5173) und „server-manager“ (5190).
- **Aufgeräumt:** nichts angefallen.

## 2026-10-31 – Anmeldung per E-Mail (Session: E-Mail-Login, Branch: feature/email-login)
- **Gebaut:** Zweistufige Anmeldung mit E-Mail: `POST /api/auth/identify` → Passwort (Admin/Druck-Team), direkt
  angemeldet (bekannte Lehrkraft aus `requesters.json`, ohne Passwort, nur Recht `orders:own`) oder eigene Ansicht
  „Diese E-Mail ist noch nicht im System.“ mit „Jetzt Konto anlegen“ (`POST /api/auth/register`, nur erlaubte
  Domains, nur Lehrkraft, Rate-Limit) und „E-Mail korrigieren“. `POST /api/auth/login` nimmt `{ email, password }`.
  Angemeldet bleiben: Session-Cookie 30 Tage, bei Nutzung verlängert (vorher 8 h). Login-Seite mit `data-testid`. Neues `GET /api/orders/mine`
  (Status nur bei eingeschalteter Statusanzeige). `User.email` (Pflicht, eindeutig, klein); Konten nur noch für
  Admin/Druck-Team; Migration ergänzt E-Mails älterer Konten ohne Datenverlust (altes Demo-Konto `lehrkraft` →
  bekannte Lehrkraft `demo.lehrkraft@mosaikschule-lu.de`). Rate-Limit für beide Schritte, Login-Bremse je E-Mail/IP,
  neue Session-ID, CSRF und Demo-Sperre bleiben. Frontend: Login-Seite (E-Mail → ggf. Passwort), „Meine Anfragen“
  und Konto-Seite für Lehrkräfte, Benutzerverwaltung mit E-Mail (anlegen/ändern), Anfrageformular übernimmt die
  E-Mail der angemeldeten Lehrkraft. Nebenbei: `.gitignore` schloss `server/src/storage/` (Speicher-Code) aus –
  jetzt nur `/storage/` und `/backups/`, Code committet.
- **Dateien:** `.gitignore`, `server/src/storage/**` (erstmals im Git), `server/src/domain/{types,permissions}.ts`,
  `server/src/auth/middleware.ts`, `server/src/routes/{auth,orders,users}.ts`, `server/src/validation.ts`,
  `server/src/seed/{seed,demoData}.ts`, `server/src/app.ts`, `server/src/config.ts`, `server/scripts/smoke-test.ts`,
  `client/src/{App.tsx,auth/AuthContext.tsx,components/Layout.tsx,lib/types.ts}`,
  `client/src/features/{konto/LoginPage,konto/AccountPage,katalog/MyOrdersPage,katalog/RequestDialog,verwaltung/UsersAdminPage}.tsx`,
  `README.md`, `docs/ARCHITEKTUR.md`.
- **Geprüft:** typecheck ✔ · test ✔ (66 Tests, u. a. Admin/Druck-Team mit Passwort, Lehrkraft ohne Passwort,
  unbekannte E-Mail, Konto anlegen/fremde Domain/erneuter Login, Cookie-Ablauf 30 Tage, Lehrkraft ohne
  Verwaltungszugriff, Migration, Rate-Limit) · im Browser ✔ (5182/3012 mit Temp-Datenordner: unbekannt → korrigieren
  → anlegen, angemeldet nach Neuladen; Admin, Lehrkraft) · Migration gegen eine Kopie der Hauptstand-Daten ✔.
- **Aufgeräumt:** Testserver 5182/3012 gestoppt, Temp-Datenordner `%TEMP%\mosaik3lab-login`, Test-`storage/` des
  Worktrees und Scratchpad-Skripte gelöscht. Worktree bleibt für den Merge. Hauptstand (5173/3001, `storage/`) unberührt.
- **Merge (Hauptchat):** vorher Sicherung `backups/storage-2026-10-31T12-13-57`, in `main` gemergt.

## 2026-10-31 – Git eingerichtet (Hauptchat)
- **Gebaut:** Git 2.56 installiert (winget), Autor eingetragen, Repository mit Branch `main`, erster Commit.
- **Dateien:** `.gitattributes` (Zeilenenden einheitlich LF), `CLAUDE.md` (Worktree-Hinweis).
- **Aufgeräumt:** nichts angefallen.

## 2026-10-31 – Arbeitsweise eingerichtet (Hauptchat)
- **Gebaut:** `CLAUDE.md` mit Regeln für Hauptchat/Unter-Sessions, dieses Protokoll.
- **Dateien:** `CLAUDE.md`, `docs/PROTOKOLL.md`, `client/vite.config.ts` (Ports per `WEB_PORT`/`API_PORT`, Standard 5173/3001).
- **Aufgeräumt:** nichts angefallen.
