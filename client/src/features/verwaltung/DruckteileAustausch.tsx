import { ArrowUpFromLine, CircleCheck, FileUp, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { ActionBar, Alert, Button, buttonClass, cx } from '../../components/ui';
import { api, apiUpload, isConnectionProblem, UPLOAD_ABGEBROCHEN } from '../../lib/api';
import { withBase } from '../../lib/basePath';
import { formatBytes, formatDate, plural } from '../../lib/format';

// Druckteile exportieren und einspielen – der eine Weg dafür (Verwaltung → Druckteile).
// Export: angehakte Druckteile → GET /api/admin/daten/export?artikel=… (ohne Liste: alle) → eine ZIP-Datei mit allen Dateien
// (ab 1.7.0; ältere Installationen können sie nicht lesen). Einspielen nimmt ZIP und ältere JSON-Exporte.
// Einspielen: Datei wählen → Vorschau → „überspringen“ oder „ersetzen“ für vorhandene → Ergebnis.
// Server: server/src/module/datenaustausch/. Rechte: daten:export, daten:import.

/** Höchstzahl je Export mit Auswahl (die IDs stehen in der Adresse) – wie MAX_AUSWAHL im Server. Alle geht immer. */
export const MAX_AUSWAHL = 200;

/** Adresse des Exports: ohne IDs = alle Druckteile. */
export const exportUrl = (ids?: string[]) => withBase(`/api/admin/daten/export${ids ? `?artikel=${ids.map(encodeURIComponent).join(',')}` : ''}`);

type Modus = 'ueberspringen' | 'ersetzen';
interface Zaehler {
  neu: number;
  ersetzt: number;
  unveraendert: number;
  uebersprungen: number;
}
interface Detail {
  status: 'neu' | 'ersetzt' | 'uebersprungen' | 'hinweis';
  bereich: string;
  name: string;
  text?: string;
}
interface Bericht {
  modus: Modus;
  artikel: number;
  vorhanden: number;
  abschnitte: Record<'artikel' | 'kategorien' | 'einsatzbereiche' | 'materialien' | 'filamente' | 'dateien', Zaehler>;
  /** Ähnliche Druckteile: neu angelegte und vorgemerkte Verknüpfungen (Partner fehlt hier noch). */
  verknuepfungen?: { neu: number; wartend: number };
  details: Detail[];
  weitereDetails: number;
}
interface Vorschau {
  importId: string;
  dateigroesse: number;
  kopf: { exportiertAm: string; mitDateien: boolean; hinweise: string[]; artikel: number; vorhanden: number; dateien: number };
  berichte: Record<Modus, Bericht>;
}

const STATUS_TEXT: Record<Detail['status'], string> = { neu: 'neu', ersetzt: 'ersetzt', uebersprungen: 'übersprungen', hinweis: 'Hinweis' };
const STAMMDATEN: [keyof Bericht['abschnitte'], string, string][] = [
  ['kategorien', 'Kategorie', 'Kategorien'],
  ['materialien', 'Material', 'Materialien'],
  ['einsatzbereiche', 'Einsatzbereich', 'Einsatzbereiche'],
  ['filamente', 'Farbe', 'Farben'],
];

/** Dialog „Druckteile einspielen“. onDone: nach erfolgreichem Einspielen (Liste neu laden). */
export function EinspielenDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [datei, setDatei] = useState<File>();
  const [anteil, setAnteil] = useState<number>();
  const [vorschau, setVorschau] = useState<Vorschau>();
  const [modus, setModus] = useState<Modus>('ueberspringen');
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<Bericht>();
  const [fehler, setFehler] = useState('');
  /** Verbindung beim Einspielen abgerissen: Ob es geklappt hat, ist offen – beim Schließen die Liste neu laden. */
  const [unklar, setUnklar] = useState(false);
  const hochladen = useRef<AbortController | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const meldung = useRef<HTMLDivElement>(null);
  const modusName = useId();

  const zuruecksetzen = () => {
    if (vorschau && !ergebnis) void api(`/admin/daten/import/${vorschau.importId}`, { method: 'DELETE' }).catch(() => undefined);
    setDatei(undefined);
    setVorschau(undefined);
    setErgebnis(undefined);
    setFehler('');
    setAnteil(undefined);
    setModus('ueberspringen');
    if (input.current) input.current.value = '';
  };
  const schliessen = () => {
    if (laeuft) return; // nicht während des Einspielens
    hochladen.current?.abort(); // Vorschau-Upload läuft noch: abbrechen und schließen
    const fertig = !!ergebnis || unklar;
    setUnklar(false);
    zuruecksetzen();
    onClose();
    if (fertig) onDone();
  };

  const waehle = async (f: File | undefined) => {
    zuruecksetzen();
    if (!f) return;
    setDatei(f);
    setAnteil(0);
    const ctrl = new AbortController();
    hochladen.current = ctrl;
    try {
      const fd = new FormData();
      fd.append('datei', f, f.name);
      setVorschau(await apiUpload<Vorschau>('/admin/daten/import/vorschau', fd, setAnteil, { signal: ctrl.signal }));
    } catch (e) {
      // Selbst abgebrochen: keine Fehlermeldung nötig.
      if (!(e instanceof Error && e.message === UPLOAD_ABGEBROCHEN)) setFehler(e instanceof Error ? e.message : 'Die Datei konnte nicht geprüft werden.');
      setDatei(undefined);
      if (input.current) input.current.value = '';
    } finally {
      if (hochladen.current === ctrl) hochladen.current = undefined;
      setAnteil(undefined);
    }
  };

  const starte = async () => {
    if (!vorschau) return;
    setLaeuft(true);
    setFehler('');
    try {
      const r = await api<{ bericht: Bericht }>('/admin/daten/import/ausfuehren', {
        method: 'POST',
        body: { importId: vorschau.importId, modus },
        timeoutMs: 0, // große Dateien dürfen dauern
      });
      setErgebnis(r.bericht);
      setVorschau(undefined);
    } catch (e) {
      if (isConnectionProblem(e)) {
        // Keine Antwort heißt nicht „nichts passiert“: Der Server kann das Einspielen trotzdem abgeschlossen haben.
        setUnklar(true);
        setFehler('Die Verbindung zum Server ist abgerissen. Bitte die Druckteil-Liste prüfen, ob das Einspielen trotzdem geklappt hat, bevor Sie es erneut versuchen.');
      } else {
        setFehler(`${e instanceof Error ? e.message : 'Das Einspielen ist fehlgeschlagen.'} Es wurde nichts verändert.`);
      }
    } finally {
      setLaeuft(false);
    }
  };

  useEffect(() => {
    if ((vorschau || ergebnis || fehler) && meldung.current) meldung.current.focus();
  }, [vorschau, ergebnis, fehler]);

  const bericht = vorschau?.berichte[modus];

  return (
    <Dialog
      open={open}
      onClose={schliessen}
      title="Druckteile einspielen"
      description="Eine Datei, die beim Exportieren entstanden ist, hier hinzufügen – zum Beispiel von einer anderen Schule."
      size="lg"
    >
      {!vorschau && !ergebnis && (
        <>
          <p className="text-stone-700">Nach dem Auswählen sehen Sie zuerst, was passieren würde. Erst mit „Jetzt einspielen“ wird etwas verändert.</p>
          <label htmlFor="einspielen-datei" className={buttonClass('primary', 'md', 'mt-4 w-full cursor-pointer sm:w-auto')}>
            <FileUp className="size-5" aria-hidden />
            Datei auswählen …
          </label>
          <input
            id="einspielen-datei"
            ref={input}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            className="sr-only"
            data-testid="import-datei"
            onChange={(e) => void waehle(e.target.files?.[0])}
            disabled={anteil !== undefined}
          />
          {datei && anteil !== undefined && (
            <div className="mt-4" role="status" aria-live="polite">
              <p className="text-stone-700">
                {anteil < 1 ? `Wird hochgeladen … ${Math.round(anteil * 100)} %` : 'Datei wird geprüft …'} ({datei.name}, {formatBytes(datei.size)})
              </p>
              <progress className="mt-2 h-3 w-full" max={1} value={anteil < 1 ? anteil : undefined} aria-label="Fortschritt" />
              <Button variant="secondary" icon={X} className="mt-3" onClick={() => hochladen.current?.abort()}>
                Abbrechen
              </Button>
            </div>
          )}
        </>
      )}

      <div ref={meldung} tabIndex={-1} className="focus:outline-none" aria-live="polite">
        {fehler && (
          <Alert kind="error" className="mt-4" title="Das hat nicht geklappt">
            {fehler}
          </Alert>
        )}

        {vorschau && bericht && (
          <div data-testid="import-vorschau">
            <p className="text-base text-stone-900">
              In der Datei: <strong>{plural(vorschau.kopf.artikel, 'Druckteil', 'Druckteile')}</strong>
              {vorschau.kopf.vorhanden > 0 ? (
                <>
                  , davon gibt es <strong>{vorschau.kopf.vorhanden}</strong> hier schon.
                </>
              ) : (
                ', alle sind neu.'
              )}
            </p>
            <p className="mt-1 text-hinweis text-stone-600">
              {datei?.name} · {formatBytes(vorschau.dateigroesse)}
              {vorschau.kopf.exportiertAm && ` · exportiert am ${formatDate(vorschau.kopf.exportiertAm)}`}
              {!vorschau.kopf.mitDateien ? ' · ohne Bilder und Druckdateien (ältere Datei)' : vorschau.kopf.dateien > 0 ? ` · ${plural(vorschau.kopf.dateien, 'Bild/Datei', 'Bilder und Dateien')} geprüft` : ''}
            </p>
            {vorschau.kopf.hinweise.length > 0 && (
              <Alert kind="warning" className="mt-3" title="Hinweis aus dem Export">
                <ul className="list-disc pl-5">
                  {vorschau.kopf.hinweise.slice(0, 5).map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {vorschau.kopf.vorhanden > 0 && (
              <fieldset className="mt-4">
                <legend className="mb-2 font-bold text-stone-900">Was soll mit den vorhandenen Druckteilen passieren?</legend>
                <div className="space-y-2">
                  {(
                    [
                      ['ueberspringen', 'Überspringen (empfohlen)', 'Die vorhandenen bleiben genau so, wie sie sind. Nur Neues kommt dazu.'],
                      ['ersetzen', 'Ersetzen', 'Die vorhandenen bekommen Texte, Bilder und Druckdateien aus der Datei. Nummer und Anfragen bleiben.'],
                    ] as const
                  ).map(([wert, titel, text]) => (
                    <label key={wert} className={cx('flex cursor-pointer gap-3 rounded-xl border p-3', modus === wert ? 'border-brand-600 bg-brand-50' : 'border-stone-300 bg-white')}>
                      <input type="radio" name={modusName} checked={modus === wert} onChange={() => setModus(wert)} className="mt-1 size-5 accent-brand-700" data-testid={`import-modus-${wert}`} />
                      <span>
                        <span className="block font-bold text-stone-900">{titel}</span>
                        <span className="block text-hinweis text-stone-600">{text}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <Zusammenfassung bericht={bericht} titel="Das passiert beim Einspielen" />

            <ActionBar
              className="mt-6"
              secondary={
                <Button variant="secondary" onClick={zuruecksetzen} disabled={laeuft}>
                  Andere Datei
                </Button>
              }
              primary={
                <Button icon={ArrowUpFromLine} onClick={() => void starte()} loading={laeuft} data-testid="import-start">
                  {laeuft ? 'Wird eingespielt …' : 'Jetzt einspielen'}
                </Button>
              }
            />
            <p className="mt-3 text-hinweis text-stone-600">Vorher wird automatisch gesichert. Klappt etwas nicht, bleibt alles, wie es war.</p>
          </div>
        )}

        {ergebnis && (
          <div data-testid="import-ergebnis">
            <Alert kind="info" title="Fertig eingespielt">
              {ergebnisSatz(ergebnis)}
            </Alert>
            <Zusammenfassung bericht={ergebnis} titel="Ergebnis" fertig />
            <ActionBar className="mt-6" primary={<Button icon={CircleCheck} onClick={schliessen}>Fertig</Button>} />
          </div>
        )}
      </div>
    </Dialog>
  );
}

function ergebnisSatz(b: Bericht) {
  const a = b.abschnitte.artikel;
  const teile = [a.neu && `${plural(a.neu, 'Druckteil', 'Druckteile')} neu`, a.ersetzt && `${a.ersetzt} ersetzt`, a.uebersprungen && `${a.uebersprungen} übersprungen`, a.unveraendert && `${a.unveraendert} waren schon gleich`].filter(Boolean);
  return teile.length ? `${teile.join(', ')}.` : 'Es gab nichts zu ändern.';
}

/** „Ähnliche Druckteile“: N werden angelegt, M warten auf Druckteile, die noch fehlen. */
function verknuepfungSatz(b: Bericht, fertig: boolean) {
  const { neu = 0, wartend = 0 } = b.verknuepfungen ?? {};
  if (!neu && !wartend) return '';
  // z. B. „Ähnliche Druckteile: 3 Verknüpfungen werden angelegt, 1 wartet auf Druckteile, die noch fehlen.“
  const angelegt = neu === 1 ? (fertig ? 'wurde angelegt' : 'wird angelegt') : fertig ? 'wurden angelegt' : 'werden angelegt';
  const teile = [neu > 0 && `${plural(neu, 'Verknüpfung', 'Verknüpfungen')} ${angelegt}`, wartend > 0 && `${neu > 0 ? wartend : plural(wartend, 'Verknüpfung', 'Verknüpfungen')} ${wartend === 1 ? 'wartet' : 'warten'} auf Druckteile, die noch fehlen`];
  return `Ähnliche Druckteile: ${teile.filter(Boolean).join(', ')}.`;
}

/** Zahlen in Klartext + aufklappbare Einzelheiten. */
function Zusammenfassung({ bericht, titel, fertig = false }: { bericht: Bericht; titel: string; fertig?: boolean }) {
  const a = bericht.abschnitte.artikel;
  const zeilen: [string, number, string?][] = [
    ['Neu angelegt', a.neu],
    ['Ersetzt', a.ersetzt],
    ['Übersprungen', a.uebersprungen, 'text-amber-900'],
    ['Schon gleich, keine Änderung', a.unveraendert],
  ];
  // Stammdaten, die neu angelegt werden, ausdrücklich mit Namen; Hinweise und Gründe fürs Überspringen sichtbar, nicht nur eingeklappt.
  const neueBezuege = bericht.details.filter((d) => d.status === 'neu' && d.bereich !== 'Druckteil').map((d) => `${d.bereich} „${d.name}“`);
  const weitereBezuege = STAMMDATEN.reduce((n, [k]) => n + bericht.abschnitte[k].neu, 0) - neueBezuege.length;
  const wichtig = bericht.details.filter((d) => d.status === 'hinweis' || (d.status === 'uebersprungen' && d.text !== 'gibt es schon' && !d.text?.startsWith('ein Druckteil mit diesem Namen')));
  return (
    <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <h3 className="font-bold text-stone-900">{titel}</h3>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {zeilen
          .filter(([, n]) => n > 0)
          .map(([label, n, farbe]) => (
            <div key={label} className="contents">
              <dt className={cx('text-stone-700', farbe)}>{label}</dt>
              <dd className={cx('font-bold tabular-nums', farbe)}>{plural(n, 'Druckteil', 'Druckteile')}</dd>
            </div>
          ))}
      </dl>
      {verknuepfungSatz(bericht, fertig) && (
        <p className="mt-2 text-stone-700" data-testid="import-verknuepfungen">
          {verknuepfungSatz(bericht, fertig)}
        </p>
      )}
      {neueBezuege.length > 0 && (
        <p className="mt-2 text-stone-700" data-testid="neue-stammdaten">
          {fertig ? 'Neu angelegt: ' : 'Wird neu angelegt: '}
          {neueBezuege.join(', ')}
          {weitereBezuege > 0 && ` und ${weitereBezuege} weitere`}.
        </p>
      )}
      {wichtig.length > 0 && (
        <Alert kind="warning" className="mt-3" title="Bitte beachten">
          <ul className="list-disc pl-5" data-testid="import-hinweise">
            {wichtig.slice(0, 8).map((d, i) => (
              <li key={i}>
                {d.status === 'uebersprungen' ? 'Übersprungen' : d.bereich}: {d.name}
                {d.text && ` – ${d.text}`}
              </li>
            ))}
            {wichtig.length > 8 && <li>… und {wichtig.length - 8} weitere (siehe Einzelheiten).</li>}
          </ul>
        </Alert>
      )}
      {bericht.details.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer py-2.5 font-bold text-brand-800">Einzelheiten anzeigen ({bericht.details.length + bericht.weitereDetails})</summary>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1 text-hinweis">
            {bericht.details.map((d, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className={cx('font-bold', d.status === 'uebersprungen' && 'text-amber-800', d.status === 'neu' && 'text-emerald-800')}>{STATUS_TEXT[d.status]}</span>
                <span>
                  {d.bereich}: {d.name}
                </span>
                {d.text && <span className="text-stone-600">– {d.text}</span>}
              </li>
            ))}
            {bericht.weitereDetails > 0 && <li className="text-stone-600">… und {bericht.weitereDetails} weitere.</li>}
          </ul>
        </details>
      )}
    </div>
  );
}
