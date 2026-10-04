// Starling murmuration at dusk. The flock's world is bigger than the wall, so birds
// drift in and out of frame like they would past a real window.
export default {
  name: 'boids',
  frame: 'house',                 // default window frame (stairwell)
  create(p, g, { W, H }) {
    const N = 700;
    const MX = W * 0.6, MY = H * 0.25;                  // world margin beyond the wall
    const X0 = -MX, X1 = W + MX, Y0 = -MY, Y1 = H * 0.8;
    const R_SEP = 12, R_NEI = 34, MAX_V = 170, MIN_V = 90, MAX_F = 260;
    const CELL = R_NEI;

    // Backdrop: dusk gradient + treeline, baked once.
    const bg = p.createGraphics(W, H);
    bg.pixelDensity(1);
    const stops = [[0, [10, 18, 48]], [0.45, [44, 50, 98]], [0.72, [150, 90, 110]], [0.88, [235, 140, 80]], [1, [250, 190, 110]]];
    for (let y = 0; y < H; y++) {
      const f = y / H;
      let i = 0;
      while (i < stops.length - 2 && f > stops[i + 1][0]) i++;
      const [fa, ca] = stops[i], [fb, cb] = stops[i + 1];
      const k = (f - fa) / (fb - fa);
      bg.stroke(ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k);
      bg.line(0, y, W, y);
    }
    bg.noStroke();
    bg.fill(8, 6, 14);
    bg.beginShape();
    bg.vertex(0, H);
    for (let x = 0; x <= W; x += 3) {
      const n = p.noise(x * 0.01, 7) * 0.6 + p.noise(x * 0.06, 9) * 0.4;
      bg.vertex(x, H * 0.9 - n * H * 0.08);
    }
    bg.vertex(W, H);
    bg.endShape(p.CLOSE);

    const boids = Array.from({ length: N }, () => {
      const a = Math.random() * Math.PI * 2;
      return {
        x: W / 2 + (Math.random() - 0.5) * W, y: H * 0.35 + (Math.random() - 0.5) * H * 0.3,
        vx: Math.cos(a) * MIN_V, vy: Math.sin(a) * MIN_V, s: 0.7 + Math.random() * 0.6,
      };
    });
    const grid = new Map();
    const key = (cx, cy) => cx * 73856093 ^ cy * 19349663;

    return {
      draw(t, dt) {
        dt = Math.min(dt, 1 / 20);
        grid.clear();
        for (const b of boids) {
          const k = key(Math.floor(b.x / CELL), Math.floor(b.y / CELL));
          let cell = grid.get(k);
          if (!cell) grid.set(k, (cell = []));
          cell.push(b);
        }
        // A wandering attractor shapes the flock into swirling blobs.
        const ax = W / 2 + (p.noise(t * 0.05, 1) - 0.5) * W * 1.6;
        const ay = H * 0.35 + (p.noise(t * 0.05, 2) - 0.5) * H * 0.6;

        for (const b of boids) {
          let sx = 0, sy = 0, avx = 0, avy = 0, cx = 0, cy = 0, n = 0;
          const gx = Math.floor(b.x / CELL), gy = Math.floor(b.y / CELL);
          for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
            const cell = grid.get(key(gx + ox, gy + oy));
            if (!cell) continue;
            for (const o of cell) {
              if (o === b) continue;
              const dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy;
              if (d2 > R_NEI * R_NEI) continue;
              n++;
              avx += o.vx; avy += o.vy; cx += o.x; cy += o.y;
              if (d2 < R_SEP * R_SEP && d2 > 0) { sx -= dx / d2; sy -= dy / d2; }
            }
          }
          let fx = 0, fy = 0;
          if (n) {
            fx += (avx / n - b.vx) * 1.1 + (cx / n - b.x) * 0.9 + sx * 2600;
            fy += (avy / n - b.vy) * 1.1 + (cy / n - b.y) * 0.9 + sy * 2600;
          }
          fx += (ax - b.x) * 0.12;
          fy += (ay - b.y) * 0.12;
          // Soft world bounds.
          if (b.x < X0) fx += (X0 - b.x) * 3; else if (b.x > X1) fx -= (b.x - X1) * 3;
          if (b.y < Y0) fy += (Y0 - b.y) * 3; else if (b.y > Y1) fy -= (b.y - Y1) * 3;
          const fm = Math.hypot(fx, fy);
          if (fm > MAX_F) { fx *= MAX_F / fm; fy *= MAX_F / fm; }
          b.vx += fx * dt; b.vy += fy * dt;
          const v = Math.hypot(b.vx, b.vy);
          const cl = Math.min(MAX_V, Math.max(MIN_V, v)) / v;
          b.vx *= cl; b.vy *= cl;
          b.x += b.vx * dt; b.y += b.vy * dt;
        }

        g.image(bg, 0, 0);
        // Birds go straight to the canvas as one path; per-line p5 calls are slow.
        const c = g.drawingContext;
        c.strokeStyle = 'rgb(12,10,20)';
        c.lineWidth = 1.8;
        c.lineCap = 'round';
        c.beginPath();
        for (const b of boids) {
          if (b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) continue;
          const v = Math.hypot(b.vx, b.vy), ux = b.vx / v, uy = b.vy / v;
          const flap = 1 + Math.sin(t * 18 + b.s * 40) * 0.6;
          const L = 4.5 * b.s;
          // Two wings swept back from the body.
          c.moveTo(b.x - ux * L - uy * L * flap, b.y - uy * L + ux * L * flap);
          c.lineTo(b.x, b.y);
          c.lineTo(b.x - ux * L + uy * L * flap, b.y - uy * L - ux * L * flap);
        }
        c.stroke();
        g.image(bg, 0, H * 0.8, W, H * 0.2, 0, H * 0.8, W, H * 0.2); // treeline in front of birds
      },
      dispose() { bg.remove(); },
    };
  },
};
