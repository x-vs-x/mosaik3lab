// Upload-Grenzen (ohne zod – auch für den Client): Der Server lehnt größere Dateien ab (server/src/kern/uploads.ts),
// der Client nennt dieselben Zahlen in seinen Hinweisen und prüft vorab.

const MB = 1024 * 1024;

/** Höchstgröße je Bild (Druckteil-Bilder, Fotos zu Vorschlägen). */
export const MAX_IMAGE_BYTES = 5 * MB;
/** Höchstgröße je Druckdatei (STL/3MF). */
export const MAX_MODEL_BYTES = 50 * MB;
/** Höchstgröße je Video (MP4/WebM). */
export const MAX_VIDEO_BYTES = 50 * MB;

export const MAX_IMAGES_PER_ITEM = 8;
export const MAX_MODELS_PER_ITEM = 10;
export const MAX_VIDEOS_PER_ITEM = 4;

/** Grenze in ganzen MB für Hinweistexte, z. B. „5 MB“. */
export const mbText = (bytes: number) => `${Math.round(bytes / MB)} MB`;
