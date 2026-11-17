# Druckteile weitergeben und alles sichern – kurz erklärt

Es gibt genau **zwei** Dinge, und jedes hat genau **einen** Ort:

| Was | Wofür | Wo |
| --- | --- | --- |
| **Druckteile exportieren / einspielen** | Einzelne, mehrere oder alle Druckteile an eine andere Schule weitergeben oder von dort übernehmen | App → Verwaltung → **Druckteile verwalten** |
| **Sicherung** | Das ganze System sichern und im Notfall zurückholen oder auf einen neuen Rechner umziehen | **Server-Manager** → Reiter „Sicherung“ |

---

## Druckteile exportieren

1. In der App **Verwaltung → Druckteile verwalten** öffnen.
2. Die gewünschten Druckteile **anhaken** – eins, mehrere oder oben „**Alle auswählen**“.
3. **„Exportieren“** drücken. Der Browser lädt **eine Datei** herunter (z. B. `mosaik3lab-druckteile-2026-11-02.json`).

In der Datei steckt alles, was zum Druckteil gehört: Texte, Farben, Varianten, **Bilder, Videos und Druckdateien**.
Nicht drin: Anfragen, Lehrkräfte, Konten und Passwörter.

## Druckteile einspielen

1. **Verwaltung → Druckteile verwalten → „Einspielen …“**.
2. **„Datei auswählen …“** und die Export-Datei wählen. Die Datei wird geprüft – kaputte oder fremde Dateien werden
   abgelehnt, es passiert dann nichts.
3. Sie sehen eine **Vorschau**, z. B. „In der Datei: 5 Druckteile, davon gibt es 2 hier schon.“
4. Nur wenn es schon welche gibt, kommt eine Frage:
   - **Überspringen (empfohlen):** Die vorhandenen bleiben, wie sie sind. Nur Neues kommt dazu.
   - **Ersetzen:** Die vorhandenen bekommen Texte, Bilder und Druckdateien aus der Datei. Nummer und Anfragen bleiben.
5. **„Jetzt einspielen“** – danach steht da, was passiert ist (z. B. „3 Druckteile neu, 2 übersprungen“).

Gut zu wissen:
- **Alles oder nichts:** Klappt etwas nicht, bleibt alles, wie es war. Vorher wird automatisch gesichert.
- Fehlende **Kategorien, Materialien, Einsatzbereiche und Farbrollen** werden automatisch angelegt. Die Vorschau
  nennt sie vorher, z. B. „Wird neu angelegt: Kategorie ‚Werkzeug‘, Farbrolle ‚Gelb (Bambu PLA Basic)‘“.
  Vorhandene werden über den Namen gefunden (Groß-/Kleinschreibung egal; Bambu-Farben über ihre Bambu-Nummer, andere
  Farbrollen über Marke, Linie, Farbname und Farbwert) und nie verändert.
- Es geht nichts still verloren: Fehlt eine Farbe in der Datei, steht das unter „Bitte beachten“. Ein Druckteil wird
  nur übersprungen, wenn wirklich nichts zu retten ist – dann mit Grund.
- Anfragestatus gehören nicht zu den Druckteilen und werden nicht übernommen.
- „Gibt es schon“ heißt: dasselbe Druckteil (z. B. früher von hier exportiert) oder ein Druckteil mit genau
  demselben Namen.
- Auch ältere Export-Dateien lassen sich einspielen.
- Wer das darf: Administration und das 3D-Druck-Team (in der Benutzerverwaltung je Konto abschaltbar).

---

## Sicherung (im Server-Manager)

Eine Sicherung ist **eine Datei** mit dem **ganzen System**: Einstellungen, Konten, Anfragen und alle Druckteile mit
Bildern und Druckdateien.

- **Automatisch:** Reiter „Sicherung“ → „Zeitplan und Speicherort“: Schalter „Täglich automatisch sichern“, dazu die
  **Uhrzeit** und der **Speicherort**. Am besten ein anderes Laufwerk oder ein Netzlaufwerk. Die ältesten Sicherungen
  werden automatisch gelöscht („Anzahl aufbewahren“).
- **„Jetzt sichern“** – zum Beispiel vor größeren Änderungen.
- **Wiederherstellen:** In der Liste „Vorhandene Sicherungen“ bei der gewünschten Sicherung **„Wiederherstellen“**.
  Es kommt eine deutliche Rückfrage. Alles wird auf den Stand der Sicherung zurückgesetzt. Was seitdem dazugekommen
  ist, ist danach weg. Der jetzige Stand wird vorher automatisch gesichert.
- **Passwortschutz:** Sicherungen enthalten Passwörter und Daten der Schule und sind deshalb mit dem
  **Backup-Passwort** verschlüsselt. **Ohne dieses Passwort lässt sich eine Sicherung nicht zurückspielen** – bitte
  aufschreiben und sicher aufbewahren (z. B. bei der Schulleitung). Ausschalten mit „Schutz ausschalten“.

### Auf einen anderen Rechner umziehen

Die Kurzfassung steht im Server-Manager auch unter „Auf anderen Rechner umziehen“ (zum Aufklappen).


1. Im Server-Manager **„Jetzt sichern“**.
2. Die neueste Datei (endet auf `.m3lbackup`) aus dem Speicherort auf einen **USB-Stick** kopieren.
3. Auf dem neuen Rechner Mosaik³LAB installieren und beim Einrichten **„Aus Sicherung einrichten“** wählen.
   Dort die Datei angeben und bei Passwortschutz auch das Passwort. Danach ist alles wie auf dem alten Rechner.

Läuft Mosaik³LAB auf dem anderen Rechner schon: die Datei in dessen Speicherort für Sicherungen kopieren. Sie erscheint
dann in der Liste und lässt sich „wiederherstellen“.

---

Technische Einzelheiten: [ARCHITEKTUR.md](ARCHITEKTUR.md) (Abschnitt „Druckteile exportieren und einspielen“) und
[manager/README.md](../manager/README.md) (Abschnitt „Sicherungen“).
