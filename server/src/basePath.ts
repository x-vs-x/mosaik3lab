import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from 'express';

/**
 * Basis-Pfad der App: „“ (Standard, App unter /) oder z. B. „/mosaik3lab“. Kommt vom Server-Manager (BASE_PATH).
 * Ungültige Werte werden abgelehnt, damit nie ein falscher Pfad in <base href> oder Cookies landet.
 */
export function normalizeBasePath(value: string | undefined): string {
  const v = (value ?? '').trim().replace(/\/+$/, '');
  if (!v || v === '/') return '';
  if (!/^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/.test(v) || v.length > 80) throw new Error(`Ungültiger Basis-Pfad „${value}“ (erlaubt: /name oder /name/unterordner).`);
  return v;
}

/**
 * index.html mit dem eingestellten Basis-Pfad ausliefern: das gebaute Frontend benutzt relative Adressen und
 * <base href="/">; hier wird der Pfad eingesetzt (z. B. <base href="/mosaik3lab/">). Eine Datei, ein Build für jeden Pfad.
 */
export function indexHtmlHandler(distDir: string, basePath: string): RequestHandler {
  const file = path.join(distDir, 'index.html');
  let cached: { mtime: number; html: string } | undefined;
  return (_req, res) => {
    const mtime = fs.statSync(file).mtimeMs;
    if (!cached || cached.mtime !== mtime) {
      // <link href="./…"> (Icons, Manifest, Schriften) zusätzlich absolut: iOS holt das Home-Bildschirm-Icon nicht
      // in jedem Fall über <base> auf – mit vollem Pfad findet jedes Gerät die Datei.
      const html = fs
        .readFileSync(file, 'utf8')
        .replace(/<base\s+href="[^"]*"\s*\/?>/i, `<base href="${basePath}/" />`)
        .replace(/(<link\b[^>]*?\shref=")\.\//gi, `$1${basePath}/`);
      cached = { mtime, html };
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(cached.html);
  };
}
