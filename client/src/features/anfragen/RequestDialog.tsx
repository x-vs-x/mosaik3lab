import { MAX_ORDER_QUANTITY, MAX_ORDER_VARIANTS, ORDER_CLASS_MAX, ORDER_CUSTOMIZATION_MAX } from '@mosaik3lab/shared/werte/anfragen';
import { CircleCheck, LayoutGrid, Plus, Save, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Dialog } from '../../components/Dialog';
import { EntwurfHinweis } from '../../components/EntwurfHinweis';
import { Alert, Button, Field, Input, LinkButton, Textarea } from '../../components/ui';
import { api, ApiError, isConnectionProblem } from '../../lib/api';
import { useConfig, useMasterData } from '../../lib/config';
import { anfrageEmail } from './anfrageEmail';
import { ersteFehlerstelle } from '../../lib/fokus';
import { entwurfSchluessel } from '../../lib/entwurfSpeicher';
import { getProfile, saveProfile } from './guestOrders';
import type { Item, OrderInput, OrderReceipt, RequestTemplate } from '../../lib/types';
import { useEntwurf } from '../../lib/useEntwurf';
import { ChoiceGroup, ColorRow, CustomFieldInput, KeineFarbeHinweis } from './AnfrageFelder';
import { domainHint, normalizeDomain, pruefeAnfrage } from './anfragePruefung';
import { entferneStueckzahl, farbbereiche, farbFehlerSchluessel, gesamtStueck, setzeZeile, startAuswahl, weitereStueckzahl } from './anfrageAuswahl';
import { AuswahlUebersicht } from './AuswahlUebersicht';
import { useAnfrageAuswahl, type AuswahlZustand } from './useAnfrageAuswahl';

/** Fehler in Zeile 1, Größe oder Personalisierung (dann klappt das Fenster die Felder der Seiten-Auswahl auf). */
const istAuswahlFehler = (k: string) => k === 'size' || k === 'quantity' || k === 'color' || k.startsWith('color.') || k.startsWith('custom.');

/** Fehler an einer Farbe – in Zeile 1 (`color`, `color.<teil>`) oder einer weiteren Stückzahl (`variants.<n>.color…`). */
const istFarbFehler = (k: string) => /(^|\.)color(\.|$)/.test(k);

/** Schlüssel des Anfrage-Entwurfs – auch für die Detailseite, die den Dialog nach einem Neuladen wieder öffnet. */
export const anfrageEntwurfSchluessel = (itemId: string, userId?: string, templateOrderId?: string) =>
  entwurfSchluessel(`anfrage-${itemId}`, userId, templateOrderId);

/**
 * Merker „Anfrage-Fenster zuletzt selbst geschlossen“ (liegt beim Entwurf und verfällt wie er): Die Druckteil-Seite öffnet
 * das Fenster dann nicht von selbst wieder.
 */
export const anfrageGeschlossenSchluessel = (itemId: string, userId?: string) => entwurfSchluessel(`anfrage-zu-${itemId}`, userId);

/**
 * Anfrageformular für Lehrkräfte – ohne Anmeldung.
 * `template`: Vorbelegung aus „Erneut anfragen“ – alle Angaben bleiben vor dem Absenden änderbar.
 * `edit`: dieselbe Anfrage ändern (PUT, nur solange offen); `onSaved` nach dem Speichern.
 * `auswahl`: von der Druckteil-Seite – Farbe, Größe, Personalisierung und Anzahl sind dort schon gewählt (gemeinsamer
 * Zustand); das Fenster zeigt sie als Zusammenfassung mit „Ändern“ und fragt nur noch E-Mail, Klasse und Wünsche.
 */
export function RequestDialog({
  item,
  open,
  onClose,
  template,
  edit = false,
  onSaved,
  auswahl: auswahlVonSeite,
}: {
  item: Item;
  open: boolean;
  onClose: () => void;
  template?: RequestTemplate;
  edit?: boolean;
  onSaved?: () => void;
  auswahl?: AuswahlZustand;
}) {
  const md = useMasterData();
  const { config, reload: ladeStammdaten } = useConfig();
  const domains = (config?.orderForm.allowedEmailDomains ?? []).map(normalizeDomain).filter(Boolean);
  // Bereiche mit hinterlegten Farben; „filaments“ enthält nur vorrätige Rollen (siehe lib/colors.ts).
  const { areas, emptyAreas, multiColor } = farbbereiche(item, md);
  const colorErrorKey = farbFehlerSchluessel(multiColor);
  // Weitere Farben: immer möglich, sobald jeder Bereich eine vorrätige Farbe hat (dazu gibt es „Farbe egal“).
  const canAddColors = emptyAreas.length === 0 && areas.length > 0;
  const customFields = item.customFields ?? [];

  const { user, loading: authLoading } = useAuth();
  const [profile] = useState(getProfile);
  // Angemeldet (Lehrkraft oder Konto): die eigene E-Mail ist fest (nur lesend), damit die Anfrage sicher unter
  // „Meine Anfragen“ erscheint. Die Anmeldung kann erst nach dem Druckteil geladen sein; ein wiederhergestellter
  // Entwurf oder die zuletzt auf diesem Gerät benutzte Adresse (gemeinsamer PC) ändern daran nichts.
  const sessionEmail = !authLoading && user ? user.email : undefined;
  const [requesterEmail, setRequesterEmail] = useState(profile.requesterEmail);
  const shownEmail = sessionEmail ?? requesterEmail;
  const [classOrTeam, setClassOrTeam] = useState(template?.classOrTeam || profile.classOrTeam);
  // Auswahl (Zeile 1 = Anzahl + Farbe; weitere Zeilen = weitere Farben, z. B. 3 × Blau, 4 × Gelb) – von der Seite oder eigene.
  const eigeneAuswahl = useAnfrageAuswahl(item, template);
  const [auswahl, setAuswahl] = auswahlVonSeite ?? eigeneAuswahl;
  const { rows, size, custom } = auswahl;
  const total = gesamtStueck(auswahl);
  const setSize = (v: string) => setAuswahl((a) => ({ ...a, size: v }));
  const setCustom = (id: string, v: string) => setAuswahl((a) => ({ ...a, custom: { ...a.custom, [id]: v } }));
  // Von der Seite: Zeile 1, Größe und Personalisierung nur als Zusammenfassung, bis man „Ändern“ tippt.
  const [felderOffen, setFelderOffen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [customization, setCustomization] = useState(template?.customization ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<OrderReceipt>();
  const successRef = useRef<HTMLParagraphElement>(null);

  const draftValue = { requesterEmail, classOrTeam, rows, custom, size, customization };
  // Ältere Entwürfe (vor „Weitere Farbe“) haben quantity/colors statt rows.
  const applyDraft = useCallback((d: typeof draftValue & { quantity?: number; colors?: Record<string, string> }) => {
    setRequesterEmail(d.requesterEmail);
    setClassOrTeam(d.classOrTeam);
    setAuswahl({
      rows: Array.isArray(d.rows) && d.rows.length ? d.rows : [{ quantity: d.quantity ?? 1, colors: d.colors ?? {} }],
      custom: d.custom ?? {},
      size: d.size ?? '',
    });
    setCustomization(d.customization);
  }, [setAuswahl]);
  const draftKey = template && edit ? `aendern-${template.orderId}` : template?.orderId;
  const entwurf = useEntwurf(anfrageEntwurfSchluessel(item.id, user?.id, draftKey), draftValue, applyDraft, {
    ready: !authLoading,
    enabled: open && !receipt,
  });

  useEffect(() => {
    if (receipt) successRef.current?.focus();
  }, [receipt]);

  // Weitere Farbe: neue Zeile mit 1 Stück, Fokus auf ihre Überschrift; nach „Entfernen“ zurück zum Button.
  const focusAfterRender = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!focusAfterRender.current) return;
    document.getElementById(focusAfterRender.current)?.focus();
    focusAfterRender.current = undefined;
  }, [rows.length, felderOffen]);
  const focusLater = (id: string) => {
    focusAfterRender.current = id;
  };
  // Mehrteilige Druckteile: nur eine Stückzahl ist aufgeklappt, die anderen stehen als kurze Zeile darüber/darunter.
  const [offeneZeile, setOffeneZeile] = useState(0);
  const addRow = () => {
    // Mehrteilig: übernimmt die Farben der letzten Stückzahl – man ändert nur, was abweicht.
    setAuswahl((a) => weitereStueckzahl(a, areas, multiColor));
    setOffeneZeile(rows.length);
    focusLater(`farbzeile-${rows.length}`);
  };
  const removeRow = (index: number) => {
    setAuswahl((a) => entferneStueckzahl(a, index));
    setOffeneZeile(0);
    setErrors({});
    focusLater('weitere-farbe');
  };
  // Fehler in Zeile 1, Größe oder Personalisierung: Felder aufklappen, damit man sie sieht und korrigieren kann.
  const kurz = !!auswahlVonSeite && !felderOffen && !Object.keys(errors).some(istAuswahlFehler);
  const zeileHatFehler = (i: number) => Object.keys(errors).some((k) => (i ? k.startsWith(`variants.${i}.`) : k === 'color' || k.startsWith('color.')));

  const close = () => {
    onClose();
    if (receipt) {
      setReceipt(undefined);
      setAuswahl(startAuswahl(areas, item.sizes, md, template));
      setFelderOffen(false);
      setCustomization(template?.customization ?? '');
      entwurf.clear();
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const email = anfrageEmail(sessionEmail, requesterEmail);
    const local = pruefeAnfrage({
      email,
      angemeldet: !!sessionEmail,
      domains,
      classOrTeam,
      rows,
      bereiche: areas.map((a) => a.area.id),
      leereBereiche: emptyAreas.map((a) => a.area.id),
      farbFehlerSchluessel: colorErrorKey,
      customFields,
      custom,
      sizes: item.sizes,
      size,
    });
    setErrors(local);
    if (Object.keys(local).some(istAuswahlFehler)) setFelderOffen(true);
    setFormError(undefined);
    if (Object.keys(local).length) {
      // Ohne vorrätige Farbe ist kein Feld markiert – dann sagen, woran es liegt.
      setFormError(
        config && emptyAreas.length
          ? 'Für dieses Druckteil ist gerade keine Farbe vorrätig – die Anfrage kann noch nicht gesendet werden. Bitte versuchen Sie es später noch einmal.'
          : 'Bitte prüfen Sie die markierten Angaben.',
      );
      // Direkt zum ersten fehlenden Feld (spart Tab-Wege, wichtig mit Tastatur oder Taster)
      const form = e.currentTarget as HTMLFormElement;
      requestAnimationFrame(() => ersteFehlerstelle<HTMLElement>(form)?.focus());
      return;
    }

    // Eine Zeile = wie bisher ohne `variants`; mehrere Zeilen = Aufteilung, Gesamtzahl = Summe.
    const body: OrderInput = {
      itemId: item.id,
      quantity: total,
      colors: rows[0].colors,
      ...(rows.length > 1 ? { variants: rows } : {}),
      size,
      requesterEmail: email,
      classOrTeam: classOrTeam.trim(),
      customization: customization.trim(),
      personalization: Object.fromEntries(
        Object.entries(custom).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v),
      ),
      ...(template && !edit ? { repeatOf: template.orderId } : {}),
    };
    setSubmitting(true);
    try {
      if (edit && template) {
        await api(`/orders/${encodeURIComponent(template.orderId)}`, { method: 'PUT', body });
        entwurf.clear();
        onSaved?.();
        return;
      }
      const result = await api<OrderReceipt>('/orders', { method: 'POST', body });
      // Angemeldet die Geräte-Vorbelegung für Gäste nicht mit der eigenen Adresse überschreiben (gemeinsamer PC).
      saveProfile({ requesterEmail: sessionEmail ? profile.requesterEmail : body.requesterEmail, classOrTeam: body.classOrTeam });
      entwurf.clear();
      setReceipt(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Das Team bearbeitet die Anfrage inzwischen – nicht mehr speicherbar; die Liste lädt beim Schließen neu.
        setLocked(true);
        entwurf.clear();
        setFormError(`${err.message} Änderungen bitte direkt beim Druck-Team melden.`);
      } else if (!edit && isConnectionProblem(err)) {
        // Keine Antwort (z. B. Zeitüberschreitung im WLAN) heißt nicht „nicht angekommen“ – sonst entstünden doppelte Anfragen.
        setFormError(
          'Der Server hat nicht rechtzeitig geantwortet. Die Anfrage ist vielleicht trotzdem angekommen: Bitte zuerst unter „Meine Anfragen“ nachsehen (oder beim Druck-Team nachfragen), bevor Sie sie erneut senden. Ihre Eingaben bleiben hier erhalten.',
        );
      } else if (err instanceof ApiError) {
        setErrors(err.fields);
        if (Object.keys(err.fields).some(istAuswahlFehler)) setFelderOffen(true);
        setFormError(err.message);
        // Farbe abgelehnt: Die Farbrolle ist inzwischen leer. Farbrollen neu laden, damit sie nicht weiter zur Wahl steht.
        if (Object.keys(err.fields).some(istFarbFehler)) void ladeStammdaten();
      } else {
        setFormError('Die Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={receipt ? 'Anfrage gesendet' : edit ? 'Anfrage bearbeiten' : template ? 'Erneut anfragen' : 'Druckteil anfragen'}
      description={receipt ? undefined : edit && template ? `${item.name} · Nr. ${template.number}` : item.name}
      size="lg"
    >
      {receipt ? (
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-700">
            <CircleCheck className="size-9" aria-hidden />
          </div>
          <p ref={successRef} tabIndex={-1} className="mt-5 text-abschnitt font-bold text-stone-900 focus:outline-none">
            Vielen Dank! Ihre Anfrage ist beim 3D-Druck-Team eingegangen.
          </p>
          <p className="mt-2 text-stone-700">Das Team meldet sich bzw. bringt das Druckteil vorbei.</p>
          <div className="mx-auto mt-6 max-w-sm rounded-2xl bg-stone-50 p-5 ring-1 ring-stone-200">
            <p className="text-hinweis font-bold text-stone-600">Anfragenummer</p>
            <p className="mt-1 text-[1.8rem] font-bold tracking-wide text-stone-900">{receipt.number}</p>
            <p className="mt-1 text-hinweis text-stone-600">{receipt.itemName}</p>
          </div>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <LinkButton to="/katalog" size="lg" icon={LayoutGrid}>
              Weiteres Druckteil ansehen
            </LinkButton>
            <Button variant="secondary" size="lg" onClick={close}>
              Schließen
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-5 sm:space-y-6">
          {entwurf.restored && <EntwurfHinweis savedAt={entwurf.restored.savedAt} onDiscard={entwurf.discard} />}
          {template && (
            <Alert
              kind={template.hinweise.length ? 'warning' : 'info'}
              title={edit ? `Angaben aus Anfrage ${template.number}` : `Vorbelegt aus Anfrage ${template.number}`}
            >
              {template.hinweise.length ? (
                <>
                  Bitte prüfen Sie die Angaben. Folgendes konnte nicht übernommen werden:
                  <ul className="mt-1 list-disc pl-5">
                    {template.hinweise.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </>
              ) : edit ? (
                'Sie können die Anfrage ändern, solange das Druck-Team sie noch nicht angesehen hat. Die Nummer bleibt gleich.'
              ) : (
                'Alle Angaben können Sie vor dem Absenden noch ändern. Es entsteht eine neue Anfrage mit neuer Nummer.'
              )}
            </Alert>
          )}

          <p className="text-hinweis text-stone-600">
            Pflichtfelder sind mit <span className="font-bold text-rose-700">*</span> markiert.
          </p>

          <Field
            label={sessionEmail ? 'Ihre Schul-E-Mail (angemeldet)' : 'Ihre Schul-E-Mail'}
            required
            error={errors.requesterEmail}
            hint={sessionEmail ? 'Sie sind angemeldet – die Anfrage erscheint unter „Meine Anfragen“.' : domainHint(domains)}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={shownEmail}
                onChange={(e) => setRequesterEmail(e.target.value)}
                readOnly={edit || !!sessionEmail}
                maxLength={120}
                required
                aria-required
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder={domains[0] ? `name@${domains[0]}` : 'name@schule.example'}
              />
            )}
          </Field>

          <Field label="Für welche Klasse?" required error={errors.classOrTeam} hint="z. B. Klasse 4b oder Team Therapie">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                value={classOrTeam}
                onChange={(e) => setClassOrTeam(e.target.value)}
                maxLength={ORDER_CLASS_MAX}
                required
                aria-required
                aria-describedby={describedBy}
                invalid={invalid}
                autoComplete="off"
              />
            )}
          </Field>

          <KeineFarbeHinweis leer={config ? emptyAreas : []} multiColor={multiColor} />
          {rows.map((row, i) =>
            i === 0 && kurz ? (
              <AuswahlUebersicht
                key={i}
                titel={rows.length > 1 ? (multiColor ? 'Stückzahl 1' : 'Farbe 1') : 'Ihre Auswahl'}
                titelId="auswahl-uebersicht"
                row={row}
                areas={areas}
                multiColor={multiColor}
                size={size}
                customFields={customFields}
                custom={custom}
                onAendern={() => {
                  setFelderOffen(true);
                  focusLater(rows.length > 1 ? 'farbzeile-0' : 'anzahl-0');
                }}
              />
            ) : (
            <ColorRow
              key={i}
              index={i}
              numbered={rows.length > 1}
              row={row}
              areas={areas}
              multiColor={multiColor}
              max={Math.max(1, MAX_ORDER_QUANTITY - (total - row.quantity))}
              errors={errors}
              onChange={(r) => setAuswahl((a) => setzeZeile(a, i, r))}
              onRemove={i ? () => removeRow(i) : undefined}
              collapsed={multiColor && rows.length > 1 && i !== Math.min(offeneZeile, rows.length - 1) && !zeileHatFehler(i)}
              onExpand={() => setOffeneZeile(i)}
              compareTo={rows[0].colors}
            />
            ),
          )}
          {canAddColors && (
            <div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {multiColor ? (
                  <Button
                    id="weitere-farbe"
                    variant="secondary"
                    icon={Plus}
                    onClick={addRow}
                    disabled={total >= MAX_ORDER_QUANTITY || rows.length >= MAX_ORDER_VARIANTS}
                    className="justify-start py-2 text-left"
                  >
                    {/* Erklärung im Knopf – außerhalb sah sie aus wie ein loser Hinweis. */}
                    <span>
                      <span className="block">Weitere Stückzahl in anderen Farben</span>
                      <span className="block text-hinweis font-normal text-stone-600">übernimmt die Farben von oben – nur Abweichungen ändern</span>
                    </span>
                  </Button>
                ) : (
                  <Button
                    id="weitere-farbe"
                    variant="secondary"
                    icon={Plus}
                    onClick={addRow}
                    disabled={total >= MAX_ORDER_QUANTITY || rows.length >= MAX_ORDER_VARIANTS}
                  >
                    Weitere Farbe
                  </Button>
                )}
                {rows.length > 1 && (
                  <p className="font-bold text-stone-900" aria-live="polite">
                    Gesamt: {total} Stück
                  </p>
                )}
              </div>
              {(total >= MAX_ORDER_QUANTITY || !multiColor) && (
                <p className="mt-1.5 text-hinweis text-stone-600">
                  {total >= MAX_ORDER_QUANTITY
                    ? `Höchstens ${MAX_ORDER_QUANTITY} Stück je Anfrage.`
                    : 'Für verschiedene Farben in einer Anfrage, z. B. 3 Stück in Blau und 4 Stück in Gelb.'}
                </p>
              )}
              {rows.length > 1 && errors.quantity && <p className="mt-1.5 text-hinweis font-bold text-rose-700">{errors.quantity}</p>}
            </div>
          )}

          {!kurz && item.sizes.length > 0 && (
            <ChoiceGroup
              legend="Größe"
              name="groesse"
              value={size}
              onChange={setSize}
              error={errors.size}
              options={item.sizes.map((s) => ({ value: s, content: s }))}
            />
          )}

          {!kurz && customFields.length > 0 && (
            <fieldset className="min-w-0 space-y-4 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200 sm:space-y-5 sm:p-5">
              <legend className="sr-only">Personalisierung</legend>
              <p className="text-abschnitt font-bold text-stone-900" aria-hidden>
                Personalisierung
              </p>
              {customFields.map((f) => (
                <CustomFieldInput
                  key={f.id}
                  field={f}
                  value={custom[f.id] ?? ''}
                  onChange={(v) => setCustom(f.id, v)}
                  error={errors[`custom.${f.id}`]}
                />
              ))}
            </fieldset>
          )}

          <Field
            label="Anpassungswünsche"
            error={errors.customization}
            hint="Optional. Bitte keine Namen von Schülerinnen und Schülern und keine Diagnosen eintragen."
          >
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                value={customization}
                onChange={(e) => setCustomization(e.target.value)}
                maxLength={ORDER_CUSTOMIZATION_MAX}
                rows={4}
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder="z. B. Griff etwas dicker, Aussparung für Klettband …"
              />
            )}
          </Field>

          {formError && <Alert kind="error">{formError}</Alert>}

          <div className="flex flex-col-reverse gap-2.5 border-t border-stone-100 pt-4 sm:flex-row sm:justify-end sm:gap-3 sm:pt-6">
            <Button variant="secondary" size="lg" onClick={close}>
              {locked ? 'Schließen' : 'Abbrechen'}
            </Button>
            {!locked && (
              <Button type="submit" size="lg" icon={edit ? Save : Send} loading={submitting}>
                {edit ? 'Änderungen speichern' : 'Anfrage senden'}
              </Button>
            )}
          </div>
        </form>
      )}
    </Dialog>
  );
}
