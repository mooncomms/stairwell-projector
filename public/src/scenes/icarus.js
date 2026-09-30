// Homage to Matisse's "Icarus" (Jazz, 1947): cut-paper figure with a red heart,
// jagged yellow stars on gouache blue. The figure is a jointed skeleton whose limbs
// drift and flail; edges "boil" a little like hand-cut paper in stop-motion.
const TAU = Math.PI * 2;

// Rest pose, in figure units (1 ≈ figure height), y down, angles in radians clockwise
// from +x (so -1.57 = pointing up, 1.57 = down, 0 = right, 3.14 = left).
// Each limb: root offset `at` from its parent joint, segments [length, angle] from
// root to tip, full width at each joint (one more than segments), and `wiggle`:
// how far (radians) each segment may swing.
// Fitted automatically to a photo of the Jazz print (silhouette overlap 93%).
export const POSE = {
  // pelvis → waist → chest → neck, leaning right.
  torso: { from: 'pelvis', at: [-0.01, 0], segs: [[0.134, -1.401], [0.158, -1.251], [0.109, -1.26]], widths: [0.165, 0.135, 0.215, 0.075], wiggle: 0.05 },
  // Raised arm: one long sweep up and over to the left, ending in a rounded hand
  // (set by hand: the photo's glare hides the tip from the fitter).
  armL: { from: 'chest', at: [-0.03, -0.07], segs: [[0.184, -2.031], [0.172, 3.423], [0.03, 3.3]], widths: [0.12, 0.06, 0.045, 0.03], wiggle: 0.22 },
  // Wide arc out to the right, forearm hanging down.
  armR: { from: 'chest', at: [0.05, -0.015], segs: [[0.17, 0.418], [0.214, 1.541], [0.015, 1.771]], widths: [0.125, 0.078, 0.016, 0.006], wiggle: 0.22 },
  // Chunky legs: hip flare → widest thigh → knee → calf → ankle.
  legL: { from: 'pelvis', at: [-0.055, -0.06], segs: [[0.097, 2.108], [0.159, 1.681], [0.151, 1.496], [0.08, 1.706], [0.015, 1.673]], widths: [0.083, 0.131, 0.11, 0.086, 0.065, 0.006], wiggle: 0.06 },
  legR: { from: 'pelvis', at: [0.045, -0.02], segs: [[0.065, 1.566], [0.145, 1.481], [0.072, 1.501], [0.101, 1.711], [0.015, 1.671]], widths: [0.066, 0.171, 0.141, 0.091, 0.051, 0.006], wiggle: 0.07 },
};
export const HEAD = { lift: 0.05, rx: 0.052, ry: 0.064, tilt: 0.45 };  // ellipse above the neck, tilted right
export const HEART = { at: [0.009, 0.01], r: 0.013 };           // offset from the chest joint

// The original's composition, in the print's own pixels (w × h): where the figure's
// pelvis sits and its scale (px per figure unit), plus the traced stars as polar
// outlines around their centres: radius in px every 3°, starting at +x, clockwise.
// The third star runs off the right edge like in the print.
export const FRAME = { w: 400, h: 580, x: 188.7, y: 339.1, s: 553.7, rot: 0 };
export const STARS = [
  { x: 268.4, y: 40.2, r: [18.3, 21.5, 22.8, 22.4, 20.9, 19.9, 19.9, 20.1, 20.5, 21.1, 22.1, 23.4, 24.5, 25.6, 26.6, 26.6, 23.8, 19.1, 17.3, 17.8, 18.5, 19.5, 20.6, 21.9, 22.9, 23.8, 23.9, 21.1, 16.6, 14.3, 14, 14, 14, 14.1, 14.4, 14.3, 13.9, 14, 14.4, 14.6, 15, 15.5, 16.1, 16.9, 17.5, 17.9, 18.4, 19.4, 20.8, 22, 22.4, 21.8, 19.4, 16, 15, 16.1, 17.4, 18.8, 20.1, 21.6, 23, 23.4, 22.6, 20.5, 18, 17.1, 17.5, 18.3, 19.5, 21, 22.6, 24.9, 27.8, 29.9, 25.6, 16, 11.6, 12.4, 13.3, 14.4, 15.6, 16.6, 17.5, 18.6, 20, 21.4, 21.6, 17.9, 12, 10, 11.5, 15, 19.3, 21.4, 21.6, 20.9, 19.3, 17.4, 16.3, 16.1, 16.9, 18.5, 20.9, 23.6, 25.8, 26.4, 25, 20.8, 14.9, 10.6, 8.5, 7.6, 7.5, 7.4, 7.1, 7.3, 8.4, 10.5, 12.4, 14.5] },
  { x: 60.5, y: 73.7, r: [19.8, 20.4, 20.9, 21, 21.4, 22.3, 23.3, 24.3, 25, 25.9, 27.3, 28.5, 29.5, 30.3, 27.4, 21.4, 19.1, 20.5, 21.6, 22.4, 23.8, 25.6, 27.6, 30, 31.8, 26.1, 13.8, 7.8, 8.3, 8.5, 8.5, 8.5, 8.8, 9.6, 10.6, 11, 11.4, 12.8, 14.5, 15.8, 17.4, 20.3, 23.6, 26.5, 28.8, 30.3, 29.9, 26.8, 21.6, 16.4, 12.9, 11.3, 10.6, 10.5, 10.5, 11.3, 15.4, 22.6, 28, 29.8, 29.5, 28, 26, 23.9, 21.8, 20.4, 19.8, 18.9, 17.6, 16.6, 16.5, 18, 20.3, 21.4, 21.4, 21.3, 21.5, 21.6, 21, 20.3, 20, 19.9, 19.9, 20.8, 22.1, 23.3, 24.4, 25.1, 24.9, 24, 23.3, 23, 23.3, 24.1, 24.5, 23.4, 21.9, 20.9, 20.8, 21, 20.6, 20.1, 19.6, 18.6, 17.9, 17.6, 17.1, 16.5, 16.3, 16.3, 16.5, 17.1, 17.9, 18.5, 18.9, 19.1, 19.1, 19.3, 19.6, 19.6] },
  { x: 399, y: 123, r: [35.4, 29.4, 24.9, 22.1, 25.8, 36, 40.5, 37.4, 33.3, 34, 40.6, 43.9, 41.3, 37.6, 35, 36.6, 42.4, 45, 43, 42, 44.3, 45.6, 44.1, 42.1, 40.4, 38.4, 36.5, 35.4, 38, 47.3, 53.5, 47.3, 38, 35.4, 36.5, 38.4, 40.4, 42.1, 44.1, 45.6, 44.3, 42, 43, 45, 42.4, 36.6, 35, 37.6, 41.3, 43.9, 40.6, 34, 33.3, 37.4, 40.5, 36, 25.8, 22.1, 24.9, 29.4, 35.4, 40.3, 40.3, 35.6, 30.3, 26.9, 31.8, 41.9, 44.5, 40.6, 36.4, 32.5, 32.9, 38.6, 42.5, 41.3, 38.1, 39, 44.8, 47.6, 46, 42.8, 39.1, 37.1, 37.5, 39.1, 40.8, 43, 46.3, 49.4, 50.8, 49.4, 46.3, 43, 40.8, 39.1, 37.5, 37.1, 39.1, 42.8, 46, 47.6, 44.8, 39, 38.1, 41.3, 42.5, 38.6, 32.9, 32.5, 36.4, 40.6, 44.5, 41.9, 31.8, 26.9, 30.3, 35.6, 40.3, 40.3] },
  { x: 62.5, y: 211.2, r: [21, 21, 21, 20.8, 20.4, 20.5, 20.6, 20.4, 20.4, 20.5, 20.8, 21, 20.5, 19.8, 19.3, 18.5, 17.9, 18.9, 21.5, 23.6, 24.5, 25, 25.8, 26.8, 27.5, 28.1, 29.1, 30.4, 31.4, 31.6, 30, 25.4, 20.1, 17.3, 18.9, 24.3, 27.4, 27.3, 26.6, 26, 25.6, 25.4, 25.1, 24.9, 24.6, 24.4, 24.1, 24, 24, 24, 24.1, 24.5, 25, 25.5, 25.8, 25.9, 26.5, 27.4, 28.1, 28.9, 29.8, 30.6, 31, 28.5, 24.1, 23.3, 25, 26.5, 27.9, 28.6, 28.1, 23.1, 14.8, 10.4, 9.8, 9.6, 10.1, 10.9, 11.4, 11.5, 11.9, 12.8, 13.4, 13.9, 14.6, 16, 17.9, 19.1, 20.8, 23.5, 26.8, 30.8, 34.9, 36.3, 31, 22.3, 20.6, 27, 32.1, 32.9, 31.5, 28.9, 25.5, 24.3, 26.9, 29.5, 30, 30.3, 30.3, 29.5, 28.3, 26.9, 26, 25.3, 24.3, 23.6, 23.1, 22.4, 21.8, 21.3] },
  { x: 28.1, y: 488.1, r: [22, 23.4, 24.9, 25.5, 22.5, 16.6, 13.9, 14.1, 14.8, 15.8, 16.8, 17.9, 18.9, 20, 21.6, 22.5, 19.4, 13.4, 10.8, 11.5, 12.6, 13.8, 14.5, 15.5, 17.3, 19.1, 20.9, 22.4, 21.6, 18.1, 15.5, 15, 15.1, 15.4, 15.5, 15.6, 15.9, 16.1, 16.8, 17.8, 18.6, 19.6, 21.3, 23.1, 24.5, 26, 27.1, 22.1, 12.5, 8.1, 8.6, 9.5, 10.6, 12.9, 16, 18.5, 20.9, 22.4, 21.5, 19, 16, 14, 13.3, 13, 13.6, 18.4, 26.1, 28.8, 25.6, 21.3, 17.6, 15.5, 14.3, 13.4, 13, 13.4, 14.5, 16.1, 17.6, 18.6, 18.9, 18.3, 16.8, 14.5, 12.4, 10.9, 9.6, 8.8, 8.5, 8.5, 11.3, 17, 20.3, 20.4, 19.6, 18.6, 18.1, 17.9, 18.3, 19.3, 20.4, 21.8, 23.3, 24.8, 26, 26.8, 24.1, 18.5, 15.9, 16.1, 16.3, 16.1, 16.4, 17.3, 17.9, 18.1, 18.4, 19, 20.1, 21.1] },
  { x: 324.3, y: 507.7, r: [25, 26.3, 27.6, 28.9, 30.4, 32.5, 35.1, 37.8, 35.5, 27.9, 24.1, 25, 26.4, 28.5, 30.8, 32, 27.8, 19.1, 15.1, 15.3, 15.4, 16, 17.1, 18, 18.6, 19.4, 20.4, 21.9, 23.4, 25, 27.3, 30.1, 33.9, 37.6, 34.6, 24.8, 20.1, 22.1, 25.3, 29.3, 30.5, 25.3, 19, 17, 17.3, 18.4, 20.1, 21.8, 23.9, 26.8, 30.1, 33.5, 29.8, 19.3, 14.3, 14.9, 16.1, 17.9, 19.9, 22.8, 27.3, 30.9, 29.4, 25, 27.8, 37.1, 39.4, 34.3, 29.8, 26.6, 23.6, 20.6, 18.6, 17.5, 16.5, 15.6, 14.9, 14.1, 18.4, 28, 33, 32, 29.9, 27.9, 25.9, 23.6, 21.9, 21.1, 21, 21, 21, 21.3, 22, 22.9, 23.8, 24.9, 26.3, 27.9, 29.6, 31.8, 34.4, 36.4, 33.4, 26.3, 23.1, 24.1, 25.5, 27, 28.4, 29.9, 31.6, 29.8, 24.1, 21.5, 22, 22.4, 22.6, 22.9, 23.3, 24] },
];

// The print is scaled to `fill` × the wall's width and centred at `y` (fraction of
// the wall's height); the bands left above and below get `extraStars` more stars.
export const LAYOUT = { fill: 1, y: 0.5, extraStars: 4 };
// How much the whole figure drifts (fraction of the wall's width) and tilts (radians).
export const MOTION = { drift: 0.05, tilt: 0.12 };

// ?still in the URL freezes all motion (for comparing against the original).
const STILL = typeof location !== 'undefined' && new URLSearchParams(location.search).has('still');

// ---- geometry (pure; also used by tools that fit the pose to the original) ----

// `wig(limb, i)` returns extra rotation for segment i; wiggle accumulates down the
// chain so hands and feet move most. Without it you get the rest pose.
function limbPoints(limb, origin, wig, key) {
  const pts = [[origin[0] + limb.at[0], origin[1] + limb.at[1]]];
  let acc = 0;
  limb.segs.forEach(([len, ang], i) => {
    acc += wig ? wig(key, i) : 0;
    const [x, y] = pts[pts.length - 1];
    pts.push([x + Math.cos(ang + acc) * len, y + Math.sin(ang + acc) * len]);
  });
  return pts;
}

export function skeleton(pose, wig) {
  const pelvis = [0, 0];
  const torso = limbPoints(pose.torso, pelvis, wig, 'torso');
  const chest = torso[2];
  return {
    torso, chest, neck: torso[3],
    armL: limbPoints(pose.armL, chest, wig, 'armL'),
    armR: limbPoints(pose.armR, chest, wig, 'armR'),
    legL: limbPoints(pose.legL, pelvis, wig, 'legL'),
    legR: limbPoints(pose.legR, pelvis, wig, 'legR'),
  };
}

// Catmull-Rom through the joints, offset by interpolated widths, with round caps.
export function limbOutline(pts, widths) {
  const SUB = 8, center = [], wid = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < SUB; k++) {
      const u = k / SUB, u2 = u * u, u3 = u2 * u;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      center.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
      // Ease between joint widths so muscles swell rather than taper linearly.
      const e = u * u * (3 - 2 * u);
      wid.push((widths[i] + (widths[i + 1] - widths[i]) * e) / 2);
    }
  }
  center.push(pts[pts.length - 1]);
  wid.push(widths[widths.length - 1] / 2);

  const left = [], right = [];
  for (let i = 0; i < center.length; i++) {
    const a = center[Math.max(0, i - 1)], b = center[Math.min(center.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    left.push([center[i][0] + nx * wid[i], center[i][1] + ny * wid[i]]);
    right.push([center[i][0] - nx * wid[i], center[i][1] - ny * wid[i]]);
  }
  const cap = (c, r, from, n = 7) => Array.from({ length: n }, (_, k) => {
    const a = from + (Math.PI * (k + 1)) / (n + 1);
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
  });
  const last = center.length - 1;
  const tipDir = Math.atan2(center[last][1] - center[last - 1][1], center[last][0] - center[last - 1][0]);
  const rootDir = Math.atan2(center[1][1] - center[0][1], center[1][0] - center[0][0]);
  return [
    ...left,
    // Caps run from one side to the other around the end, hence reversed.
    ...cap(center[last], wid[last], tipDir - Math.PI / 2).reverse(),
    ...right.reverse(),
    ...cap(center[0], wid[0], rootDir + Math.PI / 2).reverse(),
  ];
}

export function ellipsePts(cx, cy, rx, ry, rot, n = 24) {
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
  });
}

// All figure shapes in figure units: black polygons (limbs + head) and the heart.
export function figureShapes(pose = POSE, head = HEAD, heart = HEART, wig = null, beat = 1) {
  const sk = skeleton(pose, wig);
  const body = ['legL', 'legR', 'armL', 'armR', 'torso'].map((k) => limbOutline(sk[k], pose[k].widths));
  const [nx, ny] = sk.neck;
  const tilt = Math.atan2(sk.neck[1] - sk.chest[1], sk.neck[0] - sk.chest[0]) + Math.PI / 2 + head.tilt;
  body.push(ellipsePts(nx + Math.sin(tilt) * head.lift, ny - Math.cos(tilt) * head.lift, head.rx, head.ry, tilt));
  const [hx, hy] = sk.chest;
  const heartPoly = ellipsePts(hx + heart.at[0], hy + heart.at[1], heart.r * beat, heart.r * 1.15 * beat, 0.3, 16);
  return { body, heart: heartPoly, skeleton: sk };
}

export default {
  name: 'icarus',
  create(p, g, { W, H }) {
    const BLUE = [36, 78, 168], YELLOW = 'rgb(250,214,32)', BLACK = 'rgb(16,16,22)', RED = 'rgb(222,44,30)';
    // Print → wall: scale ps, offset (ox, oy). The figure's own scale and position follow.
    const ps = (W * LAYOUT.fill) / FRAME.w;
    const ox = (W - FRAME.w * ps) / 2, oy = H * LAYOUT.y - (FRAME.h * ps) / 2;
    const S = FRAME.s * ps;                    // px per figure unit
    const home = { x: ox + FRAME.x * ps, y: oy + FRAME.y * ps };
    const seed = Math.random() * 1000;

    // Gouache background: blue with soft mottling, baked once at low resolution.
    const bg = p.createGraphics(Math.ceil(W / 4), Math.ceil(H / 4));
    bg.pixelDensity(1);
    bg.loadPixels();
    for (let y = 0; y < bg.height; y++) {
      for (let x = 0; x < bg.width; x++) {
        const n = p.noise(x * 0.05 + seed, y * 0.05) * 0.7 + p.noise(x * 0.3, y * 0.3 + seed) * 0.3;
        const k = (n - 0.5) * 22;
        const i = 4 * (y * bg.width + x);
        bg.pixels[i] = BLUE[0] + k * 0.6;
        bg.pixels[i + 1] = BLUE[1] + k * 0.8;
        bg.pixels[i + 2] = BLUE[2] + k;
        bg.pixels[i + 3] = 255;
      }
    }
    bg.updatePixels();

    // Cut-paper edge: a fixed irregularity plus a slow stop-motion "boil".
    function fillShape(ctx, pts, id, boilT, amp) {
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const jx = (p.noise(id, i * 0.35, boilT) - 0.5) * amp;
        const jy = (p.noise(id + 50, i * 0.35, boilT) - 0.5) * amp;
        i ? ctx.lineTo(x + jx, y + jy) : ctx.moveTo(x + jx, y + jy);
      });
      ctx.closePath();
      ctx.fill();
    }

    // ---- stars ----
    // Wiggle: slow noise plus a gentle swing, scaled per limb. ?still freezes all motion.
    const PHASE = { torso: 0, armL: 11, armR: 23, legL: 37, legR: 51 };
    let wigT = 0;
    const wig = STILL ? null : (key, i) => {
      const w = POSE[key].wiggle, ph = PHASE[key];
      return w * (p.noise(seed + ph + i * 3.1, wigT * 0.18) - 0.5) * 2 + w * 0.35 * Math.sin(wigT * 0.9 + ph + i);
    };
    // The print's stars where Matisse put them, plus extra copies of his shapes in the
    // bands the 1:2 wall adds above and below the print.
    const stars = STARS.map((st, i) => ({
      x: ox + st.x * ps, y: oy + st.y * ps, k: ps, rot: 0, r: st.r, phase: i * 17.3,
    }));
    const sizeOf = (st) => Math.max(...st.r);
    const bands = [[0, oy], [oy + FRAME.h * ps, H]].filter(([a, b]) => b - a > 40);
    for (let tries = 0, added = 0; bands.length && added < LAYOUT.extraStars && tries < 500; tries++) {
      const src = STARS[Math.floor(Math.random() * STARS.length)];
      if (src.x >= FRAME.w - 2) continue;      // not the half star on the edge
      const [a, b] = bands[added % bands.length];
      const k = ps * (0.75 + Math.random() * 0.35), r = sizeOf(src) * k;
      if (b - a < 2 * r) continue;             // keep extra stars whole
      const x = r + Math.random() * (W - 2 * r), y = a + r + Math.random() * (b - a - 2 * r);
      if (stars.some((q) => Math.hypot(q.x - x, q.y - y) < (sizeOf(q) * q.k + r) * 1.2)) continue;
      stars.push({ x, y, k, rot: Math.random() * TAU, r: src.r, phase: Math.random() * 100 });
      added++;
    }

    // Stars sway a little around their place and their points breathe.
    function starPts(s, t) {
      const move = STILL ? 0 : 1;
      const cx = s.x + move * (p.noise(s.phase, t * 0.05) - 0.5) * 12;
      const cy = s.y + move * (p.noise(s.phase + 9, t * 0.05) - 0.5) * 12;
      const rot = s.rot + move * 0.08 * Math.sin(t * 0.13 + s.phase);
      // Only the spikes breathe: how far a radius pokes out above the star's body.
      s.body ??= [...s.r].sort((a, b) => a - b)[s.r.length >> 1];
      s.top ??= Math.max(...s.r);
      const n = s.r.length;
      return s.r.map((r, i) => {
        const spike = Math.max(0, (r - s.body) / (s.top - s.body || 1));
        const breathe = 1 + move * 0.12 * spike * Math.sin(t * 0.7 + s.phase + Math.floor(i / 8) * 1.7);
        const a = rot + (i / n) * TAU;
        return [cx + Math.cos(a) * r * s.k * breathe, cy + Math.sin(a) * r * s.k * breathe];
      });
    }

    return {
      draw(t) {
        const ctx = g.drawingContext;
        g.image(bg, 0, 0, W, H);
        const boilT = Math.floor(t * 4) * 0.37;   // edges re-cut 4× a second

        ctx.fillStyle = YELLOW;
        stars.forEach((s, i) => fillShape(ctx, starPts(s, t), 200 + i * 7, boilT, STILL ? 0 : 2));

        // The figure floats, sways and slowly tumbles; its heart pulses gently.
        wigT = t;
        const beat = STILL ? 1 : 1 + 0.1 * Math.max(0, Math.sin(t * 2.4)) ** 8;
        const fig = figureShapes(POSE, HEAD, HEART, wig, beat);
        ctx.save();
        ctx.translate(home.x, home.y);
        ctx.rotate(FRAME.rot);
        if (STILL) { /* the print's pose, unmoved */ }
        else {
          ctx.translate(
            (p.noise(seed + 70, t * 0.04) - 0.5) * W * MOTION.drift,
            (Math.sin(t * 0.25) * 0.4 + (p.noise(seed + 80, t * 0.04) - 0.5)) * H * MOTION.drift * 0.5,
          );
          ctx.rotate((Math.sin(t * 0.17) * 0.5 + (p.noise(seed + 90, t * 0.05) - 0.5)) * MOTION.tilt);
        }
        ctx.scale(S, S);
        const amp = STILL ? 0 : 2.2 / S;
        ctx.fillStyle = BLACK;
        fig.body.forEach((poly, i) => fillShape(ctx, poly, 10 + i * 13, boilT, amp));
        ctx.fillStyle = RED;
        fillShape(ctx, fig.heart, 120, boilT, amp * 0.6);
        ctx.restore();
      },
      dispose() { bg.remove(); },
    };
  },
};
