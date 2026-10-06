// Decode a captured Gray-code sequence into a camera → projector correspondence map.
//
//   node tools/autocal/decode.mjs data/autocal/run1
//
// For every camera pixel lit by the projector, recovers which projector pixel (x, y) it
// sees, by comparing each pattern with its inverse. Writes, in the run folder:
//   map.bin      Float32 [x, y] per camera pixel (NaN where not decoded), row-major
//   decoded.png  visualisation: hue = projector x, brightness = projector y
//   decode.json  stats, and a homography projector → camera fitted with RANSAC
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { homographyDLT, applyH } from './geom.mjs';

const dir = process.argv[2];
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'capture.json'), 'utf8'));
const CW = meta.camera.w, CH = meta.camera.h, N = CW * CH, BITS = meta.bits;
const luma = (name) => {
  const d = fs.readFileSync(path.join(dir, name + '.yuv')), y = new Float32Array(N);
  for (let i = 0; i < N; i++) y[i] = d[2 * i];
  return y;
};
// Light blur: the camera is noisy and the finest stripes are near its resolution.
const blur = (a) => {
  const o = new Float32Array(N);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < CW && yy < CH) { s += a[yy * CW + xx]; n++; }
    }
    o[y * CW + x] = s / n;
  }
  return o;
};

const white = blur(luma('white')), black = blur(luma('black'));
const lit = new Uint8Array(N);
for (let i = 0; i < N; i++) lit[i] = white[i] - black[i] > 20 ? 1 : 0;

// Decode one axis; stop trusting bits once a pattern/inverse pair becomes ambiguous.
function decodeAxis(axis) {
  const val = new Int32Array(N), good = new Uint8Array(N).fill(1), used = new Uint8Array(N);
  let gray = new Int32Array(N);
  for (let b = 0; b < BITS; b++) {
    const p = blur(luma(`${axis}${b}`)), q = blur(luma(`${axis}${b}i`));
    for (let i = 0; i < N; i++) {
      if (!lit[i] || !good[i]) continue;
      const d = p[i] - q[i], range = white[i] - black[i];
      if (Math.abs(d) < 0.12 * range) { good[i] = 0; continue; }   // too close to call
      gray[i] = (gray[i] << 1) | (d > 0 ? 1 : 0);
      used[i]++;
    }
  }
  for (let i = 0; i < N; i++) {
    if (!lit[i] || used[i] < 6) { val[i] = -1; continue; }
    // Gray → binary on the bits we trust, then centre within the unresolved range.
    let g = gray[i], bin = 0;
    for (let k = used[i] - 1; k >= 0; k--) { const bit = ((g >> k) & 1) ^ (bin & 1); bin = (bin << 1) | bit; }
    const drop = BITS - used[i];
    val[i] = (bin << drop) + ((1 << drop) >> 1);
  }
  return { val, used };
}
const X = decodeAxis('x'), Y = decodeAxis('y');

const map = new Float32Array(2 * N).fill(NaN);
let decoded = 0, bitsX = 0, bitsY = 0;
const pts = [];
for (let i = 0; i < N; i++) {
  if (X.val[i] < 0 || Y.val[i] < 0 || X.val[i] >= meta.screen.w || Y.val[i] >= meta.screen.h) continue;
  map[2 * i] = X.val[i]; map[2 * i + 1] = Y.val[i];
  decoded++; bitsX += X.used[i]; bitsY += Y.used[i];
  if (i % 7 === 0) pts.push({ px: X.val[i], py: Y.val[i], cx: i % CW, cy: Math.floor(i / CW) });
}
fs.writeFileSync(path.join(dir, 'map.bin'), Buffer.from(map.buffer));

// RANSAC homography projector → camera (a flat surface gives one; outliers show other
// surfaces or decoding errors).
let best = { inl: 0, H: null };
for (let it = 0; it < 400 && pts.length >= 4; it++) {
  const s = Array.from({ length: 4 }, () => pts[Math.floor(Math.random() * pts.length)]);
  const H = homographyDLT(s.map((p) => [p.px, p.py]), s.map((p) => [p.cx, p.cy]));
  if (!H) continue;
  let inl = 0;
  for (const p of pts) { const [x, y] = applyH(H, p.px, p.py); if ((x - p.cx) ** 2 + (y - p.cy) ** 2 < 4) inl++; }
  if (inl > best.inl) best = { inl, H };
}
let Hfit = best.H, rms = NaN;
if (Hfit) {
  const inliers = pts.filter((p) => { const [x, y] = applyH(Hfit, p.px, p.py); return (x - p.cx) ** 2 + (y - p.cy) ** 2 < 4; });
  Hfit = homographyDLT(inliers.map((p) => [p.px, p.py]), inliers.map((p) => [p.cx, p.cy])) || Hfit;
  rms = Math.sqrt(inliers.reduce((a, p) => { const [x, y] = applyH(Hfit, p.px, p.py); return a + (x - p.cx) ** 2 + (y - p.cy) ** 2; }, 0) / inliers.length);
}
const stats = {
  litPixels: lit.reduce((a, v) => a + v, 0), decoded,
  avgBits: { x: +(bitsX / decoded).toFixed(1), y: +(bitsY / decoded).toFixed(1) },
  plane: Hfit ? { inlierShare: +(best.inl / pts.length).toFixed(3), rmsPx: +rms.toFixed(2), H: Hfit } : null,
};
fs.writeFileSync(path.join(dir, 'decode.json'), JSON.stringify(stats, null, 2));
console.log(JSON.stringify({ ...stats, plane: stats.plane && { inlierShare: stats.plane.inlierShare, rmsPx: stats.plane.rmsPx } }));

// Visualisation: hue from projector x, brightness from projector y.
const png = Buffer.alloc((CW * 3 + 1) * CH);
for (let y = 0; y < CH; y++) {
  png[y * (CW * 3 + 1)] = 0;
  for (let x = 0; x < CW; x++) {
    const i = y * CW + x, o = y * (CW * 3 + 1) + 1 + x * 3;
    if (Number.isNaN(map[2 * i])) { const g = white[i] * 0.25; png[o] = png[o + 1] = png[o + 2] = g; continue; }
    const h = map[2 * i] / meta.screen.w * 6, v = 0.35 + 0.65 * (map[2 * i + 1] / meta.screen.h);
    const k = (n) => { const t = (n + h) % 6; return v * (1 - Math.max(0, Math.min(1, Math.min(t, 4 - t)))); };
    png[o] = 255 * k(5); png[o + 1] = 255 * k(3); png[o + 2] = 255 * k(1);
  }
}
const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (t, b) => { const l = Buffer.alloc(4); l.writeUInt32BE(b.length); const tb = Buffer.concat([Buffer.from(t), b]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(tb)); return Buffer.concat([l, tb, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(CW, 0); ihdr.writeUInt32BE(CH, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(path.join(dir, 'decoded.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(png)), chunk('IEND', Buffer.alloc(0))]));
