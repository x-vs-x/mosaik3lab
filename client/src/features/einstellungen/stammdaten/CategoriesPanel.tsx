import { useCallback } from 'react';
import { Badge, Field, Input } from '../../../components/ui';
import { COLOR_STYLES, ICONS } from '../../../lib/constants';
import type { Category, MasterData } from '../../../lib/types';
import { Aufklappen } from './Aufklappen';
import { ColorKeyPicker, IconKeyPicker } from './KeyPickers';
import { duplicateNames, nameError, type Row } from './listRows';
import { ListPanel } from './ListPanel';

/** Kategorien: Name; Mosaikfarbe und Symbol zum Aufklappen. */
export function CategoriesPanel({ md, onDirty }: { md: MasterData; onDirty: (d: boolean) => void }) {
  const validate = useCallback((r: Row<Category>) => nameError(r.name, 'die Kategorie'), []);
  return (
    <ListPanel<Category>
      list="categories"
      source={md.categories}
      title="Kategorien"
      intro="Wofür ist ein Druckteil gedacht? (z. B. Feinmotorik, Kommunikation). Lehrkräfte filtern den Katalog danach; Farbe und Symbol erscheinen auf den Katalogkarten."
      noun="Kategorie"
      addLabel="Kategorie hinzufügen"
      blank={() => ({ name: '', color: 'blau', icon: 'formen' })}
      validate={validate}
      validateAll={duplicateNames}
      rowLabel={(r, i) => (r.name.trim() ? `Kategorie „${r.name.trim()}“` : `Kategorie ${i + 1}`)}
      onDirty={onDirty}
      renderRow={(row, update, error) => {
        const style = COLOR_STYLES[row.color];
        const Icon = ICONS[row.icon]?.icon;
        return (
          <div className="space-y-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Name" required error={error} className="flex-1">
                {({ id, invalid, describedBy }) => (
                  <Input id={id} value={row.name} maxLength={60} invalid={invalid} aria-describedby={describedBy} onChange={(e) => update({ name: e.target.value })} />
                )}
              </Field>
              <div className="sm:pb-2.5">
                <p className="mb-1.5 text-hinweis font-bold text-stone-500">Vorschau</p>
                <Badge className={style.chip} icon={Icon}>
                  {row.name.trim() || 'Neue Kategorie'}
                </Badge>
              </div>
            </div>
            <Aufklappen label="Farbe und Symbol ändern" open={!row.id}>
              <ColorKeyPicker legend="Farbe" name={`cat-color-${row._key}`} value={row.color} onChange={(c) => update({ color: c })} />
              <IconKeyPicker name={`cat-icon-${row._key}`} value={row.icon} onChange={(i) => update({ icon: i })} />
            </Aufklappen>
          </div>
        );
      }}
    />
  );
}
