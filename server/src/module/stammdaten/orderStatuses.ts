import { STATUS_CATALOG, type OrderStatusDef, type StatusPhase } from '@mosaik3lab/shared/anfragen';

// Die feste Liste der Bestellstatus steht in shared/src/werte/anfragen.ts (STATUS_CATALOG).
// Hier: Standard-Schalter und die Migration früher frei angelegter Status.


const CATALOG_IDS: ReadonlySet<string> = new Set(STATUS_CATALOG.map((s) => s.id));
export const isCatalogStatus = (id: string) => CATALOG_IDS.has(id);
export const isRequiredStatus = (id: string) => !!STATUS_CATALOG.find((s) => s.id === id)?.required;

/** Status-IDs aus sehr alten Versionen (sieben Status) → feste Status. */
export const LEGACY_STATUS_MAP: Record<string, string> = {
  eingegangen: 'offen',
  freigegeben: 'in_pruefung',
  fertig: 'gedruckt',
  abgeholt: 'uebergeben',
};

const PHASE_FALLBACK: Record<StatusPhase, string> = { open: 'offen', active: 'in_druck', done: 'gedruckt' };

const norm = (s: string) =>
  s
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '');

/** Feste Liste mit Standard-Schaltern (Neuinstallation). */
export function defaultOrderStatuses(): OrderStatusDef[] {
  return STATUS_CATALOG.map((t) => ({ id: t.id, name: t.name, phase: t.phase, color: t.color, active: t.defaultActive }));
}

type StoredStatus = Partial<OrderStatusDef> & { id?: unknown };

/**
 * Bringt gespeicherte Status (früher frei angelegt, jetzt fest) auf die feste Liste.
 * - Feste Status übernehmen ihren gespeicherten Schalter.
 * - Frei angelegte Status werden über ID, Namen oder Phase einem festen Status zugeordnet,
 *   der dann eingeschaltet wird. Die Zuordnung landet in `aliases`, damit Anfragen nachziehen.
 * - Ältere Daten ohne Schalter: nur die vorhandenen Status sind an, neue feste Status aus.
 */
export function normalizeOrderStatuses(stored: unknown): { statuses: OrderStatusDef[]; aliases: Record<string, string> } {
  if (!Array.isArray(stored) || stored.length === 0) return { statuses: defaultOrderStatuses(), aliases: {} };
  const list = (stored as StoredStatus[]).filter((s) => s && typeof s.id === 'string');
  const legacyFormat = list.some((s) => typeof s.active !== 'boolean');
  const active = new Map<string, boolean>();
  const aliases: Record<string, string> = {};

  for (const s of list) {
    const id = s.id as string;
    let target = isCatalogStatus(id) ? id : undefined;
    if (!target && LEGACY_STATUS_MAP[id]) target = LEGACY_STATUS_MAP[id];
    if (!target && typeof s.name === 'string') {
      const n = norm(s.name);
      target = STATUS_CATALOG.find((t) => norm(t.name) === n || norm(t.id) === n)?.id;
    }
    if (!target) target = PHASE_FALLBACK[s.phase && s.phase in PHASE_FALLBACK ? s.phase : 'open'];
    if (target !== id) aliases[id] = target;
    const on = target !== id ? true : typeof s.active === 'boolean' ? s.active : true;
    active.set(target, (active.get(target) ?? false) || on);
  }

  const statuses = STATUS_CATALOG.map((t) => ({
    id: t.id,
    name: t.name,
    phase: t.phase,
    color: t.color,
    active: t.required ? true : (active.get(t.id) ?? (legacyFormat ? false : t.defaultActive)),
  }));
  return { statuses, aliases };
}
