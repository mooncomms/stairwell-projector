// Spotlight: a searchlight behind the buildings throws an image onto the clouds. A soft
// cone of light rises from `from` to the image at `to`; both are kept to the print's
// sky (so the beam seems to come from behind the buildings) and modulated by the
// drifting cloud cover, so the image shimmers and shifts as clouds pass. The beam sways
// a little. Toggled at runtime (remote button / key `o`), fading in and out.
//
// Wall config:
//   "spotlight": { "image": "spotlight.png", "from": { "x", "y" }, "to": { "x", "y", "r" },
//                  "brightness": 0.8, "on": false }         cm from the print's top-left
// The image: a light symbol on black (black = no light).

const BEAM = [255, 236, 190];   // warm searchlight

export function makeSpotlight(p, W, H, kx, ky, cfg, moonsky) {
  const k = (kx + ky) / 2;
  const from = { x: cfg.from.x * kx, y: cfg.from.y * ky };
  const to = { x: cfg.to.x * kx, y: cfg.to.y * ky, r: (cfg.to.r ?? 8) * k };
  const bright = cfg.brightness ?? 0.8;
  const canvas = (w, h) => { const g = p.createGraphics(w, h); g.pixelDensity(1); return g; };
  let logo = null, level = 0;

  // The image as light: its brightness becomes the light's strength, in beam colour.
  p.loadImage('/media/' + encodeURIComponent(cfg.image), (img) => {
    const S = Math.ceil(to.r * 2);
    logo = canvas(S, S);
    logo.image(img, 0, 0, S, S);
    logo.loadPixels();
    const px = logo.pixels;
    for (let i = 0; i < px.length; i += 4) {
      // Strict: the image's near-black background must stay dark, or it shows as a box.
      const lum = (px[i] + px[i + 1] + px[i + 2]) / 765;
      const x = ((i / 4) % S) / S - 0.5, y = Math.floor(i / 4 / S) / S - 0.5;
      const round = Math.max(0, Math.min(1, (0.5 - Math.hypot(x, y)) / 0.06));   // soft circular edge
      const a = Math.min(1, Math.max(0, (lum - 0.22) * 3)) * round;
      px[i] = BEAM[0] * a; px[i + 1] = BEAM[1] * a; px[i + 2] = BEAM[2] * a; px[i + 3] = 255;
    }
    logo.updatePixels();
  });

  const layer = canvas(W, H), mod = canvas(W, H);

  return {
    draw(ctx, t, dt, on) {
      level += ((on ? 1 : 0) - level) * Math.min(1, dt * 1.2);
      if (level < 0.01 || !logo) return;
      const lc = layer.drawingContext;
      lc.globalCompositeOperation = 'source-over'; lc.globalAlpha = 1;
      lc.fillStyle = '#000'; lc.fillRect(0, 0, W, H);

      // The beam sways slowly; the image lands where it points.
      const sway = Math.sin(t * 0.11) * 0.06 + Math.sin(t * 0.037 + 1) * 0.04;
      const tx = to.x + sway * to.r * 2, ty = to.y + Math.sin(t * 0.07) * to.r * 0.05;

      // 1. The image with a soft halo of spill around it.
      lc.globalCompositeOperation = 'lighter';
      const halo = lc.createRadialGradient(tx, ty, to.r * 0.6, tx, ty, to.r * 1.3);
      halo.addColorStop(0, `rgba(${BEAM},0.12)`); halo.addColorStop(1, `rgba(${BEAM},0)`);
      lc.fillStyle = halo; lc.beginPath(); lc.arc(tx, ty, to.r * 1.3, 0, Math.PI * 2); lc.fill();
      lc.filter = 'blur(1px)';
      lc.drawImage(logo.elt, tx - to.r, ty - to.r, to.r * 2, to.r * 2);
      lc.filter = 'none';

      // 2. Clouds carry the image: thicker cloud = brighter, and it drifts with them.
      if (moonsky) {
        const mc = mod.drawingContext;
        mc.globalCompositeOperation = 'source-over'; mc.globalAlpha = 1;
        mc.fillStyle = 'rgb(110,110,110)'; mc.fillRect(0, 0, W, H);
        mc.globalCompositeOperation = 'lighter'; mc.globalAlpha = 0.75;
        mc.drawImage(moonsky.density.elt, 0, 0);
        lc.globalCompositeOperation = 'multiply'; lc.globalAlpha = 1;
        lc.drawImage(mod.elt, 0, 0);
      }

      // 3. The beam: a cone from a narrow source behind the buildings to the image,
      //    brighter towards the clouds, with a hint of haze shimmer.
      const ang = Math.atan2(ty - from.y, tx - from.x), nx = -Math.sin(ang), ny = Math.cos(ang);
      const w0 = 1.2 * k, w1 = to.r * 0.95;
      const shimmer = 0.85 + 0.15 * Math.sin(t * 0.9) * Math.sin(t * 0.37);
      const grd = lc.createLinearGradient(from.x, from.y, tx, ty);
      grd.addColorStop(0, `rgba(${BEAM},${0.1 * shimmer})`); grd.addColorStop(0.6, `rgba(${BEAM},${0.22 * shimmer})`); grd.addColorStop(1, `rgba(${BEAM},${0.35 * shimmer})`);
      lc.globalCompositeOperation = 'lighter';
      lc.fillStyle = grd;
      lc.filter = 'blur(5px)';
      lc.beginPath();
      lc.moveTo(from.x + nx * w0, from.y + ny * w0);
      lc.lineTo(tx + nx * w1, ty + ny * w1);
      lc.lineTo(tx - nx * w1, ty - ny * w1);
      lc.lineTo(from.x - nx * w0, from.y - ny * w0);
      lc.closePath(); lc.fill();
      lc.filter = 'none';

      // 4. Only over the print's sky, so the beam rises from behind the buildings.
      if (moonsky) {
        lc.globalCompositeOperation = 'multiply'; lc.globalAlpha = 1;
        lc.drawImage(moonsky.skyMask.elt, 0, 0);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = bright * level;
      ctx.drawImage(layer.elt, 0, 0);
      ctx.restore();
    },
    dispose() { logo?.remove(); layer.remove(); mod.remove(); },
  };
}
