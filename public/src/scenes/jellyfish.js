// Bioluminescent jellyfish in black water. Each bell pulses and thrusts upward on the
// contraction, then drifts; tentacles trail behind as simple ropes. Far jellies are
// smaller, dimmer and slower. Mostly black, which is kind to a projector.
const TAU = Math.PI * 2;

const JELLY = {
  count: 9,
  colors: [[90, 220, 255], [255, 110, 220], [170, 130, 255], [120, 255, 200], [255, 190, 110]],
  specks: 260,
};

export default {
  name: 'jellyfish',
  frame: 'sub',                 // default window frame (stairwell)
  create(p, g, { W, H }) {
    const ctx = g.drawingContext;
    const rnd = (a, b) => a + Math.random() * (b - a);

    function spawn(y) {
      const depth = rnd(0.35, 1);                    // 1 = near
      const size = W * 0.07 * (0.6 + depth * 1.1);
      const col = JELLY.colors[Math.floor(Math.random() * JELLY.colors.length)];
      const x = rnd(0.1, 0.9) * W;
      const nt = 8 + Math.floor(Math.random() * 6);
      return {
        depth, size, col, x, y, vx: 0, vy: 0, tilt: 0,
        period: rnd(2.2, 3.6), phase: Math.random() * TAU, wander: Math.random() * 100,
        tentacles: Array.from({ length: nt }, (_, i) => ({
          u: (i + 0.5) / nt,                          // position along the rim, 0..1
          len: size * rnd(2.2, 4.5),
          pts: Array.from({ length: 16 }, (_, k) => ({ x, y: y + k * 4 })),
        })),
        arms: Array.from({ length: 4 }, (_, i) => ({ u: 0.3 + i * 0.13, pts: Array.from({ length: 12 }, (_, k) => ({ x, y: y + k * 4 })) })),
      };
    }
    const jellies = Array.from({ length: JELLY.count }, () => spawn(rnd(0, H)));
    jellies.sort((a, b) => a.depth - b.depth);

    const specks = Array.from({ length: JELLY.specks }, () => ({ x: Math.random() * W, y: Math.random() * H, r: rnd(0.4, 1.6), ph: Math.random() * TAU, sp: rnd(0.3, 1.5) }));

    // Rope: first point pinned, the rest follow with fixed spacing, trailing downward
    // (the jelly swims up) and swaying in the current.
    function rope(pts, ax, ay, seg, t, sway, ph) {
      pts[0].x = ax; pts[0].y = ay;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        b.y += seg * 0.35;                                         // hang down / trail
        b.x += Math.sin(t * 0.9 + ph + i * 0.45) * sway * (i / pts.length);
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        b.x = a.x + (dx / d) * seg; b.y = a.y + (dy / d) * seg;
      }
    }

    // A rope in three sections, each fainter and thinner than the last (cheaper than
    // one stroke per segment).
    function strokeFading(pts, col, alpha, w0, w1) {
      const n = pts.length, parts = 3;
      for (let k = 0; k < parts; k++) {
        const a = Math.floor((k * (n - 1)) / parts), b = Math.floor(((k + 1) * (n - 1)) / parts);
        const f = 1 - k / parts;
        ctx.strokeStyle = `rgba(${col},${alpha * f})`;
        ctx.lineWidth = w1 + (w0 - w1) * f;
        ctx.beginPath();
        ctx.moveTo(pts[a].x, pts[a].y);
        for (let i = a + 1; i <= b; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    }

    function bellShape(j, c) {
      // Contraction: bell narrows and deepens, then relaxes.
      const w = j.size * (1 - 0.18 * c), h = j.size * (0.62 + 0.2 * c);
      return { w, h };
    }

    function drawJelly(j, t) {
      const pulse = ((t / j.period + j.phase) % 1);
      const c = pulse < 0.3 ? Math.sin((pulse / 0.3) * Math.PI / 2) : Math.cos(((pulse - 0.3) / 0.7) * Math.PI / 2);
      const { w, h } = bellShape(j, c);
      const bright = 0.35 + 0.65 * j.depth;
      const [r, gg, b] = j.col;
      const rgba = (a) => `rgba(${r},${gg},${b},${a * bright})`;

      ctx.save();
      ctx.translate(j.x, j.y);
      ctx.rotate(j.tilt);

      // Halo.
      const halo = ctx.createRadialGradient(0, -h * 0.2, 0, 0, -h * 0.2, w * 2.2);
      halo.addColorStop(0, rgba(0.18)); halo.addColorStop(1, rgba(0));
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(0, -h * 0.2, w * 2.2, 0, TAU); ctx.fill();

      // Bell: a dome with a scalloped rim.
      const bell = ctx.createRadialGradient(0, -h * 0.55, w * 0.05, 0, -h * 0.2, w * 1.1);
      bell.addColorStop(0, rgba(0.55)); bell.addColorStop(0.6, rgba(0.28)); bell.addColorStop(1, rgba(0.08));
      ctx.fillStyle = bell;
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.bezierCurveTo(-w, -h * 1.35, w, -h * 1.35, w, 0);
      const sc = 10;
      for (let i = sc; i > 0; i--) {
        const x0 = w - ((sc - i) / sc) * 2 * w, x1 = w - ((sc - i + 1) / sc) * 2 * w;
        ctx.quadraticCurveTo((x0 + x1) / 2, h * 0.12, x1, 0);
      }
      ctx.fill();
      ctx.strokeStyle = rgba(0.8); ctx.lineWidth = 1.5;
      ctx.stroke();

      // Inner four-leaf pattern.
      ctx.fillStyle = rgba(0.35);
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.ellipse(Math.cos(k * TAU / 4 + 0.4) * w * 0.28, -h * 0.5 + Math.sin(k * TAU / 4 + 0.4) * h * 0.14, w * 0.16, h * 0.08, k * TAU / 4 + 0.4, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      return { w, c };
    }

    return {
      draw(t, dt) {
        dt = Math.min(dt, 0.05);
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#02060d'); bg.addColorStop(1, '#000104');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

        ctx.globalCompositeOperation = 'lighter';
        for (const s of specks) {
          s.y -= s.sp * 3 * dt;
          if (s.y < 0) { s.y = H; s.x = Math.random() * W; }
          const a = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(t * s.sp * 2 + s.ph));
          ctx.fillStyle = `rgba(150,230,255,${a})`;
          ctx.beginPath(); ctx.arc(s.x + Math.sin(t * 0.2 + s.ph) * 6, s.y, s.r, 0, TAU); ctx.fill();
        }

        for (const j of jellies) {
          // Swim: thrust upward during contraction, then sink slowly with drag.
          const pulse = ((t / j.period + j.phase) % 1);
          const thrust = pulse < 0.3 ? Math.sin((pulse / 0.3) * Math.PI) : 0;
          const heading = -Math.PI / 2 + (p.noise(j.wander, t * 0.05) - 0.5) * 1.2;
          const speed = j.size * 1.6 * (0.5 + 0.5 * j.depth);
          j.vx += Math.cos(heading) * thrust * speed * dt * 3;
          j.vy += Math.sin(heading) * thrust * speed * dt * 3 + j.size * 0.08 * dt;
          j.vx *= 1 - dt * 1.2; j.vy *= 1 - dt * 1.2;
          j.x += j.vx * dt; j.y += j.vy * dt;
          j.tilt += ((heading + Math.PI / 2) * 0.8 - j.tilt) * dt;
          if (j.x < j.size) j.vx += 20 * dt; if (j.x > W - j.size) j.vx -= 20 * dt;
          if (j.y < -j.size * 5) Object.assign(j, spawn(H + j.size * 2));   // swam off the top: a new one below

          const { w } = drawJelly(j, t);
          // Tentacles and oral arms, anchored on the (rotated) rim.
          const cos = Math.cos(j.tilt), sin = Math.sin(j.tilt);
          const at = (u, dy = 0) => { const lx = (u * 2 - 1) * w * 0.92; return [j.x + lx * cos - dy * sin, j.y + lx * sin + dy * cos]; };
          const bright = 0.35 + 0.65 * j.depth;
          ctx.lineCap = 'round';
          for (const tn of j.tentacles) {
            const [ax, ay] = at(tn.u);
            rope(tn.pts, ax, ay, tn.len / tn.pts.length, t, j.size * 0.25, tn.u * 9);
            strokeFading(tn.pts, j.col, 0.45 * bright, 1.2, 1.2);
          }
          for (const arm of j.arms) {
            const [ax, ay] = at(arm.u, 2);
            rope(arm.pts, ax, ay, j.size * 0.12, t, j.size * 0.15, arm.u * 20);
            strokeFading(arm.pts, j.col, 0.3 * bright, j.size * 0.12 + 1, 1);
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};
