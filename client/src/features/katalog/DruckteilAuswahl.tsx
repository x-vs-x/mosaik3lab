import { MAX_ORDER_QUANTITY } from '@mosaik3lab/shared/werte/anfragen';
import { Pencil, Send } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Button, LinkButton } from '../../components/ui';
import { useMasterData } from '../../lib/config';
import { ersteFehlerstelle } from '../../lib/fokus';
import type { Item } from '../../lib/types';
import { ChoiceGroup, CustomFieldInput, EinfarbigeWahl, KeineFarbeHinweis, QuantityInput } from '../anfragen/AnfrageFelder';
import { farbbereiche, farbFehlerSchluessel, gesamtStueck, setzeZeile } from '../anfragen/anfrageAuswahl';
import { pruefeAuswahl } from '../anfragen/anfragePruefung';
import { TeileFarbListe } from '../anfragen/TeileFarbListe';
import type { AuswahlZustand } from '../anfragen/useAnfrageAuswahl';

/**
 * Rechte Spalte der Druckteil-Seite: alles, was man beim Anfragen wählt – Farbe (einfarbig: Knöpfe; mehrteilig: Teile-Liste
 * mit Farbwahl-Fenster), Größe, Personalisierung, Anzahl – und „Druckteil anfragen“. Der Zustand gehört der Seite und wird
 * an das Anfrage-Fenster weitergereicht (dort vorbelegt). Vor dem Öffnen prüft dieselbe Regel wie beim Absenden
 * (`pruefeAuswahl`) die Auswahl; Fehler stehen hier am Feld, der Fokus springt zum ersten.
 */
export function DruckteilAuswahl({ item, zustand, onAnfragen }: { item: Item; zustand: AuswahlZustand; onAnfragen: () => void }) {
  const md = useMasterData();
  const { can } = useAuth();
  const [auswahl, setAuswahl] = zustand;
  const { areas, emptyAreas, multiColor } = farbbereiche(item, md);
  const customFields = item.customFields ?? [];
  const zeile = auswahl.rows[0];
  const weitere = auswahl.rows.length - 1;
  const gesamt = gesamtStueck(auswahl);
  const formRef = useRef<HTMLFormElement>(null);
  // Fehler erst nach dem ersten „Anfragen“, danach live (verschwinden, sobald behoben).
  const [geprueft, setGeprueft] = useState(false);
  const pruefen = () => {
    const alle = pruefeAuswahl({
      rows: auswahl.rows,
      bereiche: areas.map((a) => a.area.id),
      leereBereiche: emptyAreas.map((a) => a.area.id),
      farbFehlerSchluessel: farbFehlerSchluessel(multiColor),
      customFields,
      custom: auswahl.custom,
      sizes: item.sizes,
      size: auswahl.size,
    });
    // Fehler weiterer Stückzahlen zeigt das Fenster (dort werden sie bearbeitet).
    return Object.fromEntries(Object.entries(alle).filter(([k]) => !k.startsWith('variants.')));
  };
  const fehler = geprueft ? pruefen() : {};

  const anfragen = (e: FormEvent) => {
    e.preventDefault();
    setGeprueft(true);
    if (Object.keys(pruefen()).length === 0) {
      onAnfragen();
      return;
    }
    requestAnimationFrame(() => (formRef.current ? ersteFehlerstelle<HTMLElement>(formRef.current)?.focus() : undefined));
  };

  return (
    <form
      ref={formRef}
      onSubmit={anfragen}
      noValidate
      aria-labelledby="auswahl-titel"
      className="space-y-5 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200 sm:rounded-3xl sm:p-5"
    >
      <h2 id="auswahl-titel" className="text-abschnitt font-bold text-stone-900">
        Ihre Auswahl
      </h2>
      <KeineFarbeHinweis leer={emptyAreas} multiColor={multiColor} />
      {multiColor && areas.length > 0 && (
        <TeileFarbListe
          teile={areas}
          colors={zeile.colors}
          onChange={(colors) => setAuswahl((a) => setzeZeile(a, 0, { colors }))}
          fehler={(id) => fehler[`color.${id}`]}
        />
      )}
      {!multiColor &&
        areas.map(({ area, filaments }) => (
          <EinfarbigeWahl
            key={area.id}
            legend="Farbe"
            name={`seite-farbe-${area.id}`}
            filaments={filaments}
            value={zeile.colors[area.id] ?? ''}
            onChange={(v) => setAuswahl((a) => setzeZeile(a, 0, { colors: { ...a.rows[0].colors, [area.id]: v } }))}
            error={fehler.color}
          />
        ))}
      {item.sizes.length > 0 && (
        <ChoiceGroup
          legend="Größe"
          name="seite-groesse"
          value={auswahl.size}
          onChange={(size) => setAuswahl((a) => ({ ...a, size }))}
          error={fehler.size}
          options={item.sizes.map((s) => ({ value: s, content: <span className="wrap-anywhere">{s}</span> }))}
        />
      )}
      {customFields.length > 0 && (
        <fieldset className="min-w-0 space-y-4">
          <legend className="mb-3 text-abschnitt font-bold text-stone-900">Personalisierung</legend>
          {customFields.map((f) => (
            <CustomFieldInput
              key={f.id}
              field={f}
              value={auswahl.custom[f.id] ?? ''}
              onChange={(v) => setAuswahl((a) => ({ ...a, custom: { ...a.custom, [f.id]: v } }))}
              error={fehler[`custom.${f.id}`]}
            />
          ))}
        </fieldset>
      )}
      <QuantityInput
        id="seite-anzahl"
        contextLabel=""
        value={zeile.quantity}
        max={Math.max(1, MAX_ORDER_QUANTITY - (gesamt - zeile.quantity))}
        onChange={(quantity) => setAuswahl((a) => setzeZeile(a, 0, { quantity }))}
        error={fehler.quantity}
      />
      {weitere > 0 && (
        <Alert kind="info">
          Dazu {weitere === 1 ? 'eine weitere Stückzahl' : `${weitere} weitere Stückzahlen`} in anderen Farben – zusammen {gesamt} Stück. Ändern
          können Sie diese im Anfrage-Fenster.
        </Alert>
      )}
      <div className="space-y-2.5 border-t border-stone-200 pt-4">
        {item.published && (
          <>
            <Button type="submit" size="lg" icon={Send} className="w-full">
              Druckteil anfragen
            </Button>
            <p className="text-hinweis text-stone-600">Im nächsten Schritt: Schul-E-Mail, Klasse und Anpassungswünsche.</p>
          </>
        )}
        {can('catalog:manage') && (
          <LinkButton to={`/verwaltung/hilfsmittel/${item.id}`} variant="secondary" size="lg" icon={Pencil} className="w-full">
            Bearbeiten
          </LinkButton>
        )}
      </div>
    </form>
  );
}
