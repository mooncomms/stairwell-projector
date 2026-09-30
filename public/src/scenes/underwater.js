// A window into a kelp forest: shader water (light shafts, rippling surface seen from
// below, caustics on the sand), two schools of fish at different depths, swaying kelp,
// marine snow, bubble streams, and now and then a manta ray gliding past.
const TAU = Math.PI * 2;

// Tweakables.
const SEA = {
  surface: [70, 170, 190],   // water colour just under the surface
  mid: [12, 78, 112],        // halfway down
  deep: [3, 26, 48],         // at the sea floor
  rays: 0.45,                // strength of the light shafts
  fishFar: 140, fishNear: 55,
  kelp: 9,                   // strands (a few more are added at the edges as framing)
  mantaEvery: [40, 90],      // seconds between manta passes
};

const VERT = `
precision highp float;
attribute vec3 aPosition;
void main() { vec4 p = vec4(aPosition, 1.0); p.xy = p.xy * 2.0 - 1.0; gl_Position = p; }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uSurface, uMid, uDeep;
uniform float uRays;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float hash(float x) { return fract(sin(x * 91.7) * 43758.5453); }
float noise1(float x) { float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }

// Animated Worley noise: F2 - F1 is small along cell borders — bright caustic lines.
float caustic(vec2 p, float t, float soft) {
  vec2 i = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = hash2(i + g);
    o = 0.5 + 0.45 * sin(t + TAU_ * o);
    float d = length(g + o - f);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return pow(1.0 - smoothstep(0.0, soft, f2 - f1), 2.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float v = 1.0 - uv.y;                 // 0 at the surface (top) → 1 at the floor
  float t = uTime;

  vec3 col = v < 0.5 ? mix(uSurface, uMid, v / 0.5) : mix(uMid, uDeep, (v - 0.5) / 0.5);

  // Light shafts slanting down from the sun, swaying and fading with depth.
  float s = uv.x * 7.0 + v * 2.6;
  float ray = noise1(s + sin(t * 0.07) * 1.5) * noise1(s * 2.3 - t * 0.05 + 4.0);
  ray = pow(ray, 2.5) * pow(1.0 - v, 1.6);
  col += vec3(0.55, 0.8, 0.85) * ray * uRays;

  // The surface seen from below: a bright rippling band at the very top.
  if (v < 0.09) {
    // Ripple patches, stretched sideways as the surface recedes into perspective.
    vec2 sp = vec2(uv.x * 4.0, v * 40.0 + t * 0.15);
    float c = caustic(sp, t * 0.7, 0.5) * 0.6 + caustic(sp * 1.9 + 7.0, t, 0.6) * 0.4;
    float fade = 1.0 - smoothstep(0.0, 0.09, v);
    col = mix(col, vec3(0.78, 0.95, 0.97), fade * (0.45 + 0.55 * c) * 0.75);
  }

  // Dappled light on the sandy floor behind the rocks.
  if (v > 0.88) {
    vec2 fp = vec2(uv.x * 9.0, (v - 0.88) * 45.0);
    float c = caustic(fp, t * 0.8, 0.3) * 0.6 + caustic(fp * 1.7 + 3.1, t * 1.1, 0.3) * 0.4;
    float k = smoothstep(0.88, 0.93, v);
    col = mix(col, vec3(0.16, 0.2, 0.19), k * 0.6) + vec3(0.3, 0.45, 0.4) * c * k * 0.35;
  }
  gl_FragColor = vec4(col, 1.0);
}`.replace(/TAU_/g, '6.2831853');

export default {
  name: 'underwater',
  create(p, g, { W, H }) {
    const ctx = g.drawingContext;

    // Water at half resolution; it's all soft light, so upscaling costs nothing.
    const water = p.createGraphics(Math.ceil(W / 2), Math.ceil(H / 2), p.WEBGL);
    water.pixelDensity(1);
    const sh = water.createShader(VERT, FRAG);
    const norm = (c) => c.map((v) => v / 255);

    // Water colour at a height, matching the shader — used to fade distant things.
    const waterAt = (y) => {
      const v = Math.max(0, Math.min(1, y / H));
      const [a, b, k] = v < 0.5 ? [SEA.surface, SEA.mid, v / 0.5] : [SEA.mid, SEA.deep, (v - 0.5) / 0.5];
      return a.map((c, i) => c + (b[i] - c) * k);
    };
    const fog = (col, y, amount) => {
      const w = waterAt(y);
      return `rgb(${col.map((c, i) => Math.round(c + (w[i] - c) * amount)).join(',')})`;
    };

    // ---- sea floor: two layers of rocks, baked ----
    const floor = p.createGraphics(W, H);
    floor.pixelDensity(1);
    const seed = Math.random() * 1000;
    function rockLine(base, amp, freq, off) {
      const pts = [];
      for (let x = 0; x <= W; x += 4) {
        const n = p.noise(x * freq + off, seed) * 0.7 + p.noise(x * freq * 4 + off, seed + 5) * 0.3;
        pts.push([x, base - n * amp]);
      }
      return pts;
    }
    for (const [base, amp, freq, off, col, fogK] of [
      [H * 0.93, H * 0.09, 0.004, 10, [20, 40, 45], 0.55],
      [H * 0.99, H * 0.07, 0.006, 50, [8, 18, 24], 0.15],
    ]) {
      const c = floor.drawingContext;
      c.fillStyle = fog(col, base, fogK);
      c.beginPath();
      c.moveTo(0, H);
      rockLine(base, amp, freq, off).forEach(([x, y]) => c.lineTo(x, y));
      c.lineTo(W, H);
      c.fill();
    }

    // ---- kelp ----
    const kelp = [];
    const addKelp = (x, near) => kelp.push({
      x, near,
      h: H * (near ? 0.55 + Math.random() * 0.35 : 0.35 + Math.random() * 0.35),
      w: near ? 14 + Math.random() * 8 : 6 + Math.random() * 4,
      phase: Math.random() * TAU,
      blades: Math.floor(10 + Math.random() * 8),
    });
    for (let i = 0; i < SEA.kelp; i++) addKelp(Math.random() * W, Math.random() < 0.3);
    addKelp(W * 0.04, true); addKelp(W * 0.1, true); addKelp(W * 0.93, true);  // framing
    kelp.sort((a, b) => a.near - b.near);

    function drawKelp(k, t) {
      const base = H * (k.near ? 0.99 : 0.92), n = 24;
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const sway = Math.sin(t * 0.45 + k.phase + u * 2.2) * 40 * u ** 1.5 + Math.sin(t * 0.9 + k.phase * 2 + u * 5) * 8 * u;
        pts.push([k.x + sway, base - u * k.h]);
      }
      const col = k.near ? fog([45, 42, 18], base - k.h * 0.5, 0.1) : fog([70, 68, 30], base - k.h * 0.5, 0.55);
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      // Stipe: a tapered ribbon.
      ctx.beginPath();
      pts.forEach(([x, y], i) => { const w = k.w * 0.35 * (1 - (i / n) * 0.6); i ? ctx.lineTo(x - w, y) : ctx.moveTo(x - w, y); });
      for (let i = n; i >= 0; i--) { const [x, y] = pts[i]; ctx.lineTo(x + k.w * 0.35 * (1 - (i / n) * 0.6), y); }
      ctx.fill();
      // Blades alternating left and right, drooping with the current.
      for (let b = 0; b < k.blades; b++) {
        const u = 0.15 + (b / k.blades) * 0.85, i = Math.round(u * n), [x, y] = pts[i];
        const side = b % 2 ? 1 : -1;
        // Buoyant blades float up and out, rippling in the current.
        const ang = -Math.PI / 2 + side * (0.45 + 0.2 * Math.sin(t * 0.8 + b + k.phase)) + Math.sin(t * 0.45 + k.phase + u * 2.2) * 0.25;
        const len = k.w * (3.6 + (b % 3) * 0.9) * (1 - u * 0.35);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.ellipse(len / 2, 0, len / 2, k.w * 0.26, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    // ---- fish schools (boids) ----
    function school(n, band, size, col, fogK, speed) {
      const fish = Array.from({ length: n }, () => ({
        x: Math.random() * W, y: band[0] + Math.random() * (band[1] - band[0]),
        vx: (Math.random() - 0.5) * speed, vy: (Math.random() - 0.5) * speed * 0.3,
        s: size * (0.8 + Math.random() * 0.4), wag: Math.random() * TAU,
      }));
      return { fish, band, col: fog(col, (band[0] + band[1]) / 2, fogK), belly: fog(col.map((c) => c + 60), (band[0] + band[1]) / 2, fogK), speed, seed: Math.random() * 100 };
    }
    const schools = [
      school(SEA.fishFar, [H * 0.2, H * 0.55], 6, [30, 50, 60], 0.6, 55),
      school(SEA.fishNear, [H * 0.35, H * 0.75], 15, [40, 55, 70], 0.2, 80),
    ];

    function stepSchool(sc, t, dt) {
      const R = sc.fish[0].s * 5, SEP = sc.fish[0].s * 2.2;
      const ax = W / 2 + (p.noise(sc.seed, t * 0.03) - 0.5) * W * 2.2;
      const ay = (sc.band[0] + sc.band[1]) / 2 + (p.noise(sc.seed + 5, t * 0.04) - 0.5) * (sc.band[1] - sc.band[0]);
      for (const f of sc.fish) {
        let cx = 0, cy = 0, vx = 0, vy = 0, sx = 0, sy = 0, n = 0;
        for (const o of sc.fish) {
          if (o === f) continue;
          const dx = o.x - f.x, dy = o.y - f.y, d2 = dx * dx + dy * dy;
          if (d2 > R * R) continue;
          n++; cx += o.x; cy += o.y; vx += o.vx; vy += o.vy;
          if (d2 < SEP * SEP && d2 > 0) { sx -= dx / d2; sy -= dy / d2; }
        }
        let fx = (ax - f.x) * 0.05, fy = (ay - f.y) * 0.08;
        if (n) {
          fx += (cx / n - f.x) * 0.4 + (vx / n - f.vx) * 1.2 + sx * SEP * 40;
          fy += (cy / n - f.y) * 0.4 + (vy / n - f.vy) * 1.2 + sy * SEP * 40;
        }
        if (f.y < sc.band[0]) fy += (sc.band[0] - f.y) * 2; else if (f.y > sc.band[1]) fy -= (f.y - sc.band[1]) * 2;
        f.vx += fx * dt; f.vy += fy * dt;
        f.vy *= 0.98;                                     // fish prefer to swim level
        const v = Math.hypot(f.vx, f.vy), max = sc.speed * 1.4, min = sc.speed * 0.5;
        const k = Math.min(max, Math.max(min, v)) / (v || 1);
        f.vx *= k; f.vy *= k;
        f.x += f.vx * dt; f.y += f.vy * dt;
        f.wag += dt * (6 + v * 0.05);
      }
    }

    function drawSchool(sc) {
      for (const f of sc.fish) {
        if (f.x < -30 || f.x > W + 30) continue;
        const dir = f.vx < 0 ? -1 : 1, s = f.s;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(Math.atan2(f.vy, Math.abs(f.vx)) * dir * 0.8);
        ctx.scale(dir, 1);
        ctx.fillStyle = sc.col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s, s * 0.38, 0, 0, TAU);          // body
        const wag = Math.sin(f.wag) * s * 0.25;
        ctx.moveTo(-s * 0.8, 0);                              // tail
        ctx.lineTo(-s * 1.55, -s * 0.42 + wag);
        ctx.lineTo(-s * 1.45, wag * 0.5);
        ctx.lineTo(-s * 1.55, s * 0.42 + wag);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = sc.belly;                             // lighter flank catching the light
        ctx.beginPath();
        ctx.ellipse(s * 0.1, -s * 0.08, s * 0.6, s * 0.12, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    // ---- marine snow ----
    const snow = Array.from({ length: 220 }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() ** 3 * 2.2, a: 0.25 + Math.random() * 0.45, ph: Math.random() * TAU,
    }));

    // ---- bubbles ----
    const bubbles = [];
    const vents = Array.from({ length: 3 }, () => ({ x: W * (0.15 + Math.random() * 0.7), on: Math.random() < 0.5, next: Math.random() * 10 }));

    // ---- manta ----
    let manta = null, mantaNext = 8 + Math.random() * 15;
    function drawManta(m, t) {
      const flap = Math.sin(t * 1.1) * 0.18;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.scale(m.dir * m.size, m.size);
      ctx.rotate(Math.sin(t * 0.3) * 0.05);
      ctx.fillStyle = fog([15, 25, 35], m.y, 0.55);
      ctx.beginPath();
      // Seen from above-ish: nose at +x, wings sweeping back, flapping tips.
      ctx.moveTo(0.5, -0.06);
      ctx.quadraticCurveTo(0.58, -0.02, 0.55, 0.02);                // cephalic fin
      ctx.quadraticCurveTo(0.3, 0.1, 0.05, 0.55 + flap);             // leading edge, right wing
      ctx.quadraticCurveTo(-0.05, 0.3 + flap * 0.5, -0.25, 0.08);    // trailing edge
      ctx.lineTo(-0.7, 0.01);                                        // tail
      ctx.lineTo(-0.7, -0.01);
      ctx.lineTo(-0.25, -0.08);
      ctx.quadraticCurveTo(-0.05, -0.3 - flap * 0.5, 0.05, -0.55 - flap);
      ctx.quadraticCurveTo(0.3, -0.1, 0.55, -0.02);
      ctx.quadraticCurveTo(0.58, -0.06, 0.5, -0.06);
      ctx.fill();
      ctx.restore();
    }

    return {
      draw(t, dt) {
        dt = Math.min(dt, 0.05);
        water.shader(sh);
        sh.setUniform('uRes', [water.width, water.height]);
        sh.setUniform('uTime', t);
        sh.setUniform('uSurface', norm(SEA.surface));
        sh.setUniform('uMid', norm(SEA.mid));
        sh.setUniform('uDeep', norm(SEA.deep));
        sh.setUniform('uRays', SEA.rays);
        water.noStroke();
        water.rect(0, 0, water.width, water.height);
        g.image(water, 0, 0, W, H);

        // Far to near: distant fish, far kelp, manta, rocks, near fish, near kelp.
        schools.forEach((sc) => stepSchool(sc, t, dt));
        drawSchool(schools[0]);
        kelp.filter((k) => !k.near).forEach((k) => drawKelp(k, t));

        mantaNext -= dt;
        if (!manta && mantaNext <= 0) {
          const dir = Math.random() < 0.5 ? 1 : -1;
          manta = { dir, x: dir > 0 ? -W * 0.4 : W * 1.4, y: H * (0.25 + Math.random() * 0.3), size: W * (0.35 + Math.random() * 0.15), v: W * 0.06 };
        }
        if (manta) {
          manta.x += manta.dir * manta.v * dt;
          manta.y += Math.sin(t * 0.2) * 3 * dt;
          drawManta(manta, t);
          if (manta.x < -W * 0.5 || manta.x > W * 1.5) {
            manta = null;
            mantaNext = SEA.mantaEvery[0] + Math.random() * (SEA.mantaEvery[1] - SEA.mantaEvery[0]);
          }
        }

        g.image(floor, 0, 0);
        drawSchool(schools[1]);

        // Bubbles rise from vents on the floor, wobbling and speeding up.
        for (const v of vents) {
          v.next -= dt;
          if (v.next <= 0) { v.on = !v.on; v.next = v.on ? 4 + Math.random() * 6 : 8 + Math.random() * 20; }
          if (v.on && Math.random() < dt * 5) bubbles.push({ x: v.x + (Math.random() - 0.5) * 6, y: H * 0.95, r: 1.5 + Math.random() * 3.5, vy: 30, ph: Math.random() * TAU });
        }
        ctx.lineWidth = 1;
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const b = bubbles[i];
          b.vy = Math.min(b.vy + 40 * dt, 160);
          b.y -= b.vy * dt;
          b.x += Math.sin(t * 5 + b.ph) * 12 * dt;
          b.r *= 1 + dt * 0.03;
          if (b.y < H * 0.02) { bubbles.splice(i, 1); continue; }
          ctx.fillStyle = 'rgba(200,240,255,0.1)';
          ctx.strokeStyle = 'rgba(210,245,255,0.55)';
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, TAU);
          ctx.fill();
          ctx.stroke();
        }

        // Marine snow drifting in the current.
        for (const s of snow) {
          s.y += (4 + s.r * 3) * dt;
          s.x += (Math.sin(t * 0.3 + s.ph) * 6 + 3) * dt;
          if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
          if (s.x > W) s.x = 0;
          ctx.fillStyle = `rgba(220,240,235,${s.a})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, TAU);
          ctx.fill();
        }

        kelp.filter((k) => k.near).forEach((k) => drawKelp(k, t));
      },
      dispose() { water.remove(); floor.remove(); },
    };
  },
};
