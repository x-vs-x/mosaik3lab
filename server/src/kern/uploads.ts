import path from 'node:path';
import multer from 'multer';
import { badRequest } from './errors';
import type { ImageExt, ModelExt, VideoExt } from './files';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_MODEL_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_IMAGES_PER_ITEM = 8;
export const MAX_MODELS_PER_ITEM = 10;

const IMAGE_EXTENSIONS: Record<string, ImageExt> = { '.jpg': 'jpg', '.jpeg': 'jpg', '.png': 'png', '.webp': 'webp' };
const MODEL_EXTENSIONS: Record<string, ModelExt> = { '.stl': 'stl', '.3mf': '3mf' };
const VIDEO_EXTENSIONS: Record<string, VideoExt> = { '.mp4': 'mp4', '.m4v': 'mp4', '.webm': 'webm' };
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_VIDEOS_PER_ITEM = 4;

export const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!VIDEO_EXTENSIONS[ext]) return cb(badRequest('Erlaubt sind nur Videos im Format MP4 oder WebM.'));
    cb(null, true);
  },
});

/** MP4: „ftyp“-Box ab Byte 4; WebM: EBML-Kopf 1A 45 DF A3 mit Dokumenttyp „webm“. */
export function detectVideo(file: Express.Multer.File): VideoExt {
  const b = file.buffer;
  const claimed = VIDEO_EXTENSIONS[path.extname(file.originalname).toLowerCase()];
  let actual: VideoExt | undefined;
  if (b.length > 12 && b.toString('ascii', 4, 8) === 'ftyp') actual = 'mp4';
  else if (b.length > 4 && b.readUInt32BE(0) === 0x1a45dfa3 && b.toString('latin1', 0, Math.min(b.length, 64)).includes('webm'))
    actual = 'webm';
  if (!actual || actual !== claimed) {
    throw badRequest(`„${safeName(file.originalname)}“ ist kein gültiges MP4- oder WebM-Video.`);
  }
  return actual;
}

// Dateien werden zunächst im Arbeitsspeicher gehalten, geprüft und erst dann
// mit zufälligem Namen gespeichert.
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES_PER_ITEM, fields: 5 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS[ext]) return cb(badRequest('Erlaubt sind nur Bilder im Format JPG, PNG oder WebP.'));
    cb(null, true);
  },
});

export const modelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MODEL_BYTES, files: 5, fields: 5 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!MODEL_EXTENSIONS[ext]) return cb(badRequest('Erlaubt sind nur Druckdateien im Format STL oder 3MF.'));
    cb(null, true);
  },
});

/** Prüft den tatsächlichen Dateiinhalt (Magic Bytes), nicht nur die Endung. */
export function detectImage(file: Express.Multer.File): ImageExt {
  const b = file.buffer;
  const claimed = IMAGE_EXTENSIONS[path.extname(file.originalname).toLowerCase()];
  let actual: ImageExt | undefined;
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) actual = 'jpg';
  else if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    actual = 'png';
  else if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP')
    actual = 'webp';
  if (!actual || actual !== claimed) {
    throw badRequest(`„${safeName(file.originalname)}“ ist kein gültiges JPG-, PNG- oder WebP-Bild.`);
  }
  return actual;
}

export function detectModel(file: Express.Multer.File): ModelExt {
  const b = file.buffer;
  const ext = MODEL_EXTENSIONS[path.extname(file.originalname).toLowerCase()];
  const name = safeName(file.originalname);
  if (ext === '3mf') {
    // 3MF ist ein ZIP-Container.
    if (b.length < 4 || b.readUInt32LE(0) !== 0x04034b50) throw badRequest(`„${name}“ ist keine gültige 3MF-Datei.`);
    return '3mf';
  }
  if (ext === 'stl') {
    const isBinary = b.length >= 84 && b.length === 84 + b.readUInt32LE(80) * 50;
    const head = b.toString('ascii', 0, Math.min(b.length, 512)).trimStart().toLowerCase();
    const isAscii = head.startsWith('solid') && /facet|endsolid/.test(b.toString('ascii', 0, Math.min(b.length, 4096)).toLowerCase());
    if (!isBinary && !isAscii) throw badRequest(`„${name}“ ist keine gültige STL-Datei.`);
    return 'stl';
  }
  throw badRequest('Erlaubt sind nur Druckdateien im Format STL oder 3MF.');
}

/** Bereinigt Dateinamen für Anzeige und Download (keine Pfade, keine Steuerzeichen). */
export function safeName(original: string): string {
  const base = path.basename(original.replace(/\\/g, '/'));
  const cleaned = base.replace(/[^\p{L}\p{N}._ ()-]/gu, '_').slice(0, 120);
  return cleaned || 'datei';
}

/** Ursprünglicher Dateiname eines Uploads (multer liefert latin1), bereinigt. */
export const originalName = (f: Express.Multer.File) => safeName(Buffer.from(f.originalname, 'latin1').toString('utf8'));
