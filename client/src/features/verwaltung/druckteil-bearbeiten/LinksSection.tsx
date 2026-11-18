import { ArrowDown, ArrowUp, Link2, Plus, Trash2 } from 'lucide-react';
import { Button, Field, Input, Textarea } from '../../../components/ui';
import type { ItemLink } from '../../../lib/types';
import { MAX_ITEM_LINKS, newId, plural, sectionHasError, type FormSectionProps } from './itemForm';
import { ListError, Section } from './Section';

/** Links und Bestellhinweise: Knöpfe auf der Detailseite, z. B. zu Zubehör oder einer Bestellliste. */
export function LinksSection({ form, set, errors }: FormSectionProps) {
  const links = form.links ?? [];
  const change = (v: ItemLink[]) => set('links', v);
  const update = (index: number, patch: Partial<ItemLink>) => change(links.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const move = (index: number, dir: -1 | 1) => {
    const next = [...links];
    [next[index], next[index + dir]] = [next[index + dir], next[index]];
    change(next);
  };
  const add = () => change([...links, { id: newId('link'), text: '', beschreibung: '', url: '' }]);

  return (
    <Section
      id="links"
      icon={Link2}
      title="Links und Bestellhinweise"
      summary={links.length ? `${plural(links.length, 'Link', 'Links')}: ${links.slice(0, 3).map((l) => l.text).join(', ')}${links.length > 3 ? ' …' : ''}` : 'Keine Links'}
      hasError={sectionHasError(errors, 'links')}
    >
      <div className="space-y-4">
        <p className="text-hinweis text-stone-600">
          Jeder Link erscheint auf der Seite des Druckteils als Knopf – z. B. zu einem Elektroteil, das man dazu bestellen muss,
          oder zu einer Bestellliste. Der Link öffnet sich in einem neuen Fenster.
        </p>
        {links.map((l, i) => (
          <div key={l.id} className="space-y-4 rounded-2xl p-4 ring-1 ring-stone-300 sm:p-5">
            <div className="flex flex-wrap items-end gap-3">
              <Field label={`Knopftext von Link ${i + 1}`} required className="min-w-48 flex-1">
                {({ id }) => <Input id={id} value={l.text} onChange={(e) => update(i, { text: e.target.value })} maxLength={60} placeholder="z. B. Taster-Beispiel" />}
              </Field>
              <div className="flex gap-2">
                <Button variant="secondary" icon={ArrowUp} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Link „${l.text || i + 1}“ nach oben`} />
                <Button variant="secondary" icon={ArrowDown} onClick={() => move(i, 1)} disabled={i === links.length - 1} aria-label={`Link „${l.text || i + 1}“ nach unten`} />
                <Button variant="secondary" icon={Trash2} onClick={() => change(links.filter((_, j) => j !== i))} aria-label={`Link „${l.text || i + 1}“ entfernen`} className="text-rose-700">
                  <span className="hidden sm:inline">Entfernen</span>
                </Button>
              </div>
            </div>
            <Field label="Link (Adresse)" required hint="Vollständig mit https://, z. B. aus der Adresszeile des Browsers kopieren.">
              {({ id, describedBy }) => (
                <Input id={id} type="url" inputMode="url" value={l.url} onChange={(e) => update(i, { url: e.target.value })} maxLength={500} aria-describedby={describedBy} placeholder="https://…" />
              )}
            </Field>
            <Field label="Kurze Beschreibung" hint="Optional, steht unter dem Knopf.">
              {({ id, describedBy }) => (
                <Textarea id={id} rows={2} value={l.beschreibung} onChange={(e) => update(i, { beschreibung: e.target.value })} maxLength={300} aria-describedby={describedBy} placeholder="z. B. Dieser Taster passt in die Halterung, bitte vorher bestellen." />
              )}
            </Field>
          </div>
        ))}
        <ListError error={errors.links} />
        {links.length < MAX_ITEM_LINKS && (
          <Button variant="soft" icon={Plus} onClick={add}>
            Link hinzufügen
          </Button>
        )}
      </div>
    </Section>
  );
}
