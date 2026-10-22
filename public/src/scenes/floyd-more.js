// More scenes for the Pink Floyd tapestry (walls/floyd). All of them are light on the
// printed artwork, placed in cm on the tapestry (145 × 90).
//
//   bricks   "Another Brick in the Wall": a wall of dark bricks is laid in front of the
//            artwork, one brick per beat, until it's sealed; then it comes down
//   prism    Dark Side of the Moon: a beam of light hits a prism and fans into a rainbow
//            across the sky, pulsing with a heartbeat
//   pigs     Animals: the inflatable pig drifts over the sky on its tether while
//            searchlights hunt for it
//   storm    rain drifting across, lightning in the clouds now and then (no strobing)
import { ART, ridgeAt } from './floyd.js';

const { CM } = ART;

// Wall-space helpers shared by these scenes.
function setup(g, W, H) {
  const k = W / CM.w, ky = H / CM.h;
  const X = (x) => x * k, Y = (y) => y * ky;
  const canvas = () => { const e = document.createElement('canvas'); e.width = W; e.height = H; return e; };
  // The sky: everything above the crowd's ridge.
  const sky = canvas();
  { const s = sky.getContext('2d'); s.fillStyle = '#fff'; s.filter = 'blur(4px)'; s.beginPath(); s.moveTo(0, 0); for (const [x, y] of ART.RIDGE) s.lineTo(X(x), Y(y)); s.lineTo(W, 0); s.closePath(); s.fill(); }
  const work = canvas(), wx = work.getContext('2d');
  return {
    c: g.drawingContext, k, ky, X, Y, sky,
    // Draw into a work canvas, keep it to the sky, add it to the frame.
    inSky(c, draw, alpha = 1) {
      wx.globalCompositeOperation = 'source-over'; wx.globalAlpha = 1; wx.clearRect(0, 0, W, H); draw(wx);
      wx.globalCompositeOperation = 'destination-in'; wx.drawImage(sky, 0, 0);
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha; c.drawImage(work, 0, 0);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    },
    reset(c) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none'; },
    wash(c, col, a) {          // even room light, a little stronger in the middle
      const gr = c.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.75);
      gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},${a * 0.7})`);
      c.fillStyle = gr; c.fillRect(0, 0, W, H);
    },
  };
}
const beatOf = (flags) => (performance.now() / 1000 - flags.party.t0) * (flags.party.bpm / 60);

// ---------------------------------------------------------------------------------------
export const bricks = {
  name: 'bricks',
  tempo: true,
  create(p, g, { W, H, flags }) {
    const S = setup(g, W, H), { c, X, Y, k } = S;
    const BW = 12, BH = 5.6, M = 0.55;                 // brick and mortar, cm
    // Courses from the bottom up, each laid left to right, alternate courses offset.
    const order = [];
    const rows = Math.ceil(CM.h / BH);
    for (let r = 0; r < rows; r++) {
      const y = CM.h - (r + 1) * BH, off = r % 2 ? -BW / 2 : 0;
      for (let x = off; x < CM.w; x += BW) order.push({ x, y, fall: Math.random(), spin: (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 30 });
    }
    let laid = 0, lastBeat = null, phase = 'build', since = 0;
    return {
      draw(t, dt) {
        S.reset(c);
        const beat = beatOf(flags), b = Math.floor(beat);
        c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
        S.wash(c, '255,236,214', 0.5);
        since += dt;
        if (phase === 'build') {
          if (lastBeat !== null && b !== lastBeat) laid++;                 // one brick per beat
          lastBeat = b;
          if (laid >= order.length) { phase = 'sealed'; since = 0; }
        } else if (phase === 'sealed' && since > 9) { phase = 'fall'; since = 0; }
        else if (phase === 'fall' && since > 7) { phase = 'open'; since = 0; }
        else if (phase === 'open' && since > 12) { phase = 'build'; laid = 0; since = 0; lastBeat = null; }

        const within = beat - b;
        const n = phase === 'build' ? laid : phase === 'open' ? 0 : order.length;
        for (let i = 0; i < n; i++) {
          const br = order[i];
          let dx = 0, dy = 0, rot = 0;
          if (i === laid - 1 && phase === 'build') dy = -3 * (1 - Math.min(1, within * 4)) ** 2;   // the newest drops into place
          if (phase === 'fall') {
            const ft = Math.max(0, since - br.fall * 2.5 - (CM.h - br.y) / 90);   // top courses go first
            dy = 0.5 * 160 * ft * ft; dx = br.vx * ft; rot = br.spin * ft;
          }
          const x0 = X(br.x + M / 2), y0 = Y(br.y + M / 2 + dy), w = (BW - M) * k, h = (BH - M) * k;
          c.save(); c.translate(x0 + w / 2 + X(dx), y0 + h / 2); c.rotate(rot);
          c.fillStyle = '#000'; c.fillRect(-w / 2, -h / 2, w, h);                   // the brick: no light
          c.strokeStyle = i === laid - 1 && phase === 'build' ? `rgba(255,240,220,${0.9 - within * 0.6})` : 'rgba(255,236,214,0.25)';
          c.lineWidth = 1.2; c.strokeRect(-w / 2, -h / 2, w, h);
          c.restore();
        }
        // Sealed: just the mortar glows, faintly, like a wall lit from the side.
        if (phase === 'sealed') { c.fillStyle = `rgba(0,0,0,${Math.min(0.5, since / 6)})`; c.fillRect(0, 0, W, H); }
        if (phase === 'open') { c.fillStyle = `rgba(0,0,0,${Math.max(0, 1 - since / 3)})`; c.fillRect(0, 0, W, H); }
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
export const prism = {
  name: 'prism',
  create(p, g, { W, H }) {
    const S = setup(g, W, H), { c, X, Y } = S;
    const P = { x: 50, y: 37, s: 15 };                     // the prism: centre and side, cm
    const RAIN = [[255, 40, 40], [255, 140, 20], [255, 235, 40], [40, 230, 70], [40, 140, 255], [150, 60, 255]];
    return {
      draw(t) {
        S.reset(c);
        c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
        S.wash(c, '200,210,255', 0.14);
        // Heartbeat: lub-dub, once a second.
        const ph = t % 1.05, beat = Math.exp(-(((ph - 0.02) / 0.06) ** 2)) + 0.7 * Math.exp(-(((ph - 0.24) / 0.06) ** 2));
        const lvl = 0.72 + 0.28 * beat;
        const h = (P.s * Math.sqrt(3)) / 2;
        const A = [P.x, P.y - (2 * h) / 3], B = [P.x - P.s / 2, P.y + h / 3], C = [P.x + P.s / 2, P.y + h / 3];
        const hitL = [(A[0] + B[0]) / 2 - 0.5, (A[1] + B[1]) / 2 + 1];              // where the beam enters
        const sway = Math.sin(t * 0.07) * 2.5;
        c.globalCompositeOperation = 'lighter';
        // The incoming beam, from the left edge.
        const y0 = 47 + sway;
        c.fillStyle = `rgba(255,255,255,${0.55 * lvl})`;
        c.beginPath(); c.moveTo(0, Y(y0 - 0.7)); c.lineTo(X(hitL[0]), Y(hitL[1] - 0.25)); c.lineTo(X(hitL[0]), Y(hitL[1] + 0.25)); c.lineTo(0, Y(y0 + 0.7)); c.closePath(); c.fill();
        // Inside the prism, a faint glow.
        const exitTop = [(A[0] + C[0]) / 2 + 0.3, (A[1] + C[1]) / 2 - 1.2], exitBot = [(A[0] + C[0]) / 2 + 1.6, (A[1] + C[1]) / 2 + 1.6];
        c.fillStyle = `rgba(255,255,255,${0.18 * lvl})`;
        c.beginPath(); c.moveTo(X(hitL[0]), Y(hitL[1])); c.lineTo(X(exitTop[0]), Y(exitTop[1])); c.lineTo(X(exitBot[0]), Y(exitBot[1])); c.closePath(); c.fill();
        // The rainbow fan, to the right edge, red on top.
        const spread = 26 + Math.sin(t * 0.11) * 4, top = 22 + sway * 0.6;
        for (let i = 0; i < RAIN.length; i++) {
          const f0 = i / RAIN.length, f1 = (i + 1) / RAIN.length;
          const e0 = [exitTop[0] + (exitBot[0] - exitTop[0]) * f0, exitTop[1] + (exitBot[1] - exitTop[1]) * f0];
          const e1 = [exitTop[0] + (exitBot[0] - exitTop[0]) * f1, exitTop[1] + (exitBot[1] - exitTop[1]) * f1];
          const shimmer = 0.85 + 0.15 * Math.sin(t * 1.3 + i);
          const gr = c.createLinearGradient(X(e0[0]), 0, W, 0);
          gr.addColorStop(0, `rgba(${RAIN[i]},${0.85 * lvl * shimmer})`); gr.addColorStop(1, `rgba(${RAIN[i]},${0.5 * lvl * shimmer})`);
          c.fillStyle = gr;
          c.beginPath(); c.moveTo(X(e0[0]), Y(e0[1])); c.lineTo(W, Y(top + spread * f0)); c.lineTo(W, Y(top + spread * f1)); c.lineTo(X(e1[0]), Y(e1[1])); c.closePath(); c.fill();
        }
        // The prism's outline.
        c.strokeStyle = `rgba(255,255,255,${0.75 * lvl})`; c.lineWidth = 2; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(X(A[0]), Y(A[1])); c.lineTo(X(B[0]), Y(B[1])); c.lineTo(X(C[0]), Y(C[1])); c.closePath(); c.stroke();
        c.globalCompositeOperation = 'source-over';
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
export const pigs = {
  name: 'pigs',
  create(p, g, { W, H }) {
    const S = setup(g, W, H), { c, X, Y, k } = S;
    const LOOP = 80;                                         // seconds for one crossing
    const lights = ART.LIGHTS.map((L) => ({ ...L, ang: -Math.PI / 2 }));
    function pig(x, y, rot, glow) {
      c.save(); c.translate(X(x), Y(y)); c.rotate(rot); c.scale(k, k);
      const body = `rgba(255,150,195,${0.75 * glow})`, line = `rgba(255,215,235,${0.95 * glow})`;
      c.fillStyle = body; c.strokeStyle = line; c.lineWidth = 0.35; c.lineJoin = 'round';
      c.beginPath(); c.ellipse(0, 0, 10, 5.4, 0, 0, 7); c.fill(); c.stroke();                 // body
      for (const lx of [-6, -2.5, 3, 6.5]) { c.beginPath(); c.rect(lx - 0.9, 4, 1.8, 3.2); c.fill(); c.stroke(); }   // legs
      c.beginPath(); c.arc(9.5, -1.6, 4, 0, 7); c.fill(); c.stroke();                         // head
      c.beginPath(); c.ellipse(13.4, -1, 1.2, 1.6, 0, 0, 7); c.fill(); c.stroke();            // snout
      c.fillStyle = line; for (const ny of [-1.6, -0.4]) { c.beginPath(); c.arc(13.5, ny, 0.3, 0, 7); c.fill(); }
      c.fillStyle = body;
      c.beginPath(); c.moveTo(7.5, -4.6); c.lineTo(8.8, -8); c.lineTo(10.4, -5.2); c.closePath(); c.fill(); c.stroke();   // ears
      c.beginPath(); c.moveTo(10.2, -5.3); c.lineTo(12, -8.4); c.lineTo(12.6, -4.8); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-10, -1); c.bezierCurveTo(-13, -3, -12.5, 1, -11, 0); c.bezierCurveTo(-10, -1, -12, -4, -13.5, -2.5); c.stroke();   // tail
      c.fillStyle = 'rgba(40,0,20,0.9)'; c.beginPath(); c.arc(10.8, -2.8, 0.45, 0, 7); c.fill();   // eye
      c.restore();
    }
    return {
      draw(t, dt) {
        S.reset(c);
        c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
        S.wash(c, '200,205,225', 0.3);                        // a grey Battersea sky
        const u = (t % LOOP) / LOOP, x = -25 + u * (CM.w + 50), y = 24 + Math.sin(t * 0.4) * 2.5 + Math.sin(t * 0.13) * 3;
        const rot = Math.sin(t * 0.5) * 0.06;
        // Searchlights swing towards the pig, a little behind it.
        let lit = 0;
        S.inSky(c, (f) => {
          lights.forEach((L, i) => {
            const target = Math.atan2(Y(y) - Y(L.y), X(x) - X(L.x)) + Math.sin(t * 0.3 + i * 2) * 0.25;
            L.ang += (target - L.ang) * Math.min(1, dt * 0.6);
            const x0 = X(L.x), y0 = Y(L.y), len = H * 1.5, sp = 0.06;
            const gr = f.createRadialGradient(x0, y0, 0, x0, y0, len);
            gr.addColorStop(0, 'rgba(225,235,255,0.75)'); gr.addColorStop(0.7, 'rgba(225,235,255,0.2)'); gr.addColorStop(1, 'rgba(225,235,255,0)');
            f.fillStyle = gr; f.beginPath(); f.moveTo(x0, y0);
            f.lineTo(x0 + Math.cos(L.ang - sp) * len, y0 + Math.sin(L.ang - sp) * len);
            f.lineTo(x0 + Math.cos(L.ang + sp) * len, y0 + Math.sin(L.ang + sp) * len); f.closePath(); f.fill();
            const off = Math.abs(Math.atan2(Math.sin(target - L.ang), Math.cos(target - L.ang)));
            lit = Math.max(lit, Math.max(0, 1 - off / 0.12));
          });
        }, 0.7);
        // The tether, down to the wall.
        const gx = Math.max(0, Math.min(CM.w, x - 6));
        c.strokeStyle = 'rgba(255,230,240,0.35)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(X(x - 2), Y(y + 5)); c.quadraticCurveTo(X(x - 4), Y((y + ridgeAt(gx)) / 2 + 4), X(gx), Y(ridgeAt(gx))); c.stroke();
        c.globalCompositeOperation = 'lighter';
        pig(x, y, rot, 0.75 + 0.25 * lit);
        c.globalCompositeOperation = 'source-over';
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
export const storm = {
  name: 'storm',
  create(p, g, { W, H }) {
    const S = setup(g, W, H), { c, X, Y, k } = S;
    const drops = Array.from({ length: 220 }, () => ({ x: Math.random() * (CM.w + 40), y: Math.random() * CM.h, v: 55 + Math.random() * 35, l: 2 + Math.random() * 3 }));
    let next = 4, flash = null;          // { t, bolt: [[x, y]…], branches }
    function bolt() {
      const pts = [[20 + Math.random() * 105, -2]];
      while (pts[pts.length - 1][1] < 22 + Math.random() * 25) { const [x, y] = pts[pts.length - 1]; pts.push([x + (Math.random() - 0.5) * 7, y + 2 + Math.random() * 3]); }
      const branches = [];
      for (let i = 2; i < pts.length - 1; i += 2) if (Math.random() < 0.35) {
        const b = [pts[i]]; for (let j = 0; j < 4; j++) { const [x, y] = b[b.length - 1]; b.push([x + (Math.random() - 0.3) * 6, y + 1.5 + Math.random() * 2.5]); } branches.push(b);
      }
      return { pts, branches };
    }
    return {
      draw(t, dt) {
        S.reset(c);
        c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
        S.wash(c, '150,165,210', 0.2);
        // Rain: thin streaks falling at a slant.
        c.strokeStyle = 'rgba(200,215,255,0.28)'; c.lineWidth = 1;
        c.beginPath();
        for (const d of drops) {
          d.y += d.v * dt; d.x -= d.v * 0.3 * dt;
          if (d.y > CM.h + 3) { d.y = -3; d.x = Math.random() * (CM.w + 40); }
          c.moveTo(X(d.x), Y(d.y)); c.lineTo(X(d.x + d.l * 0.3), Y(d.y - d.l));
        }
        c.stroke();
        // Lightning: every 6–16 s a bolt, with the sky lighting up behind it (at most two
        // flickers, then it fades).
        if (t > next && !flash) { flash = { t, ...bolt() }; next = t + 6 + Math.random() * 10; }
        if (flash) {
          const a = t - flash.t, env = Math.exp(-a * 5) + (a > 0.35 ? 0.6 * Math.exp(-(a - 0.35) * 6) : 0);
          if (a > 1.4) flash = null;
          else {
            S.inSky(c, (f) => { f.fillStyle = `rgba(220,225,255,${Math.min(1, 0.7 * env)})`; f.fillRect(0, 0, W, H); });
            c.globalCompositeOperation = 'lighter'; c.lineJoin = 'round'; c.lineCap = 'round';
            for (const [path, w] of [[flash.pts, 3], ...flash.branches.map((b) => [b, 1.6])]) {
              for (const [lw, al] of [[w * 4, 0.15], [w, 0.95]]) {
                c.strokeStyle = `rgba(235,240,255,${al * Math.min(1, env * 1.4)})`; c.lineWidth = lw;
                c.beginPath(); path.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.stroke();
              }
            }
            c.globalCompositeOperation = 'source-over';
          }
        }
      },
    };
  },
};
