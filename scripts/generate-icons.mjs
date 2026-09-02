#!/usr/bin/env node
// Draws the app icons as PNGs with no image dependencies.
// Run with: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const BG = [0x5b, 0x8c, 0xff];
const WHITE = [0xff, 0xff, 0xff];
const SAMPLES = 3; // supersampling factor, for smooth edges

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Inside a rounded rectangle in unit coordinates? */
function inRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

/** Colour at a point in unit coordinates, or null for transparent. */
function shade(x, y, maskable) {
  const background = maskable ? x >= 0 && x <= 1 && y >= 0 && y <= 1 : inRoundedRect(x, y, 0, 0, 1, 1, 0.22);
  if (!background) return null;

  // Speech bubble body.
  const bubble = inRoundedRect(x, y, 0.2, 0.24, 0.8, 0.64, 0.12);

  // Tail: a wedge hanging off the lower-left of the body.
  const tail = y >= 0.6 && y <= 0.78 && x >= 0.28 && x - 0.28 <= (0.78 - y) * 1.15;

  if (bubble || tail) {
    // Three dots, in the background colour, inside the bubble.
    for (const cx of [0.35, 0.5, 0.65]) {
      if ((x - cx) ** 2 + (y - 0.44) ** 2 <= 0.055 ** 2) return BG;
    }
    return WHITE;
  }

  return BG;
}

function render(size, maskable) {
  const pixels = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const colour = shade(
            (px + (sx + 0.5) / SAMPLES) / size,
            (py + (sy + 0.5) / SAMPLES) / size,
            maskable,
          );
          if (colour) {
            r += colour[0];
            g += colour[1];
            b += colour[2];
            a += 255;
          }
        }
      }

      const total = SAMPLES * SAMPLES;
      const covered = a / 255;
      const offset = (py * size + px) * 4;

      if (covered > 0) {
        pixels[offset] = Math.round(r / covered);
        pixels[offset + 1] = Math.round(g / covered);
        pixels[offset + 2] = Math.round(b / covered);
      }
      pixels[offset + 3] = Math.round(a / total);
    }
  }

  return encodePng(size, pixels);
}

for (const [name, size, maskable] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
]) {
  writeFileSync(join(OUT, name), render(size, maskable));
  console.log(`wrote public/${name}`);
}

// Favicon: a small copy of the rounded icon.
writeFileSync(join(OUT, "favicon.png"), render(32, false));
console.log("wrote public/favicon.png");
