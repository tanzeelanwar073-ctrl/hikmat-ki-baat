'use strict';
// Generates a tiny (~2 KB) abstract SVG cover for any article that has no featured image of its own.

function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const h2r = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const r2h = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = h2r(a), y = h2r(b); return r2h(x.map((v, i) => v + (y[i] - v) * t)); };

function coverSVG(seed, color) {
  const r = rng(hash(seed));
  const c1 = mix(color, '#06231a', 0.55);
  const c2 = mix(color, '#ffffff', 0.12);
  let blobs = '';
  for (let k = 0; k < 3; k++) {
    blobs += `<circle cx="${Math.round(r() * 1200)}" cy="${Math.round(r() * 675)}" r="${Math.round(170 + r() * 260)}" fill="#fff" fill-opacity="${(0.04 + r() * 0.05).toFixed(3)}"/>`;
  }
  const rx = Math.round(260 + r() * 680), ry = Math.round(190 + r() * 300);
  let rings = '';
  for (let k = 1; k <= 5; k++) rings += `<circle cx="${rx}" cy="${ry}" r="${k * 48}" fill="none" stroke="#fff" stroke-opacity="${(0.26 - k * 0.04).toFixed(2)}" stroke-width="2"/>`;
  const star = `<g transform="translate(${rx} ${ry})" fill="#d8b45f"><rect x="-30" y="-30" width="60" height="60"/><rect x="-30" y="-30" width="60" height="60" transform="rotate(45)"/></g>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="1200" height="675">` +
    `<defs><linearGradient id="g" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient>` +
    `<pattern id="p" width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M32 0 64 32 32 64 0 32Z" fill="none" stroke="#fff" stroke-opacity=".07"/></pattern></defs>` +
    `<rect width="1200" height="675" fill="url(#g)"/><rect width="1200" height="675" fill="url(#p)"/>${blobs}${rings}${star}</svg>`
  );
}

module.exports = { coverSVG };
