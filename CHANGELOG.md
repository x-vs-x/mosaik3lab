# Änderungen

Alle Versionen von Mosaik³LAB. Versionsnummern nach [SemVer](https://semver.org/lang/de/): **MAJOR.MINOR.PATCH**:
große Umstellung, neue Funktion, Fehlerbehebung. Neue Einträge kommen unter „Unveröffentlicht“, `npm run release` macht
daraus die nächste Version.

## [Unveröffentlicht]

- **Server-Manager neu gestaltet:** ruhiger und klarer – helle Steinflächen, App-Rot nur für die wichtigsten Knöpfe,
  klare Schriftstufen, runde Knöpfe mit großen Tippflächen, kürzere Texte (Erklärungen zum Aufklappen), Sicherungen als
  übersichtliche Liste, Status als Punkt mit Wort. Reiterleiste auf dem Handy waagrecht wischbar, Dialoge auf dem Handy
  fast vollflächig mit festen Knöpfen, kleine schnelle Übergänge (aus bei „Bewegung reduzieren“), hell/dunkel nach System.
  Keine Funktionsänderung.
- **Kleinigkeiten auf dem Handy:** In der unteren Leiste heißt „Vorschläge“ auf schmalen Handys (unter 390 px) kurz
  „Ideen“, damit die fünf Einträge nicht aneinanderstoßen (Screenreader sagen weiter „Vorschläge“). Der Platzhalter der
  Katalogsuche ist kürzer („Suchen, z. B. „Stift““) und wird auf 320 px nicht mehr abgeschnitten. Im Dialog „Rechte ändern“
  ist jetzt die ganze Zeile (Häkchen und Text) eine große Tippfläche mit Hover-Hintergrund und Fokusrahmen.
- **E-Mails neu gestaltet:** Alle Mails (neue/geänderte Anfrage, neuer Vorschlag, Passwort festlegen/zurücksetzen,
  Testmail) im Aussehen der App – roter Kopf mit Mosaik³LAB, ein großer Knopf (auf dem Handy volle Breite), der Link
  zusätzlich als Text, kurze Texte; passen sich an Handy, Tablet und Computer an. Mail nach der Kontosperre erklärt jetzt
  die Sperre statt „neues Passwort angefordert“.
- **Hinweis „Der Link funktioniert nur im Schulnetz“** unter dem Knopf, wenn die Adresse in den Mails eine Adresse im
  Schulnetz ist (automatisch erkannt). Im Server-Manager, Reiter „E-Mail“, einstellbar („Automatisch erkennen · Nur im
  Schulnetz · Auch von außerhalb“) mit Anzeige der Erkennung und Warnung bei Widerspruch. Bestehende Mail-Einstellungen
  bleiben unverändert (neue Einstellung: automatisch).
- **Ansichten geprüft (Handy, Tablet, PC):** Kleine Knöpfe sind jetzt überall gut antippbar – „Ändern“ und das Auge zum
  Passwort-Anzeigen (Anmeldung, Passwort festlegen) nehmen die ganze Feldhöhe ein, das „×“ an Meldungen ist so groß wie beim
  Dialog-Schließen, das Häkchen zum Exportieren (Druckteile verwalten) und „Foto entfernen“ (Vorschlag machen) haben eine
  größere Tippfläche, Links in Vorschlägen stehen mit mehr Abstand. Im Dialog „Druckteil löschen?“ steht der Hinweis
  „Beispieldatensatz“ jetzt über den Knöpfen statt darunter.

## [1.4.2] – 2026-11-17

- **Linux/Raspberry Pi – Installation ohne Administratorrechte:** Fehlt `sudo` auf dem Rechner, verweigert sudo die
  Anmeldung oder läuft das Skript sonst nicht als root, bricht `installieren.sh` jetzt mit einer klaren Meldung ab
  („Abbruch: … Bitte so starten: sudo ./installieren.sh …“) und ändert nichts. Wie bisher startet es sich ohne root
  selbst mit sudo neu und fragt einmal nach dem Passwort.

## [1.4.1] – 2026-11-17

- **Druckteile verwalten:** Schalter und Knöpfe (Ansehen, Bearbeiten, Löschen) neu angeordnet – feste Spalten, in jeder
  Zeile an derselben Stelle, nichts ragt mehr aus der Karte (vorher rutschte der Mülleimer bei veröffentlichten Druckteilen
  heraus). Auf dem Handy steht der Schalter oben, die Knöpfe rechtsbündig darunter.

## [1.4.0] – 2026-11-17

- **Druckteile verwalten:** Neuer Filter „Alle · Veröffentlicht · Entwurf“ (mit Anzahl) neben der Suche. Filter und Suche
  stehen in der Adresse und überstehen „Zurück“ und Neuladen; „Alle auswählen“ für den Export nimmt nur die gefilterten
  Druckteile, bei leerem Ergebnis gibt es einen Knopf „Alle Druckteile anzeigen“.
- **Stammdaten:** „… hinzufügen“ steht jetzt oben im Kopf jeder Liste (auf dem Handy volle Breite unter der Überschrift),
  der neue Eintrag erscheint ganz oben mit dem Cursor im ersten Feld. Bei den Farbrollen stehen „Farbrolle hinzufügen“ und
  „Bambu-Lab-Farben importieren“ nebeneinander (Handy: untereinander).
- **Farbrollen:** Farbe, Name, Herkunft, Schalter „vorrätig“ und Knöpfe stehen auf Tablet und PC in festen Spalten – in jeder
  Zeile an derselben Stelle, egal wie lang der Name ist; auf dem Handy ordentlich untereinander. Bei den Kategorien ist das
  Namensfeld in jeder Zeile gleich breit.
- **Farbrollen – Marke und Linie:** Beide Felder bleiben frei beschreibbar und bieten die schon vorhandenen Werte als
  antippbare Vorschläge an (ohne Doppelte, alphabetisch); bei „Linie“ zuerst die Linien der gewählten Marke.
- **iPad/iPhone – Herunterladen ohne Sackgasse:** „Exportieren“ (Druckteile verwalten) und das Herunterladen von Druckdateien
  verlassen die App nicht mehr. Auf iPad/iPhone öffnet sich nach dem Laden das Teilen-Menü („In Dateien sichern“), danach ist
  man sofort wieder in der App; am PC und auf Android wird wie gewohnt heruntergeladen. Ladeanzeige am Knopf und
  verständliche Meldung, wenn etwas schiefgeht (z. B. offline).
- **iPad:** Auf der Anmeldeseite und der Seite „Passwort festlegen“ lässt sich mit offener Tastatur nicht mehr ins Leere
  scrollen – das Formular steht auf Handy und Tablet hochkant oben, die Seite ist nur so hoch wie ihr Inhalt.
- **Druckteile verwalten:** Der Schalter „Veröffentlicht/Entwurf“ steht auf breiten Bildschirmen in jeder Zeile an derselben
  Stelle, statt je nach Druckteil nach links oder rechts zu springen.

- **Update per Knopfdruck auf dem Raspberry Pi mit großer Ablage:** Die Sicherung vor dem Update darf jetzt bis zu 2 Stunden
  dauern, ohne dass ein äußeres Zeitlimit sie abbricht (Wächter des Update-Helfers 3 Stunden, ganzer Helfer 4 Stunden;
  vorher brach der Helfer schon nach 45 Minuten ab). Der Server-Manager zeigt „läuft noch“ statt eines Fehlers, solange
  der Helfer arbeitet, und nennt bei langer Wartezeit den Grund.
- **Sicherheit (Linux/Raspberry Pi):** Dienst-Dateien und polkit-Regel schreibt die Einrichtung als root direkt nach `/etc`,
  nicht mehr über einen Ordner, den der Dienstbenutzer ändern kann. Deinstallieren übernimmt nur passende Einträge.
- **Sicherheit (Windows):** Liegt der Programmordner nicht unter „Programme“, setzt die Einrichtung ausdrücklich, dass nur
  Administratoren und System dort schreiben (der Update-Helfer startet Programm und Dienstdateien als System).
- **Einstellungen aufgeräumt:** Ablagepfade und Mailserver-Status stehen nicht mehr in den App-Einstellungen – das regelt
  der Server-Manager (Knopf „Server-Manager öffnen“ bleibt). Ist der Mailversand fehlerhaft oder zuletzt gescheitert,
  erscheint dort ein Hinweis. Serverpfade werden nicht mehr an den Browser geschickt.

- **Anfrage angemeldet:** Wer angemeldet ist (Lehrkraft, Admin, Druck-Team), sieht im Anfrageformular die eigene E-Mail
  fest eingetragen („Ihre Schul-E-Mail (angemeldet)“). Der Server nimmt immer diese Adresse – so landet jede Anfrage
  sicher unter „Meine Anfragen“, auch wenn ein alter Entwurf eine andere Adresse enthielt. Ohne Anmeldung unverändert.
- **Stammdaten:** Beim Speichern mit fehlendem oder ungültigem Eintrag nennt die Meldung Zeile und Feld (z. B. „Zeile 8:
  Name fehlt.“) und markiert die Zeile, statt nur „Bitte überprüfen Sie Ihre Eingaben.“ zu zeigen.
- **Druckteil-Seite:** Der Abschnitt „Sicherheitshinweise“ (nur fürs Druck-Team) entfällt, wenn keine Hinweise hinterlegt sind.
  Im Druckteil-Editor (Personalisierung) entfällt der gelbe Datenschutz-Hinweis fürs Team; Lehrkräfte sehen ihren weiter.

## [1.3.1] – 2026-11-17

- **Server-Manager, „Im Schulnetz erreichbar“ und Ports:** Fehlen dem Manager Administratorrechte für die Firewall-Regel
  (er läuft als Dienst), wird die Einstellung trotzdem gespeichert und der fertige Befehl zum Kopieren angezeigt (Linux mit
  `sudo`). Vorher blieb der Schalter hängen – auch nachdem die Regel von Hand angelegt war. Vorhandene Regeln brauchen keine
  Adminrechte mehr.
- **Server-Manager, Paket-Installation:** „Einrichten/Reparieren“ unter „System“ zeigt jetzt, dass man das Installer-Paket
  erneut ausführt – der Knopf konnte dort ohne Adminrechte nicht funktionieren.
- **Wiederherstellen einer Sicherung mit anderem Passwort** (z. B. von einem anderen Rechner): Der Manager fragt nach dem
  Passwort, statt nur „Falsches Backup-Passwort“ zu melden.
- **Linux/Raspberry Pi: Server-Manager erkennt die Installation wieder.** `install.json` war nur für root lesbar – der
  Manager-Dienst (Benutzer mosaik3lab) hielt sich deshalb für eine Arbeitskopie (z. B. kein Update per Knopfdruck, Hinweis
  „Läuft aus der Arbeitskopie“). Wird beim nächsten Paket-Update automatisch repariert.
- **Linux/Raspberry Pi:** Zu altes polkit (Raspberry Pi OS „Bullseye“, Ubuntu 22.04) wird bei der Einrichtung und im
  Manager klar gemeldet – dort kann der Manager die Dienste nicht steuern und „Jetzt aktualisieren“ geht nicht.
  Befehle der Kommandozeile mit `sudo` (z. B. `cli.mjs backup restore`) geben Daten danach dem Dienstbenutzer zurück; ohne
  `sudo` werden sie mit klarer Meldung abgelehnt (vorher konnte die Web-App danach ihre Datenbank nicht mehr schreiben).
  Der Hinweis „Aus Sicherung einrichten“ in `installieren.sh` nennt jetzt den passenden Befehl.
- **Installer:** zeigt den Beginn jedes Schritts mit Uhrzeit – bei langen Schritten (Sicherung vor dem Update) sieht man,
  woran gerade gearbeitet wird.

- **Anfrage stellen:** Fehlt die Farbe oder Größe, springt „Anfrage senden“ jetzt direkt zur Auswahl (vorher blieb der
  Fokus auf dem Knopf – wichtig für Tastatur und Taster). Angemeldete Lehrkräfte finden immer ihre eigene Adresse im
  Formular, auch wenn die Seite langsam lädt (vorher konnte am gemeinsamen PC die zuletzt benutzte Adresse einer anderen
  Person stehen bleiben). „Erneut anfragen“ zeigt die frühere Farbe auch dann ausgewählt, wenn es sie in zwei Rollen gibt.
- **Vorschläge:** Ein in ein Druckteil umgewandelter Vorschlag bleibt „Umgesetzt“, solange der Entwurf im Katalog steht
  (vorher ließ er sich auf „Neu“ oder „Abgelehnt“ zurücksetzen). Nach dem Speichern einer Antwort ist „Speichern“ wieder
  aus. Die Adresse der Lehrkraft verlinkt nur noch auf ihre Anfragen, wenn man Anfragen sehen darf.
- **Druckteile einspielen:** Neu angelegte Kategorien, Materialien und Farben erscheinen sofort, ohne die Seite neu zu laden.
- **Farbrollen:** Der Hinweis „können gerade nicht angefragt werden“ nennt auch mehrfarbige Druckteile, bei denen nur ein
  Farbbereich leer ist.
- **Anmeldung:** Druck-Team-Mitglieder mit einzelnen Rechten (z. B. nur Farbrollen) kommen nach der Anmeldung auf die
  vorher aufgerufene Verwaltungsseite statt in den Katalog. Am Handy erscheint „Vorschläge“ unten nicht mehr doppelt.
- **Bedienung:** Dialoge schließen nicht mehr, wenn man beim Markieren von Text über den Rand hinauszieht. Die Schalter
  „Veröffentlicht“ in der Druckteil-Liste nennen für Screenreader das Druckteil.

## [1.3.0] – 2026-11-16

- **Server-Manager:** Bietet bei einer Paket-Installation kein Git-Update mehr an (Git wird dafür nicht gebraucht – vorher
  erschien das Angebot, wenn Git zufällig auf dem Rechner installiert war). „Pakete auf Schwachstellen prüfen“ erscheint dort
  nicht mehr, weil Sicherheitskorrekturen mit dem nächsten Paket kommen.
- **Schnellerer Rückfall bei kaputtem Update:** Startet die neue Version gar nicht (beendet sich mehrmals hintereinander),
  schaltet der Installer nach etwa 20 Sekunden auf die vorige Version zurück statt erst nach 2 Minuten. Langsame, aber
  normale Starts (z. B. Raspberry Pi) haben weiterhin bis zu 2 Minuten Zeit.
- **Ersteinrichtung mit Schul-Domain:** Beim Anlegen des ersten Administrators fragt der Server-Manager, ob die Domain seiner
  E-Mail-Adresse die der Schule ist (sonst eigene Domain eintragen), zeigt alle Angaben zur Bestätigung und trägt die Domain
  als erlaubte E-Mail-Domain ein. Nur bei neuen Installationen – vorhandene Einstellungen bleiben unverändert.

## [1.2.0] – 2026-11-16

- **Personen entfernen:** Unter Verwaltung → Personen gibt es jetzt „Entfernen“. Die Person verliert alle Rechte und wird
  sofort abgemeldet; ihre Anfragen und Vorschläge bleiben vollständig sichtbar. Die E-Mail-Adresse wird wieder frei – meldet
  sich die Person später erneut an, beginnt sie neu als Lehrkraft. Sich selbst kann man nicht entfernen, so bleibt immer
  mindestens ein Administrator.
- **Server-Manager neu gegliedert:** Reiter „Übersicht“ (Updates ganz oben, Status, Adresse, Dienste), „Sicherung“,
  „Netzwerk“, „E-Mail“ und „System“ statt einer langen Seite mit vielen eingeklappten Bereichen. Hinweise passen sich dem
  Betriebssystem an (Windows, Linux, Raspberry Pi). Die Adresse ist fest `http://<Server>/mosaik3lab`; das Feld
  „Adresse (Pfad)“ gibt es nicht mehr, damit Lesezeichen, Verknüpfungen und Links in Mails immer stimmen. Ein
  anderer gespeicherter Pfad (ältere Einrichtung, eingespielte Sicherung) wird automatisch ersetzt. „Einrichten“ repariert
  eine bestehende Installation am selben Ort (Programm- und Datenordner dort nicht mehr änderbar).
- **Linux und Raspberry Pi:** Ohne aktive Firewall (Raspberry Pi OS hat meist keine, bei Ubuntu ist sie aus) meldet der
  Server-Manager keine fehlende Firewall-Regel mehr und verlangt beim Einschalten von „Im Schulnetz erreichbar“ keine
  Administratorrechte.

## [1.1.5] – 2026-11-16

- **Druckteile zwischen Windows und Linux austauschen:** geprüft und abgesichert. Eine Exportdatei, die im Windows-Editor
  geöffnet und gespeichert wurde, wird jetzt ebenfalls gelesen (vorher: „keine Export-Datei“).
- **Sicherung von Windows auf Linux (oder umgekehrt) einspielen:** Ordner des anderen Systems (z. B. „C:\Mosaik3LAB\…“ auf
  einem Raspberry Pi) werden erkannt; es gelten dann die Standardordner des neuen Rechners. Vorher brach die Einrichtung ab
  bzw. legte unter Windows Ordner wie „C:\var\backups“ an.

## [1.1.4] – 2026-11-15

- **Erster Administrator ohne Einrichtungscode:** Nach der Installation legt man den ersten Administrator direkt im
  Browser an – E-Mail, Name, Passwort, fertig. Den Code am Ende der Installation gibt es nicht mehr. Bitte das Konto gleich
  nach der Installation anlegen: Bis dahin könnte es jeder im Schulnetz tun.

## [1.1.3] – 2026-11-15

- **Schneller im Hintergrund:** Der Zähler neuer Vorschläge lädt nur noch die Zahl statt der ganzen Liste, die Personenliste
  braucht eine Datenbankabfrage statt einer je Person, und eine versendete Benachrichtigung schreibt nur noch ihren Status.

## [1.1.2] – 2026-11-15

- **Suche:** Findet Druckteile auch ohne Umlaute („Loeffel“, „Loffel“ → „Löffel“) und mit mehreren Wörtern – im Katalog und
  in allen Listen der Verwaltung.
- **Weniger Stolperfallen:** Bilder, Druckdateien und Videos werden erst nach Rückfrage gelöscht. Noch nicht bestätigte
  Einträge in Listen (z. B. Größen) gehen beim Speichern nicht mehr verloren. Ungespeicherte Stammdaten werden auch beim
  Wechsel der Seite gemeldet. Doppelklicks lösen nichts doppelt aus.
- **Bedienung mit Tastatur und Taster:** Nach „Bitte prüfen Sie die Angaben“ steht der Cursor direkt im ersten fehlenden
  Feld. Nach dem Entfernen eines Eintrags bleibt der Fokus in der Liste.
- **Kleinigkeiten:** „Zurück zum Katalog“ behält Suche und Filter. Anfragen mit ausgeschaltetem Status bleiben filterbar.
  „Kopieren“ funktioniert auch ohne HTTPS. Richtige Texte bei gesperrtem Konto ohne Mail-Versand und bei der Statusanzeige
  für Lehrkräfte. Umlaute in Dateinamen bei Fehlermeldungen.
- **Server-Manager:** Einstellungen laden wieder vollständig, wenn die App nur auf diesem Rechner erreichbar ist.
  „vor 3 Tagen“ statt „vor 3 Tage“. Klare Meldung, wenn die Testmail nicht gesendet werden kann.
- **Schneller:** Die App lädt für Lehrkräfte weniger Programmcode; Bilder im Katalog werden schneller ausgeliefert und
  Programmdateien länger zwischengespeichert.
- **Sicherer:** Die Statusabfrage für Lehrkräfte gibt keine internen Angaben mehr heraus. Ein Fehler, durch den beim
  Sortieren der Bilder ein Bild verloren gehen konnte, ist behoben.

## [1.1.1] – 2026-11-15

- **„Was ist neu“ und Versionsanzeige:** Erscheinen jetzt auch in installierten Paketen zuverlässig (zeigten dort „unbekannt“).
- **Updates noch sicherer:** Der Programmordner ist für das Dienstkonto schreibgeschützt (Windows und Linux). Meldet sich der Update-Helfer nicht,
  sagt der Server-Manager das nach einigen Minuten klar, statt endlos zu warten. Ein Update kann auch aus einem zweiten
  Browserfenster nicht doppelt gestartet werden. Das Protokoll des Update-Helfers ist im Server-Manager einsehbar.
- **Server-Manager auf dem Handy:** Häkchen werden bei langen Beschriftungen nicht mehr zusammengedrückt. Alle Texte in der
  Sie-Form.

## [1.1.0] – 2026-11-15

- **Updates per Knopfdruck:** Der Server-Manager meldet neue Versionen selbst und zeigt, was sich ändert. Ein Klick auf
  „Jetzt aktualisieren“ genügt: Vorher wird automatisch gesichert. Klappt etwas nicht, läuft die bisherige Version
  einfach weiter, Ihre Daten bleiben unverändert.
- **Was ist neu:** Nach einem Update sehen Administratoren einmal, was neu ist – im Server-Manager und beim Anmelden in
  Mosaik³LAB.
- **Sicherungen:** Eine Sicherung aus einer neueren Version wird nicht mehr versehentlich in eine ältere zurückgespielt.
  In der Liste steht jetzt bei jeder Sicherung, von welcher Version sie stammt. Die Sicherung von direkt vor einem Update
  bleibt immer erhalten.
- **Mehr Sicherheit bei der Installation:** Installation und Update können nicht mehr versehentlich doppelt gestartet
  werden. Ein älteres Paket wird über einer neueren Version abgelehnt.

## [1.0.0] – 2026-11-15

Erste freigegebene Version für den Betrieb in der Schule.

- **Katalog** für Hilfs- und Lehrmittel aus dem 3D-Drucker, **Anfragen** von Lehrkräften mit Status und E-Mail-Benachrichtigung,
  **Vorschläge**, **Verwaltung** für Druck-Team und Administratoren (Druckteile, Farbrollen, Stammdaten, Personen und Rechte).
- **Server-Manager** unter `<Adresse>/mosaik3lab/manager/` (nur Administratoren): Dienste, Sicherungen (verschlüsselt),
  Updates, Adresse/HTTPS, E-Mail-Versand, Pfade.
- **Installer** für Windows, Linux (x64) und Raspberry Pi OS 64 Bit: alles im Paket, Dienste mit Autostart, im Schulnetz
  erreichbar. Update mit Sicherung und automatischem Rückfall.
- **Ersteinrichtung über das Netz:** Solange es keinen Administrator gibt, führt jede Adresse zur Einrichtung (E-Mail, Passwort,
  Einrichtungscode aus dem Installer).
- **Versionierung:** eine Versionsnummer für alles; der Installer lehnt ältere Versionen über einer neueren ab.
