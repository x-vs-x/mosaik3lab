import { Eye } from 'lucide-react';
import { Panel, Switch } from '../../../components/ui';
import type { FormSectionProps } from './itemForm';

/** Sichtbarkeit: Entwurf oder im Katalog veröffentlicht. */
export function VisibilityPanel({ form, set }: Omit<FormSectionProps, 'errors'>) {
  return (
    <Panel icon={Eye} title="Sichtbarkeit" description="Entwürfe sehen nur Druck-Team und Administration.">
      <Switch
        checked={form.published}
        onChange={(v) => set('published', v)}
        label="Im Katalog veröffentlichen"
        description="Nur veröffentlichte Druckteile sind für Lehrkräfte sichtbar und anfragbar."
      />
    </Panel>
  );
}
