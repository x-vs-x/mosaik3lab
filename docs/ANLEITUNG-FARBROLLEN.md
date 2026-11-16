# Farbrollen und Bambu-Lab-Farben – kurz erklärt

Ort: App → Verwaltung → **Stammdaten → Material & Farben → Farbrollen**.

## Zwei Arten von Farbrollen

| Art | Erkennbar an | Was Sie ändern können |
| --- | --- | --- |
| **Bambu-Katalog** | Abzeichen „Bambu-Katalog“, darunter z. B. „Bambu Lab PLA Basic, Nr. 10101“ und der englische Originalname | nur **vorrätig** an/aus, Reihenfolge, Entfernen (wenn kein Druckteil sie nutzt) |
| **Eigene** | Abzeichen „eigene“ | alles: Marke, Linie, Farbname, Farbe, eine eigene Nummer (freiwillig) |

Name, Bambu-Nummer und Farbe der Bambu-Farben kommen von Bambu Lab und werden bei Updates automatisch aktualisiert.
Darum sind sie nicht änderbar. Eine Farbe einer anderen Marke legen Sie mit **„Farbrolle hinzufügen“** an.

Lehrkräfte sehen immer nur den deutschen Farbnamen und die Farbe. Druck-Team und Verwaltung sehen zusätzlich die Rolle
mit Bambu-Nummer, z. B. in der Mail zu einer neuen Anfrage („Cyan (Bambu Lab PLA Basic, Nr. 10603)“) und bei den Anfragen.

## Welche Farben hat ein Druckteil?

Beim Bearbeiten eines Druckteils (Verwaltung → Druckteile verwalten) wählen Sie je Farbbereich:
- **Alle Farben** – jede vorrätige Farbe, auch Farben, die später dazukommen. Für neue Druckteile ist das voreingestellt.
- **Nur bestimmte Farben** – Sie haken die Farben selbst an (nach Linie sortiert, mit Suche und „Alle dieser Linie wählen“).

Leere Rollen sind als „nicht vorrätig“ markiert und werden Lehrkräften nicht angeboten.

## Eine Farbe vielen Druckteilen zuordnen

Unter jeder Farbrolle steht, bei wie vielen Druckteilen sie ausgewählt ist, und der Knopf **„Druckteilen zuordnen …“**.
Nach dem Anlegen oder Übernehmen einer neuen Farbe öffnet sich der Dialog von selbst. Dort:
- Schnellwahl **„Alle mit PLA-Basic-Farben“** (bzw. der Linie der Farbe), „Alle angezeigten wählen“, Suche, Häkchen je Druckteil.
- Bei mehrfarbigen Druckteilen wählen Sie den Bereich (vorgewählt: Bereiche, die schon Farben derselben Linie haben).
- **„Zuordnen“** ändert alle gewählten Druckteile auf einmal („bei 12 Druckteilen ergänzt“). Klappt etwas nicht, bleibt alles, wie es war.

Druckteile mit „Alle Farben“ erscheinen dort nicht – sie bekommen neue Farben automatisch.

## Neu installiert

16 übliche Farben (PLA Basic, PETG HF, TPU 95A HF) sind gleich da. Weitere Farben: **„Bambu-Lab-Farben importieren“**.
Dort können Sie nach Name oder Nummer suchen, nach Linie filtern und mit **„Alle angezeigten Farben wählen“** viele auf einmal übernehmen.

## Nach einem Update

Die App vergleicht beim Start Ihre Bambu-Farbrollen mit dem neuen Katalog:
- Hat Bambu Lab Name, Nummer oder Farbe geändert, wird das übernommen.
- Führt Bambu Lab eine Farbe nicht mehr, steht dort **„nicht mehr bei Bambu Lab“**. Die Rolle bleibt, weil Druckteile darauf verweisen.
- Neue Farben werden **nicht** automatisch angelegt. Sie stehen im Import mit dem Hinweis **„neu“**.
- „Vorrätig“, die Reihenfolge und Ihre eigenen Farbrollen bleiben unverändert.

Oben in der Farbrollen-Liste steht dann ein kurzer Hinweis, was sich geändert hat. Mit „Hinweis ausblenden“ verschwindet er.

## Für die Entwicklung: Katalog aktualisieren

`node scripts/bambu-katalog.mjs` lädt die Farbliste von Bambu Studio (GitHub, `bambulab/BambuStudio`,
`resources/profiles/BBL/filament/filaments_color_codes.json`) und schreibt `server/src/domain/bambuKatalog.json`. Die Linien
stehen oben im Skript. Katalog-IDs bleiben immer gleich, weggefallene Farben bleiben mit `weggefallen: true` in der Datei.
Danach Diff ansehen, `npm test`, committen. Mit dem nächsten Update übernehmen alle Installationen die Änderungen.
