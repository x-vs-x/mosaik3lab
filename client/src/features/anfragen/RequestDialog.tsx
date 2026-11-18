import { MAX_ORDER_QUANTITY, MAX_ORDER_VARIANTS, ORDER_CLASS_MAX, ORDER_CUSTOMIZATION_MAX } from '@mosaik3lab/shared/werte/anfragen';
import { CircleCheck, LayoutGrid, Plus, Save, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Dialog } from '../../components/Dialog';
import { EntwurfHinweis } from '../../components/EntwurfHinweis';
import { Alert, Button, Field, Input, LinkButton, Textarea } from '../../components/ui';
import { api, ApiError, isConnectionProblem } from '../../lib/api';
import { useConfig, useMasterData } from '../../lib/config';
import { aufAngeboteneFarben, initialColorChoice, itemColorAreas } from '../../lib/colors';
import { anfrageEmail } from './anfrageEmail';
import { ersteFehlerstelle } from '../../lib/fokus';
import { entwurfSchluessel } from '../../lib/entwurfSpeicher';
import { getProfile, saveProfile } from './guestOrders';
import type { Item, OrderInput, OrderReceipt, RequestTemplate } from '../../lib/types';
import { useEntwurf } from '../../lib/useEntwurf';
import { ChoiceGroup, ColorRow, CustomFieldInput, type ColorRowValue } from './AnfrageFelder';
import { domainHint, normalizeDomain, pruefeAnfrage } from './anfragePruefung';

/** Schlüssel des Anfrage-Entwurfs – auch für die Detailseite, die den Dialog nach einem Neuladen wieder öffnet. */
export const anfrageEntwurfSchluessel = (itemId: string, userId?: string, templateOrderId?: string) =>
  entwurfSchluessel(`anfrage-${itemId}`, userId, templateOrderId);

/**
 * Anfrageformular für Lehrkräfte – ohne Anmeldung.
 * `template`: Vorbelegung aus „Erneut anfragen“ – alle Angaben bleiben vor dem Absenden änderbar.
 * `edit`: dieselbe Anfrage ändern (PUT, nur solange offen); `onSaved` nach dem Speichern.
 */
export function RequestDialog({
  item,
  open,
  onClose,
  template,
  edit = false,
  onSaved,
}: {
  item: Item;
  open: boolean;
  onClose: () => void;
  template?: RequestTemplate;
  edit?: boolean;
  onSaved?: () => void;
}) {
  const md = useMasterData();
  const { config } = useConfig();
  const domains = (config?.orderForm.allowedEmailDomains ?? []).map(normalizeDomain).filter(Boolean);
  // Bereiche mit hinterlegten Farben; „filaments“ enthält nur vorrätige Rollen (siehe lib/colors.ts).
  const allAreas = itemColorAreas(item, md).filter((a) => a.area.colors.length > 0);
  const areas = allAreas.filter((a) => a.filaments.length > 0);
  const emptyAreas = allAreas.filter((a) => a.filaments.length === 0);
  const multiColor = allAreas.length > 1;
  const colorErrorKey = (areaId: string, row = 0) => (row ? `variants.${row}.` : '') + (multiColor ? `color.${areaId}` : 'color');
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
  // Zeile 1 = bisherige Anzahl + Farbe; weitere Zeilen = weitere Farben (z. B. 3 × Blau, 4 × Gelb).
  const initialRows = (): ColorRowValue[] =>
    template?.variants?.length
      ? template.variants.map((v) => ({ quantity: v.quantity, colors: { ...initialColorChoice(areas), ...aufAngeboteneFarben(areas, v.colors, md) } }))
      : [{ quantity: template?.quantity ?? 1, colors: { ...initialColorChoice(areas), ...aufAngeboteneFarben(areas, template?.colors ?? {}, md) } }];
  const [rows, setRows] = useState<ColorRowValue[]>(initialRows);
  const total = rows.reduce((n, r) => n + r.quantity, 0);
  const [locked, setLocked] = useState(false);
  const [custom, setCustom] = useState<Record<string, string>>(template?.personalization ?? {});
  const [size, setSize] = useState(template?.size || (item.sizes.length === 1 ? item.sizes[0] : ''));
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
    setRows(Array.isArray(d.rows) && d.rows.length ? d.rows : [{ quantity: d.quantity ?? 1, colors: d.colors ?? {} }]);
    setCustom(d.custom);
    setSize(d.size);
    setCustomization(d.customization);
  }, []);
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
  }, [rows.length]);
  const focusLater = (id: string) => {
    focusAfterRender.current = id;
  };
  // Mehrteilige Druckteile: nur eine Stückzahl ist aufgeklappt, die anderen stehen als kurze Zeile darüber/darunter.
  const [offeneZeile, setOffeneZeile] = useState(0);
  const addRow = () => {
    // Mehrteilig: übernimmt die Farben der letzten Stückzahl – man ändert nur, was abweicht.
    setRows((all) => [...all, { quantity: 1, colors: multiColor ? { ...all[all.length - 1].colors } : initialColorChoice(areas) }]);
    setOffeneZeile(rows.length);
    focusLater(`farbzeile-${rows.length}`);
  };
  const removeRow = (index: number) => {
    setRows((all) => all.filter((_, j) => j !== index));
    setOffeneZeile(0);
    setErrors({});
    focusLater('weitere-farbe');
  };
  const zeileHatFehler = (i: number) => Object.keys(errors).some((k) => (i ? k.startsWith(`variants.${i}.`) : k === 'color' || k.startsWith('color.')));

  const close = () => {
    onClose();
    if (receipt) {
      setReceipt(undefined);
      setRows(initialRows());
      setCustomization(template?.customization ?? '');
      setCustom(template?.personalization ?? {});
      setSize(template?.size || (item.sizes.length === 1 ? item.sizes[0] : ''));
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
    setFormError(undefined);
    if (Object.keys(local).length) {
      setFormError('Bitte prüfen Sie die markierten Angaben.');
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
        setFormError(err.message);
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

          {emptyAreas.length > 0 && (
            <Alert kind="warning" title="Derzeit keine Farbe vorrätig">
              {multiColor
                ? `Für „${emptyAreas.map((a) => a.area.name).join('“, „')}“ ist gerade keine Farbe vorrätig. Bitte versuchen Sie es später noch einmal.`
                : 'Alle Farben für dieses Druckteil sind gerade leer. Bitte versuchen Sie es später noch einmal.'}
            </Alert>
          )}
          {rows.map((row, i) => (
            <ColorRow
              key={i}
              index={i}
              numbered={rows.length > 1}
              row={row}
              areas={areas}
              multiColor={multiColor}
              max={Math.max(1, MAX_ORDER_QUANTITY - (total - row.quantity))}
              errors={errors}
              onChange={(r) => setRows((all) => all.map((x, j) => (j === i ? r : x)))}
              onRemove={i ? () => removeRow(i) : undefined}
              collapsed={multiColor && rows.length > 1 && i !== Math.min(offeneZeile, rows.length - 1) && !zeileHatFehler(i)}
              onExpand={() => setOffeneZeile(i)}
              compareTo={rows[0].colors}
            />
          ))}
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

          {item.sizes.length > 0 && (
            <ChoiceGroup
              legend="Größe"
              name="groesse"
              value={size}
              onChange={setSize}
              error={errors.size}
              options={item.sizes.map((s) => ({ value: s, content: s }))}
            />
          )}

          {customFields.length > 0 && (
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
                  onChange={(v) => setCustom((c) => ({ ...c, [f.id]: v }))}
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
