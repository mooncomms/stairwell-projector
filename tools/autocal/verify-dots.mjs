// Independent accuracy check of a decoded run: project dots at known projector pixels,
// find them in the camera, and compare with what the decode map says those camera
// pixels see.
//
//   node tools/autocal/verify-dots.mjs data/autocal/run1 [rig options]
import fs from 'node:fs';
import path from 'node:path';
import { openRig, parseArgs, readLuma } from './rig.mjs';

const dir = process.argv[2];
const args = parseArgs(process.argv.slice(3));
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'capture.json'), 'utf8'));
const CW = meta.camera.w, CH = meta.camera.h;
const map = new Float32Array(fs.readFileSync(path.join(dir, 'map.bin')).buffer.slice(0));

// Dots on a grid across the screen.
const pts = [];
for (let j = 1; j <= 5; j++) for (let i = 1; i <= 7; i++) pts.push([Math.round((i / 8) * meta.screen.w), Math.round((j / 6) * meta.screen.h)]);

const rig = await openRig({ port: args.port, adb: args.adb, serial: args.serial, exposure: args.exposure });
await rig.show({ kind: 'black' }); await rig.grab('vblack');
await rig.show({ kind: 'points', pts, r: 7 }); await rig.grab('vdots');
rig.close();
await rig.show({ kind: 'black' });
const out = path.join(dir, 'verify'); rig.pullAll(out);

const a = readLuma(path.join(out, 'vdots.yuv')), b = readLuma(path.join(out, 'vblack.yuv'));
const on = new Uint8Array(CW * CH);
for (let i = 0; i < on.length; i++) on[i] = a[i] - b[i] > 35 ? 1 : 0;
// Connected components → weighted centroids.
const seen = new Uint8Array(on.length), blobs = [];
for (let i = 0; i < on.length; i++) {
  if (!on[i] || seen[i]) continue;
  const st = [i]; seen[i] = 1; let sw = 0, sx = 0, sy = 0, n = 0;
  while (st.length) {
    const k = st.pop(), x = k % CW, y = (k / CW) | 0, w = a[k] - b[k];
    sw += w; sx += w * x; sy += w * y; n++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy, kk = yy * CW + xx;
      if (xx >= 0 && yy >= 0 && xx < CW && yy < CH && on[kk] && !seen[kk]) { seen[kk] = 1; st.push(kk); }
    }
  }
  if (n >= 3) blobs.push({ x: sx / sw, y: sy / sw, n });
}
// What the decode map says each blob centre sees (median of valid neighbours).
const errs = [];
for (const bl of blobs) {
  const xs = [], ys = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = Math.round(bl.x) + dx, y = Math.round(bl.y) + dy, k = 2 * (y * CW + x);
    if (x < 0 || y < 0 || x >= CW || y >= CH || Number.isNaN(map[k])) continue;
    xs.push(map[k]); ys.push(map[k + 1]);
  }
  if (!xs.length) continue;
  const med = (v) => v.sort((p, q) => p - q)[v.length >> 1];
  const px = med(xs), py = med(ys);
  const near = pts.reduce((best, p) => (Math.hypot(p[0] - px, p[1] - py) < Math.hypot(best[0] - px, best[1] - py) ? p : best));
  errs.push(Math.hypot(near[0] - px, near[1] - py));
}
errs.sort((p, q) => p - q);
const r = { dots: pts.length, found: blobs.length, matched: errs.length, medianErrPx: +errs[errs.length >> 1]?.toFixed(1), p90ErrPx: +errs[Math.floor(errs.length * 0.9)]?.toFixed(1), maxErrPx: +errs[errs.length - 1]?.toFixed(1) };
fs.writeFileSync(path.join(out, 'verify.json'), JSON.stringify(r, null, 2));
console.log(JSON.stringify(r));
