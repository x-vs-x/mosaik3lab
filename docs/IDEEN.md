# Ideen-Eingang

Hier landen neue Wünsche **sofort und unbearbeitet** – einfach unten bei „Neu“ eine Zeile dazuschreiben.
Nichts davon wird beim Aufschreiben umgesetzt.

Ein eigener Agent arbeitet den Eingang später ab: prüft jede Idee, plant sie und verteilt sie (Umsetzen per
Unter-Session, zurückstellen nach [BACKLOG.md](BACKLOG.md) oder verwerfen). Danach wird die Idee unten
in „Erledigt“ verschoben – mit Datum und Verweis (Protokoll/Backlog).

Format (alles freiwillig außer dem Text):
`- [ ] JJJJ-MM-TT – Idee in eigenen Worten`

## Neu

- [ ] 2026-10-31 – Beim Anlegen einen MakerWorld-/Bambu-Lab-Link einfügen: Name, Beschreibung und Bilder werden übernommen, Bilder händisch entfernbar. (Machbarkeit geprüft: inoffizielle Schnittstelle `api.bambulab.com/v1/design-service/design/<id>` liefert Titel, Beschreibung, Bilder, Ersteller, Lizenz; Webseite selbst blockt mit 403. Quelle + Lizenz mitspeichern, nur `makerworld.com` erlauben.)

## In Arbeit (verteilt am 2026-10-31 durch den Hauptchat)

**Welle 1 – erledigt und in `main` (2026-10-31), siehe PROTOKOLL**
- [ ] Statusarten nicht frei konfigurierbar, nur an/aus; weitere Statustypen überlegen → `status-filamente`
- [ ] Ausgeschaltete/gelöschte Statusarten nicht mehr auf der Startseite → `status-filamente`
- [ ] Status „In Arbeit“ auf der Startseite erst einmal ausblenden, nur wenn aktiv → `status-filamente`
- [ ] Filamente als „leer/nicht verfügbar“ markieren; nur verfügbare Farben/Typen anzeigen → `status-filamente`
- [ ] Preis als Textfeld → `produktdaten`
- [ ] Mehrfarbige Drucke: Farbfelder je Bereich → `produktdaten`
- [ ] Personalisierbare Drucke: frei konfigurierbare Abfragefelder → `produktdaten`
- [ ] Videos zu einem Druckteil → `produktdaten`
- [ ] Stammdaten der Hilfsmittel kürzer/übersichtlicher → `produktdaten`
- [ ] Leere Angaben auf der Produktseite ausblenden (Frage prüfen) → `produktdaten`
- [ ] Beim Rolle-Wählen sehen, was die Rolle darf → `rollen-rechte`
- [ ] Einzelnen Personen im Druck-Team unterschiedliche Rechte (sehen/bearbeiten) → `rollen-rechte`
- [ ] Mail bei jeder neuen Bestellung an vordefiniertes Postfach, mit allen Infos → `bestell-mail`
  (Wunsch Nutzer: Konfiguration NUR im Server-Manager über `config/mail.json`; Admin-Panel zeigt nur den Status)

**Welle 2 – läuft (`vorschlaege` = Bereitschaft 1, `meine-bestellungen` = Bereitschaft 2)**
- [ ] Lehrkräfte können Vorschläge einreichen (Fotos, Beschreibung, Links), landen bei den Bestellungen
- [ ] Vorschlag mit einem Klick in ein neues Produkt umwandeln (Admin/Druck-Team)
- [ ] „Meine Bestellungen“ übersichtlicher + erneut anfragen

**Welle 3 – zum Schluss (berührt alles)**
- [ ] Stammdaten als eine Datei exportieren/importieren, Bilder als Text eingebettet
- [ ] „Hilfsmittel“ → auch „Lehrmittel“ in allen Texten
- [ ] UI übersichtlicher, klare Rahmen um Vorgänge

**Abschluss – nach Welle 3**
- [ ] Gesamtprojekt neu bewerten: professionell, übersichtlich, zuverlässig, zukunftsorientiert strukturiert?
- [ ] Oberflächen barrierefrei auf Handy und unterschiedlichen Auflösungen prüfen
- [ ] Alle Funktionen nach dem großen Umbau testen (App + Server-Manager)

## Erledigt / übernommen

