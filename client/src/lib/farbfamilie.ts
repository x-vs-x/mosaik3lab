// Farbfamilie aus dem Farbwert – für die Gruppierung im Farbwahl-Fenster der Lehrkräfte (ohne neue Daten).
// Grob und verständlich: Grautöne zuerst, dann Braun/Beige (warme dunkle bzw. blasse Töne), dann nach Farbton.

export const FARBFAMILIEN = ['Weiß, Grau, Schwarz', 'Rot & Rosa', 'Orange & Gelb', 'Grün', 'Blau & Türkis', 'Lila & Pink', 'Braun & Beige'] as const;
export type Farbfamilie = (typeof FARBFAMILIEN)[number];

/** Farbton (0–360), Helligkeit (0–1), Sättigung (0–1) und Buntheit (max − min, 0–1) eines #RRGGBB-Werts. */
function hsl(hex: string) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, l, s, d };
}

export function farbfamilie(hex: string): Farbfamilie {
  const { h, l, s, d } = hsl(hex);
  if (s < 0.18 || l < 0.12 || l > 0.95) return 'Weiß, Grau, Schwarz';
  // Warme Töne: dunkel = Braun (Kakao, Bronze), sehr blass = Beige (Creme, Wüstenbraun)
  if (h >= 10 && h < 56 && (l < 0.45 || (l > 0.7 && d < 0.3))) return 'Braun & Beige';
  if (h < 15 || h >= 330) return 'Rot & Rosa';
  if (h < 62) return 'Orange & Gelb';
  if (h < 170) return 'Grün';
  if (h < 245) return 'Blau & Türkis';
  return 'Lila & Pink';
}

/** Farben nach Familie gruppiert (Reihenfolge der Familien fest, in jeder Familie wie übergeben); leere fallen weg. */
export function nachFarbfamilie<T extends { hex: string }>(farben: readonly T[]): [Farbfamilie, T[]][] {
  const map = new Map<Farbfamilie, T[]>(FARBFAMILIEN.map((f) => [f, []]));
  for (const f of farben) map.get(farbfamilie(f.hex))!.push(f);
  return [...map.entries()].filter(([, l]) => l.length > 0);
}
