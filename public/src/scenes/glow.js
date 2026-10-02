// Glow: makes a printed artwork's own lights shine. From the wall's reference image
// (config "reference" in media/, in wall space) it keeps only the strongly coloured,
// bright parts — light trails, signs, lamps — at full brightness in their own colour,
// adds a soft bloom (which also hides small misalignment), and animates them gently:
// a slow breath, and faint streaks of brightness drifting the way traffic flows.
// Everything else stays black, so the print looks lit from within.
const GLOW = {
  minSat: [0.3, 0.65],      // saturation ramp: below 0.3 no light, above 0.65 full
  minVal: [0.5, 0.88],      // brightness ramp: the road and brick are tinted but dim; real lights are bright
  bloom: 0.8,               // strength of the soft halo
  blur: 4,                  // halo radius, px
  breath: 0.12,             // slow overall pulse (0 = steady)
  flow: 0.35,               // depth of the drifting streaks (0 = none)
  flowSpeed: 60,            // px per second, left → right
};

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Shared with other scenes (traffic): the artwork's lights as a layer, plus its bloom.
// Keeps bright, saturated pixels, pushed to full brightness in their own colour.
export function buildLights(p, img, W, H, opts = GLOW) {
  const lights = p.createGraphics(W, H); lights.pixelDensity(1);
  lights.image(img, 0, 0, W, H);
  lights.loadPixels();
  const px = lights.pixels;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gg = px[i + 1], b = px[i + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const sat = mx ? (mx - mn) / mx : 0, val = mx / 255;
    const w = smooth(...opts.minSat, sat) * smooth(...opts.minVal, val);
    const k = mx ? (255 / mx) * w : 0;
    px[i] = r * k; px[i + 1] = gg * k; px[i + 2] = b * k; px[i + 3] = 255;
  }
  lights.updatePixels();
  const bloom = p.createGraphics(W, H); bloom.pixelDensity(1);
  bloom.drawingContext.filter = `blur(${opts.blur}px)`;
  bloom.drawingContext.drawImage(lights.elt, 0, 0);
  return { lights, bloom };
}

export default {
  name: 'glow',
  create(p, g, { W, H, config }) {
    const ctx = g.drawingContext;
    let lights = null, bloom = null, flow = null, scratch = null, failed = false;

    const file = config.reference;
    if (!file) failed = true;
    else p.loadImage('/media/' + encodeURIComponent(file), build, () => { failed = true; });

    function build(img) {
      // 1–2. Light map and its bloom.
      ({ lights, bloom } = buildLights(p, img, W, H));
      // 3. Flow texture: soft horizontal streaks, tiled sideways as it scrolls.
      flow = p.createGraphics(W, H); flow.pixelDensity(1);
      const fc = flow.drawingContext;
      fc.fillStyle = '#000'; fc.fillRect(0, 0, W, H);
      for (let k = 0; k < 60; k++) {
        const y = Math.random() * H, len = W * (0.2 + Math.random() * 0.5), x = Math.random() * W;
        const grd = fc.createLinearGradient(x, 0, x + len, 0);
        grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        fc.fillStyle = grd;
        fc.fillRect(x, y, len, 6 + Math.random() * 30);
        fc.fillRect(x - W, y, len, 6 + Math.random() * 30);   // wrap-around copy
      }
      fc.filter = 'blur(6px)'; fc.drawImage(flow.elt, 0, 0); fc.filter = 'none';
    }

    // The lights multiplied by the scrolled streak texture.
    function flowLayer(off) {
      scratch ??= (() => { const s = p.createGraphics(W, H); s.pixelDensity(1); return s; })();
      const sc = scratch.drawingContext;
      sc.globalCompositeOperation = 'source-over';
      sc.drawImage(lights.elt, 0, 0);
      sc.globalCompositeOperation = 'multiply';
      sc.drawImage(flow.elt, off, 0);
      sc.drawImage(flow.elt, off - W, 0);
      sc.globalCompositeOperation = 'source-over';
      return scratch.elt;
    }

    return {
      draw(t) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        if (failed) {
          g.fill(110); g.noStroke(); g.textAlign(p.CENTER, p.CENTER); g.textSize(W / 24);
          g.text('glow: needs a reference image\n(config "reference", in media/)', W / 2, H / 2);
          return;
        }
        if (!lights) return;
        const breath = 1 - GLOW.breath * (0.5 + 0.5 * Math.sin(t * 0.6));
        // Lights, dimmed slightly by the breath…
        ctx.globalAlpha = breath * (1 - GLOW.flow * 0.5);
        ctx.drawImage(lights.elt, 0, 0);
        // …brightened where the drifting streaks pass (only where there's light).
        if (GLOW.flow > 0) {
          const off = (t * GLOW.flowSpeed) % W;
          const tmp = flowLayer(off);
          ctx.globalAlpha = GLOW.flow;
          ctx.drawImage(tmp, 0, 0);
        }
        ctx.globalAlpha = GLOW.bloom * breath;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(bloom.elt, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      },
      dispose() { lights?.remove(); bloom?.remove(); flow?.remove(); scratch?.remove(); },
    };

  },
};
