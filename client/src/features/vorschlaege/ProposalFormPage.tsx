import { ImagePlus, Lightbulb, ListOrdered, Plus, ShieldAlert, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { EntwurfHinweis } from '../../components/EntwurfHinweis';
import { ActionBar, Alert, Button, Field, Input, LinkButton, PageHeader, Panel, Select, Textarea } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { apiUpload, ApiError, UPLOAD_ABGEBROCHEN } from '../../lib/api';
import { bildVerkleinern } from '../../lib/bildVerkleinern';
import { ersteFehlerstelle } from '../../lib/fokus';
import { entwurfSchluessel } from '../../lib/entwurfSpeicher';
import { useDocumentTitle } from '../../lib/useApi';
import { useEntwurf } from '../../lib/useEntwurf';
import { mbText } from '@mosaik3lab/shared/werte/dateien';
import {
  MAX_LINKS,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  MAX_PROPOSAL_QUANTITY,
  PROPOSAL_DESC_MAX,
  PROPOSAL_DESC_MIN,
  PROPOSAL_TITLE_MAX,
  PROPOSAL_TITLE_MIN,
  PROPOSAL_USAGE_MAX,
  URGENCY_LABELS,
  type OwnProposal,
  type ProposalUrgency,
} from './proposals';

/** Formular „Etwas vorschlagen“ (Lehrkraft, angemeldet). Fotos als Multipart, Rest als JSON im Feld „data“ (apiUpload). */
export function ProposalFormPage() {
  useDocumentTitle('Etwas vorschlagen');
  const navigate = useNavigate();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [usage, setUsage] = useState('');
  const [links, setLinks] = useState<string[]>(['']);
  const [quantity, setQuantity] = useState('1');
  const [urgency, setUrgency] = useState<ProposalUrgency>('normal');
  const [photos, setPhotos] = useState<File[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // Senden mit Fotos: Fortschritt, Stillstands-Wächter und „Abbrechen“ wie beim Hochladen von Bildern und Videos.
  const [anteil, setAnteil] = useState<number | null>(null);
  const senden = useRef<AbortController | undefined>(undefined);
  const [abgebrochen, setAbgebrochen] = useState(false);
  const { user } = useAuth();

  // Entwurf im Browser. Ausgewählte Fotos lassen sich dort nicht ablegen – nur ihre Anzahl für den Hinweis.
  const draftValue = { title, description, usage, links, quantity, urgency, confirmed, fotos: photos.length };
  const applyDraft = useCallback((d: typeof draftValue) => {
    setTitle(d.title);
    setDescription(d.description);
    setUsage(d.usage);
    setLinks(d.links.length ? d.links : ['']);
    setQuantity(d.quantity);
    setUrgency(d.urgency);
    setConfirmed(d.confirmed);
  }, []);
  const entwurf = useEntwurf(entwurfSchluessel('vorschlag', user?.id), draftValue, applyDraft, { ready: !!user });

  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const addPhotos = async (list: FileList | null) => {
    if (!list) return;
    const istBild = (f: File) => /\.(jpe?g|png|webp)$/i.test(f.name);
    // Fotos im Browser verkleinern – so passen auch große Handyfotos unter die Grenze (MAX_PHOTO_BYTES)
    const auswahl = await Promise.all(Array.from(list).map((f) => (istBild(f) ? bildVerkleinern(f) : f)));
    const next = [...photos];
    const problems: string[] = [];
    for (const f of auswahl) {
      if (!istBild(f)) problems.push(`„${f.name}“: nur JPG, PNG oder WebP`);
      else if (f.size > MAX_PHOTO_BYTES) problems.push(`„${f.name}“: größer als ${mbText(MAX_PHOTO_BYTES)}`);
      else if (next.length >= MAX_PHOTOS) problems.push(`Höchstens ${MAX_PHOTOS} Fotos`);
      else next.push(f);
    }
    setPhotos(next);
    setFields((f) => ({ ...f, photos: [...new Set(problems)].join('; ') }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setAbgebrochen(false);
    const errs: Record<string, string> = {};
    if (title.trim().length < PROPOSAL_TITLE_MIN) errs.title = `Bitte einen kurzen Titel eingeben (mindestens ${PROPOSAL_TITLE_MIN} Zeichen)`;
    if (description.trim().length < PROPOSAL_DESC_MIN) errs.description = `Bitte kurz beschreiben (mindestens ${PROPOSAL_DESC_MIN} Zeichen)`;
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_PROPOSAL_QUANTITY) errs.quantity = `Bitte eine Zahl von 1 bis ${MAX_PROPOSAL_QUANTITY} eingeben`;
    if (!confirmed) errs.confirmed = 'Bitte bestätigen, dass keine Namen oder Fotos von Kindern enthalten sind';
    setFields(errs);
    if (Object.keys(errs).length) {
      setError('Bitte prüfen Sie die markierten Angaben.');
      // Direkt zum ersten markierten Feld
      const form = e.currentTarget as HTMLFormElement;
      requestAnimationFrame(() => ersteFehlerstelle<HTMLElement>(form)?.focus());
      return;
    }

    const form = new FormData();
    form.append(
      'data',
      JSON.stringify({
        title: title.trim(),
        description: description.trim(),
        usage: usage.trim(),
        links: links.map((l) => l.trim()).filter(Boolean),
        quantity: qty,
        urgency,
      }),
    );
    photos.forEach((f) => form.append('photos', f));
    setBusy(true);
    const ctrl = new AbortController();
    senden.current = ctrl;
    setAnteil(0);
    try {
      const created = await apiUpload<OwnProposal>('/proposals', form, setAnteil, { signal: ctrl.signal });
      entwurf.clear();
      toast('success', `Danke! Ihr Vorschlag ${created.number} ist beim 3D-Druck-Team eingegangen.`);
      navigate('/vorschlaege', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.message === UPLOAD_ABGEBROCHEN) setAbgebrochen(true); // selbst abgebrochen
      else if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else setError('Der Vorschlag konnte nicht gesendet werden.');
    } finally {
      senden.current = undefined;
      setAnteil(null);
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Mosaik³LAB"
        title="Etwas vorschlagen"
        description="Sie brauchen ein Druckteil, das noch nicht im Katalog ist? Beschreiben Sie es hier – das 3D-Druck-Team prüft Ihren Vorschlag und meldet sich."
        actions={
          <LinkButton to="/vorschlaege" variant="secondary" icon={Lightbulb}>
            Meine Vorschläge
          </LinkButton>
        }
      />

      <form onSubmit={submit} noValidate className="max-w-3xl space-y-6" aria-label="Vorschlag einreichen">
        <Alert kind="warning" title="Datenschutz">
          Bitte keine Namen von Schülerinnen und Schülern, keine Diagnosen und keine Fotos von Kindern. Beschreiben Sie das
          Druckteil allgemein (z. B. „ein Kind mit schwachem Griff“) und fotografieren Sie nur Gegenstände.
        </Alert>
        {entwurf.restored && (
          <EntwurfHinweis savedAt={entwurf.restored.savedAt} onDiscard={entwurf.discard}>
            {entwurf.restored.value.fotos > 0 && 'Fotos werden nicht im Browser gemerkt – bitte erneut auswählen.'}
          </EntwurfHinweis>
        )}
        {error && <Alert kind="error">{error}</Alert>}

        <Panel icon={Lightbulb} title="1. Das Druckteil beschreiben" description="Je genauer die Beschreibung, desto schneller kann das Team prüfen, ob und wie es sich drucken lässt." bodyClassName="space-y-5">
          <Field label="Titel" required error={fields.title} hint="Kurz und verständlich, z. B. „Rutschfeste Tellerunterlage“">
            {({ id, describedBy, invalid }) => (
              <Input id={id} aria-describedby={describedBy} invalid={invalid} value={title} maxLength={PROPOSAL_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
            )}
          </Field>
          <Field label="Was wird gebraucht?" required error={fields.description} hint="Was soll das Druckteil können? Größe, Form oder Besonderheiten dürfen Sie gern nennen.">
            {({ id, describedBy, invalid }) => (
              <Textarea id={id} aria-describedby={describedBy} invalid={invalid} value={description} maxLength={PROPOSAL_DESC_MAX} rows={5} onChange={(e) => setDescription(e.target.value)} />
            )}
          </Field>
          <Field label="Wofür und wo wird es eingesetzt?" error={fields.usage} hint="Zum Beispiel Unterricht, Mahlzeit, Therapie – und in welcher Klasse oder Gruppe.">
            {({ id, describedBy, invalid }) => (
              <Textarea id={id} aria-describedby={describedBy} invalid={invalid} value={usage} maxLength={PROPOSAL_USAGE_MAX} rows={3} onChange={(e) => setUsage(e.target.value)} />
            )}
          </Field>
        </Panel>

        <Panel icon={ImagePlus} title="2. Fotos und Links (optional)" description="Hilft dem Team, das Gewünschte zu verstehen." bodyClassName="space-y-6">
          <div>
            <p className="mb-1 font-bold text-stone-800">Fotos</p>
            <p className="mb-3 text-hinweis text-stone-600">
              Höchstens {MAX_PHOTOS} Bilder (JPG, PNG oder WebP, je bis {mbText(MAX_PHOTO_BYTES)}) – z. B. ein ähnliches Produkt, eine Skizze oder die
              Stelle, an der es gebraucht wird.
            </p>
            {photos.length > 0 && (
              <ul className="mb-3 flex flex-wrap gap-3">
                {photos.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="relative">
                    <img src={previews[i]} alt={`Vorschau: ${f.name}`} className="size-28 rounded-xl object-cover ring-1 ring-stone-300" />
                    <button
                      type="button"
                      onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                      className="absolute -right-3 -top-3 grid size-11 place-items-center rounded-full bg-white text-rose-700 shadow ring-1 ring-stone-300 hover:bg-rose-50"
                      aria-label={`Foto ${f.name} entfernen`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {photos.length < MAX_PHOTOS && (
              <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl bg-white px-5 font-bold text-stone-800 ring-1 ring-inset ring-stone-300 focus-within:ring-4 focus-within:ring-brand-600/30 hover:bg-stone-50">
                <ImagePlus className="size-5" aria-hidden />
                Foto auswählen
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    void addPhotos(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            {fields.photos && (
              <p role="alert" className="mt-2 text-hinweis font-bold text-rose-700">
                {fields.photos}
              </p>
            )}
          </div>

          <div>
            <p className="mb-1 font-bold text-stone-800">Links</p>
            <p className="mb-3 text-hinweis text-stone-600">Zum Beispiel eine Produktseite oder ein Beispiel im Internet (beginnt mit https://).</p>
            <ul className="space-y-3">
              {links.map((l, i) => (
                <li key={i} className="flex items-start gap-2">
                  <div className="flex-1">
                    <label htmlFor={`link-${i}`} className="sr-only">
                      Link {i + 1}
                    </label>
                    <Input id={`link-${i}`} type="url" inputMode="url" placeholder="https://…" value={l} maxLength={500} onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))} />
                  </div>
                  {links.length > 1 && (
                    <Button variant="ghost" icon={Trash2} onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label={`Link ${i + 1} entfernen`} />
                  )}
                </li>
              ))}
            </ul>
            {fields.links && (
              <p role="alert" className="mt-2 text-hinweis font-bold text-rose-700">
                {fields.links}
              </p>
            )}
            {links.length < MAX_LINKS && (
              <Button variant="ghost" icon={Plus} className="mt-2" onClick={() => setLinks([...links, ''])}>
                Weiteren Link hinzufügen
              </Button>
            )}
          </div>
        </Panel>

        <Panel icon={ListOrdered} title="3. Menge und Dringlichkeit" bodyClassName="grid gap-5 sm:grid-cols-2">
          <Field label="Gewünschte Menge" error={fields.quantity} hint="Wie viele Stück werden gebraucht?">
            {({ id, describedBy, invalid }) => (
              <Input id={id} aria-describedby={describedBy} invalid={invalid} type="number" inputMode="numeric" min={1} max={MAX_PROPOSAL_QUANTITY} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            )}
          </Field>
          <Field label="Wie dringend?" error={fields.urgency}>
            {({ id }) => (
              <Select id={id} value={urgency} onChange={(e) => setUrgency(e.target.value as ProposalUrgency)}>
                {(Object.keys(URGENCY_LABELS) as ProposalUrgency[]).map((u) => (
                  <option key={u} value={u}>
                    {URGENCY_LABELS[u]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </Panel>

        <Panel
          icon={ShieldAlert}
          title="4. Bestätigen und senden"
          footer={
            <ActionBar
              secondary={
                busy ? (
                  <Button variant="secondary" size="lg" icon={X} onClick={() => senden.current?.abort()}>
                    Senden abbrechen
                  </Button>
                ) : (
                  <Link to="/katalog" className="inline-flex min-h-14 items-center justify-center px-4 font-bold text-stone-700 hover:underline">
                    Abbrechen
                  </Link>
                )
              }
              primary={
                <Button type="submit" size="lg" icon={Lightbulb} loading={busy}>
                  Vorschlag senden
                </Button>
              }
            />
          }
        >
          <p role="status" aria-live="polite" className="mb-3 text-sm font-semibold text-stone-700 empty:hidden">
            {anteil !== null
              ? anteil < 1
                ? `Wird gesendet … ${Math.round(anteil * 100)} %`
                : 'Wird gespeichert … bitte warten'
              : abgebrochen
                ? 'Das Senden wurde abgebrochen. Ihre Angaben bleiben stehen – Sie können es erneut versuchen.'
                : ''}
          </p>
          <label className="flex items-start gap-3 min-h-12">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-700" aria-describedby={fields.confirmed ? 'confirm-error' : undefined} aria-invalid={!!fields.confirmed || undefined} />
            <span>
              <ShieldAlert className="mr-1.5 inline size-4 text-amber-700" aria-hidden />
              Ich bestätige: Meine Angaben und Fotos enthalten keine Namen oder Diagnosen von Schülerinnen und Schülern und keine Fotos von Kindern.
            </span>
          </label>
          {fields.confirmed && (
            <p id="confirm-error" role="alert" className="mt-1.5 text-hinweis font-bold text-rose-700">
              {fields.confirmed}
            </p>
          )}
        </Panel>
      </form>
    </>
  );
}
