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
const EMBLEM = { x: 76, y: 23, r: 5 };
// Pennants: the top of each pole.
const PENNANTS = [[73, 54], [86, 56], [91, 41], [97, 65], [101.5, 62], [109, 60], [121, 72], [124.5, 75.5], [139, 81]];
// Title strokes live in these boxes (cm); the strokes themselves come from the reference.
const TITLE = [{ x: 13, y: 8, w: 48, h: 24 }, { x: 82, y: 6, w: 61, h: 45 }];
// Searchlights: rising from behind the wall.
const LIGHTS = [{ x: 28, y: 53, a: 0 }, { x: 78, y: 62, a: 2.2 }, { x: 118, y: 80, a: 4.1 }];
const DAY = 8 * 60;   // seconds for a whole day in the sky

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
    teardown: { label: 'Tear down the wall', action: true },
  },
  create(p, g, ctx) {
    const { W, H, flags } = ctx;
    const k = W / CM.w, kyy = H / CM.h;
    const X = (x) => x * k, Y = (y) => y * kyy;
    const c = g.drawingContext;
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
    const title = canvas(), titleGlow = canvas();
    p.loadImage('/media/reference.jpg', (img) => {
      const t = canvas(); const tc = ctx2(t, true); tc.drawImage(img.canvas || img.elt, 0, 0, W, H);
      const px = tc.getImageData(0, 0, W, H).data, L = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) L[i] = 0.3 * px[4 * i] + 0.59 * px[4 * i + 1] + 0.11 * px[4 * i + 2];   // luminance: white letters stand out from the pink sky
      const R = 3, filt = (src, op) => {           // separable min/max over (2R+1)²
        const a = new Float32Array(W * H), b = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = src[y * W + x]; for (let d = -R; d <= R; d++) { const xx = Math.min(W - 1, Math.max(0, x + d)); m = op(m, src[y * W + xx]); } a[y * W + x] = m; }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = a[y * W + x]; for (let d = -R; d <= R; d++) { const yy = Math.min(H - 1, Math.max(0, y + d)); m = op(m, a[yy * W + x]); } b[y * W + x] = m; }
        return b;
      };
      const open = filt(filt(L, Math.min), Math.max);
      const out = ctx2(title), od = out.createImageData(W, H);
      const inTitle = (x, y) => TITLE.some((b) => x >= X(b.x) && x < X(b.x + b.w) && y >= Y(b.y) && y < Y(b.y + b.h));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, v = inTitle(x, y) ? Math.max(0, Math.min(1, (L[i] - open[i] - 22) / 20)) : 0;
        od.data[4 * i] = od.data[4 * i + 1] = od.data[4 * i + 2] = 255; od.data[4 * i + 3] = v * 255;
      }
      out.putImageData(od, 0, 0);
      const gl = ctx2(titleGlow); gl.filter = 'blur(6px)'; gl.drawImage(title, 0, 0); gl.drawImage(title, 0, 0);
    });

    // A soft white dot, drawn scaled for every small glow (cheaper than a gradient each).
    const dot = canvas(64, 64);
    { const d = ctx2(dot), gr = d.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,248,238,1)'); gr.addColorStop(1, 'rgba(255,248,238,0)'); d.fillStyle = gr; d.fillRect(0, 0, 64, 64); }
    const glow = (x, y, r, a) => { if (a < 0.01) return; c.globalAlpha = Math.min(1, a); c.drawImage(dot, x - r, y - r, 2 * r, 2 * r); };

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
        for (const a of flags.actions.splice(0)) if (a.scene === 'floyd' && a.key === 'teardown' && !tear) startTear();
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
              glow(X(x), Y(y), w * 1.3, 0.16 * v * Math.min(1, u * 4 + 0.2));
            }
          };
          ripple(FLAG, FLAG_W, 3.2, 0); ripple(FLAG2, null, 3.8, 1.3);
          const gust = ((t % 11) / 3.5) * CM.w * 1.2 - 10;                     // a gust every 11 s
          for (const [px, py] of PENNANTS) {
            const near = Math.exp(-(((px - gust) / 9) ** 2));
            const fl = 0.5 + 0.5 * Math.sin(t * 9 + px);
            glow(X(px + 3.5), Y(py + 3), 6 * k, near * (0.25 + 0.25 * fl));
          }
          c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
        }

        // The march: bands of light step along the crowd, one step per beat; the heads
        // light up in turn.
        if (fx('march')) {
          const step = Math.floor(beat), within = beat - step;
          masked(crowd, (f) => {
            const sp = 7 * k, slant = -0.6;                  // the crowd's stripes lean this way
            f.fillStyle = 'rgba(255,240,225,1)';
            for (let i = -4; i < CM.w / 7 + 6; i++) {
              if (((i - step) % 4 + 4) % 4 !== 0) continue;
              const x = i * sp;
              f.globalAlpha = 0.3 + 0.7 * Math.exp(-within * 3);
              f.beginPath(); f.moveTo(x, 0); f.lineTo(x + sp * 0.45, 0); f.lineTo(x + sp * 0.45 + slant * H, H); f.lineTo(x + slant * H, H); f.closePath(); f.fill();
            }
          }, 0.3);
          c.globalCompositeOperation = 'lighter';
          for (let i = 0; i < HEADS.n; i++) {
            if ((i + step) % 2) continue;                    // left, right, left…
            const u = i / (HEADS.n - 1), x = HEADS.from[0] + (HEADS.to[0] - HEADS.from[0]) * u, y = HEADS.from[1] + (HEADS.to[1] - HEADS.from[1]) * u;
            glow(X(x), Y(y), (1.2 + u * 1.6) * k * 1.6, 0.5 * pulse);
          }
          c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
        }

        // The hammers emblem: a red pulse on each beat.
        if (fx('hammers')) {
          c.globalCompositeOperation = 'lighter';
          const r = EMBLEM.r * k * 1.5, gr = c.createRadialGradient(X(EMBLEM.x), Y(EMBLEM.y), 0, X(EMBLEM.x), Y(EMBLEM.y), r);
          gr.addColorStop(0, `rgba(255,30,20,${0.25 + 0.55 * pulse})`); gr.addColorStop(0.6, `rgba(255,30,20,${0.15 + 0.3 * pulse})`); gr.addColorStop(1, 'rgba(255,30,20,0)');
          c.fillStyle = gr; c.fillRect(X(EMBLEM.x) - r, Y(EMBLEM.y) - r, 2 * r, 2 * r);
          c.globalCompositeOperation = 'source-over';
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

        // Neon title: every 75 s, a pen of light writes it left to right, it glows a while,
        // then fades.
        if (fx('title')) {
          const cyc = t % 75, sweep = Math.min(1, cyc / 7);
          const hold = cyc < 7 ? 1 : cyc < 32 ? 1 : Math.max(0, 1 - (cyc - 32) / 5);
          if (hold > 0) {
            const flick = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3);
            const x0 = X(TITLE[0].x), x1 = X(TITLE[1].x + TITLE[1].w), front = x0 + (x1 - x0) * sweep;
            masked(null, (f) => {
              f.drawImage(titleGlow, 0, 0); f.drawImage(title, 0, 0);
              f.globalCompositeOperation = 'source-in'; f.fillStyle = 'rgb(255,120,210)'; f.fillRect(0, 0, W, H);
              f.globalCompositeOperation = 'lighter'; f.globalAlpha = 0.35; f.drawImage(title, 0, 0); f.globalAlpha = 1;
              f.globalCompositeOperation = 'destination-in';          // only what the pen has written
              const gr = f.createLinearGradient(front - 30, 0, front + 4, 0);
              gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
              f.fillStyle = '#000'; f.fillRect(0, 0, Math.max(0, front - 30), H); f.fillStyle = gr; f.fillRect(front - 30, 0, 34, H);
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
