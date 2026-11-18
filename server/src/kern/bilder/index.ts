// Bildverarbeitung der Druckteil-Bilder – die einzige Stelle, die Bilder umrechnet.
//   groessen.ts      feste Größen (Original ≤ 2000 px, karte 1080, mini 360) und Ablage vorschau/<größe>-<breite>/
//   format.ts        Kopfdaten (Maße, EXIF-Drehung) ohne Dekodieren
//   verarbeitung.ts  Dekodieren, Verkleinern, Drehen, Kodieren (jpeg-js, pngjs; reines JavaScript) – austauschbar
//   worker.ts        Rechen-Thread; rechner.ts verwaltet ihn (Warteschlange, Zeitgrenze, Neustart nach Absturz)
//   dienst.ts        Bild verarbeiten und ablegen (Upload, Abruf, Bildpflege); bildpflege.ts Hintergrund-Lauf
//   sperre.ts        Pause während Import/Export/Sicherung
export { BildDienst, istDruckteilBild, type Verarbeitet } from './dienst';
export { Bildpflege, berichtText, type BildpflegeBericht } from './bildpflege';
export { BildFehler, BildRechner } from './rechner';
export { austauschLaeuft, bildpflegeWartetAuf, SICHERUNG_MARKER } from './sperre';
export { istVorschauGroesse, VORSCHAU, VORSCHAU_GROESSEN, VORSCHAU_ORDNER, vorschauRel, type VorschauGroesse } from './groessen';
// verarbeitung.ts wird bewusst nicht hier exportiert: die Bibliotheken laufen nur im Rechen-Thread.
