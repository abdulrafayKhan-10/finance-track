// Generates the PWA icons (public/icons/*.png) with no image dependencies:
// a teal tile (the app's primary colour) with a white wallet shape, rendered
// with 4x4 supersampling and written as PNG via zlib. Run: node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const TEAL = [18, 60, 51]; // treasury ink #123c33
const BRASS = [168, 120, 30];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
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

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Inside a rounded rectangle (coordinates in 0..1 units). */
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/**
 * The glyph in a 0..1 square: a wallet body with a flap line and a clasp.
 * `pad` shrinks it towards the centre (maskable icons need a safe zone).
 */
function shade(u, v, { pad, rounded }) {
  const tile = rounded ? inRoundRect(u, v, 0, 0, 1, 1, 0.22) : true;
  if (!tile) return null;
  const s = (t) => 0.5 + (t - 0.5) / (1 - 2 * pad);
  const x = s(u);
  const y = s(v);
  const body = inRoundRect(x, y, 0.2, 0.3, 0.8, 0.74, 0.07);
  const flapGap = y > 0.39 && y < 0.43 && x > 0.2 && x < 0.8;
  const pocket = inRoundRect(x, y, 0.56, 0.47, 0.86, 0.61, 0.05);
  const clasp = (x - 0.66) ** 2 + (y - 0.54) ** 2 <= 0.03 ** 2;
  if (clasp) return BRASS;
  if (pocket) return WHITE;
  if (body && !flapGap) return WHITE;
  return TEAL;
}

function render(size, opts) {
  const n = 4;
  return png(size, (px, py) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < n; sy++) {
      for (let sx = 0; sx < n; sx++) {
        const c = shade((px + (sx + 0.5) / n) / size, (py + (sy + 0.5) / n) / size, opts);
        if (c) {
          r += c[0];
          g += c[1];
          b += c[2];
          a += 255;
        }
      }
    }
    const k = n * n;
    const alpha = a / k;
    return alpha === 0
      ? [0, 0, 0, 0]
      : [Math.round(r / (a / 255)), Math.round(g / (a / 255)), Math.round(b / (a / 255)), Math.round(alpha)];
  });
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", render(192, { pad: 0.02, rounded: true }));
writeFileSync("public/icons/icon-512.png", render(512, { pad: 0.02, rounded: true }));
// Maskable: full-bleed background, glyph inside the central 80% safe zone.
writeFileSync("public/icons/maskable-512.png", render(512, { pad: 0.12, rounded: false }));
writeFileSync("public/icons/apple-touch-icon.png", render(180, { pad: 0.04, rounded: false }));
writeFileSync("public/icons/favicon-32.png", render(32, { pad: 0, rounded: true }));
console.log("Icons written to public/icons/");
