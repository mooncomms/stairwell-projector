// The Wall: light for the Pink Floyd tapestry (walls/floyd). Everything here is light on
// the printed artwork, placed in cm on the tapestry (145 × 90). Each effect can be switched
// on and off from the remote; "Tear down the wall" is a one-shot finale.
//
//   light        a soft warm wash, so the tapestry is seen at all in a dark room
//   sky          light drifting along the sky's brush streaks; the light's colour follows a
//                slow day: dawn, day, dusk, night (with stars)
//   flags        ripples running down the big flag; gusts of wind through the pennants
//   march        the crowd marches: light steps along it on the beat, heads light in turn
//   hammers      the hammers emblem pulses red on the beat
//   title        "Pink Floyd The Wall" writes itself in neon now and then
//   searchlights beams sweeping the sky from behind the wall
//   concert      coloured washes on the beat (party)
//   teardown     cracks spread, the wall shakes and falls, darkness, then light returns
//
// The beat is the party scene's tempo (tap it on the remote).

const CM = { w: 145, h: 90 };
// The crowd/wall's top edge, left to right (cm). Everything below it is the marching crowd.
const RIDGE = [[0, 64], [10, 61], [20, 56.5], [30, 51.5], [38, 47], [44, 43], [50, 44], [56, 48], [62, 52], [70, 55.5], [80, 62.5], [90, 67.5], [100, 72.5], [110, 76.5], [120, 79.5], [130, 82.5], [145, 86]];
// The row of white heads along the left ridge.
const HEADS = { from: [2, 65.5], to: [41, 46.5], n: 16 };
// The big flag's centreline from the pole to the tip of its tail (cm), and its half-width.
const FLAG = [[67.5, 6], [72, 13], [76, 21], [79, 28], [82, 35], [86, 42], [90, 48.5], [94, 54], [99, 59], [103, 63]];
const FLAG_W = [5.5, 6, 6, 5, 3.5, 2.6, 2, 1.6, 1.2, 0.8];
const FLAG2 = [[91, 42], [94.5, 47], [97.5, 53], [100.5, 59], [104, 65]];
// The hammers emblem: a tilted oval (white and red halves) on the big flag.
const EMBLEM = { x: 76.6, y: 23.3, rx: 4.3, ry: 7.4, rot: -15.4 };
// Pennants: the top of each pole.
const PENNANTS = [[73, 54], [86, 56], [91, 41], [97, 65], [101.5, 62], [109, 60], [121, 72], [124.5, 75.5], [139, 81]];
// Title strokes live in these boxes (cm); the strokes themselves come from the reference.
const TITLE = [{ x: 13, y: 8, w: 48, h: 24 }, { x: 82, y: 6, w: 61, h: 45 }];
// Searchlights: rising from behind the wall.
const LIGHTS = [{ x: 28, y: 53, a: 0 }, { x: 78, y: 62, a: 2.2 }, { x: 118, y: 80, a: 4.1 }];
const DAY = 8 * 60;   // seconds for a whole day in the sky

// Shared with the other scenes for this tapestry.
export const ART = { CM, RIDGE, FLAG, FLAG_W, FLAG2, EMBLEM, PENNANTS, TITLE, LIGHTS };
// The wall's ridge height (cm) at x (cm).
export function ridgeAt(x) {
  for (let i = 1; i < RIDGE.length; i++) if (x <= RIDGE[i][0]) { const [x0, y0] = RIDGE[i - 1], [x1, y1] = RIDGE[i]; return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0); }
  return RIDGE[RIDGE.length - 1][1];
}

export default {
  name: 'floyd',
  tempo: true,
  effects: {
    light: { label: 'Room light', on: true },
    sky: { label: 'Living sky (day and night)', on: true },
    flags: { label: 'Flags in the wind', on: true },
    march: { label: 'The march (on the beat)', on: true },
    hammers: { label: 'Hammers pulse (on the beat)', on: true },
    title: { label: 'Neon title', on: true },
    searchlights: { label: 'Searchlights', on: false },
    concert: { label: 'Concert colours (on the beat)', on: false },
    guides: { label: 'Alignment guides', on: false },
    writeTitle: { label: 'Write the title now', action: true },
    teardown: { label: 'Tear down the wall', action: true },
  },
  create(p, g, ctx) {
    const { W, H, flags } = ctx;
    const k = W / CM.w, kyy = H / CM.h;
    const X = (x) => x * k, Y = (y) => y * kyy;
    let c = g.drawingContext;           // (swapped briefly to draw into a work canvas)
    const fx = (key) => ctx.fx('floyd', key);
    const canvas = (w = W, h = H) => { const e = document.createElement('canvas'); e.width = w; e.height = h; return e; };
    // Pixel reads only where the title mask is built; everything else stays on the GPU
    // (CPU-backed canvases composited every frame ran at ~6 fps on the box).
    const ctx2 = (e, read = false) => e.getContext('2d', read ? { willReadFrequently: true } : undefined);

    // ---- masks, built once ----
    const ridgePath = (cc, below) => {
      cc.beginPath(); cc.moveTo(0, below ? H : 0);
      for (const [x, y] of RIDGE) cc.lineTo(X(x), Y(y));
      cc.lineTo(W, below ? H : 0); cc.closePath();
    };
    const sky = canvas(), crowd = canvas();
    { const s = ctx2(sky); s.fillStyle = '#fff'; s.filter = 'blur(4px)'; ridgePath(s, false); s.fill(); }
    { const s = ctx2(crowd); s.fillStyle = '#fff'; s.filter = 'blur(3px)'; ridgePath(s, true); s.fill(); }
    // Title strokes: thin bright lines in the title boxes (bright minus its local opening).
    // Masks found in the reference image (the print, straightened), so the light follows
    // the artwork itself:
    //   title    the title's thin white strokes
    //   strokes  the marching hammers' white handles and heads, below the ridge
    //   flagM    the big flags' dark cloth, around their centrelines
    const title = canvas(), titleGlow = canvas(), strokes = canvas(), flagM = canvas();
    const marchers = [canvas(), canvas(), canvas(), canvas()];   // the hammers, in 4 groups left to right
    p.loadImage('/media/reference.jpg', (img) => {
      const t = canvas(); const tc = ctx2(t, true); tc.drawImage(img.canvas || img.elt, 0, 0, W, H);
      const px = tc.getImageData(0, 0, W, H).data, L = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) L[i] = 0.3 * px[4 * i] + 0.59 * px[4 * i + 1] + 0.11 * px[4 * i + 2];   // luminance: white strokes stand out from the pink sky
      // Grey-level opening (min then max over a (2R+1)² square): bright - opening = what's
      // bright and thinner than the square.
      const filt = (src, op, R) => {
        const a = new Float32Array(W * H), b = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = src[y * W + x]; for (let d = -R; d <= R; d++) { const xx = Math.min(W - 1, Math.max(0, x + d)); m = op(m, src[y * W + xx]); } a[y * W + x] = m; }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = a[y * W + x]; for (let d = -R; d <= R; d++) { const yy = Math.min(H - 1, Math.max(0, y + d)); m = op(m, a[yy * W + x]); } b[y * W + x] = m; }
        return b;
      };
      const thin = (R) => { const o = filt(filt(L, Math.min, R), Math.max, R); return (i) => L[i] - o[i]; };
      const paint = (cv, val) => {
        const out = ctx2(cv), od = out.createImageData(W, H);
        for (let i = 0; i < W * H; i++) { od.data[4 * i] = od.data[4 * i + 1] = od.data[4 * i + 2] = 255; od.data[4 * i + 3] = Math.max(0, Math.min(1, val(i % W, (i / W) | 0, i))) * 255; }
        out.putImageData(od, 0, 0);
      };
      const inBox = (x, y, bs) => bs.some((b) => x >= X(b.x) && x < X(b.x + b.w) && y >= Y(b.y) && y < Y(b.y + b.h));
      const t3 = thin(Math.round(1.4 * k / 2)), t8 = thin(Math.round(3.5 * k / 2));
      // Title: thin bright strokes in the title boxes, minus flat horizontal bits (the
      // sky's brush streaks; letters are taller, and their crossbars join their uprights).
      const tv = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) tv[i] = inBox(i % W, (i / W) | 0, TITLE) ? Math.max(0, Math.min(1, (t3(i) - 22) / 20)) : 0;
      const lab = new Int32Array(W * H).fill(-1), stack = [];
      for (let i0 = 0; i0 < W * H; i0++) {
        if (tv[i0] < 0.3 || lab[i0] >= 0) continue;
        const comp = []; let y0 = H, y1 = 0; stack.push(i0); lab[i0] = i0;
        while (stack.length) {
          const i = stack.pop(); comp.push(i); const y = (i / W) | 0, x = i % W; y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          for (const j of [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1]) if (j >= 0 && j < W * H && lab[j] < 0 && tv[j] >= 0.3 && Math.abs((j % W) - x) <= 1) { lab[j] = i0; stack.push(j); }
        }
        if (y1 - y0 < 1.3 * kyy) for (const i of comp) tv[i] = 0;
      }
      for (let i = 0; i < W * H; i++) if (lab[i] < 0) tv[i] = 0;        // faint bits not on a kept stroke
      paint(title, (x, y, i) => tv[i]);
      // Below the ridge (a little inside, away from the sky's own streaks).
      const ridgeY = (x) => { const cx = x / k; for (let j = 1; j < RIDGE.length; j++) if (cx <= RIDGE[j][0]) { const [x0, y0] = RIDGE[j - 1], [x1, y1] = RIDGE[j]; return Y(y0 + ((cx - x0) / (x1 - x0)) * (y1 - y0)); } return H; };
      // Hammers: thin bright strokes below the ridge, as separate pieces (one hammer's
      // handle or head each). Dropped: blocky pieces (not drawn lines: light that was on the
      // print when the reference was photographed) and anything at the tapestry's edges.
      const sv = new Float32Array(W * H), edge = 1.5;
      for (let i = 0; i < W * H; i++) {
        const x = i % W, y = (i / W) | 0;
        const inside = x > edge * k && x < W - edge * k && y > edge * kyy && y < H - edge * kyy;
        sv[i] = inside && y > ridgeY(x) - 2 * kyy ? Math.max(0, Math.min(1, (t8(i) - 18) / 18)) : 0;
      }
      // Blocks: where a 3 cm square around a pixel is mostly lit (strokes are thin, heads
      // small; the light blocks fill it).
      {
        const on = new Float64Array((W + 1) * (H + 1));
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) on[(y + 1) * (W + 1) + x + 1] = (sv[y * W + x] >= 0.3 ? 1 : 0) + on[y * (W + 1) + x + 1] + on[(y + 1) * (W + 1) + x] - on[y * (W + 1) + x];
        const r = Math.round(1.5 * k), dense = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const xa = Math.max(0, x - r), xb = Math.min(W, x + r + 1), ya = Math.max(0, y - r), yb = Math.min(H, y + r + 1);
          const n = on[yb * (W + 1) + xb] - on[ya * (W + 1) + xb] - on[yb * (W + 1) + xa] + on[ya * (W + 1) + xa];
          if (n / ((xb - xa) * (yb - ya)) > 0.9) dense[y * W + x] = 1;
        }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dense[y * W + x])   // clear the block and its rim
          for (let yy = Math.max(0, y - r); yy < Math.min(H, y + r + 1); yy++) for (let xx = Math.max(0, x - r); xx < Math.min(W, x + r + 1); xx++) sv[yy * W + xx] = 0;
      }
      const owner = new Int32Array(W * H).fill(-1), group = new Int8Array(W * H).fill(-1), st = [];
      for (let i0 = 0; i0 < W * H; i0++) {
        if (sv[i0] < 0.3 || owner[i0] >= 0) continue;
        const comp = []; let x0 = W, x1 = 0, y0 = H, y1 = 0, sx = 0; st.push(i0); owner[i0] = i0;
        while (st.length) {
          const i = st.pop(); comp.push(i); const x = i % W, y = (i / W) | 0;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); sx += x;
          for (const j of [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1]) if (j >= 0 && j < W * H && owner[j] < 0 && sv[j] >= 0.3 && Math.abs((j % W) - x) <= 1) { owner[j] = i0; st.push(j); }
        }
        const bw = (x1 - x0 + 1) / k, bh = (y1 - y0 + 1) / kyy, fill = comp.length / ((x1 - x0 + 1) * (y1 - y0 + 1));
        const blocky = bw > 2.5 && bh > 2.5 && fill > 0.5, speck = comp.length < 6;
        const gIdx = Math.floor(sx / comp.length / k / 4) % 4;               // 4 cm columns, cycling
        for (const i of comp) group[i] = blocky || speck ? -1 : gIdx;
      }
      // Faint bits around a kept stroke belong to it (soft edges).
      const g0 = group.slice();
      for (let i = 0; i < W * H; i++) if (g0[i] < 0 && sv[i] > 0) { const n = [i - 1, i + 1, i - W, i + W].find((j) => j >= 0 && j < W * H && g0[j] >= 0 && sv[j] >= 0.3); if (n !== undefined) group[i] = g0[n]; }
      paint(strokes, (x, y, i) => (group[i] >= 0 ? sv[i] : 0));
      marchers.forEach((cv, gi) => paint(cv, (x, y, i) => (group[i] === gi ? sv[i] : 0)));
      // Flags: darker than the sky, within reach of the centrelines.
      const near = (x, y) => [[FLAG, FLAG_W], [FLAG2, FLAG2.map(() => 2.5)]].some(([path, ws]) => path.some(([fx, fy], j) => Math.hypot(x / k - fx, y / kyy - fy) < ws[j] + 2.5));
      paint(flagM, (x, y, i) => (near(x, y) ? (200 - L[i]) / 25 : 0));
      const gl = ctx2(titleGlow); gl.filter = 'blur(5px)'; gl.drawImage(title, 0, 0); gl.drawImage(title, 0, 0);
    });

    // A soft white dot, drawn scaled for every small glow (cheaper than a gradient each).
    const dot = canvas(64, 64);
    { const d = ctx2(dot), gr = d.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,248,238,1)'); gr.addColorStop(1, 'rgba(255,248,238,0)'); d.fillStyle = gr; d.fillRect(0, 0, 64, 64); }
    const glow = (x, y, r, a) => { if (a < 0.01) return; c.globalAlpha = Math.min(1, a); c.drawImage(dot, x - r, y - r, 2 * r, 2 * r); c.globalAlpha = 1; };

    // Work canvases.
    const fxc = canvas(), fxx = ctx2(fxc);
    const snap = canvas(), snapx = ctx2(snap);
    const NW = 96, NH = 60, noiseC = canvas(NW, NH), noiseX = ctx2(noiseC), noiseD = noiseX.createImageData(NW, NH);
    const stars = Array.from({ length: 90 }, () => ({ x: Math.random() * CM.w, y: Math.random() * 60, r: 0.6 + Math.random() * 1.2, ph: Math.random() * 6 }))
      .filter((s) => { let ry = 99; for (let i = 1; i < RIDGE.length; i++) if (s.x <= RIDGE[i][0]) { const [x0, y0] = RIDGE[i - 1], [x1, y1] = RIDGE[i]; ry = y0 + ((s.x - x0) / (x1 - x0)) * (y1 - y0); break; } return s.y < ry - 4; });

    // Draw an effect into fxc, keep it inside a mask, add it to the frame.
    function masked(mask, draw, alpha = 1, op = 'lighter') {
      fxx.globalCompositeOperation = 'source-over'; fxx.globalAlpha = 1; fxx.filter = 'none';
      fxx.clearRect(0, 0, W, H); draw(fxx);
      if (mask) { fxx.globalCompositeOperation = 'destination-in'; fxx.globalAlpha = 1; fxx.drawImage(mask, 0, 0); }
      c.globalCompositeOperation = op; c.globalAlpha = alpha; c.drawImage(fxc, 0, 0);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    }
    const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    // The day: light colour and level through dawn, day, dusk, night.
    const KEYS = [[0, [255, 160, 140], 0.75], [0.12, [255, 238, 225], 1], [0.45, [255, 238, 225], 1], [0.58, [255, 140, 80], 0.85], [0.68, [120, 90, 170], 0.5], [0.75, [60, 75, 150], 0.32], [0.95, [60, 75, 150], 0.32], [1, [255, 160, 140], 0.75]];
    function dayAt(f) {
      for (let i = 1; i < KEYS.length; i++) if (f <= KEYS[i][0]) {
        const [a, ca, la] = KEYS[i - 1], [b, cb, lb] = KEYS[i], t = (f - a) / (b - a), e = t * t * (3 - 2 * t);
        return { col: mixc(ca, cb, e), lvl: la + (lb - la) * e, night: Math.max(0, Math.min(1, (f - 0.66) / 0.06)) * Math.max(0, Math.min(1, (0.99 - f) / 0.04)) };
      }
      return { col: KEYS[0][1], lvl: 1, night: 0 };
    }
    const rgba = (col, a) => `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${a})`;

    // ---- tear down (one-shot) ----
    let tear = null;   // { t, cracks, cells }
    let titleAt = null; // when "write the title now" was pressed
    function startTear() {
      const cracks = [];
      const walk = (x, y, ang, len, w, depth) => {
        const pts = [[x, y]];
        for (let d = 0; d < len; d += 1.2) {
          ang += (Math.random() - 0.5) * 0.6; x += Math.cos(ang) * 1.2; y += Math.sin(ang) * 1.2; pts.push([x, y]);
          if (depth < 2 && Math.random() < 0.06) walk(x, y, ang + (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.5), len * 0.5, w * 0.6, depth + 1);
        }
        cracks.push({ pts, w, depth });
      };
      for (let i = 0; i < 9; i++) walk(55 + (Math.random() - 0.5) * 6, 62 + (Math.random() - 0.5) * 6, Math.random() * Math.PI * 2, 20 + Math.random() * 35, 0.9, 0);
      // Pieces: a jittered grid over the crowd, each falls on its own.
      const cells = [];
      for (let gy = 40; gy < CM.h; gy += 10) for (let gx = 0; gx < CM.w; gx += 12) {
        const j = () => (Math.random() - 0.5) * 4;
        cells.push({ pts: [[gx + j(), gy + j()], [gx + 12 + j(), gy + j()], [gx + 12 + j(), gy + 10 + j()], [gx + j(), gy + 10 + j()]],
          delay: Math.abs(gx + 6 - 55) / 40 + (CM.h - gy) / 60 + Math.random() * 0.8, spin: (Math.random() - 0.5) * 2, vx: (gx + 6 - 55) * 0.4 + (Math.random() - 0.5) * 6 });
      }
      tear = { t: 0, cracks, cells, snapped: false };
    }

    return {
      draw(t, dt) {
        for (const a of flags.actions.splice(0)) {
          if (a.scene !== 'floyd') continue;
          if (a.key === 'teardown' && !tear) startTear();
          if (a.key === 'writeTitle') titleAt = t;
        }
        const beat = (performance.now() / 1000 - flags.party.t0) * (flags.party.bpm / 60);
        const pulse = Math.exp(-(beat % 1) * 4);
        const day = fx('sky') ? dayAt((t / DAY + 0.15) % 1) : { col: [255, 238, 225], lvl: 1, night: 0 };
        c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
        c.fillStyle = '#000'; c.fillRect(0, 0, W, H);

        // Room light: a soft warm wash, a little brighter in the middle.
        if (fx('light')) {
          const gr = c.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.75);
          const lv = 0.42 * (0.55 + 0.45 * day.lvl);
          gr.addColorStop(0, rgba([255, 236, 214], lv)); gr.addColorStop(1, rgba([255, 230, 205], lv * 0.7));
          c.fillStyle = gr; c.fillRect(0, 0, W, H);
        }

        // Living sky: streaks of light drifting along the brushwork, in the day's colour.
        if (fx('sky')) {
          const d = noiseD.data;
          for (let y = 0; y < NH; y++) for (let x = 0; x < NW; x++) {
            const n = p.noise(x * 0.06 - t * 0.012, y * 0.45, t * 0.015);
            const v = Math.max(0, Math.min(1, (n - 0.42) * 2.6));
            const i = 4 * (y * NW + x); d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = v * 255;
          }
          noiseX.putImageData(noiseD, 0, 0);
          masked(sky, (f) => {
            f.imageSmoothingQuality = 'high'; f.drawImage(noiseC, 0, 0, W, H);
            f.globalCompositeOperation = 'source-in'; f.fillStyle = rgba(day.col, 1); f.fillRect(0, 0, W, H);
          }, 0.45 * day.lvl);
          if (day.night > 0) {                       // stars come out at night
            c.globalCompositeOperation = 'lighter';
            for (const s of stars) {
              const tw = 0.55 + 0.45 * Math.sin(t * 1.7 + s.ph * 3);
              c.fillStyle = `rgba(230,235,255,${0.8 * day.night * tw})`;
              c.beginPath(); c.arc(X(s.x), Y(s.y), s.r, 0, 7); c.fill();
            }
            c.globalCompositeOperation = 'source-over';
          }
        }

        // Searchlights from behind the wall.
        if (fx('searchlights') || fx('concert')) {
          const conc = fx('concert');
          masked(sky, (f) => {
            LIGHTS.forEach((L, i) => {
              const sway = Math.sin(t * (conc ? 0.5 : 0.18) + L.a) * 0.75, ang = -Math.PI / 2 + sway;
              const x0 = X(L.x), y0 = Y(L.y), len = H * 1.4, sp = 0.07;
              const col = conc ? [[255, 60, 160], [60, 200, 255], [255, 200, 60]][(i + Math.floor(beat / 4)) % 3] : [220, 230, 255];
              const gr = f.createRadialGradient(x0, y0, 0, x0, y0, len);
              gr.addColorStop(0, rgba(col, 0.7)); gr.addColorStop(0.6, rgba(col, 0.2)); gr.addColorStop(1, rgba(col, 0));
              f.fillStyle = gr; f.beginPath(); f.moveTo(x0, y0);
              f.lineTo(x0 + Math.cos(ang - sp) * len, y0 + Math.sin(ang - sp) * len);
              f.lineTo(x0 + Math.cos(ang + sp) * len, y0 + Math.sin(ang + sp) * len); f.closePath(); f.fill();
            });
          }, 0.8);
        }

        // Flags: ripples running from the pole to the tail of the big flag (and the second
        // one), and gusts of wind sweeping through the pennants.
        if (fx('flags')) {
          c.globalCompositeOperation = 'lighter';
          const ripple = (path, widths, speed, phase) => {
            for (let i = 0; i < path.length - 1; i++) for (let s = 0; s < 4; s++) {
              const u = (i + s / 4) / (path.length - 1);
              const [x0, y0] = path[i], [x1, y1] = path[i + 1], x = x0 + (x1 - x0) * s / 4, y = y0 + (y1 - y0) * s / 4;
              const w = (widths ? widths[i] + (widths[i + 1] - widths[i]) * s / 4 : 1.5) * k;
              const v = Math.max(0, Math.sin(u * 14 - t * speed + phase)) ** 2;
              glow(X(x), Y(y), w * 1.5, 0.75 * v * Math.min(1, u * 4 + 0.2));
            }
          };
          c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
          masked(flagM, (f) => {                           // ripples, kept on the cloth
            const prev = c; c = f; f.globalCompositeOperation = 'lighter';
            ripple(FLAG, FLAG_W, 3.2, 0); ripple(FLAG2, null, 3.8, 1.3);
            c = prev;
          }, 1);
          c.globalCompositeOperation = 'lighter';
          const gust = ((t % 11) / 3.5) * CM.w * 1.2 - 10;                     // a gust every 11 s
          for (const [px, py] of PENNANTS) {
            const near = Math.exp(-(((px - gust) / 9) ** 2));
            const fl = 0.5 + 0.5 * Math.sin(t * 9 + px);
            glow(X(px + 3.5), Y(py + 3), 6 * k, near * (0.25 + 0.25 * fl));
          }
          c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
        }

        // The march: the printed hammers light up group by group, a step to the right on
        // every beat, with a faint glow on the rest.
        if (fx('march')) {
          const step = Math.floor(beat), within = beat - step;
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = 0.2; c.drawImage(strokes, 0, 0);
          c.globalAlpha = 0.35 + 0.65 * Math.exp(-within * 2.5); c.drawImage(marchers[((step % 4) + 4) % 4], 0, 0);
          c.globalAlpha = 0.25 * Math.exp(-within * 2.5); c.drawImage(marchers[(((step - 1) % 4) + 4) % 4], 0, 0);   // the last step fading
          c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        }

        // The hammers emblem: its oval flushes red on each beat, with a little halo.
        if (fx('hammers')) {
          c.save(); c.translate(X(EMBLEM.x), Y(EMBLEM.y)); c.rotate((EMBLEM.rot * Math.PI) / 180);
          c.globalCompositeOperation = 'lighter';
          c.scale(EMBLEM.rx * k, EMBLEM.ry * kyy);
          const gr = c.createRadialGradient(0, 0, 0.9, 0, 0, 1.5);
          gr.addColorStop(0, `rgba(255,30,20,${0.2 * pulse})`); gr.addColorStop(1, 'rgba(255,30,20,0)');
          c.fillStyle = gr; c.beginPath(); c.arc(0, 0, 1.5, 0, 7); c.fill();
          c.fillStyle = `rgba(255,40,25,${0.3 + 0.7 * pulse})`; c.beginPath(); c.arc(0, 0, 1, 0, 7); c.fill();
          c.restore();
        }

        // Concert colours: a coloured wash slides across with every bar.
        if (fx('concert')) {
          const bar = Math.floor(beat / 4), f = (beat % 4) / 4;
          const cols = [[255, 40, 140], [40, 160, 255], [255, 150, 30], [150, 60, 255]];
          const col = cols[bar % cols.length];
          const x = (-0.3 + f * 1.6) * W, gr = c.createLinearGradient(x - W * 0.4, 0, x + W * 0.4, 0);
          gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.5, rgba(col, 0.28 + 0.12 * pulse)); gr.addColorStop(1, rgba(col, 0));
          c.globalCompositeOperation = 'lighter'; c.fillStyle = gr; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over';
        }

        // Alignment guides: thin outlines of everything placed by hand, to check them
        // against the print.
        if (fx('guides')) {
          // Only what was found in the print (title and hammer strokes, flag cloth), drawn
          // bright: on a good calibration it sits exactly on the printed lines.
          c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
          c.globalAlpha = 1; c.drawImage(title, 0, 0); c.drawImage(strokes, 0, 0); c.globalAlpha = 0.3; c.drawImage(flagM, 0, 0); c.globalAlpha = 1;
        }

        // Neon title: every 75 s, a pen of light writes it left to right, it glows a while,
        // then fades.
        if (fx('title')) {
          const cyc = titleAt != null && t - titleAt < 40 ? t - titleAt : t % 75, sweep = Math.min(1, cyc / 7);
          const hold = cyc < 7 ? 1 : cyc < 32 ? 1 : Math.max(0, 1 - (cyc - 32) / 5);
          if (hold > 0) {
            const flick = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3);
            const x0 = X(TITLE[0].x), x1 = X(TITLE[1].x + TITLE[1].w), front = x0 + (x1 - x0) * sweep;
            masked(null, (f) => {
              f.drawImage(titleGlow, 0, 0); f.drawImage(title, 0, 0);
              f.globalCompositeOperation = 'source-in'; f.fillStyle = 'rgb(255,120,210)'; f.fillRect(0, 0, W, H);
              f.globalCompositeOperation = 'lighter'; f.globalAlpha = 0.5; f.drawImage(title, 0, 0); f.drawImage(title, 0, 0); f.globalAlpha = 1;
              // Only what the pen has written: one fill over the whole canvas (each masking
              // fill also clears everything outside its own shape).
              f.globalCompositeOperation = 'destination-in';
              const gr = f.createLinearGradient(0, 0, W, 0), at = (x) => Math.max(0, Math.min(1, x / W));
              gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(at(front - 30), 'rgba(0,0,0,1)'); gr.addColorStop(at(front + 4), 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
              f.fillStyle = gr; f.fillRect(0, 0, W, H);
            }, hold * flick);
            if (sweep < 1) {                                          // the pen's spark
              c.globalCompositeOperation = 'lighter';
              const gr = c.createRadialGradient(front, Y(18), 0, front, Y(18), 60);
              gr.addColorStop(0, 'rgba(255,200,240,0.35)'); gr.addColorStop(1, 'rgba(255,200,240,0)');
              c.fillStyle = gr; c.fillRect(front - 60, Y(18) - 60, 120, 120); c.globalCompositeOperation = 'source-over';
            }
          }
        }

        // Tear down the wall.
        if (tear) {
          tear.t += dt; const T = tear.t;
          const poly = (cc, pts, ox = 0, oy = 0) => { cc.beginPath(); pts.forEach(([x, y], i) => (i ? cc.lineTo(X(x) + ox, Y(y) + oy) : cc.moveTo(X(x) + ox, Y(y) + oy))); cc.closePath(); };
          // 1. Cracks spread (0–7 s).
          const grow = Math.min(1, T / 7);
          const drawCracks = (cc) => {
            cc.lineCap = 'round'; cc.lineJoin = 'round';
            for (const cr of tear.cracks) {
              const n = Math.floor(cr.pts.length * Math.min(1, grow * (1.6 - cr.depth * 0.3)));
              if (n < 2) continue;
              cc.strokeStyle = '#000'; cc.lineWidth = cr.w * k;
              cc.beginPath(); for (let i = 0; i < n; i++) (i ? cc.lineTo : cc.moveTo).call(cc, X(cr.pts[i][0]), Y(cr.pts[i][1])); cc.stroke();
            }
          };
          if (T < 8) {
            drawCracks(c);
            if (T > 6.5) {                                          // 2. it shakes
              snapx.globalCompositeOperation = 'copy'; snapx.drawImage(g.elt, 0, 0);
              const a = (T - 6.5) * 4;
              c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
              c.drawImage(snap, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
            }
          } else if (T < 15) {                                      // 3. it falls
            if (!tear.snapped) { drawCracks(c); snapx.globalCompositeOperation = 'copy'; snapx.drawImage(g.elt, 0, 0); tear.snapped = true; }
            c.save(); ridgePath(c, true); c.fillStyle = '#000'; c.fill(); c.restore();
            const fall = T - 8;
            for (const cell of tear.cells) {
              const ft = Math.max(0, fall - cell.delay);
              const dy = 0.5 * 170 * ft * ft, dx = cell.vx * ft, rot = cell.spin * ft;
              if (Y(cell.pts[0][1]) + dy > H + 80) continue;
              const cx = X(cell.pts[0][0] + 6), cy = Y(cell.pts[0][1] + 5);
              c.save();
              c.translate(cx + dx, cy + dy); c.rotate(rot); c.translate(-cx, -cy);
              poly(c, cell.pts); c.clip(); ridgePath(c, true); c.clip();
              c.drawImage(snap, 0, 0); c.restore();
            }
            c.fillStyle = `rgba(0,0,0,${Math.min(1, fall / 7) * 0.85})`; c.fillRect(0, 0, W, H);   // the light goes too
          } else if (T < 19) {                                      // 4. darkness
            c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
          } else if (T < 27) {                                      // 5. light comes back, from the sky down
            const u = (T - 19) / 8, edge = (u * 1.4 - 0.2) * H;
            const gr = c.createLinearGradient(0, edge - H * 0.25, 0, edge + H * 0.05);
            gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
            c.fillStyle = gr; c.fillRect(0, edge - H * 0.25, W, H * 0.3); c.fillStyle = '#000'; c.fillRect(0, edge + H * 0.05, W, H);
          } else tear = null;
        }
      },
      dispose() {},
    };
  },
};
