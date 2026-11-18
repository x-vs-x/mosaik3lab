import crypto from 'node:crypto';
import { newId } from '../../kern/ids';
import { userCan } from '../konten/rechte';
import { ANFANGSSTATUS, isAllowedEmail } from '../einstellungen/einstellungen.vorgaben';
import { type Filament } from '@mosaik3lab/shared/stammdaten';
import { type StatusPhase } from '@mosaik3lab/shared/anfragen';
import { singleColorArea, type Item, type User } from '../../domain/types';
import { type DashboardData, type Order, type OrderColorChoice, type OrderCustomValue, type OwnOrder, type Requester, type RequestTemplate } from '@mosaik3lab/shared/anfragen';
import { badRequest, conflict, forbidden, notFound } from '../../kern/errors';
import type { Storage } from '../../storage';
import { passtZurSuche } from '@mosaik3lab/shared/suche';
import { notifyNewOrder } from './anfragen.mail';
import {
  colorChoicesText,
  colorVariantsText,
  EGAL_FARBE,
  EGAL_FARBE_NAME,
  MAX_ORDER_QUANTITY,
  ORDER_LOCKED_MESSAGE,
  trackSchema,
  type OrderColorVariant,
  type orderInputSchema,
} from '@mosaik3lab/shared/anfragen';
import type { z } from 'zod';

// Regeln für Anfragen: Farben und Personalisierung prüfen, anlegen, ändern, Status ändern, Sicht der Lehrkraft, Übersicht.

type OrderInputData = z.infer<typeof orderInputSchema>;

/**
 * Farbe je Farbbereich prüfen. Ältere Clients senden nur `color` – das gilt bei einem einzigen Bereich.
 * Fehler-Felder: `color` (ein Bereich) bzw. `color.<Bereich-ID>`, bei weiteren Farbvarianten mit Vorsilbe `variants.<n>.`.
 */
function resolveColors(item: Item, colors: Record<string, string> | undefined, color: string | undefined, filaments: Filament[], prefix = ''): OrderColorChoice[] {
  const areas = item.colorAreas?.length ? item.colorAreas : singleColorArea(item.colors);
  const fields: Record<string, string> = {};
  const choices: OrderColorChoice[] = [];
  for (const area of areas) {
    const id = colors?.[area.id] ?? (areas.length === 1 ? color : undefined);
    // „Farbe egal“ ist in jedem Bereich erlaubt – das Team wählt dann selbst.
    if (id === EGAL_FARBE) {
      choices.push({ areaId: area.id, area: area.name, colorId: EGAL_FARBE, color: EGAL_FARBE_NAME, colorHex: '' });
      continue;
    }
    const filament = id ? filaments.find((f) => f.id === id) : undefined;
    // Leere (nicht vorrätige) Farbrollen sind je Bereich ausgeschlossen.
    if (!id || !area.colors.includes(id) || !filament || !filament.available) {
      fields[prefix + (areas.length === 1 ? 'color' : `color.${area.id}`)] = id ? 'Farbe nicht verfügbar' : 'Bitte eine Farbe wählen';
      continue;
    }
    choices.push({ areaId: area.id, area: area.name, colorId: filament.id, color: filament.colorName, colorHex: filament.hex });
  }
  if (Object.keys(fields).length) throw badRequest('Bitte eine verfügbare Farbe wählen.', fields);
  return choices;
}

/** Personalisierungsfelder prüfen (Pflicht, Länge, Zahl, Auswahl). Fehler-Felder: `custom.<Feld-ID>`. */
function resolvePersonalization(item: Item, values: Record<string, string>): OrderCustomValue[] {
  const fields: Record<string, string> = {};
  const result: OrderCustomValue[] = [];
  for (const field of item.customFields ?? []) {
    const value = (values[field.id] ?? '').trim();
    const key = `custom.${field.id}`;
    if (!value) {
      if (field.required) fields[key] = 'Pflichtfeld';
      continue;
    }
    if (value.length > field.maxLength) fields[key] = `Höchstens ${field.maxLength} Zeichen`;
    else if (field.type === 'number' && !/^-?\d+([.,]\d+)?$/.test(value)) fields[key] = 'Bitte eine Zahl eingeben';
    else if (field.type === 'select' && !field.options.includes(value)) fields[key] = 'Bitte einen Eintrag aus der Liste wählen';
    else result.push({ fieldId: field.id, label: field.label, value });
  }
  if (Object.keys(fields).length) throw badRequest('Bitte prüfen Sie die Angaben zur Personalisierung.', fields);
  return result;
}

/**
 * Prüft alle Angaben, die die Lehrkraft beim Anlegen und Ändern macht, und liefert die zu speichernden Felder.
 * Mehrere Farben (`variants`): Stückzahl = Summe; die erste Variante gilt als bisherige Farbe (colorId/colorChoices),
 * `color` enthält die kurze Aufteilung („3 × Blau, 4 × Gelb“) für Listen, Suche und ältere Anzeigen.
 */
function resolveOrderInput(item: Item, input: OrderInputData, filaments: Filament[]) {
  let quantity = input.quantity;
  let colorChoices: OrderColorChoice[];
  let colorVariants: OrderColorVariant[] = [];
  if (input.variants) {
    const variants = input.variants.map((v, i) => ({
      quantity: v.quantity,
      colorChoices: resolveColors(item, v.colors, undefined, filaments, i ? `variants.${i}.` : ''),
    }));
    quantity = variants.reduce((n, v) => n + v.quantity, 0);
    if (quantity > MAX_ORDER_QUANTITY) {
      throw badRequest(`Bitte höchstens ${MAX_ORDER_QUANTITY} Stück je Anfrage.`, { quantity: `Zusammen höchstens ${MAX_ORDER_QUANTITY} Stück` });
    }
    colorChoices = variants[0].colorChoices;
    if (variants.length > 1) colorVariants = variants;
  } else {
    colorChoices = resolveColors(item, input.colors, input.color, filaments);
  }
  const personalization = resolvePersonalization(item, input.personalization);
  // Größen sind freiwillig: ohne Größen am Druckteil bleibt die Angabe leer.
  if (item.sizes.length ? !item.sizes.includes(input.size) : input.size) {
    throw badRequest('Bitte eine verfügbare Größe wählen.', { size: 'Größe nicht verfügbar' });
  }
  return {
    quantity,
    // Schnappschuss der Farbnamen – bleibt lesbar, auch wenn die Rolle später gelöscht wird. Anfragende sehen nur
    // die Farbe; welches Filament dahintersteht, zeigt die Verwaltung über colorId.
    // color/colorId/colorHex: erster Bereich bzw. Gesamttext (für Listen, Suche und Mail).
    color: colorVariants.length ? colorVariantsText(colorVariants) : colorChoicesText(colorChoices),
    colorId: colorChoices[0].colorId,
    colorHex: colorChoices[0].colorHex,
    colorChoices,
    colorVariants,
    size: input.size,
    classOrTeam: input.classOrTeam,
    customization: input.customization,
    personalization,
  };
}

const byNewest = (a: Order, b: Order) => b.createdAt.localeCompare(a.createdAt);

// Ohne verwechselbare Zeichen (0/O, 1/I/L), damit der Code leicht abzulesen ist.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function createTrackingCode(): string {
  return Array.from(crypto.randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export const siehtAlleAnfragen = (user: User | undefined) => userCan(user, 'orders:view');

/** Anfrage stellen – ohne Anmeldung möglich. Schul-E-Mail und Klasse werden eingetragen. */
export async function createOrder(storage: Storage, input: OrderInputData, user: User | undefined, loggedIn: Requester | undefined) {
  const item = await storage.items.findById(input.itemId);
  if (!item || !item.published) throw badRequest('Dieses Druckteil kann derzeit nicht angefragt werden.');
  const settings = await storage.settings.get();
  // Farben sind Filament-IDs; sie müssen im jeweiligen Farbbereich hinterlegt sein und noch existieren.
  const values = resolveOrderInput(item, input, settings.masterData.filaments);

  const now = new Date().toISOString();
  // Verweis auf die Ursprungsanfrage nur, wenn sie der angemeldeten Lehrkraft gehört (sonst still ignoriert).
  const source = input.repeatOf && loggedIn ? await storage.orders.findById(input.repeatOf) : undefined;
  const repeatOf = source && source.requesterId === loggedIn?.id ? source.id : undefined;
  // Angemeldet (Lehrkraft oder Konto): immer die eigene Adresse aus der Sitzung – eine andere im Body wird
  // still ersetzt, damit die Anfrage sicher unter „Meine Anfragen“ landet und niemand unter fremder Adresse anfragt.
  const sessionEmail = user?.email || loggedIn?.email;
  const email = sessionEmail || input.requesterEmail;
  // Domänen nur ohne Anmeldung prüfen; angemeldete Adressen sind schon geprüft (Anmeldung bzw. Konto).
  if (!sessionEmail && !isAllowedEmail(email, settings.orderForm.allowedEmailDomains)) {
    const list = settings.orderForm.allowedEmailDomains.map((d) => `@${d}`).join(' oder ');
    throw badRequest(`Bitte Ihre Schul-E-Mail-Adresse (${list}) verwenden.`, { requesterEmail: `Nur Adressen mit ${list}` });
  }
  // Häkchen „Druckteile anfragen“ abgeschaltet → keine Anfragen mit dieser Adresse (auch nicht ohne Anmeldung).
  if ((await storage.requesters.findByEmail(email))?.darfAnfragen === false) {
    throw forbidden('Mit dieser E-Mail-Adresse können keine Anfragen gestellt werden. Bitte an die Administration wenden.');
  }
  // Unbekannte Adresse → Lehrkraft wird automatisch neu angelegt (ohne Passwort/Profil).
  const requester = await storage.requesters.upsertByEmail(email, now);
  const status = ANFANGSSTATUS;
  const order = await storage.orders.create({
    id: newId(),
    itemId: item.id,
    itemName: item.name,
    ...values,
    status,
    history: [{ status, at: now, byUserId: user?.id ?? '', byName: requester.email, comment: '' }],
    requesterId: requester.id,
    requesterEmail: requester.email,
    requesterName: requester.email,
    trackingCode: createTrackingCode(),
    isDemo: false,
    ...(repeatOf ? { repeatOf } : {}),
    createdAt: now,
    updatedAt: now,
  });
  notifyNewOrder(storage, order, item);

  // Lehrkräfte reichen nur ein – Status und Code erhalten sie nur, wenn das eingeschaltet ist.
  if (!settings.features.requesterTracking && !siehtAlleAnfragen(user)) return { id: order.id, number: order.number, itemName: order.itemName };
  return order;
}

/** Nur offene Anfragen (vom Team noch nicht angesehen) darf die Lehrkraft selbst ändern. */
const isEditable = (o: Order) => o.status === ANFANGSSTATUS;

/**
 * Eigene Anfrage ändern, solange sie offen ist. Gleiche Prüfung wie beim Anlegen; Druckteil, E-Mail und
 * Nummer bleiben. Fremde Anfragen → 404, schon bearbeitete → 409.
 */
export async function updateOwnOrder(storage: Storage, id: string, input: OrderInputData, requester: Requester) {
  const order = await storage.orders.findById(id);
  if (!order || order.requesterId !== requester.id) throw notFound('Anfrage nicht gefunden.');
  if (!isEditable(order)) throw conflict(ORDER_LOCKED_MESSAGE);
  if (input.itemId !== order.itemId) throw badRequest('Das Druckteil einer Anfrage kann nicht geändert werden.', { itemId: 'Nicht änderbar' });
  const item = await storage.items.findById(order.itemId);
  if (!item || !item.published) throw badRequest('Dieses Druckteil kann derzeit nicht angefragt werden.');
  const { masterData, features } = await storage.settings.get();
  const values = resolveOrderInput(item, input, masterData.filaments);
  const updated = await storage.orders.update(id, (current) => {
    // Erneut in der Transaktion prüfen – das Team könnte den Status gerade geändert haben.
    if (!isEditable(current)) throw conflict(ORDER_LOCKED_MESSAGE);
    const at = new Date().toISOString();
    const entry = { status: current.status, at, byUserId: '', byName: requester.email, comment: 'Von der Lehrkraft geändert' };
    return { ...current, ...values, history: [...current.history, entry], updatedAt: at };
  });
  if (!updated) throw notFound('Anfrage nicht gefunden.');
  notifyNewOrder(storage, updated, item, order);
  return toOwnOrder(updated, features.requesterTracking);
}

/** Anfragen über ihre Codes abrufen – nur wenn in den Einstellungen eingeschaltet (Schalter vor der Eingabeprüfung). */
export async function trackOrders(storage: Storage, body: unknown) {
  if (!(await storage.settings.get()).features.requesterTracking) throw notFound('Die Statusabfrage ist ausgeschaltet.');
  const { codes } = trackSchema.parse(body);
  return storage.orders.listByTrackingCodes([...new Set(codes)]).sort(byNewest).map((o) => toOwnOrder(o, true));
}

/** Sicht der Lehrkraft auf ihre Anfrage – ohne interne Felder. */
function toOwnOrder(o: Order, withStatus: boolean): OwnOrder {
  const base: OwnOrder = {
    id: o.id,
    number: o.number,
    itemId: o.itemId,
    itemName: o.itemName,
    quantity: o.quantity,
    color: o.color,
    colorHex: o.colorHex,
    colorChoices: o.colorChoices ?? [],
    colorVariants: o.colorVariants ?? [],
    size: o.size,
    classOrTeam: o.classOrTeam,
    customization: o.customization,
    personalization: o.personalization ?? [],
    isDemo: o.isDemo,
    createdAt: o.createdAt,
    editable: isEditable(o),
  };
  return withStatus ? { ...base, status: o.status, history: o.history, trackingCode: o.trackingCode } : base;
}

/** Eigene Anfragen der Lehrkraft; Bearbeitungsstand nur, wenn die Statusanzeige für Lehrkräfte eingeschaltet ist. */
export async function myOrders(storage: Storage, requesterId: string): Promise<OwnOrder[]> {
  const { features } = await storage.settings.get();
  const orders = (await storage.orders.listByRequester(requesterId)).sort(byNewest);
  const items = new Map(storage.items.listByIds(orders.map((o) => o.itemId)).map((i) => [i.id, i]));
  return orders.map((o) => {
    const item = items.get(o.itemId);
    return { ...toOwnOrder(o, features.requesterTracking), itemImages: item?.images.slice(0, 1) ?? [], itemCategory: item?.category ?? '' };
  });
}

/**
 * Vorlage zum erneuten Anfragen: nur die eigene Anfrage. Prüft gegen den aktuellen Stand des Druckteils und
 * liefert nur noch gültige Angaben; alles andere steht in `hinweise` (und bleibt im Formular leer).
 */
export async function orderTemplate(storage: Storage, orderId: string, requesterId: string): Promise<RequestTemplate> {
  const order = await storage.orders.findById(orderId);
  if (!order || order.requesterId !== requesterId) throw notFound('Anfrage nicht gefunden.');
  const item = order.itemId ? await storage.items.findById(order.itemId) : undefined;
  if (!item || !item.published) {
    return { orderId: order.id, number: order.number, itemId: order.itemId, itemName: order.itemName, available: false, hinweise: ['Dieses Druckteil ist nicht mehr im Katalog.'] };
  }
  const { masterData } = await storage.settings.get();
  const hinweise: string[] = [];
  const areas = item.colorAreas?.length ? item.colorAreas : singleColorArea(item.colors);
  const validColors = (choices: OrderColorChoice[]) => {
    const colors: Record<string, string> = {};
    for (const area of areas) {
      const choice =
        choices.find((c) => c.areaId === area.id) ??
        (areas.length === 1 && order.colorId && !order.colorVariants.length ? { colorId: order.colorId, color: order.color } : undefined);
      if (choice?.colorId === EGAL_FARBE) {
        colors[area.id] = EGAL_FARBE;
        continue;
      }
      const filament = choice ? masterData.filaments.find((f) => f.id === choice.colorId) : undefined;
      if (choice && filament && filament.available && area.colors.includes(filament.id)) colors[area.id] = filament.id;
      else hinweise.push(`${areas.length > 1 ? `Farbe „${area.name}“` : 'Farbe'}: „${choice?.color ?? 'bisherige Farbe'}“ ist nicht mehr verfügbar – bitte neu wählen.`);
    }
    return colors;
  };
  const colors = validColors(order.colorChoices);
  const variants = order.colorVariants.length ? order.colorVariants.map((v) => ({ quantity: v.quantity, colors: validColors(v.colorChoices) })) : undefined;
  const personalization: Record<string, string> = {};
  for (const v of order.personalization) {
    const field = (item.customFields ?? []).find((f) => f.id === v.fieldId);
    if (field && (field.type !== 'select' || field.options.includes(v.value))) personalization[field.id] = v.value;
    else hinweise.push(`Angabe „${v.label}“ gibt es nicht mehr oder ist nicht mehr gültig – bitte neu eintragen.`);
  }
  const size = item.sizes.includes(order.size) ? order.size : '';
  if (!size && order.size) hinweise.push(`Größe „${order.size}“ gibt es nicht mehr – bitte neu wählen.`);
  return {
    orderId: order.id,
    number: order.number,
    itemId: item.id,
    itemName: item.name,
    available: true,
    quantity: order.quantity,
    colors,
    ...(variants ? { variants } : {}),
    size,
    classOrTeam: order.classOrTeam,
    customization: order.customization,
    personalization,
    hinweise: [...new Set(hinweise)],
  };
}

/** Lehrkräfte (Besteller-Verzeichnis) mit Anzahl ihrer Anfragen. */
export async function listRequesters(storage: Storage) {
  const counts = storage.orders.countByRequester();
  return (await storage.requesters.list())
    .map((r) => ({ ...r, orderCount: counts.get(r.id) ?? 0 }))
    .sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt));
}

/** Alle Anfragen, optional nach Status und Suchtext gefiltert (wie im Katalog: jedes Wort, Umlaute egal), neueste zuerst. */
export function listOrders(storage: Storage, status: string, query: string) {
  return storage.orders
    .listByStatus(status)
    .filter((o) => passtZurSuche([o.number, o.itemName, o.classOrTeam, o.color, o.requesterName, o.requesterEmail], query))
    .sort(byNewest);
}

export async function changeStatus(storage: Storage, id: string, status: string, comment: string, user: User) {
  const { masterData } = await storage.settings.get();
  const def = masterData.orderStatuses.find((s) => s.id === status);
  if (!def) throw badRequest('Unbekannter Status.', { status: 'Unbekannter Status' });
  const updated = await storage.orders.update(id, (current) => {
    // Ausgeschaltete Status sind nicht wählbar – nur ein Kommentar zum bestehenden Status bleibt möglich.
    if (!def.active && current.status !== status) {
      throw badRequest(`Der Status „${def.name}“ ist ausgeschaltet.`, { status: 'Status ausgeschaltet' });
    }
    if (current.status === status && !comment) {
      throw badRequest('Der Status ist bereits gesetzt. Bitte einen anderen Status oder einen Kommentar angeben.');
    }
    const at = new Date().toISOString();
    return { ...current, status, history: [...current.history, { status, at, byUserId: user.id, byName: user.displayName, comment }], updatedAt: at };
  });
  if (!updated) throw notFound('Anfrage nicht gefunden.');
  return updated;
}

/** Übersicht für das Druck-Team: Zahlen per SQL, dazu die neuesten Anfragen. */
export async function dashboard(storage: Storage): Promise<DashboardData> {
  const statuses = (await storage.settings.get()).masterData.orderStatuses;
  const byStatus: Record<string, number> = Object.fromEntries(statuses.map((s) => [s.id, 0]));
  for (const [status, n] of Object.entries(storage.orders.countByStatus())) byStatus[status] = (byStatus[status] ?? 0) + n;
  const sumPhase = (phase: StatusPhase) => statuses.filter((s) => s.phase === phase).reduce((n, s) => n + (byStatus[s.id] ?? 0), 0);
  return {
    items: { total: await storage.items.count(), published: storage.items.countPublished() },
    orders: { open: sumPhase('open'), printing: sumPhase('active'), completed: sumPhase('done'), byStatus },
    latest: storage.orders.latest(6).sort(byNewest),
  };
}
