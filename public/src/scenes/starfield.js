// A window into deep space: a slowly drifting nebula, three parallax star layers,
// twinkle, and the odd shooting star.
export default {
  name: 'starfield',
  frame: 'ship',                 // default window frame (stairwell)
  create(p, g, { W, H }) {
    // Nebula: fbm noise baked once at 1/4 resolution, upscaled with smoothing.
    const NS = 4, nw = Math.ceil(W / NS), nh = Math.ceil((H * 1.3) / NS);
    const neb = p.createGraphics(nw, nh);
    neb.pixelDensity(1);
    neb.loadPixels();
    p.noiseSeed(Math.floor(Math.random() * 1e6));
    p.noiseDetail(6, 0.5);
    const hueA = [80, 40, 160], hueB = [20, 110, 150], hueC = [170, 40, 110];
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const n1 = p.noise(x * 0.012, y * 0.012);
        const n2 = p.noise(x * 0.02 + 100, y * 0.02 + 100);
        const dens = Math.max(0, n1 - 0.42) * 2.4;
        const i = 4 * (y * nw + x);
        for (let c = 0; c < 3; c++) {
          const col = n2 < 0.5 ? hueA[c] + (hueB[c] - hueA[c]) * n2 * 2 : hueB[c] + (hueC[c] - hueB[c]) * (n2 - 0.5) * 2;
          neb.pixels[i + c] = Math.min(255, col * dens * dens * 1.6);
        }
        neb.pixels[i + 3] = 255;
      }
    }
    neb.updatePixels();
    p.noiseDetail(4, 0.5);

    const layers = [0.25, 0.5, 1].map((depth) => ({
      depth,
      stars: Array.from({ length: Math.round((W * H) / 2600 / depth) }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: (0.5 + Math.random() * 1.4) * depth + 0.3,
        b: 120 + Math.random() * 135,
        tw: Math.random() * Math.PI * 2, tws: 0.5 + Math.random() * 3,
        tint: Math.random(),
      })),
    }));
    let shooting = null;
    const drift = { x: 3, y: -6 }; // px/s for the nearest layer

    return {
      draw(t, dt) {
        g.background(2, 2, 8);
        g.image(neb, 0, -H * 0.15 + Math.sin(t * 0.004) * H * 0.12, W, nh * NS);
        g.noStroke();
        for (const L of layers) {
          for (const s of L.stars) {
            s.x = (s.x + drift.x * L.depth * dt + W) % W;
            s.y = (s.y + drift.y * L.depth * dt + H) % H;
            const tw = 0.75 + 0.25 * Math.sin(t * s.tws + s.tw);
            const b = s.b * tw;
            const [r, gg, bb] = s.tint < 0.15 ? [b, b * 0.85, b * 0.7] : s.tint > 0.85 ? [b * 0.8, b * 0.9, b] : [b, b, b];
            g.fill(r, gg, bb);
            g.circle(s.x, s.y, s.r * 2);
            if (s.r > 1.6) { g.fill(r, gg, bb, 30); g.circle(s.x, s.y, s.r * 7); }
          }
        }
        if (!shooting && Math.random() < dt / 25) {
          const a = p.radians(20 + Math.random() * 40);
          shooting = { x: Math.random() * W, y: Math.random() * H * 0.5, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0 };
        }
        if (shooting) {
          const s = shooting;
          s.life += dt;
          s.x += s.vx * dt; s.y += s.vy * dt;
          const fade = Math.max(0, 1 - s.life / 0.9);
          g.strokeWeight(2);
          for (let k = 0; k < 10; k++) {
            g.stroke(255, 255, 240, 255 * fade * (1 - k / 10));
            g.line(s.x - s.vx * 0.012 * k, s.y - s.vy * 0.012 * k, s.x - s.vx * 0.012 * (k + 1), s.y - s.vy * 0.012 * (k + 1));
          }
          g.noStroke();
          if (fade <= 0) shooting = null;
        }
      },
      dispose() { neb.remove(); },
    };
  },
};
