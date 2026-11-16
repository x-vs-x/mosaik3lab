import type { Neuigkeiten } from '@mosaik3lab/shared/neuigkeiten';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { ChangelogText } from './ChangelogText';

/** 2026-11-20 → 20.11.2026 */
const datumDeutsch = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('.') : d);

/**
 * „Neu in Version X“: erscheint für Administratoren einmal nach einem Update (Quelle CHANGELOG.md).
 * Schließen ohne „Gelesen“ ist erlaubt – dann kommt das Fenster beim nächsten Laden wieder.
 */
export function NeuigkeitenDialog() {
  const { user } = useAuth();
  const { data } = useApi<Neuigkeiten>(user?.role === 'admin' ? `/neuigkeiten?u=${user.id}` : null);
  const [geschlossen, setGeschlossen] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  if (!data?.anzeigen || user?.role !== 'admin') return null;

  const gelesen = async () => {
    setSpeichert(true);
    try {
      await api('/neuigkeiten/gelesen', { method: 'POST' });
    } catch {
      /* nicht schlimm – das Fenster kommt dann beim nächsten Laden noch einmal */
    } finally {
      setSpeichert(false);
      setGeschlossen(true);
    }
  };

  return (
    <Dialog open={!geschlossen} onClose={() => setGeschlossen(true)} title={`Neu in Version ${data.version}`} size="lg">
      <div className="space-y-6">
        {data.abschnitte.map((a) => (
          <section key={a.version} aria-labelledby={`neu-${a.version}`}>
            <h3 id={`neu-${a.version}`} className="mb-2 text-lg font-bold text-stone-900">
              Version {a.version}
              {a.datum && ` · ${datumDeutsch(a.datum)}`}
            </h3>
            <ChangelogText text={a.text} />
          </section>
        ))}
        <div className="flex justify-end border-t border-stone-100 pt-4">
          <Button icon={Check} loading={speichert} onClick={() => void gelesen()} className="w-full sm:w-auto">
            Gelesen – nicht mehr anzeigen
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
