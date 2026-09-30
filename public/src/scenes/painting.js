// Paintings from media/paintings/, shown whole: fitted to the wall's width and sitting
// on the bottom edge. The missing sky above is grown from the painting's own top edge:
// each column continues the colour it had there, drifting to a deeper blue overhead,
// with grain matched to the paint so the seam disappears.
//
// Tweaks for the generated sky:
const SKY = {
  band: 0.02,              // fraction of the painting's height sampled as "the sky at the top"
  top: [0.8, 0.88, 1.0],   // RGB multipliers reached at the very top (deeper, bluer overhead)
  flatten: 0.7,            // how much the left/right colour variation evens out towards the top
  blend: 0.025,            // fraction of the painting's height blended into the new sky at the seam
};

// Add ?lids to the URL to hold every lid shut, for checking eye positions.
const SHUT = new URLSearchParams(location.search).has('lids');

// Blinking: an optional sidecar next to the image (same name, .json) lists who blinks
// and where their eyes are, in the image's own pixels [centre x, centre y, width, height]:
//   { "blinkers": [ { "eyes": [[199, 330, 38, 14], [259, 333, 34, 12]], "every": [2.5, 6] } ] }
// `every` is the random gap between blinks, in seconds. Lids are painted with skin
// colours sampled just above and below each eye.
const BLINK = {
  close: 0.08, hold: 0.05, open: 0.15,   // seconds
  double: 0.2,                           // chance a blink is followed by a second one
  cover: [1.1, 1.3],                     // lid size relative to the eye box (w, h)
};

export default {
  name: 'painting',
  create(p, g, { W, H, config }) {
    const ITEM = config.paintingSeconds ?? 120, FADE = 3;
    let items = [], idx = -1, cur = null, prev = null, since = 0, disposed = false;

    fetch('/api/media?dir=paintings').then((r) => r.json()).then((list) => {
      items = list.filter((m) => !m.video);
      if (!disposed) advance();
    });

    function advance() {
      if (!items.length) return;
      prev?.g.remove();
      prev = cur;
      idx = (idx + 1) % items.length;
      const slot = { ready: false, g: null, blinkers: [] };
      const url = items[idx].url;
      const meta = fetch(url.replace(/\.[^.\/]+$/, '.json')).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      p.loadImage(url, async (img) => {
        if (disposed) return;
        slot.g = compose(img, slot);
        slot.blinkers = makeBlinkers(await meta, img);
        slot.ready = true;
      });
      cur = slot;
      since = 0;
    }

    // Build the full-wall picture once per painting.
    function compose(img, slot) {
      const out = p.createGraphics(W, H);
      out.pixelDensity(1);
      out.background(0);
      img.loadPixels();
      const s = W / img.width, dh = Math.round(img.height * s);
      if (dh >= H) {
        // Taller than the wall: cover-fit, centred. Nothing to extend.
        const k = H / img.height, ox = (W - img.width * k) / 2;
        out.image(img, ox, 0, img.width * k, H);
        slot.toWall = (x, y) => [ox + x * k, y * k];
        slot.scale = k;
        return out;
      }
      const y0 = H - dh;                          // where the painting starts
      slot.toWall = (x, y) => [x * s, y0 - 1 + (y * (dh + 1)) / img.height];
      slot.scale = s;
      liftTopEdge(img);
      const { profile, grain } = sampleSky(img);
      const mean = [0, 1, 2].map((c) => profile.reduce((a, q) => a + q[c], 0) / W);

      // Sky colour at column x, t = 0 at the seam → 1 at the very top.
      // The colour shift eases *out*: it changes fastest at the seam, carrying on the
      // painting's own gradient (a flat start reads as a line), and levels off overhead.
      const skyAt = (x, t) => {
        const e = t * t * (3 - 2 * t), shift = 1 - (1 - t) ** 2;
        return [0, 1, 2].map((c) => {
          const base = profile[x][c] + (mean[c] - profile[x][c]) * SKY.flatten * e;
          return base * (1 + (SKY.top[c] - 1) * shift);
        });
      };
      const noisy = (v, x, y) => {
        const fine = (Math.random() + Math.random() - 1) * grain;
        const mottle = (p.noise(x * 0.02, y * 0.02) - 0.5) * grain * 1.6;
        return v + fine + mottle;
      };

      // Start one row early: the scaled image's anti-aliased top row (half blended with
      // black) lands in the sky area and gets overwritten, instead of drawing a dark seam.
      out.image(img, 0, y0 - 1, W, dh + 1);
      out.loadPixels();
      const px = out.pixels;
      for (let y = 0; y < y0; y++) {
        const t = 1 - y / y0;
        for (let x = 0; x < W; x++) {
          const col = skyAt(x, t), i = 4 * (y * W + x);
          for (let c = 0; c < 3; c++) px[i + c] = noisy(col[c], x, y);
          px[i + 3] = 255;
        }
      }
      // Seam: fade the painting's top rows into the new sky, but only where they
      // really are sky-coloured, so thin details (the spire's finial) stay intact.
      const band = Math.max(2, Math.round(dh * SKY.blend));
      for (let y = y0; y < y0 + band; y++) {
        const w = 1 - (y - y0) / band;
        for (let x = 0; x < W; x++) {
          const i = 4 * (y * W + x), sky = skyAt(x, 0);
          const dist = Math.abs(px[i] - sky[0]) + Math.abs(px[i + 1] - sky[1]) + Math.abs(px[i + 2] - sky[2]);
          const k = w * Math.max(0, 1 - dist / 60);
          for (let c = 0; c < 3; c++) px[i + c] += (noisy(sky[c], x, y) - px[i + c]) * k;
        }
      }
      out.updatePixels();
      return out;
    }

    // ---- blinking ----
    function makeBlinkers(meta, img) {
      const src = img.pixels, iw = img.width, ih = img.height;
      // Skin colour of a patch, taken at a brightish percentile so eyebrow hairs and
      // crease shadows don't drag it down.
      const patch = (x0, y0, x1, y1, pct) => [0, 1, 2].map((c) => {
        const v = [];
        for (let y = Math.max(0, Math.round(y0)); y <= Math.min(ih - 1, Math.round(y1)); y++)
          for (let x = Math.max(0, Math.round(x0)); x <= Math.min(iw - 1, Math.round(x1)); x++) v.push(src[4 * (y * iw + x) + c]);
        return v.sort((a, b) => a - b)[Math.floor(v.length * pct)] ?? 128;
      });
      return (meta?.blinkers || []).map((b) => ({
        every: b.every || [2.5, 7],
        next: 0.5 + Math.random() * 3,
        t: -1,
        again: false,
        eyes: b.eyes.map(([x, y, w, h]) => ({
          x, y, w, h,
          // Skin just above the eye for the lid; just under it for its lower edge.
          top: patch(x - w * 0.3, y - h * 1.1, x + w * 0.3, y - h * 0.6, 0.7),
          bottom: patch(x - w * 0.3, y + h * 0.65, x + w * 0.3, y + h * 1.1, 0.6),
        })),
      }));
    }

    // 0 = open, 1 = shut.
    function closure(t) {
      if (t < 0) return 0;
      if (t < BLINK.close) return (t / BLINK.close) ** 2;
      if (t < BLINK.close + BLINK.hold) return 1;
      const u = Math.min(1, (t - BLINK.close - BLINK.hold) / BLINK.open);
      return (1 - u) ** 2;
    }

    function drawLids(slot, dt) {
      const ctx = g.drawingContext, total = BLINK.close + BLINK.hold + BLINK.open;
      for (const b of slot.blinkers) {
        if (b.t < 0) {
          b.next -= dt;
          if (b.next <= 0) { b.t = 0; b.again = Math.random() < BLINK.double; }
        } else if ((b.t += dt) > total) {
          b.t = -1;
          b.next = b.again ? 0.12 : b.every[0] + Math.random() * (b.every[1] - b.every[0]);
          b.again = false;
        }
        const k = SHUT ? 1 : closure(b.t);
        if (k < 0.02) continue;
        for (const e of b.eyes) {
          const [cx, cy] = slot.toWall(e.x, e.y);
          const w = e.w * slot.scale * BLINK.cover[0], h = e.h * slot.scale * BLINK.cover[1];
          const topY = cy - h, lowY = cy - h + 2 * h * k;   // quadratic control points
          ctx.save();
          ctx.filter = `blur(${Math.max(0.8, slot.scale * 1.2)}px)`;
          // Shaded like a closed lid: a slightly darker crease on top, lit skin in the
          // middle, blending into the under-eye skin at the bottom.
          const mixc = (a, b, u, lift = 1) => a.map((v, i) => Math.round(Math.min(255, (v + (b[i] - v) * u) * lift)));
          const grad = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
          grad.addColorStop(0, `rgb(${mixc(e.top, e.top, 0, 0.92)})`);
          grad.addColorStop(0.45, `rgb(${mixc(e.top, e.bottom, 0.3, 1.04)})`);
          grad.addColorStop(1, `rgb(${e.bottom})`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(cx - w / 2, cy);
          ctx.quadraticCurveTo(cx, topY, cx + w / 2, cy);
          ctx.quadraticCurveTo(cx, lowY, cx - w / 2, cy);
          ctx.fill();
          // Lash line along the lid's moving edge.
          ctx.strokeStyle = `rgba(55,35,25,${0.55 * k})`;
          ctx.lineWidth = Math.max(1, slot.scale * 1.3);
          ctx.beginPath();
          ctx.moveTo(cx + w / 2, cy);
          ctx.quadraticCurveTo(cx, lowY, cx - w / 2, cy);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Photos of paintings often have a darkened top edge (frame shadow, scan falloff)
    // which would otherwise show up as a dark line at the seam. Fit the sky's natural
    // top-to-bottom gradient a little lower down, find the rows at the top that fall
    // below it, and lift them back onto it. Thin details there (the finial) stay.
    function liftTopEdge(img) {
      const iw = img.width, ih = img.height, src = img.pixels;
      const a = Math.round(ih * 0.04), b = Math.round(ih * 0.08);
      const rowMed = (y) => [0, 1, 2].map((c) => {
        const v = [];
        for (let x = 0; x < iw; x += 2) v.push(src[4 * (y * iw + x) + c]);
        return v.sort((m, n) => m - n)[v.length >> 1];
      });
      // Least-squares line per channel over rows a..b.
      const fit = [0, 1, 2].map(() => ({ sy: 0, syy: 0, sv: 0, syv: 0, n: 0 }));
      for (let y = a; y <= b; y++) {
        rowMed(y).forEach((v, c) => { const f = fit[c]; f.sy += y; f.syy += y * y; f.sv += v; f.syv += y * v; f.n++; });
      }
      const line = fit.map(({ sy, syy, sv, syv, n }) => {
        const slope = (n * syv - sy * sv) / (n * syy - sy * sy || 1);
        return (y) => (sv - slope * sy) / n + slope * y;
      });
      const expected = (y) => line.map((f) => f(y));
      const lum = (v) => v[0] * 0.3 + v[1] * 0.59 + v[2] * 0.11;
      let edge = 0;
      while (edge < a && lum(rowMed(edge)) < lum(expected(edge)) - 3) edge++;
      // Walk down past the dip: rows are edge-shadowed until they meet the fit line.
      for (let y = 0; y < a; y++) if (lum(rowMed(y)) < lum(expected(y)) - 3) edge = y + 1;
      for (let y = 0; y < edge; y++) {
        const have = rowMed(y), want = expected(y);
        const gain = [0, 1, 2].map((c) => Math.min(2, want[c] / Math.max(1, have[c])));
        for (let x = 0; x < iw; x++) {
          const i = 4 * (y * iw + x);
          for (let c = 0; c < 3; c++) src[i + c] = Math.min(255, src[i + c] * gain[c]);
        }
      }
      if (edge) img.updatePixels();
    }

    // Per-column sky colour from the painting's top band, robust to details like
    // the lightning rod, plus how grainy the paint is there.
    function sampleSky(img) {
      const iw = img.width, rows = Math.max(4, Math.round(img.height * SKY.band));
      const src = img.pixels;
      const lum = (i) => src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11;
      // 1. Trimmed mean down each source column (drop the darkest/lightest quarter).
      const colMean = [];
      for (let x = 0; x < iw; x++) {
        const idx = [];
        for (let y = 0; y < rows; y++) idx.push(4 * (y * iw + x));
        idx.sort((a, b) => lum(a) - lum(b));
        const keep = idx.slice(Math.floor(rows / 4), Math.ceil((rows * 3) / 4));
        colMean.push([0, 1, 2].map((c) => keep.reduce((a, i) => a + src[i + c], 0) / keep.length));
      }
      // 2. Resample to wall columns, then a wide median + box blur across columns so
      //    thin vertical things (rod, finial) don't become stripes in the sky.
      let prof = Array.from({ length: W }, (_, x) => colMean[Math.min(iw - 1, Math.floor((x * iw) / W))]);
      const med = Math.max(3, Math.round(W * 0.05)) | 1, h = med >> 1;
      prof = prof.map((_, x) => [0, 1, 2].map((c) => {
        const win = [];
        for (let k = -h; k <= h; k++) win.push(prof[Math.max(0, Math.min(W - 1, x + k))][c]);
        return win.sort((a, b) => a - b)[h];
      }));
      const bw = Math.max(1, Math.round(W * 0.03));
      prof = prof.map((_, x) => [0, 1, 2].map((c) => {
        let sum = 0, n = 0;
        for (let k = -bw; k <= bw; k++) { const q = prof[x + k]; if (q) { sum += q[c]; n++; } }
        return sum / n;
      }));
      // 3. Grain: typical deviation of band pixels from the smoothed colour.
      let dev = 0, n = 0;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < iw; x += 2) {
          const i = 4 * (y * iw + x), q = prof[Math.min(W - 1, Math.floor((x * W) / iw))];
          const d = Math.abs(lum(i) - (q[0] * 0.3 + q[1] * 0.59 + q[2] * 0.11));
          if (d < 25) { dev += d; n++; }   // ignore details, keep the paint texture
        }
      }
      const grain = Math.min(10, Math.max(1.5, n ? (dev / n) * 1.25 : 3));
      return { profile: prof, grain };
    }

    return {
      draw(t, dt) {
        since += dt;
        g.background(0);
        if (!items.length) {
          g.fill(120); g.textAlign(p.CENTER, p.CENTER); g.textSize(W / 22);
          g.text('Drop paintings into\nstairwall/media/paintings/', W / 2, H / 2);
          return;
        }
        if (cur?.ready && since > ITEM && items.length > 1) advance();
        const a = Math.min(1, since / FADE);
        if (prev?.ready && a < 1) g.image(prev.g, 0, 0);
        if (cur?.ready) {
          g.drawingContext.globalAlpha = prev ? a : 1;
          g.image(cur.g, 0, 0);
          drawLids(cur, dt);
          g.drawingContext.globalAlpha = 1;
        }
      },
      dispose() { disposed = true; prev?.g?.remove(); cur?.g?.remove(); },
    };
  },
};
