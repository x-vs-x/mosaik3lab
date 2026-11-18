import { ListChecks } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../../components/Toast';
import { Alert, Panel, Switch } from '../../components/ui';
import { api, fehlerText } from '../../lib/api';
import { useConfig, useMasterData } from '../../lib/config';
import { STATUS_DESCRIPTIONS } from '../../lib/constants';
import type { MasterData, OrderStatusDef } from '../../lib/types';

/** Ablauf der Anfragen: feste Statusliste, nur an-/ausschaltbar (sofort gespeichert). */
export function AnfrageAblaufSection() {
  const md = useMasterData();
  const { reload } = useConfig();
  const toast = useToast();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const toggle = async (s: OrderStatusDef, active: boolean) => {
    setBusy(s.id);
    setError(undefined);
    try {
      await api<MasterData>(`/admin/settings/order-statuses/${encodeURIComponent(s.id)}`, { method: 'PATCH', body: { active } });
      await reload();
      toast('success', `„${s.name}“ ${active ? 'eingeschaltet' : 'ausgeschaltet'}.`);
    } catch (err) {
      setError(fehlerText(err, 'Speichern fehlgeschlagen.'));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Panel
      icon={ListChecks}
      title="Ablauf der Anfragen"
      description="Welche Schritte nutzt Ihr Team? Eingeschaltete Schritte kann man bei einer Anfrage auswählen. Anfragen behalten ihren Stand, auch wenn Sie einen Schritt ausschalten."
    >
      {error && (
        <Alert kind="error" className="mb-4">
          {error}
        </Alert>
      )}
      <ul className="space-y-3">
        {md.orderStatuses.map((s) => {
          const required = s.id === 'offen';
          return (
            <li key={s.id}>
              <Switch
                checked={s.active}
                disabled={required || busy === s.id}
                onChange={(v) => void toggle(s, v)}
                label={s.name}
                description={required ? 'Neue Anfragen – immer eingeschaltet.' : STATUS_DESCRIPTIONS[s.id]}
              />
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
