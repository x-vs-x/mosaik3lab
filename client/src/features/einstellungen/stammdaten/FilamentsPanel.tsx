import { Download, Link2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { Link } from 'react-router-dom';
import { ColorSwatch } from '../../../components/ColorSwatch';
import { Badge, Button, Field, Input, Switch } from '../../../components/ui';
import { api } from '../../../lib/api';
import type { BambuAbgleichHinweis, BambuKatalogAntwort, Filament, Item, MasterData } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { filamentRolle, HEX_FARBE } from '@mosaik3lab/shared/werte/stammdaten';
import { BambuHinweis } from './BambuHinweis';
import { FarbeZuordnenDialog } from './FarbeZuordnenDialog';
import { Aufklappen } from './Aufklappen';
import { BambuImportDialog } from './BambuImportDialog';
import { type Row } from './listRows';
import { VorschlagFeld } from './VorschlagFeld';
import { linienVorschlaege, markenVorschlaege } from './vorschlaege';
import { ListPanel } from './ListPanel';


/**
 * Farbrollen (Filamente): Farbname, Rolle mit Bambu-Nummer und Vorrat sichtbar.
 * Bambu-Katalog-Rollen sind schreibgeschützt (der Abgleich bei Updates pflegt sie), eigene Rollen frei editierbar.
 */
export function FilamentsPanel({ md, onDirty }: { md: MasterData; onDirty: (d: boolean) => void }) {
  const [importOpen, setImportOpen] = useState(false);
  // Bambu-Katalog einmal laden: Hier für den Hinweis auf neue Farben, im Import-Dialog für die Auswahl.
  const katalog = useApi<BambuKatalogAntwort>('/admin/settings/bambu-palette');
  const hinweis = katalog.data?.hinweis ?? null;
  const setHinweis = (
    f: (h: BambuAbgleichHinweis | null) => BambuAbgleichHinweis | null,
  ) => katalog.setData((k) => (k ? { ...k, hinweis: f(k.hinweis) } : k));
  // Druckteile: wie oft wird eine Farbe benutzt, und „Druckteilen zuordnen …“ (wer Druckteile bearbeiten darf).
  const darfZuordnen = useAuth().can('catalog:manage');
  const { data: items, reload: reloadItems } = useApi<Item[]>(darfZuordnen ? '/items?all=1' : null);
  const [zuordnen, setZuordnen] = useState<Filament>();
  const nutzung = (id: string) => {
    if (!items) return undefined;
    const fest = items.filter((i) => i.colorAreas.some((a) => !a.alleFarben && a.colors.includes(id))).length;
    const alle = items.filter((i) => i.colorAreas.some((a) => a.alleFarben)).length;
    return { fest, alle };
  };
  // Eine neue Farbrolle (gespeichert oder aus dem Katalog übernommen) → gleich anbieten, sie Druckteilen zuzuordnen.
  const bekannt = useRef<Set<string>>(undefined);
  useEffect(() => {
    const ids = md.filaments.map((f) => f.id);
    const neu = bekannt.current ? md.filaments.filter((f) => !bekannt.current!.has(f.id)) : [];
    bekannt.current = new Set(ids);
    if (neu.length === 1 && darfZuordnen) setZuordnen(neu[0]);
  }, [md.filaments, darfZuordnen]);
  const zuordnenLeiste = (row: Row<Filament>) => {
    const n = row.id ? nutzung(row.id) : undefined;
    const f = row.id ? md.filaments.find((x) => x.id === row.id) : undefined;
    if (!n || !f) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-hinweis text-stone-600">
        <span className="min-w-0">
          {n.fest === 0
            ? 'Bei keinem Druckteil ausgewählt'
            : n.fest === 1 ? 'Bei 1 Druckteil ausgewählt' : `Bei ${n.fest} Druckteilen ausgewählt`}
          {n.alle > 0 && `, dazu ${n.alle} mit „Alle Farben“`}
        </span>
        <Button variant="ghost" size="sm" icon={Link2} className="ml-auto shrink-0" onClick={() => setZuordnen(f)}>
          Druckteilen zuordnen …
        </Button>
      </div>
    );
  };
  // Vorschläge aus den gespeicherten Farbrollen – neu Eingetipptes erscheint nach dem Speichern mit.
  const marken = useMemo(() => markenVorschlaege(md.filaments), [md.filaments]);
  const validate = useCallback((r: Row<Filament>) => {
    if (!r.colorName.trim()) return 'Bitte einen Farbnamen eingeben.';
    if (!HEX_FARBE.test(r.hex)) return 'Bitte einen Farbwert im Format #RRGGBB eingeben.';
    return undefined;
  }, []);

  return (
    <ListPanel<Filament>
      list="filaments"
      source={md.filaments}
      title="Farbrollen"
      intro={
        <>
          Die Filament-Rollen im Druckraum. Lehrkräfte sehen nur Farbname und
          Farbe, Druck-Team und Verwaltung auch Rolle und Bambu-Nummer. Farben
          aus dem Bambu-Lab-Katalog werden bei Updates automatisch aktualisiert
          und sind darum nicht änderbar; eigene Farbrollen (auch anderer Marken)
          legen Sie mit „Farbrolle hinzufügen“ an. Leere Rollen werden nicht
          angeboten – schnell umschalten geht auch unter Verwaltung →{' '}
          <Link to="/verwaltung/filamente" className="font-bold text-brand-700 underline underline-offset-2">Farbrollen</Link>
          . Gelöschte Farbrollen werden automatisch aus allen Druckteilen
          entfernt.
          {hinweis && (
            <BambuHinweis
              hinweis={hinweis}
              onNeueAnsehen={() => setImportOpen(true)}
              onGelesen={async () => {
                await api('/admin/settings/bambu-palette/hinweis', { method: 'DELETE' });
                setHinweis(() => null);
              }}
            />
          )}
        </>
      }
      noun="Farbrolle"
      addLabel="Farbrolle hinzufügen"
      blank={() => ({
        brand: '',
        line: '',
        colorName: '',
        hex: '#3ccbfc',
        herstellerNummer: '',
        available: true,
        katalogId: null,
        herstellerName: '',
        weggefallen: false,
      })}
      validate={validate}
      rowLabel={(r, i) => r.colorName.trim() ? `Farbrolle „${r.colorName.trim()}“` : `Farbrolle ${i + 1}`}
      onDirty={onDirty}
      onSaved={(removed) => {
        // Gelöschte Farbrollen nimmt der Server automatisch aus den Druckteilen.
        const ids = new Set(removed.map((r) => r.id));
        const betroffen = (items ?? []).filter((i) => i.colorAreas.some((a) => !a.alleFarben && a.colors.some((c) => ids.has(c)))).length;
        if (darfZuordnen) void reloadItems();
        if (!betroffen) return undefined;
        return betroffen === 1
          ? 'Gelöschte Farben wurden aus 1 Druckteil entfernt.'
          : `Gelöschte Farben wurden aus ${betroffen} Druckteilen entfernt.`;
      }}
      layout="compact"
      toolbar={({ dirty, applySaved }) => (
        <>
          <Button
            variant="secondary"
            icon={Download}
            onClick={() => setImportOpen(true)}
            className="w-full sm:w-auto"
            data-testid="bambu-import-open"
          >
            Bambu-Lab-Farben importieren
          </Button>
          <FarbeZuordnenDialog
            farbe={zuordnen}
            items={items ?? []}
            filaments={md.filaments}
            onClose={() => setZuordnen(undefined)}
            onDone={() => void reloadItems()}
          />
          <BambuImportDialog
            open={importOpen}
            katalog={katalog}
            onClose={() => setImportOpen(false)}
            existing={md.filaments}
            neu={hinweis?.neu ?? []}
            blocked={dirty}
            onImported={async (next, ids) => {
              await applySaved(next);
              setImportOpen(false);
              setHinweis((h) => h ? { ...h, neu: h.neu.filter((id) => !ids.includes(id)) } : h);
            }}
          />
        </>
      )}
      renderRow={(row, update, error) => {
        if (row.katalogId) return <KatalogZeile row={row} update={update} extra={zuordnenLeiste(row)} />;
        const hexError = row.colorName.trim() ? error : undefined;
        const kind = filamentRolle(row);
        return (
          <div className={RASTER}>
            <ColorSwatch hex={HEX_FARBE.test(row.hex) ? row.hex : '#ffffff'} className="size-10" />
            <div className="min-w-0">
              <Field label="Farbname" required error={!row.colorName.trim() ? error : undefined}>
                {({ id, invalid, describedBy }) => (
                  <Input
                    id={id}
                    value={row.colorName}
                    maxLength={60}
                    placeholder="z. B. Türkis"
                    invalid={invalid}
                    aria-describedby={describedBy}
                    onChange={(e) => update({ colorName: e.target.value })}
                  />
                )}
              </Field>
              {kind && <p className="mt-1 text-hinweis text-stone-600">{kind}</p>}
            </div>
            <Steuerung
              badge={<Badge className="bg-amber-50 text-amber-900 ring-amber-200">eigene</Badge>}
              name={row.colorName.trim() || 'Farbrolle'}
              checked={row.available !== false}
              onChange={(v) => update({ available: v })}
            />
            <div className="col-span-full space-y-1 md:col-start-2">
              {zuordnenLeiste(row)}
              <Aufklappen label="Marke, Linie, Nummer und Farbe ändern" open={!row.id || !!hexError}>
              <div className="grid items-start gap-3 sm:grid-cols-3">
                <VorschlagFeld
                  label="Marke"
                  value={row.brand}
                  maxLength={40}
                  placeholder="z. B. Bambu Lab"
                  vorschlaege={marken}
                  onChange={(v) => update({ brand: v })}
                />
                <VorschlagFeld
                  label="Linie"
                  value={row.line}
                  maxLength={40}
                  placeholder="z. B. PLA Basic"
                  vorschlaege={linienVorschlaege(md.filaments, row.brand)}
                  onChange={(v) => update({ line: v })}
                />
                <Field label="Nummer (freiwillig)">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={row.herstellerNummer}
                      maxLength={20}
                      placeholder="Artikel-Nr. der Rolle"
                      onChange={(e) => update({ herstellerNummer: e.target.value })}
                    />
                  )}
                </Field>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Farbe wählen">
                  {({ id }) => (
                    <input
                      id={id}
                      type="color"
                      value={HEX_FARBE.test(row.hex) ? row.hex.toLowerCase() : '#000000'}
                      onChange={(e) => update({ hex: e.target.value })}
                      className="block h-12 w-20 cursor-pointer rounded-xl border border-stone-300 bg-white p-1 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/20"
                    />
                  )}
                </Field>
                <Field label="oder Farbwert (#RRGGBB)" required error={hexError} className="w-52">
                  {({ id, invalid, describedBy }) => (
                    <Input
                      id={id}
                      value={row.hex}
                      maxLength={7}
                      placeholder="#RRGGBB"
                      spellCheck={false}
                      invalid={invalid}
                      aria-describedby={describedBy}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        update({ hex: v && !v.startsWith('#') ? `#${v}` : v });
                      }}
                      className="font-mono"
                    />
                  )}
                </Field>
              </div>
              </Aufklappen>
            </div>
          </div>
        );
      }}
    />
  );
}

/** Bambu-Katalog-Rolle: alles schreibgeschützt außer „vorrätig“. */
function KatalogZeile({
  row,
  update,
  extra,
}: {
  row: Row<Filament>;
  update: (patch: Partial<Omit<Filament, 'id'>>) => void;
  extra: ReactNode;
}) {
  return (
    <div className={RASTER}>
      <ColorSwatch hex={row.hex} className="size-10" />
      <div className="min-w-0">
          <p className="font-bold text-stone-900">
            {row.colorName}{' '}
            {row.herstellerName && row.herstellerName !== row.colorName && (
              <span className="font-normal text-stone-600">({row.herstellerName})</span>
            )}
          </p>
          <p className="text-hinweis text-stone-600">{filamentRolle(row)} <span className="font-mono">{row.hex}</span></p>
      </div>
      <Steuerung
        badge={
          row.weggefallen ? (
            <Badge className="bg-red-50 text-red-800 ring-red-200">nicht mehr bei Bambu Lab</Badge>
          ) : (
            <Badge className="bg-brand-50 text-brand-800 ring-brand-200">Bambu-Katalog</Badge>
          )
        }
        name={row.colorName}
        checked={row.available !== false}
        onChange={(v) => update({ available: v })}
      />
      {extra && <div className="col-span-full md:col-start-2">{extra}</div>}
    </div>
  );
}

/**
 * Feste Spalten je Zeile – ab md: Farbe | Name | Herkunft | Vorrätig (die Pfeile und „Entfernen“ setzt ListPanel
 * links/rechts daneben). So stehen Schalter und Knöpfe in jeder Zeile an derselben Stelle, egal wie lang der Name ist.
 * Handy: Farbe + Name oben, Schalter und Herkunft in einer Reihe darunter.
 */
const RASTER = 'grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 md:grid-cols-[2.5rem_minmax(0,1fr)_10rem_9.5rem]';

function Steuerung({
  badge,
  name,
  checked,
  onChange,
}: {
  badge: ReactNode;
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    // Handy: Schalter links, Herkunft dahinter – so steht der Schalter in jeder Zeile an derselben Stelle.
    <div className="col-span-2 flex flex-wrap items-center gap-3 md:contents">
      <div className="order-last min-w-0 md:order-none">{badge}</div>
      <div className="shrink-0"><Switch checked={checked} onChange={onChange} label="vorrätig" srLabel={`${name} vorrätig`} /></div>
    </div>
  );
}
