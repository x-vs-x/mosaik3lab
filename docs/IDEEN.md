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

## In Arbeit

## Erledigt / übernommen

- [x] 2026-11-18 – „Updatewünsche: es wäre super, wenn man mehrere Kategorien auswählen könnte beim anlegen der Dateien“ → umgesetzt in PR 37

**Wellen vom 2026-10-31 – umgesetzt bis Version 1.7.0 (siehe CHANGELOG.md, PROTOKOLL.md)**
- [x] Statusarten nicht frei konfigurierbar, nur an/aus; weitere Statustypen überlegen → `status-filamente`
- [x] Ausgeschaltete/gelöschte Statusarten nicht mehr auf der Startseite → `status-filamente`
- [x] Status „In Arbeit“ auf der Startseite erst einmal ausblenden, nur wenn aktiv → `status-filamente`
- [x] Filamente als „leer/nicht verfügbar“ markieren; nur verfügbare Farben/Typen anzeigen → `status-filamente`
- [x] Preis als Textfeld → `produktdaten`
- [x] Mehrfarbige Drucke: Farbfelder je Bereich → `produktdaten`
- [x] Personalisierbare Drucke: frei konfigurierbare Abfragefelder → `produktdaten`
- [x] Videos zu einem Druckteil → `produktdaten`
- [x] Stammdaten der Hilfsmittel kürzer/übersichtlicher → `produktdaten`
- [x] Leere Angaben auf der Produktseite ausblenden (Frage prüfen) → `produktdaten`
- [x] Beim Rolle-Wählen sehen, was die Rolle darf → `rollen-rechte`
- [x] Einzelnen Personen im Druck-Team unterschiedliche Rechte (sehen/bearbeiten) → `rollen-rechte`
- [x] Mail bei jeder neuen Bestellung an vordefiniertes Postfach, mit allen Infos → `bestell-mail`
  (Wunsch Nutzer: Konfiguration NUR im Server-Manager über `config/mail.json`; Admin-Panel zeigt nur den Status)
- [x] Lehrkräfte können Vorschläge einreichen (Fotos, Beschreibung, Links), landen bei den Bestellungen
- [x] Vorschlag mit einem Klick in ein neues Produkt umwandeln (Admin/Druck-Team)
- [x] „Meine Bestellungen“ übersichtlicher + erneut anfragen
- [x] Stammdaten als eine Datei exportieren/importieren, Bilder als Text eingebettet
- [x] „Hilfsmittel“ → auch „Lehrmittel“ in allen Texten
- [x] UI übersichtlicher, klare Rahmen um Vorgänge
- [x] Gesamtprojekt neu bewerten: professionell, übersichtlich, zuverlässig, zukunftsorientiert strukturiert?
- [x] Oberflächen barrierefrei auf Handy und unterschiedlichen Auflösungen prüfen
- [x] Alle Funktionen nach dem großen Umbau testen (App + Server-Manager)

