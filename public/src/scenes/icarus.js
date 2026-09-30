// Homage to Matisse's "Icarus" (Jazz, 1947): cut-paper figure with a red heart,
// jagged yellow stars on gouache blue. The figure is a jointed skeleton whose limbs
// drift and flail; edges "boil" a little like hand-cut paper in stop-motion.
const TAU = Math.PI * 2;
const UP = -Math.PI / 2, DOWN = Math.PI / 2;

// Rest pose, in figure units (1 ≈ figure height), y down, angles clockwise from +x
// (so UP = pointing up, DOWN = pointing down, 0 = right, Math.PI = left).
// Each limb: root offset `at` from its parent joint, segments [length, angle] from
// root to tip, full width at each joint (one more than segments), and `wiggle`:
// how far (radians) each segment may swing. Traced from the Jazz print.
const POSE = {
  // pelvis → waist → chest → neck; leans right like the original.
  torso: { from: 'pelvis', at: [0, 0], segs: [[0.134, UP + 0.23], [0.158, UP + 0.32], [0.097, UP + 0.37]], widths: [0.16, 0.13, 0.18, 0.08], wiggle: 0.05 },
  // Raised arm: up to a high elbow, then the forearm swings out to the left.
  armL: { from: 'chest', at: [-0.06, -0.07], segs: [[0.196, UP - 0.4], [0.13, Math.PI - 0.08], [0.05, Math.PI - 0.3]], widths: [0.08, 0.06, 0.035, 0.01], wiggle: 0.22 },
  // Out to an elbow on the right, forearm dropping down beside the body.
  armR: { from: 'chest', at: [0.06, 0.0], segs: [[0.17, 0.12], [0.19, DOWN + 0.15], [0.05, DOWN + 0.35]], widths: [0.09, 0.058, 0.03, 0.01], wiggle: 0.22 },
  // Chunky legs: hip flare → widest thigh → knee → calf → ankle → pointed toe.
  // They start narrow inside the waist so the hip curves out instead of stepping.
  legL: { from: 'pelvis', at: [-0.035, -0.06], segs: [[0.085, DOWN + 0.4], [0.15, DOWN + 0.05], [0.1, DOWN], [0.1, DOWN - 0.24], [0.05, DOWN - 0.1]], widths: [0.07, 0.145, 0.085, 0.085, 0.035, 0.01], wiggle: 0.1 },
  legR: { from: 'pelvis', at: [0.055, -0.06], segs: [[0.08, DOWN - 0.35], [0.13, DOWN - 0.15], [0.09, DOWN + 0.11], [0.095, DOWN + 0.32], [0.045, DOWN + 0.4]], widths: [0.09, 0.14, 0.08, 0.075, 0.03, 0.01], wiggle: 0.12 },
};
const HEAD = { lift: 0.05, rx: 0.048, ry: 0.058, tilt: 0.25 };  // ellipse above the neck, tilted right
const HEART = { at: [0.015, 0.03], r: 0.02 };                    // offset from the chest joint
const LAYOUT = { size: 0.6, x: 0.47, y: 0.54 };                   // figure height and centre, as fractions of the wall

export default {
  name: 'icarus',
  create(p, g, { W, H }) {
    const BLUE = [36, 78, 168], YELLOW = 'rgb(250,214,32)', BLACK = 'rgb(16,16,22)', RED = 'rgb(222,44,30)';
    const S = H * LAYOUT.size;                 // px per figure unit
    const home = { x: W * LAYOUT.x, y: H * LAYOUT.y };
    const seed = Math.random() * 1000;

    // Gouache background: blue with soft mottling, baked once at low resolution.
    const bg = p.createGraphics(Math.ceil(W / 4), Math.ceil(H / 4));
    bg.pixelDensity(1);
    bg.loadPixels();
    for (let y = 0; y < bg.height; y++) {
      for (let x = 0; x < bg.width; x++) {
        const n = p.noise(x * 0.05 + seed, y * 0.05) * 0.7 + p.noise(x * 0.3, y * 0.3 + seed) * 0.3;
        const k = (n - 0.5) * 22;
        const i = 4 * (y * bg.width + x);
        bg.pixels[i] = BLUE[0] + k * 0.6;
        bg.pixels[i + 1] = BLUE[1] + k * 0.8;
        bg.pixels[i + 2] = BLUE[2] + k;
        bg.pixels[i + 3] = 255;
      }
    }
    bg.updatePixels();

    // ---- skeleton ----
    function limbPoints(limb, origin, t, phase) {
      const pts = [[origin[0] + limb.at[0], origin[1] + limb.at[1]]];
      let acc = 0;
      limb.segs.forEach(([len, ang], i) => {
        // Wiggle accumulates down the chain so hands and feet move most.
        acc += limb.wiggle * (p.noise(seed + phase + i * 3.1, t * 0.18) - 0.5) * 2;
        acc += limb.wiggle * 0.35 * Math.sin(t * 0.9 + phase + i);
        const [x, y] = pts[pts.length - 1];
        pts.push([x + Math.cos(ang + acc) * len, y + Math.sin(ang + acc) * len]);
      });
      return pts;
    }

    function skeleton(t) {
      const pelvis = [0, 0];
      const torso = limbPoints(POSE.torso, pelvis, t, 0);
      const chest = torso[2];
      return {
        torso, chest, neck: torso[3],
        armL: limbPoints(POSE.armL, chest, t, 11),
        armR: limbPoints(POSE.armR, chest, t, 23),
        legL: limbPoints(POSE.legL, pelvis, t, 37),
        legR: limbPoints(POSE.legR, pelvis, t, 51),
      };
    }

    // Catmull-Rom through the joints, offset by interpolated widths, with round caps.
    function limbOutline(pts, widths) {
      const SUB = 8, center = [], wid = [];
      const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
        for (let k = 0; k < SUB; k++) {
          const u = k / SUB, u2 = u * u, u3 = u2 * u;
          const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
          center.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
          // Ease between joint widths so muscles swell rather than taper linearly.
          const e = u * u * (3 - 2 * u);
          wid.push((widths[i] + (widths[i + 1] - widths[i]) * e) / 2);
        }
      }
      center.push(pts[pts.length - 1]);
      wid.push(widths[widths.length - 1] / 2);

      const left = [], right = [];
      for (let i = 0; i < center.length; i++) {
        const a = center[Math.max(0, i - 1)], b = center[Math.min(center.length - 1, i + 1)];
        let nx = -(b[1] - a[1]), ny = b[0] - a[0];
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl;
        left.push([center[i][0] + nx * wid[i], center[i][1] + ny * wid[i]]);
        right.push([center[i][0] - nx * wid[i], center[i][1] - ny * wid[i]]);
      }
      const cap = (c, r, from, n = 7) => Array.from({ length: n }, (_, k) => {
        const a = from + (Math.PI * (k + 1)) / (n + 1);
        return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
      });
      const last = center.length - 1;
      const tipDir = Math.atan2(center[last][1] - center[last - 1][1], center[last][0] - center[last - 1][0]);
      const rootDir = Math.atan2(center[1][1] - center[0][1], center[1][0] - center[0][0]);
      return [
        ...left,
        // Caps run from one side to the other around the end, hence reversed.
        ...cap(center[last], wid[last], tipDir - Math.PI / 2).reverse(),
        ...right.reverse(),
        ...cap(center[0], wid[0], rootDir + Math.PI / 2).reverse(),
      ];
    }

    function ellipsePts(cx, cy, rx, ry, rot, n = 24) {
      return Array.from({ length: n }, (_, k) => {
        const a = (k / n) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
        return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
      });
    }

    // Cut-paper edge: a fixed irregularity plus a slow stop-motion "boil".
    function fillShape(ctx, pts, id, boilT, amp) {
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const jx = (p.noise(id, i * 0.35, boilT) - 0.5) * amp;
        const jy = (p.noise(id + 50, i * 0.35, boilT) - 0.5) * amp;
        i ? ctx.lineTo(x + jx, y + jy) : ctx.moveTo(x + jx, y + jy);
      });
      ctx.closePath();
      ctx.fill();
    }

    // ---- stars ----
    const rest = skeleton(0);
    const bodyPts = ['torso', 'armL', 'armR', 'legL', 'legR'].flatMap((k) => rest[k]).map(([x, y]) => [home.x + x * S, home.y + y * S]);
    const stars = [];
    for (let tries = 0; tries < 4000 && stars.length < 9; tries++) {
      const r = W * (0.045 + Math.random() * 0.045);
      const x = r + Math.random() * (W - 2 * r), y = r + Math.random() * (H - 2 * r);
      if (bodyPts.some(([bx, by]) => Math.hypot(bx - x, by - y) < r + S * 0.09)) continue;
      if (stars.some((s) => Math.hypot(s.x - x, s.y - y) < (s.r + r) * 1.5)) continue;
      const k = 7 + Math.floor(Math.random() * 4);
      stars.push({
        x, y, r, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 0.06, phase: Math.random() * 100,
        spikes: Array.from({ length: k }, () => ({ len: 0.55 + Math.random() * 0.5, jit: (Math.random() - 0.5) * 0.5, inner: 0.28 + Math.random() * 0.14 })),
      });
    }

    function starPts(s, t) {
      const k = s.spikes.length, pts = [];
      const dx = (p.noise(s.phase, t * 0.05) - 0.5) * s.r * 0.8, dy = (p.noise(s.phase + 9, t * 0.05) - 0.5) * s.r * 0.8;
      const cx = s.x + dx, cy = s.y + dy, rot = s.rot + t * s.spin;
      s.spikes.forEach((sp, i) => {
        const a = rot + ((i + sp.jit * 0.5) / k) * TAU;
        const breathe = 1 + 0.12 * Math.sin(t * 0.7 + s.phase + i * 1.7);
        pts.push([cx + Math.cos(a) * s.r * sp.len * breathe, cy + Math.sin(a) * s.r * sp.len * breathe]);
        const am = rot + ((i + 0.5) / k) * TAU;
        pts.push([cx + Math.cos(am) * s.r * sp.inner, cy + Math.sin(am) * s.r * sp.inner]);
      });
      return pts;
    }

    return {
      draw(t) {
        const ctx = g.drawingContext;
        g.image(bg, 0, 0, W, H);
        const boilT = Math.floor(t * 4) * 0.37;   // edges re-cut 4× a second

        ctx.fillStyle = YELLOW;
        stars.forEach((s, i) => fillShape(ctx, starPts(s, t), 200 + i * 7, boilT, s.r * 0.06));

        // The figure floats, sways and slowly tumbles.
        const sk = skeleton(t);
        ctx.save();
        ctx.translate(
          home.x + (p.noise(seed + 70, t * 0.04) - 0.5) * W * 0.12,
          home.y + Math.sin(t * 0.25) * H * 0.02 + (p.noise(seed + 80, t * 0.04) - 0.5) * H * 0.05,
        );
        ctx.rotate(Math.sin(t * 0.17) * 0.1 + (p.noise(seed + 90, t * 0.05) - 0.5) * 0.2);
        ctx.scale(S, S);
        const amp = 2.2 / S;
        ctx.fillStyle = BLACK;
        ['legL', 'legR', 'armL', 'armR', 'torso'].forEach((k, i) => fillShape(ctx, limbOutline(sk[k], POSE[k].widths), 10 + i * 13, boilT, amp));
        const [nx, ny] = sk.neck;
        const tilt = Math.atan2(sk.neck[1] - sk.chest[1], sk.neck[0] - sk.chest[0]) + Math.PI / 2 + HEAD.tilt;
        fillShape(ctx, ellipsePts(nx + Math.sin(tilt) * HEAD.lift, ny - Math.cos(tilt) * HEAD.lift, HEAD.rx, HEAD.ry, tilt), 90, boilT, amp);

        // The red heart pulses gently.
        const [hx, hy] = sk.chest;
        const beat = 1 + 0.1 * Math.max(0, Math.sin(t * 2.4)) ** 8;
        ctx.fillStyle = RED;
        fillShape(ctx, ellipsePts(hx + HEART.at[0], hy + HEART.at[1], HEART.r * beat, HEART.r * 1.15 * beat, 0.3, 16), 120, boilT, amp * 0.6);
        ctx.restore();
      },
      dispose() { bg.remove(); },
    };
  },
};
