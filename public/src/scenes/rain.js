// Rain on a window at night. Behind the glass, an out-of-focus city with bokeh lights
// and passing cars. On the glass, fine droplets keep landing; big drops hang, then
// slide down in stuttering runs, swallowing droplets and leaving a trail of beads.
// Each big drop shows the city sharp and upside down, like real refraction.
const TAU = Math.PI * 2;

const RAIN = {
  bigDrops: 34,
  droplets: 700,
  lightning: [40, 120],    // seconds between flashes
};

export default {
  name: 'rain',
  create(p, g, { W, H }) {
    const ctx = g.drawingContext;
    const rnd = (a, b) => a + Math.random() * (b - a);

    // ---- the city: drawn once sharp (seen inside drops) and once blurred ----
    const sharp = p.createGraphics(W, H); sharp.pixelDensity(1);
    const s = sharp.drawingContext;
    const sky = s.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0b0d1c'); sky.addColorStop(0.55, '#1c1a2e'); sky.addColorStop(0.8, '#3a2a2c'); sky.addColorStop(1, '#1a1214');
    s.fillStyle = sky; s.fillRect(0, 0, W, H);
    const lights = [];
    for (let i = 0; i < 16; i++) {                     // buildings with lit windows
      const bw = rnd(60, 180), bh = rnd(H * 0.15, H * 0.5), bx = rnd(-40, W), by = H * 0.85 - bh;
      s.fillStyle = `rgb(${rnd(10, 22)},${rnd(10, 20)},${rnd(18, 30)})`;
      s.fillRect(bx, by, bw, bh + H * 0.2);
      for (let y = by + 10; y < H * 0.84; y += 18) for (let x = bx + 8; x < bx + bw - 8; x += 16) {
        if (Math.random() < 0.35) {
          const warm = Math.random() < 0.8;
          const c = warm ? [255, rnd(170, 210), rnd(90, 130)] : [rnd(160, 200), rnd(200, 230), 255];
          s.fillStyle = `rgba(${c},${rnd(0.5, 1)})`;
          s.fillRect(x, y, 8, 10);
          if (Math.random() < 0.15) lights.push({ x: x + 4, y: y + 5, c, r: rnd(14, 34) });
        }
      }
    }
    for (let i = 0; i < 14; i++) {                     // street lamps
      const x = rnd(0, W), y = rnd(H * 0.8, H * 0.9), c = [255, 180, 90];
      s.fillStyle = 'rgba(255,200,120,1)'; s.beginPath(); s.arc(x, y, 3, 0, TAU); s.fill();
      lights.push({ x, y, c, r: rnd(30, 60) });
    }
    const blur = p.createGraphics(W, H); blur.pixelDensity(1);
    const b = blur.drawingContext;
    b.filter = 'blur(10px)';
    b.drawImage(sharp.canvas, 0, 0);
    b.filter = 'none';
    b.globalCompositeOperation = 'lighter';
    for (const l of lights) {                           // bokeh discs
      const grd = b.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      grd.addColorStop(0, `rgba(${l.c},0.35)`); grd.addColorStop(0.8, `rgba(${l.c},0.25)`); grd.addColorStop(1, `rgba(${l.c},0)`);
      b.fillStyle = grd; b.beginPath(); b.arc(l.x, l.y, l.r, 0, TAU); b.fill();
    }
    b.globalCompositeOperation = 'source-over';

    // ---- glass ----
    const droplets = Array.from({ length: RAIN.droplets }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(1.2, 4.5) }));
    const newBig = (y) => ({ x: rnd(0, W), y: y ?? rnd(0, H), r: rnd(8, 16), vy: 0, stuck: rnd(1, 12), run: 0, trail: 0, seed: Math.random() * 100 });
    const drops = Array.from({ length: RAIN.bigDrops }, () => newBig());
    const cars = [];
    const streaks = Array.from({ length: 90 }, () => ({ x: rnd(0, W), y: rnd(0, H), l: rnd(20, 60), v: rnd(900, 1400) }));
    let flash = 0, nextFlash = rnd(...RAIN.lightning);

    function drawBigDrop(d) {
      const rx = d.r, ry = d.r * (1 + Math.min(0.35, d.vy / 400));   // stretches as it runs
      ctx.save();
      ctx.beginPath(); ctx.ellipse(d.x, d.y, rx, ry, 0, 0, TAU); ctx.clip();
      // Refraction: a wide patch of the city around the drop, flipped and shrunk into
      // it: the glowing bokeh for colour, plus the sharp lights as crisp points.
      const span = d.r * 9;
      ctx.translate(d.x, d.y);
      ctx.scale(1, -1);
      ctx.drawImage(blur.canvas, d.x - span, d.y - span, span * 2, span * 2, -rx, -ry, rx * 2, ry * 2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.8;
      ctx.drawImage(sharp.canvas, d.x - span, d.y - span, span * 2, span * 2, -rx, -ry, rx * 2, ry * 2);
      ctx.restore();
      // Dark rim and a bright glint.
      const rim = ctx.createRadialGradient(d.x, d.y, d.r * 0.4, d.x, d.y, d.r * 1.05);
      rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(0.75, 'rgba(0,0,0,0.12)'); rim.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = rim; ctx.beginPath(); ctx.ellipse(d.x, d.y, rx, ry, 0, 0, TAU); ctx.fill();
      // Light focused through the drop: a bright crescent along its lower edge.
      ctx.strokeStyle = 'rgba(255,235,210,0.35)'; ctx.lineWidth = Math.max(1, d.r * 0.14);
      ctx.beginPath(); ctx.ellipse(d.x, d.y, rx * 0.8, ry * 0.8, 0, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(d.x - rx * 0.35, d.y - ry * 0.4, rx * 0.22, ry * 0.14, -0.5, 0, TAU); ctx.fill();
    }

    return {
      draw(t, dt) {
        dt = Math.min(dt, 0.05);
        g.image(blur, 0, 0);

        // Cars passing far below: headlights one way, tail lights the other.
        if (Math.random() < dt * 0.25) {
          const dir = Math.random() < 0.5 ? 1 : -1;
          cars.push({ x: dir > 0 ? -60 : W + 60, y: H * rnd(0.86, 0.93), v: dir * rnd(60, 140), c: dir > 0 ? '255,245,220' : '255,60,50' });
        }
        ctx.globalCompositeOperation = 'lighter';
        for (let i = cars.length - 1; i >= 0; i--) {
          const c = cars[i];
          c.x += c.v * dt;
          if (c.x < -80 || c.x > W + 80) { cars.splice(i, 1); continue; }
          for (const off of [-14, 14]) {
            const grd = ctx.createRadialGradient(c.x + off, c.y, 0, c.x + off, c.y, 22);
            grd.addColorStop(0, `rgba(${c.c},0.45)`); grd.addColorStop(1, `rgba(${c.c},0)`);
            ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(c.x + off, c.y, 22, 0, TAU); ctx.fill();
          }
        }
        // Rain falling beyond the glass: faint fast streaks.
        ctx.strokeStyle = 'rgba(180,190,220,0.08)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (const r of streaks) {
          r.y += r.v * dt; r.x += r.v * 0.08 * dt;
          if (r.y > H) { r.y = -r.l; r.x = rnd(0, W); }
          ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - r.l * 0.08, r.y - r.l);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';

        // Lightning somewhere far away: the whole scene flares briefly.
        nextFlash -= dt;
        if (nextFlash <= 0) { flash = 1; nextFlash = rnd(...RAIN.lightning); }
        if (flash > 0) {
          const f = flash * (0.6 + 0.4 * Math.sin(t * 60));
          ctx.fillStyle = `rgba(200,210,255,${f * 0.35})`; ctx.fillRect(0, 0, W, H);
          flash = Math.max(0, flash - dt * 2.5);
        }

        // Fine droplets keep landing.
        for (let k = 0; k < 6; k++) if (Math.random() < dt * 8) droplets.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(1.2, 4.5) });
        if (droplets.length > RAIN.droplets * 1.3) droplets.splice(0, droplets.length - RAIN.droplets * 1.3);

        // Big drops: hang, then run in stuttering bursts, eating what they touch.
        for (const d of drops) {
          if (d.stuck > 0) {
            d.stuck -= dt;
            if (d.stuck <= 0) { d.run = rnd(0.3, 2.5); d.vy = 0; }
          } else {
            d.run -= dt;
            d.vy = Math.min(d.vy + 600 * dt, 90 + d.r * 18);
            if (d.run <= 0) { d.stuck = rnd(0.2, 3) / (d.r / 8); d.vy = 0; }
            d.y += d.vy * dt;
            d.x += (p.noise(d.seed, d.y * 0.02) - 0.5) * 50 * dt;
            d.trail += d.vy * dt;
            if (d.trail > 9) {                            // leave beads behind
              d.trail = 0;
              if (Math.random() < 0.6) droplets.push({ x: d.x + rnd(-1, 1), y: d.y - d.r * 1.3, r: rnd(1.2, 2.6) });
              d.r = Math.max(6, d.r - 0.05);
            }
          }
          for (let i = droplets.length - 1; i >= 0; i--) {
            const q = droplets[i];
            if (Math.abs(q.x - d.x) < d.r + q.r && Math.abs(q.y - d.y) < d.r + q.r && Math.hypot(q.x - d.x, q.y - d.y) < d.r + q.r * 0.5) {
              if (q.y > d.y - d.r) {                       // only what lies in its path
                d.r = Math.min(22, Math.sqrt(d.r * d.r + q.r * q.r));
                droplets.splice(i, 1);
              }
            }
          }
          if (d.y - d.r > H) Object.assign(d, newBig(-d.r));
        }

        // Draw: droplets as tiny lenses (dark rim, bright top), then the big drops.
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        for (const q of droplets) { ctx.moveTo(q.x + q.r, q.y + 0.4); ctx.arc(q.x, q.y + 0.4, q.r, 0, TAU); }
        ctx.fill();
        ctx.fillStyle = 'rgba(225,230,255,0.28)';
        ctx.beginPath();
        for (const q of droplets) { ctx.moveTo(q.x + q.r * 0.7, q.y - q.r * 0.2); ctx.arc(q.x, q.y - q.r * 0.2, q.r * 0.7, 0, TAU); }
        ctx.fill();
        drops.forEach(drawBigDrop);
      },
      dispose() { sharp.remove(); blur.remove(); },
    };
  },
};
