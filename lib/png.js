'use strict';
// Tiny dependency-free PNG writer used to generate Open Graph (Facebook/WhatsApp) share images and icons.

const zlib = require('zlib');

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePNG(w, h, rgb) {
  const stride = w * 3 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * stride + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a, b, t) => a + (b - a) * t;

/** 1200x630 share card: diagonal gradient + concentric rings + gold star. No text (keeps it font-free). */
function ogCard(colorHex, w = 1200, h = 630) {
  const dark = hex('#0b2e22');
  const col = hex(colorHex);
  const gold = hex('#d8b45f');
  const px = new Uint8Array(w * h * 3);
  const cx = w * 0.78, cy = h * 0.42;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = Math.min(1, Math.max(0, (x / w) * 0.35 + (1 - y / h) * 0.15 + (1 - x / w) * 0.5));
      let r = lerp(col[0], dark[0], 1 - t), g = lerp(col[1], dark[1], 1 - t), b = lerp(col[2], dark[2], 1 - t);
      const d = Math.hypot(x - cx, y - cy);
      const ring = Math.abs(((d % 70) + 70) % 70 - 35);
      if (d < 420 && ring > 32.5) { const k = 0.16 * (1 - d / 420); r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
      // diamond (rotated square) star in the middle of the rings
      const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
      const sq = Math.max(dx, dy) < 46 || dx + dy < 66;
      if (sq) { r = lerp(r, gold[0], 0.92); g = lerp(g, gold[1], 0.92); b = lerp(b, gold[2], 0.92); }
      const o = (y * w + x) * 3;
      px[o] = r; px[o + 1] = g; px[o + 2] = b;
    }
  }
  return encodePNG(w, h, px);
}

/** Square app/favicon icon: dark green disc, cream ring, gold star. */
function iconPng(size) {
  const bg = hex('#0f3d2e'), cream = hex('#faf6ec'), gold = hex('#d8b45f');
  const px = new Uint8Array(size * size * 3);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
      let col = bg;
      if (d > 0.74 && d < 0.8) col = cream;
      const dx = Math.abs(x + 0.5 - c) / c, dy = Math.abs(y + 0.5 - c) / c;
      if (Math.max(dx, dy) < 0.26 || dx + dy < 0.38) col = gold;
      const o = (y * size + x) * 3;
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2];
    }
  }
  return encodePNG(size, size, px);
}

module.exports = { ogCard, iconPng };
