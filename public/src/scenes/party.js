// Party: a life-size dancer on the wall, in one of several looks, on the beat.
//
// Dancers are vector outlines cut out of real dance clips by tools/dancer/cutout.py, kept
// in the wall's media/dancers/ (local, not in git: the clips' licences don't allow
// redistributing them). Looks:
//   pop        black silhouette on a flat colour that changes every two beats (iPod ads)
//   spotlight  a shadow on a glowing disc of light, 60s go-go style
//   neon       a glowing outline with fading echoes of its last moves
//   club       chrome pole, coloured beams sweeping up from the floor, rim-lit dancer
// With auto on, look and dancer change every 16 bars. The remote sets the look, the
// dancer and the tempo (tap along); the beat drives colour changes and pulses.
// Nothing strobes: colour changes are at most one every two beats, and soften in.

const POLE_CM = 4.5;

// Placement per dancer file (media/dancers/<name>.json). kind: where it's pinned —
// floor (feet on the wall's bottom edge), pole (its pole on the wall's centre line), disc
// (a shadow on a spotlight disc). pxPerM: clip pixels per metre, for life size.
const DANCERS = {
// (Measured from each clip: the dancer's stretched-out height, arms up, ≈ 2 m.)
  'pole-studio': { label: 'Pole (studio)', kind: 'pole', pxPerM: 310, looks: ['club', 'pop', 'neon'] },
  'pole-rooftop': { label: 'Pole (rooftop)', kind: 'pole', pxPerM: 280, looks: ['club', 'pop', 'neon'] },
  headphones: { label: 'Headphones', kind: 'floor', pxPerM: 330, looks: ['pop', 'neon', 'club', 'spotlight'] },
  shadow: { label: 'Go-go shadow', kind: 'disc', looks: ['spotlight'] },
};
export const LOOKS = { pop: 'Pop', spotlight: 'Spotlight', neon: 'Neon', club: 'Club' };

const POP = ['#ff2d95', '#b4ff00', '#00e5ff', '#ff8a00', '#ffe600', '#8a5cff', '#ff3b3b', '#00ff9c'];

export default {
  name: 'party',
  hold: true,                 // stays until changed; not part of the ambient rotation
  create(p, g, { W, H, pxPerM, flags, config }) {
    const SIZE = config.party?.size ?? 0.9;      // 1 = life size
    const c = g.drawingContext;
    const party = flags.party;
    const dancers = {};       // name → data
    let look = party.look, dancer = party.dancer, sinceAuto = 0, lastBar = -1, disposed = false;

    fetch('/api/media?dir=dancers').then((r) => r.json()).then(async (list) => {
      for (const { url } of list) {
        const name = decodeURIComponent(url.split('/').pop()).replace(/\.json$/, '');
        try { dancers[name] = prep(name, await (await fetch(url)).json()); } catch {}
      }
      if (!disposed) pick(look, dancer);
      party.dancers = Object.fromEntries(Object.entries(dancers).map(([n, d]) => [n, d.label]));
    });

    function prep(name, d) {
      const def = DANCERS[name] || { label: name, kind: d.disc ? 'disc' : d.pole ? 'pole' : 'floor', looks: Object.keys(LOOKS) };
      // Frames to play: the usable stretches, back to back (a cut between them).
      const order = [];
      for (const [a, b] of d.segments.length ? d.segments : [[0, d.frames.length - 1]]) for (let i = a; i <= b; i++) order.push(i);
      const s = def.kind === 'disc' ? W / d.w : (pxPerM / (def.pxPerM || d.pxPerM || 330)) * SIZE;
      return { ...def, name, d, order, s };
    }

    function pick(l, n) {
      const names = Object.keys(dancers);
      if (!names.length) return;
      if (!l || !LOOKS[l]) {                       // random, but not the same again
        const ls = Object.keys(LOOKS).filter((k) => k !== look && names.some((n) => dancers[n].looks.includes(k)));
        l = ls.length ? ls[Math.floor(Math.random() * ls.length)] : look;
      }
      if (!n || !dancers[n] || !dancers[n].looks.includes(l)) {
        const fit = names.filter((k) => dancers[k].looks.includes(l));
        n = fit.length ? fit[Math.floor(Math.random() * fit.length)] : names[0];
        if (!dancers[n].looks.includes(l)) l = dancers[n].looks[0];
      }
      look = party.look = l; dancer = party.dancer = n; sinceAuto = 0; clipT = 0;
    }

    // Wall-space transform for a clip frame: its anchor (pole, feet or disc centre) to the
    // anchor's spot on the wall.
    function xform(D, i) {
      const { d, s, kind } = D, ax = d.anchor.x[i], ay = d.anchor.y[i];
      if (kind === 'pole') return { s, ax, ay, ox: W / 2, oy: H * 0.985 };
      if (kind === 'disc') return { s, ax, ay, ox: W / 2, oy: H * 0.5 };
      return { s, ax, ay, ox: W / 2, oy: H * 0.965 };
    }
    // Outline path, smoothed with curves through edge midpoints (clip pixels are coarse at
    // life size).
    function trace(rings, m) {
      for (const r of rings) {
        const n = r.length / 2;
        const X = (i) => (r[2 * (i % n)] - m.ax) * m.s + m.ox, Y = (i) => (r[2 * (i % n) + 1] - m.ay) * m.s + m.oy;
        c.moveTo((X(0) + X(1)) / 2, (Y(0) + Y(1)) / 2);
        for (let i = 1; i <= n; i++) c.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
        c.closePath();
      }
    }
    const frameAt = (D, back = 0) => {
      const k = Math.floor(clipT * D.d.fps) - back;
      return D.order[((k % D.order.length) + D.order.length) % D.order.length];
    };

    const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;
    const mix = (a, b, t) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };
    let clipT = 0;

    // ---- looks ----
    function drawPole(style, col) {
      const w = (POLE_CM / 100) * pxPerM, x = W / 2 - w / 2;
      if (style === 'flat') { c.fillStyle = '#000'; c.fillRect(x, 0, w, H); return; }
      if (style === 'neon') {
        c.globalCompositeOperation = 'lighter';
        for (const [lw, a] of [[w * 1.6, 0.12], [w * 0.8, 0.25], [w * 0.25, 0.9]]) { c.fillStyle = hsl(col, 100, 60, a); c.fillRect(W / 2 - lw / 2, 0, lw, H); }
        c.globalCompositeOperation = 'source-over'; return;
      }
      // Chrome: dark edges, a bright streak, tinted by the room's light.
      const gr = c.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, '#111'); gr.addColorStop(0.3, '#777'); gr.addColorStop(0.42, '#eee'); gr.addColorStop(0.55, '#666'); gr.addColorStop(1, '#0a0a0a');
      c.fillStyle = gr; c.fillRect(x, 0, w, H);
      if (col != null) { c.globalCompositeOperation = 'multiply'; c.fillStyle = hsl(col, 80, 60); c.fillRect(x, 0, w, H); c.globalCompositeOperation = 'source-over'; }
    }

    function pop(D, beat, i, m) {
      const k = Math.floor(beat / 2), f = Math.min(1, ((beat % 2) * 60) / party.bpm / 0.15);
      c.fillStyle = mix(POP[(k + POP.length - 1) % POP.length], POP[k % POP.length], f);
      c.fillRect(0, 0, W, H);
      const pulse = Math.exp(-(beat % 1) * 5) * 0.12;          // a soft lift on each beat
      c.fillStyle = `rgba(255,255,255,${pulse})`; c.fillRect(0, 0, W, H);
      if (D.kind === 'pole') drawPole('flat');
      if (D.kind === 'floor') {                                   // contact shadow
        const gr = c.createRadialGradient(W / 2, H * 0.965, 0, W / 2, H * 0.965, W * 0.3);
        gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        c.save(); c.translate(0, H * 0.965 * (1 - 0.15)); c.scale(1, 0.15); c.fillStyle = gr; c.beginPath(); c.arc(W / 2, H * 0.965, W * 0.3, 0, 7); c.fill(); c.restore();
      }
      c.fillStyle = '#000'; c.beginPath(); trace(D.d.frames[i], m); c.fill('evenodd');
    }

    function spotlight(D, beat, i, m) {
      c.fillStyle = '#0d0203'; c.fillRect(0, 0, W, H);
      // The disc: the clip's own disc for a shadow clip, else one around the dancer.
      let cx = W / 2, cy = H * 0.5, rx = W * 0.62, ry = H * 0.36, ang = 0;
      if (D.d.disc) { const k = D.d.disc; cx = (k.x - m.ax) * m.s + m.ox; cy = (k.y - m.ay) * m.s + m.oy; rx = k.rx * m.s; ry = k.ry * m.s; ang = (k.angle * Math.PI) / 180; }
      const hue = 28 - 40 * (0.5 - 0.5 * Math.cos((beat / 32) * Math.PI * 2));   // orange ↔ pink, every 8 bars
      const lift = 1 + Math.exp(-(beat % 1) * 4) * 0.08;
      c.save(); c.translate(cx, cy); c.rotate(ang); c.scale(rx * lift, ry * lift);
      const gr = c.createRadialGradient(0, -0.15, 0, 0, 0, 1);
      gr.addColorStop(0, hsl(hue + 20, 100, 62)); gr.addColorStop(0.75, hsl(hue, 100, 50)); gr.addColorStop(0.97, hsl(hue - 12, 95, 40)); gr.addColorStop(1, hsl(hue - 12, 95, 40, 0));
      c.fillStyle = gr; c.beginPath(); c.arc(0, 0, 1, 0, 7); c.fill(); c.restore();
      // The shadow, with a slightly soft edge like a real one (a faint wide stroke: cheaper
      // than a blur filter on the box's GPU).
      c.beginPath(); trace(D.d.frames[i], m);
      c.lineJoin = 'round'; c.strokeStyle = 'rgba(20,0,4,0.35)'; c.lineWidth = 5; c.stroke();
      c.fillStyle = 'rgba(20,0,4,0.96)'; c.fill('evenodd');
    }

    function neon(D, beat, i) {
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      const hue = (beat / 4) * 45, thick = 1 + Math.exp(-(beat % 1) * 5) * 0.6;
      if (D.kind === 'pole') drawPole('neon', hue + 180);
      c.lineJoin = 'round'; c.globalCompositeOperation = 'lighter';
      // Echoes: where the dancer was a moment ago, in shifted colours.
      for (let k = 5; k >= 1; k--) {
        const j = frameAt(D, k * 3), mk = xform(D, j);
        c.strokeStyle = hsl(hue - k * 35, 100, 55, 0.35 * (6 - k) / 5); c.lineWidth = 6 * thick;
        c.beginPath(); trace(D.d.frames[j], mk); c.stroke();
      }
      const m = xform(D, i);
      c.beginPath(); trace(D.d.frames[i], m);
      for (const [lw, a, l] of [[26, 0.08, 55], [14, 0.18, 55], [7, 0.5, 60], [2.5, 1, 85]]) { c.strokeStyle = hsl(hue, 100, l, a); c.lineWidth = lw * thick; c.stroke(); }
      c.globalCompositeOperation = 'source-over';
    }

    const beams = [{ x: 0.05, a: 0.0 }, { x: 0.5, a: 2.1 }, { x: 0.95, a: 4.2 }];
    function club(D, beat, i, m, t) {
      // Dark room with a little haze.
      const bg = c.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#020208'); bg.addColorStop(1, '#0a0614');
      c.fillStyle = bg; c.fillRect(0, 0, W, H);
      const bar = Math.floor(beat / 4), set = Math.floor(bar / 4);
      const hues = [[300, 190], [20, 280], [200, 330], [130, 260]][set % 4];
      c.globalCompositeOperation = 'lighter';
      let rimHue = hues[0], rimX = 0;
      beams.forEach((b, k) => {
        const hue = hues[k % 2], sway = Math.sin((beat / 8) * Math.PI + b.a) * 0.55;   // a full sweep every 4 bars
        const x0 = b.x * W, y0 = H * 1.02, ang = -Math.PI / 2 + sway * (k === 1 ? 0.5 : 1) + (b.x - 0.5) * -0.6;
        const len = H * 1.25, spread = 0.13, hit = 0.55 + 0.45 * Math.exp(-(beat % 1) * 3);
        const gr = c.createRadialGradient(x0, y0, 0, x0, y0, len);
        gr.addColorStop(0, hsl(hue, 100, 62, 0.9 * hit)); gr.addColorStop(0.45, hsl(hue, 100, 55, 0.35 * hit)); gr.addColorStop(1, hsl(hue, 100, 50, 0));
        c.fillStyle = gr; c.beginPath(); c.moveTo(x0, y0);
        c.lineTo(x0 + Math.cos(ang - spread) * len, y0 + Math.sin(ang - spread) * len);
        c.lineTo(x0 + Math.cos(ang + spread) * len, y0 + Math.sin(ang + spread) * len);
        c.closePath(); c.fill();
        if (k !== 1 && Math.abs(Math.cos(ang)) > Math.abs(rimX)) { rimX = Math.cos(ang) > 0 ? -1 : 1; rimHue = hue; }
      });
      // Haze: a few soft drifting clouds catching the light.
      for (let k = 0; k < 3; k++) {
        const hx = W * (0.5 + 0.4 * Math.sin(t * 0.05 + k * 2)), hy = H * (0.3 + 0.25 * k + 0.05 * Math.sin(t * 0.07 + k));
        const gr = c.createRadialGradient(hx, hy, 0, hx, hy, W * 0.6);
        gr.addColorStop(0, hsl(hues[k % 2], 60, 40, 0.06)); gr.addColorStop(1, hsl(hues[k % 2], 60, 40, 0));
        c.fillStyle = gr; c.fillRect(0, 0, W, H);
      }
      // Light pooling on the floor where the beams start.
      const fl = c.createRadialGradient(W / 2, H, 0, W / 2, H, W * 0.8);
      fl.addColorStop(0, hsl(hues[1], 100, 55, 0.35)); fl.addColorStop(1, hsl(hues[1], 100, 50, 0));
      c.fillStyle = fl; c.fillRect(0, H * 0.6, W, H * 0.4);
      c.globalCompositeOperation = 'source-over';
      if (D.kind === 'pole') drawPole('chrome', rimHue);
      // Rim light: the outline in the beam's colour, peeking out on the lit side.
      c.save(); c.translate(-rimX * 4, -3); c.beginPath(); trace(D.d.frames[i], m);
      c.lineJoin = 'round'; c.strokeStyle = hsl(rimHue, 100, 65, 0.3); c.lineWidth = 9; c.stroke();
      c.strokeStyle = hsl(rimHue, 100, 70, 0.9); c.lineWidth = 3; c.stroke(); c.restore();
      c.fillStyle = '#000'; c.beginPath(); trace(D.d.frames[i], m); c.fill('evenodd');
    }

    return {
      draw(t, dt) {
        // Remote commands (main.js queues them; the scene knows the looks and dancers).
        for (const cmd of party.cmds.splice(0)) {
          const names = Object.keys(dancers);
          if (cmd.action === 'look') {
            const ls = Object.keys(LOOKS); const l = cmd.v || ls[(ls.indexOf(look) + 1) % ls.length];
            pick(l, dancer); party.auto = false;
          } else if (cmd.action === 'dancer') {
            const fit = names.filter((n) => dancers[n].looks.includes(look));
            const pool = cmd.v ? [cmd.v] : fit.length > 1 ? fit : names;
            const n = cmd.v || pool[(pool.indexOf(dancer) + 1) % pool.length];
            pick(dancers[n]?.looks.includes(look) ? look : dancers[n]?.looks[0], n); party.auto = false;
          } else if (cmd.action === 'auto') party.auto = cmd.on ?? !party.auto;
        }
        const D = dancers[dancer];
        c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
        if (!D) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); return; }
        const beat = (performance.now() / 1000 - party.t0) * (party.bpm / 60);
        // Auto: a new look and dancer every 16 bars, on a downbeat.
        const bar = Math.floor(beat / 4);
        if (bar !== lastBar) { if (party.auto && lastBar >= 0 && (sinceAuto += 1) >= 16) pick(null, null); lastBar = bar; }
        clipT += dt;
        const i = frameAt(D), m = xform(D, i);
        ({ pop, spotlight, neon, club })[look](D, beat, i, m, t);
      },
      dispose() { disposed = true; },
    };
  },
};
