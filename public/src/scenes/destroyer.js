// Homage to a certain opening shot: a desert planet's curve along the bottom, two
// moons, a small ship fleeing toward the planet under laser fire, then the underside
// of an enormous wedge-shaped capital ship sliding in overhead, nose first. It hangs
// there a while, then recedes toward the planet, engines glowing, and the loop restarts.
const TAU = Math.PI * 2;

// Timeline (seconds) and look. Tweak here.
const SHOT = {
  loop: 180,
  runner: [4, 30],         // the small ship: enters, reaches the planet
  enter: [10, 70],         // the big ship slides in until its nose is at `hold` of the wall
  hold: 0.62,
  leave: [140, 176],       // recedes toward the planet
  shipLength: 2.2,         // × wall height, at full size
  shipWidth: 0.56,         // width / length (a long wedge)
  tilt: 0.06,              // radians off vertical
};

// ?seek=90 in the URL starts the loop 90 s in (to preview a moment).
const SEEK = typeof location !== 'undefined' ? +new URLSearchParams(location.search).get('seek') || 0 : 0;

export default {
  name: 'destroyer',
  create(p, g, { W, H }) {
    const ctx = g.drawingContext;
    const rnd = (a, b) => a + Math.random() * (b - a);

    // ---- stars, planet and moons: baked once ----
    const sky = p.createGraphics(W, H);
    sky.pixelDensity(1);
    const sc = sky.drawingContext;
    sc.fillStyle = '#000'; sc.fillRect(0, 0, W, H);
    for (let i = 0; i < 1600; i++) {
      const b = Math.random() ** 3;
      const tint = Math.random();
      sc.fillStyle = tint < 0.1 ? `rgba(255,220,190,${0.3 + b})` : tint > 0.9 ? `rgba(190,210,255,${0.3 + b})` : `rgba(255,255,255,${0.25 + b * 0.75})`;
      const r = 0.4 + b * 1.3;
      sc.beginPath(); sc.arc(Math.random() * W, Math.random() * H, r, 0, TAU); sc.fill();
    }

    // Planet: a huge sphere whose top arc fills the bottom of the wall.
    const R = W * 1.7, pcx = W * 0.62, pcy = H + R * 0.74;
    const sun = [0.55, -0.6, 0.58];                     // light from the upper right, toward the viewer
    const top = Math.floor(pcy - R - 40);
    const img = sky.drawingContext.getImageData(0, top, W, H - top);
    p.noiseSeed(Math.floor(Math.random() * 1e5));
    for (let y = top; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - pcx) / R, dy = (y - pcy) / R, d2 = dx * dx + dy * dy;
        const i = 4 * ((y - top) * W + x);
        if (d2 > 1) {
          // Atmosphere: a thin warm-blue halo just outside the limb.
          const h = Math.max(0, 1 - (Math.sqrt(d2) - 1) * R / 28);
          const a = h ** 2 * 0.8;
          img.data[i] += (170 - img.data[i]) * a; img.data[i + 1] += (190 - img.data[i + 1]) * a; img.data[i + 2] += (230 - img.data[i + 2]) * a;
          continue;
        }
        const dz = Math.sqrt(1 - d2);
        const lit = Math.max(0, dx * sun[0] + dy * sun[1] + dz * sun[2]);
        // Latitude-ish dune bands and blotches, seen on the sphere.
        const u = Math.atan2(dx, dz) * 3, v = Math.asin(dy) * 3;
        const n = p.noise(u * 1.5 + 10, v * 6) * 0.6 + p.noise(u * 6, v * 14 + 5) * 0.4;
        const sand = [196 + n * 50, 160 + n * 42, 112 + n * 30];
        const shade = 0.08 + lit * 0.95;
        const limb = Math.max(0, 1 - dz * 4);           // haze near the edge
        for (let c = 0; c < 3; c++) {
          const base = sand[c] * shade;
          img.data[i + c] = base + ([200, 210, 235][c] * lit - base) * limb * 0.55;
        }
      }
    }
    sky.drawingContext.putImageData(img, 0, top);
    // Two moons above the limb.
    for (const [mx, my, mr, col] of [[W * 0.2, H * 0.66, W * 0.05, [200, 190, 170]], [W * 0.33, H * 0.7, W * 0.028, [170, 175, 185]]]) {
      const grd = sc.createRadialGradient(mx + mr * 0.4, my - mr * 0.4, mr * 0.1, mx, my, mr);
      grd.addColorStop(0, `rgb(${col})`);
      grd.addColorStop(1, `rgb(${col.map((c) => c * 0.25)})`);
      sc.fillStyle = grd;
      sc.beginPath(); sc.arc(mx, my, mr, 0, TAU); sc.fill();
    }

    // ---- the capital ship's underside: baked once at 3/4 scale ----
    const L = H * SHOT.shipLength, Wd = L * SHOT.shipWidth, K = 0.75;
    const ship = p.createGraphics(Math.ceil(Wd * K), Math.ceil(L * K));
    ship.pixelDensity(1);
    const s = ship.drawingContext;
    s.scale(K, K);
    // Local coords: nose at (Wd/2, L), rear edge along y = 0.
    const hull = () => { s.beginPath(); s.moveTo(Wd / 2, L); s.lineTo(0, 0); s.lineTo(Wd, 0); s.closePath(); };
    hull();
    s.save();
    s.clip();
    const base = s.createLinearGradient(0, 0, Wd, 0);
    base.addColorStop(0, '#26282d'); base.addColorStop(0.5, '#44474e'); base.addColorStop(1, '#5a5d65');
    s.fillStyle = base; s.fillRect(0, 0, Wd, L);
    const halfAt = (y) => (Wd / 2) * (1 - y / L);
    const lightAt = (x) => 0.75 + 0.5 * (x / Wd);   // lit from the right
    const spot = (y) => Wd / 2 + (Math.random() * 2 - 1) * halfAt(y);
    // 1. Large hull plates: big, low-contrast.
    for (let i = 0; i < 900; i++) {
      const y = Math.random() * L, x = spot(y), w = rnd(40, 140), h = rnd(60, 260);
      const v = (58 + rnd(-10, 10)) * lightAt(x);
      s.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
      s.fillRect(x - w / 2, y - h / 2, w, h);
    }
    // 2. Fine greebles, denser toward the keel, each with a thin shadow edge.
    for (let i = 0; i < 16000; i++) {
      const y = Math.random() * L, hw = halfAt(y);
      const x = Wd / 2 + (Math.random() ** 1.4) * hw * (Math.random() < 0.5 ? -1 : 1);
      const w = rnd(3, 16), h = rnd(3, 22);
      const v = (50 + rnd(0, 45)) * lightAt(x);
      s.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
      s.fillRect(x - w / 2, y - h / 2, w, h);
      s.fillStyle = 'rgba(0,0,0,0.45)';
      s.fillRect(x - w / 2, y + h / 2, w, 1.5);
    }
    // 3. Tiny dark vents and ports.
    s.fillStyle = 'rgba(10,10,14,0.6)';
    for (let i = 0; i < 9000; i++) { const y = Math.random() * L; s.fillRect(spot(y), y, rnd(1, 3), rnd(1, 4)); }
    // Chevron plating seams parallel to each edge.
    s.strokeStyle = 'rgba(12,13,17,0.55)'; s.lineWidth = 2;
    for (let k = 0.08; k < 1; k += 0.07) {
      s.beginPath();
      s.moveTo(Wd / 2 - k * Wd / 2, 0); s.lineTo(Wd / 2, L * (1 - k)); s.lineTo(Wd / 2 + k * Wd / 2, 0);
      s.stroke();
    }
    // Keel: a raised spine, lit on one side and shadowed on the other.
    const kw = Wd * 0.022;
    s.fillStyle = '#4b4e56'; s.fillRect(Wd / 2 - kw / 2, 0, kw, L * 0.95);
    s.fillStyle = '#62656e'; s.fillRect(Wd / 2, 0, kw / 2, L * 0.95);
    s.fillStyle = 'rgba(0,0,0,0.5)'; s.fillRect(Wd / 2 - kw / 2 - 3, 0, 3, L * 0.95);
    for (let y = 20; y < L * 0.93; y += rnd(20, 70)) { s.fillStyle = 'rgba(0,0,0,0.4)'; s.fillRect(Wd / 2 - kw / 2, y, kw, 2); }
    // Hangar bay: a recess with a faint glow from inside.
    const bx = Wd / 2 - Wd * 0.035, by = L * 0.42, bw = Wd * 0.07, bh = L * 0.035;
    s.fillStyle = '#121317'; s.fillRect(bx, by, bw, bh);
    const bay = s.createLinearGradient(0, by, 0, by + bh);
    bay.addColorStop(0, 'rgba(150,180,255,0.05)'); bay.addColorStop(1, 'rgba(150,180,255,0.3)');
    s.fillStyle = bay; s.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
    // Warm light bouncing off the planet onto the nose; the far side in shadow.
    const bounce = s.createLinearGradient(0, L * 0.4, 0, L);
    bounce.addColorStop(0, 'rgba(255,190,120,0)'); bounce.addColorStop(1, 'rgba(255,190,120,0.18)');
    s.fillStyle = bounce; s.fillRect(0, 0, Wd, L);
    // Running lights.
    for (let i = 0; i < 260; i++) {
      const y = Math.random() * L, x = Wd / 2 + (Math.random() * 2 - 1) * halfAt(y) * 0.95;
      s.fillStyle = Math.random() < 0.8 ? 'rgba(255,245,220,0.9)' : 'rgba(255,200,120,0.9)';
      s.fillRect(x, y, 2.5, 2.5);
    }
    s.restore();
    // Bright bevels along the two long edges.
    s.strokeStyle = '#8d9098'; s.lineWidth = 4;
    s.beginPath(); s.moveTo(0, 0); s.lineTo(Wd / 2, L); s.lineTo(Wd, 0); s.stroke();
    // Engines stick out beyond the rear edge; drawn live so they can glow.
    const engines = [[-0.16, 0.055], [0, 0.07], [0.16, 0.055], [-0.3, 0.03], [0.3, 0.03]];

    // ---- ships' positions over time ----
    const ease = (u) => u * u * (3 - 2 * u);
    const clamp01 = (u) => Math.max(0, Math.min(1, u));
    function bigShip(t) {
      const ein = ease(clamp01((t - SHOT.enter[0]) / (SHOT.enter[1] - SHOT.enter[0])));
      const eout = clamp01((t - SHOT.leave[0]) / (SHOT.leave[1] - SHOT.leave[0]));
      const holdY = H * SHOT.hold;
      // Receding: nose heads for the planet while the whole ship shrinks.
      const scale = 1 - 0.8 * ease(eout);
      const noseY = -L * 0.02 + (holdY + L * 0.02) * ein + (H * 0.8 - holdY) * ease(eout) + Math.sin(t * 0.05) * 6;
      const alpha = 1 - clamp01((t - (SHOT.leave[1] - 5)) / 5);
      return { x: W * 0.5, y: noseY, scale, alpha, visible: t > SHOT.enter[0] && alpha > 0 };
    }
    function runner(t) {
      const u = clamp01((t - SHOT.runner[0]) / (SHOT.runner[1] - SHOT.runner[0]));
      return { u, x: W * (0.62 - 0.12 * u), y: -60 + (H * 0.74) * (1 - (1 - u) ** 1.6), size: 70 * (1 - u * 0.88), on: t > SHOT.runner[0] && u < 1 };
    }

    const bolts = [];
    function fire(t, dt, run) {
      if (!run.on || run.u > 0.85) return;
      if (Math.random() < dt * 4) {   // green bolts from somewhere overhead
        const sx = W * rnd(0.3, 0.8), sy = -20;
        const ang = Math.atan2(run.y - sy, run.x + rnd(-40, 40) - sx);
        bolts.push({ x: sx, y: sy, vx: Math.cos(ang) * 900, vy: Math.sin(ang) * 900, col: '120,255,140', life: 1.2 });
      }
      if (Math.random() < dt * 1.2) { // the runner shoots back
        const ang = -Math.PI / 2 + rnd(-0.4, 0.4);
        bolts.push({ x: run.x, y: run.y, vx: Math.cos(ang) * 700, vy: Math.sin(ang) * 700, col: '255,90,70', life: 1 });
      }
    }

    function drawRunner(run, t) {
      const sz = run.size;
      ctx.save();
      ctx.translate(run.x, run.y);
      ctx.rotate(Math.PI / 2 + 0.12);            // heading down toward the planet
      ctx.fillStyle = '#c9ccd2';
      ctx.fillRect(-sz * 0.5, -sz * 0.07, sz * 0.8, sz * 0.14);   // long body
      ctx.fillRect(sz * 0.22, -sz * 0.16, sz * 0.2, sz * 0.32);   // hammerhead
      ctx.fillStyle = '#9ea2aa';
      ctx.fillRect(-sz * 0.55, -sz * 0.2, sz * 0.14, sz * 0.4);   // engine block
      ctx.globalCompositeOperation = 'lighter';
      for (let k = -2; k <= 2; k++) {
        const grd = ctx.createRadialGradient(-sz * 0.58, k * sz * 0.075, 0, -sz * 0.58, k * sz * 0.075, sz * 0.12);
        grd.addColorStop(0, 'rgba(255,230,200,0.95)'); grd.addColorStop(1, 'rgba(255,120,60,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(-sz * 0.58, k * sz * 0.075, sz * 0.12, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    return {
      draw(tAbs, dt) {
        dt = Math.min(dt, 0.05);
        const t = (tAbs + SEEK) % SHOT.loop;
        g.image(sky, 0, 0);

        const run = runner(t);
        fire(t, dt, run);
        if (run.on) drawRunner(run, t);

        // Laser bolts: short bright streaks with a soft glow.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let i = bolts.length - 1; i >= 0; i--) {
          const b = bolts[i];
          b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
          if (b.life <= 0) { bolts.splice(i, 1); continue; }
          const len = 0.05;
          for (const [w, a] of [[7, 0.18], [3, 0.5], [1.5, 1]]) {
            ctx.strokeStyle = `rgba(${b.col},${a})`; ctx.lineWidth = w;
            ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * len, b.y - b.vy * len); ctx.stroke();
          }
        }
        ctx.restore();

        const big = bigShip(t);
        if (big.visible) {
          ctx.save();
          ctx.globalAlpha = big.alpha;
          ctx.translate(big.x, big.y);
          ctx.rotate(SHOT.tilt);
          ctx.scale(big.scale, big.scale);
          // Nose at the origin, hull extending up (negative y).
          ctx.drawImage(ship.canvas, -Wd / 2, -L, Wd, L);
          // Engine glow past the rear edge, flickering slightly.
          ctx.globalCompositeOperation = 'lighter';
          for (const [ex, er] of engines) {
            const r = er * Wd * (1 + 0.04 * Math.sin(tAbs * 13 + ex * 50));
            const grd = ctx.createRadialGradient(ex * Wd, -L - r * 0.2, 0, ex * Wd, -L - r * 0.2, r * 1.6);
            grd.addColorStop(0, 'rgba(235,245,255,1)'); grd.addColorStop(0.35, 'rgba(140,190,255,0.8)'); grd.addColorStop(1, 'rgba(60,100,255,0)');
            ctx.fillStyle = grd;
            ctx.beginPath(); ctx.arc(ex * Wd, -L - r * 0.2, r * 1.6, 0, TAU); ctx.fill();
          }
          ctx.restore();
        }
      },
      dispose() { sky.remove(); ship.remove(); },
    };
  },
};
