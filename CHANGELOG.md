# Änderungen

Alle Versionen von Mosaik³LAB. Versionsnummern nach [SemVer](https://semver.org/lang/de/): **MAJOR.MINOR.PATCH**:
große Umstellung, neue Funktion, Fehlerbehebung. Neue Einträge kommen unter „Unveröffentlicht“, `npm run release` macht
daraus die nächste Version.

## [Unveröffentlicht]

- **Server-Manager: stabiler und verständlicher** (Durchsicht der Oberfläche vor 1.8.1):
  - **Absturz behoben:** Eine kaputte Adresse (z. B. `…/manager//`) konnte den Server-Manager beenden – er lehnt sie jetzt
    nur noch ab. Auch sonst beendet kein Fehler einer einzelnen Anfrage mehr das Programm.
  - **Sichern und Wiederherstellen laufen nie doppelt:** Ein zweiter Klick, ein zweites Fenster oder ein Neuladen
    mittendrin startet keinen zweiten Vorgang mehr („Gerade läuft schon eine Wiederherstellung – bitte warten“). Unter
    „Sicherung“ steht, solange etwas läuft – auch nach dem Neuladen der Seite.
  - **Web-App gestoppt oder startet neu (Update, Wiederherstellen):** Über die Adresse der App sprang der Manager dann auf
    „Nur für Administratoren – bitte anmelden“. Jetzt sagt er, dass Mosaik³LAB gerade nicht antwortet, wartet von selbst
    und nennt den Weg direkt am Server.
  - **HTTPS oder Port geändert:** Statt „Der Server-Manager antwortet nicht – es wurde nichts verändert“ steht jetzt, dass
    die Änderung gespeichert ist, mit der neuen Adresse zum Anklicken.
  - **Fehlermeldungen bleiben stehen,** bis man sie schließt (vorher verschwanden sie nach 10 Sekunden). Fehler in einem
    Formular stehen nur noch am Formular, nicht zusätzlich als Meldung darüber.
  - **Testmail:** Fehler des Mailservers werden erklärt (Server nicht gefunden, Benutzer/Passwort abgelehnt, Verschlüsselung
    passt nicht zum Port …) statt nur englisch angezeigt.
  - Kleineres: Der wichtigste Hinweis steht im Status nicht mehr doppelt; die Seite verbindet sich nach einem Neuladen
    während eines Neustarts von selbst wieder; „Abmelden“ meldet, wenn es nicht geklappt hat; eine zu große Datei beim
    Zertifikat wird verständlich abgelehnt; viele gleichzeitige Anmeldeversuche umgehen die Sperre nicht mehr.
- **Abgebrochene Uploads sind kein „Serverfehler“ mehr:** Bricht ein Upload ab (WLAN weg, Fenster geschlossen) oder kommt
  er unvollständig an, heißt es jetzt „Der Upload ist unvollständig angekommen … Bitte erneut versuchen.“ statt „Ein
  unerwarteter Serverfehler ist aufgetreten“. Im Protokoll des Server-Managers stehen dafür keine Fehlermeldungen mit
  Programmzeilen mehr – dort bleiben nur noch echte Fehler. Dasselbe gilt für kaputte Adressen.
- **Geänderte Anfrage mit vielen Teilen:** Ändert eine Lehrkraft bei einem mehrteiligen Druckteil nur einzelne Farben, nennt
  die Mail unter „Was hat sich geändert?“ nur diese Teile (z. B. „Dach: Rot → Dach: Blau“) statt zweimal alle bis zu 20.
- **Einspielen nennt das Feld auf Deutsch:** Wird ein Druckteil beim Einspielen übersprungen, weil Angaben fehlen, steht
  der Grund jetzt z. B. als „Angaben unvollständig (Kategorien: Bitte mindestens eine Kategorie wählen)“ da – vorher mit
  dem internen Feldnamen.
- **Tippflächen überall mindestens 44 px:** Alle Knöpfe, Links, Schalter, Häkchen und Eingabefelder sind in der ganzen
  App auf Handy, Tablet und PC mindestens 44 px hoch, Symbol-Knöpfe auch 44 px breit (vorher oft nur 41 px) – z. B. Logo
  und „Menü“, Suchfeld, „Filter“ und Kategorien im Katalog, das × in Fenstern, „Anmelden“/„Abmelden“, Statusfilter,
  Schalter und Häkchen in der Verwaltung. Ausnahme sind nur Links mitten im Fließtext.
- **Druckteil-Seite neu aufgeteilt:** Links steht alles, was fest zum Druckteil gehört – Bilder und Videos in einer Galerie,
  darunter kompakt Druckdauer, Material, Preis, Art und Einsatzbereiche, dann Beschreibung, Materialinformationen, Links und
  (nur für das Druck-Team) Sicherheitshinweise. Rechts stehen Titel und alles, was man wählt: Farbe bzw. Farbe je Teil
  (Teile-Liste mit Farbwahl-Fenster), Größe, Personalisierung, Anzahl und „Druckteil anfragen“.
  - **Gleich auf der Seite wählen:** Das Anfrage-Fenster kommt vorbelegt und fragt nur noch Schul-E-Mail, Klasse und
    Anpassungswünsche; die Auswahl steht dort als Zusammenfassung mit „Ändern“. „Weitere Stückzahl“ bleibt im Fenster.
    Fehlt eine Pflichtangabe, zeigt die Seite das direkt am Feld.
  - **Videos in der Galerie:** Hochgeladene Videos stehen hinter den Bildern (mit Play-Symbol) und spielen direkt dort,
    ohne Autoplay. YouTube-/Vimeo-Links erscheinen als Kachel „Bei youtube.com ansehen“ (neuer Tab, nichts eingebettet).
  - **iPad quer jetzt zweispaltig;** die rechte Spalte läuft beim Scrollen mit, wenn sie ganz ins Fenster passt. Auf dem
    Handy kommt „Druckteil anfragen“ direkt nach Titel und Auswahl, die Beschreibung danach.
- **Mehrfarbige Druckteile übersichtlich – bis zu 20 Teile:** Ein Druckteil kann jetzt aus bis zu 20 Teilen bestehen
  (vorher 8), jedes Teil mit eigener Farbe.
  - **Anfragen:** Die Teile stehen als kurze Liste (Farbtupfer, Teilname, Farbname). Ein Tipp öffnet das Farbwahl-Fenster
    mit Suche, „Schon in dieser Anfrage“ und allen Farben nach Farbfamilie (Weiß/Grau, Rot, Blau …); nach der Wahl geht
    es automatisch zum nächsten Teil ohne Farbe. „Eine Farbe für alle Teile“ setzt alles auf einmal, danach ändert man nur
    die Abweichungen. „Weitere Stückzahl in anderen Farben“ übernimmt die Farben von oben. Einfarbige Druckteile bleiben,
    wie sie sind.
  - **Anlegen:** Welche Farben zur Wahl stehen, stellt man einmal für alle Teile ein; einzelne Teile bekommen bei Bedarf
    eigene Farben. Teile lassen sich verschieben, verdoppeln und mit „Mehrere Teile auf einmal“ als Liste eintippen.
  - **Anzeige für das Druck-Team:** In der Verwaltung, unter „Meine Anfragen“ und in der Mail steht kurz „10 Teile ·
    7 Farben“; aufgeklappt sind die Teile nach Farbe gebündelt (eine Farbrolle nach der anderen), umschaltbar auf
    Teile-Reihenfolge.
  - **Bitte beachten:** Bestehende Druckteile und Anfragen bleiben unverändert. Eine Export-Datei aus dieser Version lässt
    sich auch in ältere Versionen (z. B. 1.6.3) einspielen, Druckteile mit mehr als 8 Teilen werden dort aber übersprungen
    (mit Grund in der Vorschau) – deshalb zuerst die Schule aktualisieren und danach einspielen.
- **Druckteil bearbeiten mit großer Schrift:** Die Abschnittsköpfe trennen auf dem Handy nicht mehr mitten im Wort (das
  Symbol fällt bei wenig Platz weg), und der schwebende Knopf „Speichern“ verdeckt die letzte Zeile nicht mehr.
- **Katalogkarten mit mehreren Kategorien:** Auf dem Handy mit großer Schrift wurde der Kategoriename auf der Karte
  mitten im Wort getrennt oder abgeschnitten; lange Kategorienamen verschwanden teilweise am Bildrand. Jetzt stehen die
  Namen vollständig da, „+1“ rutscht bei Platzmangel in die nächste Zeile.
- **Suchfelder der Anfragen:** Der Hinweistext im Suchfeld passt auch auf schmalen Handys ganz hinein.
- **Logo auf dem Home-Bildschirm (iPhone, iPad, Android, PC):** „Zum Home-Bildschirm“ und „App installieren“ zeigen zuverlässig das Mosaik³LAB-Logo statt eines Buchstabens – auch von einer Unterseite aus; dazu ein echtes Tab-Symbol (favicon.ico).
- **Druckteil-Seite auf dem Tablet ohne große Lücke:** Steht die Seite zweispaltig (iPad hoch, breite Bildschirme), folgt die Beschreibung jetzt direkt unter den Bildern statt erst nach allen Angaben der rechten Spalte.
- **Mehrere Kategorien je Druckteil:** Beim Anlegen und Bearbeiten eines Druckteils lassen sich jetzt mehrere Kategorien
  ankreuzen. Im Katalog erscheint das Druckteil unter jeder davon; die zuerst gewählte bestimmt Symbolbild und Farbe der
  Karte, weitere stehen daneben („+1“) und auf der Druckteil-Seite. Bestehende Druckteile behalten beim Update ihre
  Kategorie; Export und Einspielen nehmen alle Kategorien mit, ältere Export-Dateien lassen sich weiter einspielen.

## [1.8.0] – 2026-11-18

- **Fotovorschau im Vorschlagsformular:** Ausgewählte Fotos erscheinen jetzt als Vorschaubild (die
  Sicherheitsregeln der Seite hatten sie blockiert).
- **Katalog bei großer Schrift:** Auf dem Handy mit großer Schrift werden die Karten nicht mehr rechts abgeschnitten;
  viele Farbtupfer brechen um.
- **Kontosperre:** Bei weiteren Versuchen an einem schon gesperrten Konto behauptet die Meldung nicht mehr, es sei eine
  E-Mail verschickt worden.
- **Suchfelder verlieren beim schnellen Tippen keine Zeichen mehr:** Im Katalog, in den Anfragen und in der
  Druckteil-Liste der Verwaltung kamen bei schnellem Tippen nicht alle Buchstaben an. Jetzt bleibt alles Getippte stehen;
  Zurück/Vor im Browser und Links mit Suchbegriff funktionieren wie bisher.
- **Aufgeräumt:** Eine seit Längerem ungenutzte Tabelle der Datenbank (alte Einzelrechte) wird entfernt
  (Datenbank-Migration 022, vorher automatische Sicherung; Rechte und Häkchen bleiben unverändert).

- **Updates ab Version 1.6.3:** Aktualisiert wird nur noch von 1.6.3 oder neuer. Ältere Stände bitte zuerst auf 1.6.3
  bringen (Paket 1.6.3 installieren), dann auf diese Version. Übernahmen aus noch älteren Ständen sind entfernt.
- **Kontosperre zählt jeden falschen Versuch:** Kamen mehrere falsche Passwörter gleichzeitig an, zählte die Sperre nach
  zehn Fehlversuchen nur einen davon. Jetzt zählt jeder; eine gerade gesetzte Sperre wird nicht wieder aufgehoben.
- **Vorschlag mit Fotos: Fortschritt und „Senden abbrechen“:** Beim Senden eines Vorschlags mit Fotos zeigt die Seite
  „Wird gesendet … %“, bricht bei abgerissener Verbindung von selbst ab statt endlos zu laden und lässt sich abbrechen –
  die Angaben bleiben stehen.
- **Farbrollen umbenennen ohne Farbverlust:** Wählt ein Druckteil eine ganze Linie (z. B. „alle Farben von Werkstatt PLA
  Matt“) und wird bei eigenen Farbrollen Marke oder Linie umbenannt, folgt die Auswahl im Druckteil jetzt mit. Vorher boten
  solche Druckteile diese Farben ohne Hinweis nicht mehr an.
- **Suche über die Schnittstelle wie im Katalog:** Anfragen- und Vorschlagsliste finden „Muller“ auch bei „Müller“ und
  verstehen mehrere Suchwörter in beliebiger Reihenfolge.
- **Bilder und Druckdateien:** Zwei gleichzeitige Uploads können die Höchstzahl je Druckteil nicht mehr überschreiten;
  abgelehnte oder abgebrochene Uploads hinterlassen keine Dateien in der Ablage.
- **Schneller beim Start und beim Löschen von Stammdaten:** Zwei Start-Prüfungen aus der Zeit vor der Datenbank entfallen;
  neue Indizes (Datenbank-Migration 021, nur Indizes, keine Datenänderung, vorher automatische Sicherung).

- **Sicherung bleibt gültig, wenn alte Sicherungen nicht gelöscht werden können:** Ist eine alte Sicherung unter Windows
  kurz gesperrt (z. B. Virenscanner), wird die gerade erstellte und geprüfte Sicherung nicht mehr verworfen – ein Update
  bricht deshalb nicht mehr mit „Sicherung vor dem Update fehlgeschlagen“ ab. Aufgeräumt wird beim nächsten Mal.
- **Update robuster:** Scheitert das Umschalten auf die neue Version, zeigt das Programm wieder auf die bisherige Version
  und die Dienste laufen weiter. Lassen sich alte Programmversionen nach einem gelungenen Update nicht löschen (z. B. ein
  noch offenes Manager-Fenster), meldet das Installieren kein „fehlgeschlagen“ mehr.
- **Wiederherstellen mit Rückfall:** Scheitert das Wiederherstellen einer Sicherung mittendrin (Datenträger voll, Datei
  gesperrt), wird der Stand von direkt davor automatisch zurückgespielt – es bleibt nichts halb ersetzt.
- **Dienst-Wrapper (Windows):** „Dienst-Wrapper aktualisieren“ ersetzt WinSW jetzt in allen Diensten (auch Portal und
  Update-Helfer). Ein frisch geladenes WinSW wird zusätzlich an seiner festen Prüfsumme erkannt, eine fremde Datei verworfen.
- **Linux:** Programm- und Datenordner mit Leerzeichen funktionieren jetzt auch in den Diensten und Verknüpfungen.
- **Sicherheit:** Eine präparierte Sicherungsdatei kann beim Auspacken unter Windows keine Dateien mehr außerhalb des
  Zielordners anlegen.
- **Nur noch ein Update-Weg:** Updates kommen ausschließlich als Installer-Paket (per Knopfdruck im Server-Manager oder
  per USB-Stick). Der frühere Update-Weg über Git und die Laufzeit-Zeile „Git“ sind entfernt; `cli update check|install`
  nutzt jetzt ebenfalls die Paketquelle. Bestehende Installationen und Einstellungen bleiben unverändert.
- `npm run backup` (Entwicklung) erstellt jetzt eine Sicherung wie der Server-Manager (eine geprüfte `.m3lbackup`-Datei).

- **Ladefehler mit „Erneut versuchen“:** Bricht das WLAN kurz ab, bieten jetzt alle Verwaltungsseiten, „Meine Anfragen“,
  „Meine Vorschläge“, die Druckteil-Seite und der Bambu-Import einen Knopf „Erneut versuchen“ statt nur einer Meldung.
- **Farbsuche wie überall:** In der Farbwahl eines Druckteils und im Bambu-Import findet „gruen“ jetzt „Grün“, und
  mehrere Wörter („PLA rot“) grenzen die Suche ein.
- **Einheitliche Filterknöpfe:** Personen, Farbrollen und Vorschläge zeigen ihre Filter wie Katalog und Anfragen als
  runde Knöpfe, die Anzahl steht einheitlich daneben.
- **Fokus auf das erste fehlerhafte Feld** auch im Druckteil-Editor und beim Anlegen einer Person (wie schon im
  Anfrageformular) – spart Tab-Wege mit Tastatur oder Taster.

## [1.7.0] – 2026-11-18

- **Anzeige auf Handy, iPad und bei großer Schrift überarbeitet:** Alle Seiten, Dialoge und Meldungen – auch der
  Server-Manager und die Portal-Seiten – wurden in sieben Bildschirmgrößen, mit 200 % Schrift, mit Browser-Zoom und mit
  Bildschirmtastatur durchgesehen. Lange Wörter werden jetzt mit Trennstrich umbrochen statt mitten im Wort, E-Mail-Adressen
  nur vor @ und Punkt. Bei großer Schrift zerfallen Logo, Menü-Knopf, untere Leiste, Seitentitel, Zahl-Kacheln und
  Stammdaten-Listen nicht mehr in einzelne Buchstaben; Dialoge scrollen bei wenig Höhe samt Titel, sodass Knöpfe wie
  „Zuordnen“ und „Importieren“ erreichbar bleiben; bei offener Bildschirmtastatur verschwindet die untere Leiste.
  Mehrfarbige Anfragen sind in „Meine Anfragen“ und in der Anfragen-Verwaltung ordentlich umbrochen, die Größenwahl „S/M/L“
  hat größere Tippflächen. Im Server-Manager laufen Statustexte nicht mehr über den Rand; Manager und Portal-Seiten
  wachsen mit der Grundschrift des Geräts.

- **Sicherung bricht nicht mehr ab, wenn währenddessen eine Datei verschwindet:** Wird beim Sichern z. B. gerade ein
  Bild in der App gelöscht, überspringt die Sicherung diese Datei (Hinweis im Protokoll) und wird trotzdem fertig.

- **Stabiler bei schwachem WLAN und nach Updates:** Statt einer weißen Seite erscheint bei einem Fehler „Etwas ist
  schiefgelaufen – Seite neu laden“; ein alter Tab nach einem Update lädt sich einmal selbst neu. Der Katalog erscheint
  schneller (kleineres Programm, Schriften werden früh geladen, keine Wartezeit mehr auf die Prüfung der Ersteinrichtung;
  gemessen auf langsamem Mobilfunk: beim ersten Aufruf 6,0 → 5,1 s, danach 1,9 → 1,3 s). Lädt der Katalog nicht, gibt es
  „Erneut versuchen“ (bei Verbindungsfehlern versucht er es einmal selbst). Beim Wechsel zu einem ähnlichen Druckteil ist
  nie mehr kurz das vorige zu sehen. Hochladen lässt sich abbrechen und bricht ab, wenn es eine Minute lang stehen bleibt.
  Fehlermeldungen bleiben stehen, bis man sie schließt. Antwortet der Server beim Absenden einer Anfrage nicht, weist die
  Meldung darauf hin, erst unter „Meine Anfragen“ nachzusehen (keine doppelten Anfragen).

- **Stabiler nach Updates und auf kleinen Raspberry Pis:** Fehlen nach einem Update oder Wiederherstellen viele
  Vorschaubilder, zeigt der Katalog sofort die Originalbilder statt lange zu laden; die Vorschaubilder entstehen nach
  etwa einer Minute im Hintergrund. Auf Geräten mit wenig Arbeitsspeicher werden sehr große Bilder nicht mehr
  verarbeitet (sie bleiben unverändert erhalten), ein Bild, das die Verarbeitung stört, wird nicht nach jedem Neustart
  erneut versucht. Seiten und Listen werden komprimiert übertragen (im WLAN rund 70 % weniger Daten). Export und
  Sicherung brechen nicht mehr ab, wenn währenddessen Bilder verkleinert würden; Stoppen und Updates warten nicht mehr
  auf ein gerade verarbeitetes Bild. Abgebrochene Import-Vorschauen werden zuverlässig aufgeräumt, und Sortieren oder
  Löschen von Bildern im Druckteil-Editor klappt auch, wenn ein Bild inzwischen von PNG zu JPG verkleinert wurde.

- **Bilder macht der Server selbst – Katalog auf dem Handy viel schneller:** Zu jedem Druckteil-Bild legt der Server
  zwei kleine Vorschaubilder an (für die Katalogkarte und für kleine Vorschauen wie „Ähnliche Druckteile“); der Browser
  wählt je nach Bildschirm selbst die passende Größe. Im Test lud der Katalog auf dem Handy statt 11,9 MB nur noch
  0,7 MB Bilder – scharf auch auf Displays mit hoher Pixeldichte. Neue Bilder werden beim Hochladen gleich fertig verarbeitet („Vorschau wird erzeugt … bitte warten“).
  Vorhandene Bilder erledigt die „Bildpflege“ einmal einige Minuten nach dem Start (auch nach diesem Update): zu große
  Originale (über 2000 Pixel) werden verkleinert, wenn das mindestens ein Fünftel Speicher spart – sonst bleibt das Original,
  wie es ist; fehlende Vorschaubilder werden erzeugt – die App bleibt dabei bedienbar.
  Der Knopf „Bilder verkleinern …“ unter Verwaltung → Druckteile entfällt, er ist nicht mehr nötig.
  Vorschaubilder kommen nicht in Exporte und nicht ins Backup (sie werden bei Bedarf neu berechnet).

- **Neutrale Vorgaben:** keine schulspezifischen Beispiele mehr im Standard. Beispiel- und Demo-Adressen lauten
  `…@schule.example`, Texte auf der Anmeldeseite sind neutral. Neue Installationen erlauben zunächst jede Adresse, bis
  die Einrichtung die Domain der Schule übernimmt. Bestehende Installationen behalten ihre erlaubte Domain und ihre
  Konten unverändert.

- **Ähnliche Druckteile:** Beim Bearbeiten eines Druckteils lassen sich im neuen Abschnitt „Ähnliche Druckteile“ andere
  Druckteile über die Suche (Name oder Nummer) verknüpfen und wieder entfernen. Die Verknüpfung gilt für beide Teile.
  Ganz unten auf der Seite des Druckteils erscheinen sie als kleine Karten; ein Tipp öffnet das ähnliche Druckteil.
  Nicht veröffentlichte Teile sieht nur das Druck-Team.

- **Export als ZIP-Datei:** „Exportieren“ erzeugt jetzt eine ZIP-Datei statt einer Textdatei – rund ein Viertel kleiner,
  und die Bilder darin lassen sich am Computer direkt ansehen. Ältere Export-Dateien (.json) lassen sich weiter
  einspielen. Die Schule, die die Datei einspielt, braucht mindestens Version 1.7.0 (ältere melden „keine Export-Datei“).

- **Ähnliche Druckteile wandern mit:** Export und Einspielen übernehmen die Verknüpfungen „Ähnliche Druckteile“. Fehlt ein
  ähnliches Druckteil noch, merkt sich die App die Verknüpfung und legt sie an, sobald es mit einer späteren Datei kommt.
  Vorschau und Ergebnis zeigen z. B. „3 Verknüpfungen werden angelegt, 1 wartet auf Druckteile, die noch fehlen“.
  Verknüpfungen werden nur hinzugefügt, nie gelöscht.

- **Katalog lädt schneller:** Die Seite mit den Druckteilen zeigt zuerst 50 Stück. Beim Runterscrollen kommen kurz vor
  dem Ende automatisch die nächsten 50 dazu – ohne Seitenzahlen. Unter der Liste stehen „50 von 137 Druckteilen“ und der
  Knopf „Weitere Druckteile laden“ (für Tastatur und Screenreader). Suche und Filter finden weiterhin alle Druckteile.
  Wer weit unten ein Druckteil öffnet und zurückgeht, landet wieder an derselben Stelle.

- **Kleinere Bilder:** Bilder von Druckteilen und Fotos in Vorschlägen werden beim Hochladen im Browser auf höchstens
  2000 Pixel verkleinert (JPEG, Bilder mit Transparenz bleiben PNG). Große Handyfotos über 5 MB lassen sich so auch
  hochladen. Vorhandene große Bilder verkleinert inzwischen der Server selbst (siehe oben, „Bilder macht der Server selbst“).

- **Links am Druckteil:** Beim Anlegen und Bearbeiten eines Druckteils gibt es den neuen Abschnitt „Links und
  Bestellhinweise“. Jeder Link bekommt einen Knopftext und eine kurze Beschreibung und erscheint auf der Seite des
  Druckteils als Knopf, z. B. „Taster-Beispiel“ mit dem Link zu einem Elektroteil, das man dazu bestellen muss. Die Links
  kommen beim Exportieren und Einspielen mit.
- **Links in der Beschreibung sind anklickbar:** Adressen mit `https://`, `http://` oder `www.` in der Beschreibung und
  den Materialinformationen öffnen sich in einem neuen Tab.

- **Katalog:** Wer ein Druckteil öffnet und zurückgeht, landet wieder auf derselben Höhe im Katalog statt ganz oben –
  mit der Zurück-Taste oder -Geste, mit „Zurück zum Katalog“ und über die Navigation, auch mit Suche und Filtern.

- **Bilder eines Druckteils:** Bei mehreren Bildern wechselt man jetzt durch Wischen nach links oder rechts, mit den
  großen Pfeil-Knöpfen auf dem Bild oder mit den Pfeiltasten. Die kleinen Vorschaubilder bleiben.

- **Anfrageformular:** Der feste Warnhinweis „Bitte keine Namen … und keine Diagnosen eintragen“ über den
  Personalisierungsfeldern entfällt. Eigene Hinweise der einzelnen Felder bleiben.

- **Druckteile einspielen mit „Ersetzen“:** Wurde in der Quelle nur die Art (Hilfs-/Lehrmittel) oder nur eine Farbgruppe
  („Alle dieser Linie“, „Alle PLA“) geändert, galt das Druckteil als unverändert und wurde nicht ersetzt. Jetzt wird es
  übernommen.

## [1.6.3] – 2026-11-17

- **„Jetzt aktualisieren“ funktioniert auf dem iPad:** Die Rückfrage erscheint jetzt direkt in der Update-Karte statt in
  einem Fenster. Das Fenster blieb in Safari unsichtbar, und der Knopf drehte endlos. Andere Rückfragen im Server-Manager
  weichen auf die einfache Rückfrage des Browsers aus, wenn ihr Fenster nicht richtig zu sehen ist.

## [1.6.2] – 2026-11-17

- **Installer (Windows) hält bei einem Klick ins Fenster nicht mehr an:** Der Markiermodus des Konsolenfensters ist während
  der Einrichtung abgeschaltet. Vorher blieb die Einrichtung nach einem Klick stehen, bis man Esc drückte.

## [1.6.1] – 2026-11-17

- **Update per Knopfdruck hängt nicht mehr endlos:** Kommt beim Herunterladen 90 Sekunden lang nichts an, bricht der
  Server-Manager mit einer klaren Meldung ab (vorher bis zu 30 Minuten Ladeanzeige ohne Hinweis). Der Start des Downloads
  steht jetzt im Protokoll. Der automatische Installer-Test drückt „Jetzt aktualisieren“ jetzt mit dem echten Code des
  Server-Managers statt ihn nachzuahmen.

## [1.6.0] – 2026-11-17

- **Größen sind freiwillig:** Druckteile lassen sich ohne „Verfügbare Größen“ anlegen; Lehrkräfte wählen dann keine Größe.
- **Ganze Linien und ganze Materialien als Farbwahl:** Unter „Bestimmte Farben oder Linien“ gibt es „Alle PLA“, „Alle PETG“ …
  und je Linie „Ganze Linie wählen“. Später in den Stammdaten angelegte Farbrollen dieser Linie bzw. dieses Materials sind
  automatisch mit dabei – anders als bei „Alle Farben“ ohne TPU & Co.
- **Farbrollen löschen, auch wenn sie verwendet werden:** Die Farbe verschwindet dabei automatisch aus allen Druckteilen.
  War es die letzte Farbe eines Bereichs, gilt dort „Alle Farben“. Bestehende Anfragen behalten ihre Farbe.

## [1.5.0] – 2026-11-17

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
