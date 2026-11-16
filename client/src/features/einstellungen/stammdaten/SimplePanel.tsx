import { useCallback } from 'react';
import { Field, Input } from '../../../components/ui';
import type { MasterData, SimpleEntry } from '../../../lib/types';
import { duplicateNames, nameError, type Row } from './listRows';
import { ListPanel } from './ListPanel';

/** Einsatzbereiche bzw. Materialien – Listen nur mit Namen. */
export function SimplePanel({
  list,
  md,
  noun,
  placeholder,
  onDirty,
}: {
  list: 'useAreas' | 'materials';
  md: MasterData;
  noun: string;
  placeholder: string;
  onDirty: (d: boolean) => void;
}) {
  const isAreas = list === 'useAreas';
  const validate = useCallback((r: Row<SimpleEntry>) => nameError(r.name, isAreas ? 'den Einsatzbereich' : 'das Material'), [isAreas]);
  return (
    <ListPanel<SimpleEntry>
      list={list}
      source={md[list]}
      title={isAreas ? 'Einsatzbereiche' : 'Materialien'}
      intro={
        isAreas
          ? 'Wo wird ein Druckteil benutzt? (z. B. Unterricht, Therapie, Pause). Lehrkräfte filtern den Katalog danach.'
          : 'Woraus wird gedruckt? (z. B. PLA, PETG). Steht beim Druckteil zur Auswahl.'
      }
      noun={noun}
      addLabel={`${noun} hinzufügen`}
      blank={() => ({ name: '' })}
      validate={validate}
      validateAll={duplicateNames}
      rowLabel={(r, i) => (r.name.trim() ? `${noun} „${r.name.trim()}“` : `${noun} ${i + 1}`)}
      onDirty={onDirty}
      layout="compact"
      renderRow={(row, update, error) => (
        <Field label="Name" required error={error}>
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              value={row.name}
              maxLength={60}
              placeholder={placeholder}
              invalid={invalid}
              aria-describedby={describedBy}
              onChange={(e) => update({ name: e.target.value })}
            />
          )}
        </Field>
      )}
    />
  );
}
