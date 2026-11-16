// Programmsymbol aus dem Mosaik³LAB-Logo (farbige Quadrate, wie client/public/favicon.svg) –
// als PNG und Windows-.ico erzeugt, ohne Zusatzpakete.
import zlib from 'node:zlib';

// Logo-Kacheln im Koordinatensystem viewBox="-1 -4 46 44"
const TILES = [
  [10, 0, 11, '#f23838'], [1, 12, 7, '#3ccbfc'], [23, 6, 12, '#f5f55a'],
  [23, 20, 12, '#fa9b4d'], [36.5, 20, 7, '#b85e99'], [8, 20, 13, '#56bc52'],
];
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -4 46 44">${TILES.map(([x, y, s, c]) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${c}"/>`).join('')}</svg>\n`;

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** PNG (RGBA, transparent) in der gewünschten Kantenlänge. */
export function logoPng(size) {
  const scale = size / 46;
  const px = Buffer.alloc(size * size * 4);
  for (const [x, y, s, color] of TILES) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    const x0 = Math.round((x + 1) * scale), y0 = Math.round((y + 4 + 1) * scale);
    const x1 = Math.round((x + 1 + s) * scale), y1 = Math.round((y + 4 + 1 + s) * scale);
    for (let yy = Math.max(0, y0); yy < Math.min(size, y1); yy++) {
      for (let xx = Math.max(0, x0); xx < Math.min(size, x1); xx++) px.set([r, g, b, 255], (yy * size + xx) * 4);
    }
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Windows-Symboldatei mit 16/32/48/256 px (PNG-komprimiert). */
export function logoIco() {
  const images = [16, 32, 48, 256].map((s) => [s, logoPng(s)]);
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(([s, png], i) => {
    const o = 6 + i * 16;
    head.writeUInt8(s === 256 ? 0 : s, o);
    head.writeUInt8(s === 256 ? 0 : s, o + 1);
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(png.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map(([, png]) => png)]);
}
