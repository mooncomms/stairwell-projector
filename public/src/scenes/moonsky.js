// Moonlit sky for a print: soft clouds drift across the artwork's own sky (only where
// the reference image is sky: light, grey, above `until`), lit by a dim full moon behind
// them. Where a cloud passes in front the moon dims, and cloud edges near it glow.
// Projection can only add light, so everything here is gentle and cool.
//
// Wall config:
//   "moonsky": { "moon": { "x", "y", "r" }, "until": 75, "brightness": 0.5, "speed": 1 }
//   cm from the print's top-left; `until` = how far down the sky may go.

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const MOON = [215, 225, 255];   // moonlight: cool white

export function makeMoonSky(p, img, W, H, kx, ky, cfg = {}) {
  const until = (cfg.until ?? 75) * ky;
  const moon = cfg.moon ? { x: cfg.moon.x * kx, y: cfg.moon.y * ky, r: (cfg.moon.r ?? 3) * (kx + ky) / 2 } : null;
  const bright = cfg.brightness ?? 0.5, speed = cfg.speed ?? 1;
  const canvas = (w, h) => { const g = p.createGraphics(w, h); g.pixelDensity(1); return g; };

  // 1. Sky mask from the reference: light and unsaturated, fading out toward `until`.
  const mask = canvas(W, H);
  mask.image(img, 0, 0, W, H);
  mask.loadPixels();
  const mp = mask.pixels;
  for (let y = 0; y < H; y++) {
    const vy = 1 - smooth(until * 0.75, until, y);
    for (let x = 0; x < W; x++) {
      const i = 4 * (y * W + x), r = mp[i], g = mp[i + 1], b = mp[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx ? (mx - mn) / mx : 0, lum = (r + g + b) / 765;
      const m = 255 * vy * smooth(0.28, 0.5, lum) * (1 - smooth(0.15, 0.3, sat));
      mp[i] = mp[i + 1] = mp[i + 2] = m; mp[i + 3] = 255;
    }
  }
  mask.updatePixels();
  const softMask = canvas(W, H);
  softMask.drawingContext.filter = 'blur(3px)';
  softMask.drawingContext.drawImage(mask.elt, 0, 0);
  mask.remove();

  // 2. Two cloud textures at low resolution, tileable sideways (noise sampled on a
  //    cylinder), scrolled at different speeds so the clouds slowly change shape.
  const CW = Math.ceil(W / 3), CH = Math.ceil(until / 3) + 2;
  const makeClouds = (seed, scale, cover) => {
    const g = canvas(CW, CH), dens = new Float32Array(CW * CH);
    g.loadPixels();
    const R = (CW / (2 * Math.PI)) * scale;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const a = (x / CW) * Math.PI * 2;
      const nx = Math.cos(a) * R + seed, nz = Math.sin(a) * R + seed, ny = y * scale;
      let n = 0, amp = 0.5, f = 1;
      for (let o = 0; o < 3; o++) { n += amp * p.noise(nx * f, ny * f, nz * f); amp *= 0.45; f *= 2.03; }
      const d = smooth(cover, cover + 0.18, n);
      dens[y * CW + x] = d;
      const i = 4 * (y * CW + x);
      g.pixels[i] = g.pixels[i + 1] = g.pixels[i + 2] = 255 * d; g.pixels[i + 3] = 255;
    }
    g.updatePixels();
    // Soften: clouds have no hard texture at this distance.
    const soft = canvas(CW, CH);
    soft.drawingContext.filter = 'blur(2px)';
    soft.drawingContext.drawImage(g.elt, 0, 0);
    g.remove();
    return { g: soft, dens };
  };
  p.noiseDetail(4, 0.5);
  const far = makeClouds(11.3, 0.012, 0.4), near = makeClouds(57.9, 0.018, 0.46);   // big, soft banks
  const layer = canvas(W, H), clouds = canvas(W, H), density = canvas(W, H);

  const densityAt = (c, off, x, y) => {
    const cx = Math.floor((((x - off) / W) * CW % CW + CW) % CW), cy = Math.min(CH - 1, Math.max(0, Math.floor(y / 3)));
    return c.dens[cy * CW + cx];
  };
  const tile = (ctx, c, off, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.drawImage(c.g.elt, off, 0, W, CH * 3);
    ctx.drawImage(c.g.elt, off - W, 0, W, CH * 3);
  };

  return {
    skyMask: softMask,       // white where the print is sky
    density,                 // current cloud cover (updated by draw)
    draw(ctx, t) {
      const offFar = (t * 4 * speed) % W, offNear = (t * 9 * speed) % W;   // px/s
      // Cloud cover, both layers (screen-like: lighter, capped by the alphas).
      const cc = clouds.drawingContext;
      cc.globalCompositeOperation = 'source-over'; cc.globalAlpha = 1;
      cc.fillStyle = '#000'; cc.fillRect(0, 0, W, H);
      cc.globalCompositeOperation = 'lighter';
      tile(cc, far, offFar, 0.55);
      tile(cc, near, offNear, 0.6);
      // Keep a copy of the bare cloud cover for other layers (the spotlight).
      const dc = density.drawingContext;
      dc.globalCompositeOperation = 'copy'; dc.drawImage(clouds.elt, 0, 0);

      const lc = layer.drawingContext;
      lc.globalCompositeOperation = 'source-over'; lc.globalAlpha = 1;
      lc.fillStyle = '#000'; lc.fillRect(0, 0, W, H);
      // a) Ambient moonlight on the clouds.
      lc.globalAlpha = 0.22;
      lc.drawImage(clouds.elt, 0, 0);
      if (moon) {
        // b) Silver lining: a wide moon halo, kept only where there are clouds.
        const halo = layer.drawingContext.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, moon.r * 9);
        halo.addColorStop(0, 'rgba(255,255,255,0.9)'); halo.addColorStop(0.35, 'rgba(255,255,255,0.35)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
        const sc = clouds.drawingContext;
        sc.globalCompositeOperation = 'multiply'; sc.globalAlpha = 1;
        sc.fillStyle = halo;
        sc.fillRect(0, 0, W, H);
        lc.globalCompositeOperation = 'lighter';
        lc.globalAlpha = 0.8;
        lc.drawImage(clouds.elt, 0, 0);
        // c) The moon itself, veiled by whatever cloud is in front of it right now.
        const veil = Math.min(1, 0.6 * densityAt(far, offFar, moon.x, moon.y) + 0.8 * densityAt(near, offNear, moon.x, moon.y));
        const show = 0.55 * (1 - 0.9 * veil);                  // dim, and mostly hidden behind cloud
        const disc = lc.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, moon.r * 2.4);
        disc.addColorStop(0, `rgba(255,255,255,${show})`);
        disc.addColorStop(0.38, `rgba(255,255,255,${show * 0.9})`);
        disc.addColorStop(0.5, `rgba(255,255,255,${show * 0.22})`);
        disc.addColorStop(1, 'rgba(255,255,255,0)');
        lc.globalAlpha = 1;
        lc.fillStyle = disc;
        lc.beginPath(); lc.arc(moon.x, moon.y, moon.r * 2.4, 0, Math.PI * 2); lc.fill();
      }
      // Only on the print's sky; tint cool; add to the scene.
      lc.globalCompositeOperation = 'multiply'; lc.globalAlpha = 1;
      lc.drawImage(softMask.elt, 0, 0);
      lc.fillStyle = `rgb(${MOON})`;
      lc.fillRect(0, 0, W, H);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = bright;
      ctx.drawImage(layer.elt, 0, 0);
      ctx.restore();
    },
    dispose() { softMask.remove(); far.g.remove(); near.g.remove(); layer.remove(); clouds.remove(); density.remove(); },
  };
}
