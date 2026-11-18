import { badRequest, notFound } from '../../kern/errors';
import { detectImage, originalName } from '../../kern/uploads';
import type { Storage } from '../../storage';

/**
 * Inhalt eines Druckteil-Bildes ersetzen (z. B. „Vorhandene Bilder verkleinern“). Gleiche Prüfungen wie beim Hochladen;
 * Bild-ID und Reihenfolge bleiben, nur die Endung kann sich ändern (PNG ohne Transparenz → JPG).
 */
export async function replaceImage(storage: Storage, itemId: string, name: string, file: Express.Multer.File | undefined) {
  if (!file) throw badRequest('Bitte ein Bild auswählen.');
  const item = await storage.items.findById(itemId);
  if (!item) throw notFound('Druckteil nicht gefunden.');
  const datei = item.images.includes(name) ? storage.files.findByName(name, 'bild') : undefined;
  if (!datei || datei.objektId !== item.id) throw notFound('Bild nicht gefunden.');
  const ext = detectImage(file);
  // Ursprünglichen Dateinamen behalten, nur die Endung anpassen (foto.png → foto.jpg)
  const name0 = datei.originalname || originalName(file);
  await storage.files.replace(datei.id, file.buffer, ext, `${name0.replace(/\.[^.]*$/, '') || 'bild'}.${ext}`);
  const updated = await storage.items.update(item.id, (c) => ({ ...c, updatedAt: new Date().toISOString() }));
  if (!updated) throw notFound('Druckteil nicht gefunden.');
  return updated;
}
