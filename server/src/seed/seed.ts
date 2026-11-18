import { hashPassword } from '../kern/auth/password';
import { newId } from '../kern/ids';
import { STANDARD_BEREICHE, TEAM_BEREICHE } from '@mosaik3lab/shared/konten';
import { ANFANGSSTATUS } from '../module/einstellungen/einstellungen.vorgaben';
import { productDefaults, type Item } from '../domain/types';
import { type StatusEntry } from '@mosaik3lab/shared/anfragen';
import { createTrackingCode } from '../module/anfragen/anfragen.service';
import type { Storage } from '../storage';
import { DEMO_ITEMS, DEMO_ORDERS, DEMO_USERS, LEGACY_DEMO_EMAILS } from './demoData';


/**
 * Legt beim allerersten Start (alle Datendateien leer) Demo-Benutzer,
 * Beispiel-Druckteile und Beispiel-Anfragen an. Bestehende Daten werden nie verändert.
 */
export async function seedIfEmpty(storage: Storage): Promise<boolean> {
  const [users, items, orders] = await Promise.all([
    storage.users.count(),
    storage.items.count(),
    storage.orders.count(),
  ]);
  if (users + items + orders > 0) return false;

  console.log('[Seed] Leerer Datenbestand – Beispieldaten werden angelegt …');
  const base = Date.now();
  const iso = (msAgo: number) => new Date(base - msAgo).toISOString();
  const DAY = 24 * 60 * 60 * 1000;

  const userIds: Record<string, { id: string; name: string }> = {};
  for (const u of DEMO_USERS) {
    const id = newId();
    userIds[u.key] = { id, name: u.displayName };
    await storage.users.create({
      id,
      username: u.username,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      passwordHash: await hashPassword(u.password),
      active: true,
      isDemo: true,
      createdAt: iso(30 * DAY),
      updatedAt: iso(30 * DAY),
      lastLoginAt: null,
      teamBereiche: u.role === 'druckteam' ? STANDARD_BEREICHE.filter((b) => TEAM_BEREICHE.includes(b)) : [],
      fehlversuche: 0,
    });
  }

  const itemMap: Record<string, Item> = {};
  for (const [index, d] of DEMO_ITEMS.entries()) {
    const { key, ...data } = d;
    const item: Item = {
      kind: 'hilfsmittel',
      links: [],
      ...productDefaults(data.colors),
      ...data,
      id: newId(),
      images: [],
      modelFiles: [],
      isDemo: true,
      createdAt: iso((30 - index) * DAY),
      updatedAt: iso((30 - index) * DAY),
    };
    itemMap[key] = await storage.items.create(item);
  }

  const { masterData } = await storage.settings.get();
  const start = ANFANGSSTATUS;

  // Älteste Anfrage zuerst, damit Nummern und „letzte Anfrage“ der Lehrkräfte stimmen.
  for (const d of [...DEMO_ORDERS].sort((a, b) => b.daysAgo - a.daysAgo)) {
    const item = itemMap[d.itemKey];
    const created = d.daysAgo * DAY;
    const requester = await storage.requesters.upsertByEmail(d.requesterEmail, iso(created));
    const filament = masterData.filaments.find((f) => f.id === d.color);
    const history: StatusEntry[] = [
      { status: start, at: iso(created), byUserId: '', byName: requester.email, comment: '' },
    ];
    d.steps.forEach((step, i) => {
      const by = userIds[step.byKey];
      history.push({
        status: step.status,
        at: iso(created - (i + 1) * (created / (d.steps.length + 1))),
        byUserId: by.id,
        byName: by.name,
        comment: step.comment ?? '',
      });
    });
    const last = history[history.length - 1];
    await storage.orders.create({
      id: newId(),
      itemId: item.id,
      itemName: item.name,
      quantity: d.quantity,
      color: filament ? filament.colorName : d.color,
      colorId: d.color,
      colorHex: filament?.hex ?? '',
      colorChoices: [],
      colorVariants: [],
      personalization: [],
      size: d.size,
      classOrTeam: d.classOrTeam,
      customization: d.customization,
      status: last.status,
      history,
      requesterId: requester.id,
      requesterEmail: requester.email,
      requesterName: requester.email,
      trackingCode: createTrackingCode(),
      isDemo: true,
      createdAt: history[0].at,
      updatedAt: last.at,
    });
  }

  console.log(
    `[Seed] ${DEMO_USERS.length} Demo-Benutzer, ${DEMO_ITEMS.length} Druckteile und ${DEMO_ORDERS.length} Anfragen angelegt.`,
  );
  return true;
}

/**
 * Ergänzt Konten aus älteren Versionen um die Anmelde-E-Mail (läuft bei jedem Start, ohne Datenverlust):
 * - Demo-Konten erhalten ihre Demo-Adresse, andere Konten <benutzername>@<erste erlaubte Schul-Domain>.
 * - Konten mit Rolle „lehrkraft“ bleiben erhalten; ihre E-Mail wird als bekannte Lehrkraft
 *   eingetragen, damit sie sich künftig ohne Passwort anmelden können.
 */
export async function migrateUserEmails(storage: Storage) {
  const users = await storage.users.list();
  const legacy = users.filter((u) => typeof u.email !== 'string' || !u.email);
  if (legacy.length === 0) return;
  const { orderForm } = await storage.settings.get();
  const domain = orderForm.allowedEmailDomains[0] ?? 'schule.example';
  const taken = new Set(users.map((u) => u.email).filter(Boolean));

  for (const user of legacy) {
    const preferred = (user.isDemo && LEGACY_DEMO_EMAILS[user.username]) || `${user.username}@${domain}`;
    let email = preferred;
    for (let n = 2; taken.has(email); n++) email = preferred.replace('@', `.${n}@`);
    taken.add(email);
    await storage.users.update(user.id, (u) => ({ ...u, email }));
    if (user.role === 'lehrkraft' && !(await storage.requesters.findByEmail(email))) {
      await storage.requesters.create({ id: newId(), email, createdAt: user.createdAt, lastOrderAt: '', darfAnfragen: true, darfVorschlagen: true });
    }
  }
  console.log(`[Migration] ${legacy.length} Konto/Konten um eine Anmelde-E-Mail ergänzt (siehe Benutzer & Rollen).`);
}
