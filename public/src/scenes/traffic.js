// Traffic: a print's long-exposure light trails come alive. The artwork's lights (from
// its reference image, as in `glow`) sit at a calm base level, and pulses of light run
// along traced trails — red tail lights one way, yellow headlights the other — lighting
// only the printed streak beneath them. Signs can flicker like old neon, and street
// lamps glow warm after real sunset. All of it is described in the wall's config:
//   "trails":  [{ "color": "red" | "yellow", "pts": [[x, y], …] }]   cm, drawn left → right
//   "flicker": [{ "x", "y", "w", "h" }]                               cm, e.g. a neon sign
//   "lamps":   [{ "x", "y", "r" }]                                    cm
// URL flag ?night forces the lamps on (for testing in daylight).
import { buildLights } from './glow.js';
import { sunPosition } from './sky.js';

const TRAFFIC = {
  base: 0.4,               // the artwork's lights between cars (0–1)
  baseBloom: 0.25,
  every: [0.6, 3.5],       // seconds between cars on each trail
  speed: [22, 45],         // cm per second
  length: [9, 18],         // length of a light pulse, cm
  width: 2.4,              // pulse radius, cm (generous: it only lights the printed streak)
  halo: 0.18,              // glow around a passing pulse, beyond the printed streak
  colors: { red: [255, 70, 55], yellow: [255, 215, 110] },
  lamp: [255, 205, 140],
};

const rnd = (a, b) => a + Math.random() * (b - a);
const NIGHT = typeof location !== 'undefined' && new URLSearchParams(location.search).has('night');

export default {
  name: 'traffic',
  create(p, g, { W, H, wall, config }) {
    const ctx = g.drawingContext;
    const kx = W / (wall.widthM * 100), ky = H / (wall.heightM * 100), kr = (kx + ky) / 2;
    let lights = null, bloom = null, failed = false;
    const layer = (() => { const s = p.createGraphics(W, H); s.pixelDensity(1); return s; })();
    const glowLayer = (() => { const s = p.createGraphics(W, H); s.pixelDensity(1); return s; })();

    if (!config.reference) failed = true;
    else p.loadImage('/media/' + encodeURIComponent(config.reference), (img) => ({ lights, bloom } = buildLights(p, img, W, H)), () => { failed = true; });

    // Trails as polylines in px, with cumulative length; yellow runs the other way.
    const trails = (config.trails || []).map((t) => {
      let pts = t.pts.map(([x, y]) => [x * kx, y * ky]);
      if (t.color === 'yellow') pts = pts.reverse();
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return { pts, cum, len: cum[cum.length - 1], color: TRAFFIC.colors[t.color] || TRAFFIC.colors.red, next: rnd(0, 2) };
    });
    const at = (tr, s) => {
      s = Math.max(0, Math.min(tr.len, s));
      let i = 1; while (i < tr.cum.length - 1 && tr.cum[i] < s) i++;
      const u = (s - tr.cum[i - 1]) / (tr.cum[i] - tr.cum[i - 1] || 1);
      const [a, b] = [tr.pts[i - 1], tr.pts[i]];
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    };
    const pulses = [];

    const flicker = (config.flicker || []).map((r) => ({ x: r.x * kx, y: r.y * ky, w: r.w * kx, h: r.h * ky, level: 1, until: rnd(4, 12), burst: 0 }));
    const lamps = (config.lamps || []).map((l) => ({ x: l.x * kx, y: l.y * ky, r: l.r * kr }));
    const sky = { lat: 40.4, lon: -3.7, ...(config.sky || {}) };
    let lampLevel = 0;

    return {
      draw(t, dt) {
        dt = Math.min(dt, 0.1);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        if (failed) {
          g.fill(110); g.noStroke(); g.textAlign(p.CENTER, p.CENTER); g.textSize(W / 24);
          g.text('traffic: needs a reference image\n(config "reference", in media/)', W / 2, H / 2);
          return;
        }
        if (!lights) return;

        // 1. The artwork's lights at a calm base level.
        ctx.globalAlpha = TRAFFIC.base;
        ctx.drawImage(lights.elt, 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = TRAFFIC.baseBloom;
        ctx.drawImage(bloom.elt, 0, 0);

        // 2. Neon: flicker regions shine at full strength, with the odd stutter.
        for (const f of flicker) {
          f.until -= dt;
          if (f.until <= 0) {
            if (f.burst > 0) { f.burst--; f.level = f.level > 0.5 ? rnd(0.05, 0.3) : 1; f.until = rnd(0.04, 0.12); }
            else if (f.level < 1) { f.level = 1; f.until = rnd(5, 15); }
            else { f.burst = 2 + Math.floor(Math.random() * 5); f.level = rnd(0.05, 0.3); f.until = rnd(0.04, 0.12); }
          }
          ctx.globalAlpha = (1 - TRAFFIC.base) * f.level;
          ctx.drawImage(lights.elt, f.x, f.y, f.w, f.h, f.x, f.y, f.w, f.h);
          ctx.globalAlpha = 0.5 * f.level;
          ctx.drawImage(bloom.elt, f.x, f.y, f.w, f.h, f.x, f.y, f.w, f.h);
        }

        // 3. Cars: spawn, move, and draw comet-shaped pulses into a layer…
        for (const tr of trails) {
          tr.next -= dt;
          if (tr.next <= 0) {
            pulses.push({ tr, s: 0, v: rnd(...TRAFFIC.speed) * kr, len: rnd(...TRAFFIC.length) * kr, a: rnd(0.75, 1) });
            tr.next = rnd(...TRAFFIC.every);
          }
        }
        const lc = layer.drawingContext, hc = glowLayer.drawingContext;
        lc.globalCompositeOperation = 'source-over'; lc.fillStyle = '#000'; lc.fillRect(0, 0, W, H);
        hc.globalCompositeOperation = 'source-over'; hc.clearRect(0, 0, W, H);
        lc.globalCompositeOperation = 'lighter'; hc.globalCompositeOperation = 'lighter';
        const R = TRAFFIC.width * kr;
        for (let i = pulses.length - 1; i >= 0; i--) {
          const q = pulses[i];
          q.s += q.v * dt;
          if (q.s - q.len > q.tr.len) { pulses.splice(i, 1); continue; }
          const steps = 14;
          for (let k = 0; k <= steps; k++) {
            const u = k / steps, [x, y] = at(q.tr, q.s - q.len * (1 - u));   // tail → head
            if (q.s - q.len * (1 - u) < 0) continue;
            const a = q.a * u * u;
            lc.fillStyle = `rgba(255,255,255,${a})`;
            lc.beginPath(); lc.arc(x, y, R, 0, Math.PI * 2); lc.fill();
            hc.fillStyle = `rgba(${q.tr.color},${a * 0.5})`;
            hc.beginPath(); hc.arc(x, y, R * 1.1, 0, Math.PI * 2); hc.fill();
          }
        }
        // …keep them only where the print has light (so they follow the real streak)…
        lc.globalCompositeOperation = 'multiply';
        lc.drawImage(lights.elt, 0, 0);
        // …and add them, plus a soft coloured halo so the motion reads at a glance.
        ctx.globalAlpha = 1;
        ctx.drawImage(layer.elt, 0, 0);
        ctx.filter = 'blur(6px)';
        ctx.globalAlpha = TRAFFIC.halo;
        ctx.drawImage(glowLayer.elt, 0, 0);
        ctx.filter = 'none';

        // 4. Street lamps: warm glow after sunset (fades in over twilight).
        if (lamps.length) {
          const alt = sunPosition(Date.now(), sky.lat, sky.lon).alt;
          const target = NIGHT ? 1 : Math.max(0, Math.min(1, (2 - alt) / 6));
          lampLevel += (target - lampLevel) * Math.min(1, dt);
          if (lampLevel > 0.01) for (const l of lamps) {
            const grd = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
            grd.addColorStop(0, `rgba(${TRAFFIC.lamp},${0.9 * lampLevel})`);
            grd.addColorStop(0.25, `rgba(${TRAFFIC.lamp},${0.45 * lampLevel})`);
            grd.addColorStop(1, `rgba(${TRAFFIC.lamp},0)`);
            ctx.globalAlpha = 1; ctx.fillStyle = grd;
            ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      },
      dispose() { lights?.remove(); bloom?.remove(); layer.remove(); glowLayer.remove(); },
    };
  },
};
