import fs from 'node:fs/promises';
import path from 'node:path';
import { newId } from '../../kern/ids';
import { userCan } from '../konten/rechte';
import type { Proposal } from '@mosaik3lab/shared/vorschlaege';
import type { Item, User } from '../../domain/types';
import type { Requester } from '@mosaik3lab/shared/anfragen';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../../kern/errors';
import { dateiName } from '../../kern/files';
import { detectImage, originalName } from '../../kern/uploads';
import type { Storage } from '../../storage';
import { notifyNewProposal } from './vorschlaege.mail';
import { passtZurSuche } from '@mosaik3lab/shared/suche';
import { proposalInputSchema } from '@mosaik3lab/shared/vorschlaege';

// Regeln für Vorschläge der Lehrkräfte: einreichen (mit Fotos), beantworten, in ein Druckteil umwandeln.

const byNewest = (a: Proposal, b: Proposal) => b.createdAt.localeCompare(a.createdAt);

export async function loadProposal(storage: Storage, id: string) {
  const p = await storage.proposals.findById(id);
  if (!p) throw notFound('Vorschlag nicht gefunden.');
  return p;
}

/** Vorschlag einreichen. `data` = JSON-Text aus dem Multipart-Feld „data“, Fotos höchstens 5. */
export async function submitProposal(storage: Storage, requester: Requester | undefined, data: unknown, files: Express.Multer.File[]) {
  if (!requester) throw forbidden();
  let raw: unknown;
  try {
    raw = JSON.parse(typeof data === 'string' ? data : '{}');
  } catch {
    throw badRequest('Ungültige Daten.');
  }
  const input = proposalInputSchema.parse(raw);
  const exts = files.map(detectImage); // erst alles prüfen, dann speichern

  const now = new Date().toISOString();
  const id = newId();
  await storage.proposals.create({
    id,
    requesterId: requester.id,
    requesterEmail: requester.email,
    title: input.title,
    description: input.description,
    usage: input.usage,
    links: input.links,
    quantity: input.quantity,
    urgency: input.urgency,
    status: 'neu',
    reply: '',
    itemId: null,
    updatedByUserId: '',
    createdAt: now,
    updatedAt: now,
  });
  try {
    for (let i = 0; i < files.length; i++) {
      await storage.files.save({
        objekttyp: 'vorschlag',
        objektId: id,
        rolle: 'foto',
        buffer: files[i].buffer,
        ext: exts[i],
        originalname: originalName(files[i]),
        erstelltVon: requester.id,
      });
    }
  } catch (err) {
    await storage.proposals.delete(id); // Vorschlag samt bereits gespeicherten Fotos zurücknehmen
    throw err;
  }
  const created = await loadProposal(storage, id);
  notifyNewProposal(storage, created);
  return created;
}

export async function myProposals(storage: Storage, requesterId: string) {
  return (await storage.proposals.listByRequester(requesterId)).sort(byNewest);
}

export function listProposals(storage: Storage, status: string, query: string) {
  return storage.proposals
    .listByStatus(status)
    .filter((p) => passtZurSuche([p.number, p.title, p.description, p.requesterEmail], query))
    .sort(byNewest);
}

/** Foto eines Vorschlags: die einreichende Lehrkraft und wer Vorschläge sehen darf. Ohne Recht → Fehler. */
export async function proposalPhoto(storage: Storage, id: string, file: string, user: User | undefined, requester: Requester | undefined) {
  const p = await storage.proposals.findById(id);
  const isOwner = !!requester && !!p && p.requesterId === requester.id;
  if (!user && !requester) throw unauthorized();
  if (!p || !(isOwner || userCan(user, 'vorschlaege:sehen'))) throw notFound('Foto nicht gefunden.');
  const datei = storage.files.findByName(file, 'foto');
  if (!datei || datei.objekttyp !== 'vorschlag' || datei.objektId !== p.id) throw notFound('Foto nicht gefunden.');
  return datei;
}

/** Status ändern und der Lehrkraft antworten; bei „Abgelehnt“ ist eine Antwort Pflicht. */
export async function answerProposal(storage: Storage, id: string, status: Proposal['status'], reply: string, user: User) {
  if (status === 'abgelehnt' && !reply) {
    throw badRequest('Bitte der Lehrkraft kurz erklären, warum der Vorschlag abgelehnt wird.', { reply: 'Bei „Abgelehnt“ bitte eine Antwort schreiben' });
  }
  const updated = await storage.proposals.update(id, (c) => {
    // Umgewandelt = es gibt den Entwurf im Katalog; „Neu“ oder „Abgelehnt“ widerspräche dem. Erst den Entwurf löschen.
    if (c.itemId && status !== 'umgesetzt') {
      throw conflict('Dieser Vorschlag ist schon in ein Druckteil umgewandelt. Für einen anderen Status bitte zuerst den Entwurf unter „Druckteile verwalten“ löschen.', {
        status: 'Bereits umgewandelt',
      });
    }
    return { ...c, status, reply, updatedByUserId: user.id, updatedAt: new Date().toISOString() };
  });
  if (!updated) throw notFound('Vorschlag nicht gefunden.');
  return updated;
}

/** Entwurf eines Druckteils aus einem Vorschlag – die Pflichtangaben füllt das Team in der Bearbeitung aus. */
async function draftItem(storage: Storage, p: Proposal, itemId: string, images: string[]): Promise<Item> {
  const { masterData: md } = await storage.settings.get();
  const category = md.categories.find((c) => c.name === 'Sonstiges') ?? md.categories[0];
  const material = md.materials.find((m) => m.name === 'Sonstiges') ?? md.materials[0];
  const filament = md.filaments.find((f) => f.available) ?? md.filaments[0];
  const now = new Date().toISOString();
  const description = p.description.slice(0, 3000);
  return {
    id: itemId,
    name: p.title,
    shortDescription: (description.replace(/\s+/g, ' ').trim() || `Entwurf aus Vorschlag ${p.number}`).slice(0, 200),
    description,
    category: category?.name ?? '',
    kind: 'hilfsmittel',
    useAreas: [],
    sizes: ['Standard'],
    colors: filament ? [filament.id] : [],
    colorAreas: filament ? [{ id: 'farbe', name: 'Farbe', colors: [filament.id] }] : [],
    price: '',
    customFields: [],
    videos: [],
    material: material?.name ?? '',
    materialInfo: '',
    printTimeMinutes: 60,
    safetyNotes: [],
    links: [],
    images,
    modelFiles: [],
    published: false,
    isDemo: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** „In Druckteil umwandeln“: Entwurf (nicht veröffentlicht) mit Titel, Beschreibung und kopierten Fotos. */
export async function convertProposal(storage: Storage, id: string, user: User) {
  if (!userCan(user, 'catalog:manage')) throw forbidden('Zum Umwandeln wird zusätzlich das Recht „Katalog bearbeiten“ gebraucht.');
  const proposal = await loadProposal(storage, id);
  if (proposal.itemId) throw conflict('Dieser Vorschlag wurde bereits in ein Druckteil umgewandelt.');

  const itemId = newId();
  const images: string[] = [];
  try {
    for (const name of proposal.photos) {
      const foto = storage.files.findByName(name, 'foto');
      if (!foto) continue;
      const copy = await storage.files.save({
        objekttyp: 'artikel',
        objektId: itemId,
        rolle: 'bild',
        buffer: await fs.readFile(storage.files.absPath(foto)),
        ext: path.posix.extname(foto.pfad).slice(1),
        originalname: foto.originalname,
        erstelltVon: user.id,
      });
      images.push(dateiName(copy));
    }
    const item = await storage.items.create(await draftItem(storage, proposal, itemId, images));
    const updated = await storage.proposals.update(proposal.id, (c) => {
      if (c.itemId) throw conflict('Dieser Vorschlag wurde bereits in ein Druckteil umgewandelt.');
      return { ...c, status: 'umgesetzt', itemId: item.id, updatedByUserId: user.id, updatedAt: new Date().toISOString() };
    });
    return { proposal: updated, itemId: item.id };
  } catch (err) {
    // nichts halb fertig zurücklassen: Entwurf samt kopierten Bildern entfernen
    if (!(await storage.items.delete(itemId))) {
      for (const name of images) {
        const d = storage.files.findByName(name);
        if (d) await storage.files.delete(d.id);
      }
    }
    throw err;
  }
}
