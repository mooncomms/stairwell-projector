// Feedback: the projector's own camera as input. Each camera frame is warped into wall
// space (through the wall's last autocal run: camera <-> projector plane, plus the
// calibration), so what the camera sees lines up with the wall, and is projected back:
// light -> camera -> light, a loop. Effects (remote):
//   tunnel     classic video feedback: the picture is fed back into itself, slightly
//              zoomed and turned, colours drifting, the camera re-filming it all
//   trails     anything that moves leaves trails of colour
//   edges      what the camera sees, outlined in neon
//   echo       the room as it was 3 seconds ago, as a ghost
//   kaleido    the camera's view, mirrored four ways
// Needs the projector on USB (adb) and an autocal run for the wall.
import { squareToQuad, apply as applyH } from '../warp.js';

const GW = 160;                     // wall-space camera image width (cells)

export default {
  name: 'feedback',
  hold: true,                       // interactive: stays until changed, not in the rotation
  tempo: true,                      // beat circles: tap the tempo on the remote
  effects: {
    light: { label: 'Room light (so the camera sees you)', on: true },
    tunnel: { label: 'Feedback tunnel', on: true },
    trails: { label: 'Motion trails', on: true },
    edges: { label: 'Neon edges', on: false },
    echo: { label: 'Echo (3 s ago)', on: false },
    kaleido: { label: 'Kaleidoscope', on: false },
    circles: { label: 'Beat circles (in your shadow)', on: true },
  },
  create(p, g, ctx) {
    const { W, H } = ctx;
    const fx = (k) => ctx.fx('feedback', k);
    const c = g.drawingContext;
    const GH = Math.round((GW * H) / W);
    const mk = (w, h) => { const e = document.createElement('canvas'); e.width = w; e.height = h; return e; };
    const cam = mk(GW, GH), camX = cam.getContext('2d'), camD = camX.createImageData(GW, GH);
    const motion = mk(GW, GH), motX = motion.getContext('2d'), motD = motX.createImageData(GW, GH);
    const edges = mk(GW, GH), edgX = edges.getContext('2d'), edgD = edgX.createImageData(GW, GH);
    const echo = mk(GW, GH), echoX = echo.getContext('2d');
    const fb = mk(W, H), fbX = fb.getContext('2d'), tmp = mk(W, H), tmpX = tmp.getContext('2d');
    const hist = [];                                   // past wall-space frames (luma+rgb), for echo
    let lut = null, prevL = null, status = 'connecting to the camera…', frames = 0, lastFrame = 0, disposed = false, ctl = null;
    const motAcc = new Float32Array(GW * GH * 3);
    let gain = 1;
    // Shadow: a slowly learned picture of the lit wall; where it suddenly goes much darker,
    // someone is in the beam. It stops learning under a shadow, so standing still doesn't
    // fade you out.
    const bg = new Float32Array(GW * GH), shadow = new Uint8Array(GW * GH);
    const shadowC = mk(GW, GH), shX = shadowC.getContext('2d'), shD = shX.createImageData(GW, GH);
    let shadowCells = [], bgReady = 0, circles = [], lastBeat = -1;

    // Wall cell -> camera pixel (in the stream's own size).
    async function buildLut(fw, fh) {
      const info = await (await fetch('/api/camera/info')).json();
      if (!info.planeH) { status = info.error || 'no camera mapping'; return null; }
      const Hpc = info.planeH.flat ? info.planeH.flat() : info.planeH;    // projector px -> camera px
      const Hw = squareToQuad(ctx.cal.corners);                             // wall uv -> projector px
      const sx = fw / info.cam.w, sy = fh / info.cam.h, out = new Float32Array(GW * GH * 2);
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const { x: px, y: py } = applyH(Hw, (i + 0.5) / GW, (j + 0.5) / GH);
        const d = Hpc[6] * px + Hpc[7] * py + Hpc[8];
        out[2 * (j * GW + i)] = ((Hpc[0] * px + Hpc[1] * py + Hpc[2]) / d) * sx;
        out[2 * (j * GW + i) + 1] = ((Hpc[3] * px + Hpc[4] * py + Hpc[5]) / d) * sy;
      }
      return out;
    }

    function onFrame(fw, fh, rgb) {
      frames++; lastFrame = performance.now();
      const d = camD.data, L = new Float32Array(GW * GH);
      for (let n = 0; n < GW * GH; n++) {
        const x = lut[2 * n], y = lut[2 * n + 1];
        if (!(x >= 0 && y >= 0 && x < fw - 1 && y < fh - 1)) { d[4 * n] = d[4 * n + 1] = d[4 * n + 2] = 0; d[4 * n + 3] = 255; L[n] = 0; continue; }
        const x0 = x | 0, y0 = y | 0, ax = x - x0, ay = y - y0, o = (y0 * fw + x0) * 3, o2 = o + fw * 3;
        for (let ch = 0; ch < 3; ch++) {
          const v = (rgb[o + ch] * (1 - ax) + rgb[o + 3 + ch] * ax) * (1 - ay) + (rgb[o2 + ch] * (1 - ax) + rgb[o2 + 3 + ch] * ax) * ay;
          d[4 * n + ch] = v;
        }
        d[4 * n + 3] = 255; L[n] = 0.3 * d[4 * n] + 0.59 * d[4 * n + 1] + 0.11 * d[4 * n + 2];
      }
      camX.putImageData(camD, 0, 0);
      // Automatic gain: a dark room still gives a picture to feed back.
      let sum = 0; for (let n = 0; n < GW * GH; n += 7) sum += L[n];
      const mean = sum / (GW * GH / 7);
      gain += (Math.max(0.6, Math.min(6, 70 / Math.max(2, mean))) - gain) * 0.1;
      // Motion: where it got brighter or darker since the last frame, coloured by time.
      if (prevL) {
        const t = performance.now() / 1000, hue = (t * 40) % 360;
        const [r, g2, b] = hsl2rgb(hue / 360, 1, 0.55), md = motD.data;
        for (let n = 0; n < GW * GH; n++) {
          const m = Math.max(0, Math.abs(L[n] - prevL[n]) - 14) / 40;
          motAcc[3 * n] = motAcc[3 * n] * 0.9 + r * m; motAcc[3 * n + 1] = motAcc[3 * n + 1] * 0.9 + g2 * m; motAcc[3 * n + 2] = motAcc[3 * n + 2] * 0.9 + b * m;
          md[4 * n] = Math.min(255, motAcc[3 * n]); md[4 * n + 1] = Math.min(255, motAcc[3 * n + 1]); md[4 * n + 2] = Math.min(255, motAcc[3 * n + 2]); md[4 * n + 3] = 255;
        }
        motX.putImageData(motD, 0, 0);
      }
      // Edges (Sobel on luma).
      if (fx('edges')) {
        const ed = edgD.data, t = performance.now() / 1000, [r, g2, b] = hsl2rgb(((t * 25) % 360) / 360, 1, 0.6);
        for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
          const n = y * GW + x;
          const gx = L[n - GW + 1] + 2 * L[n + 1] + L[n + GW + 1] - L[n - GW - 1] - 2 * L[n - 1] - L[n + GW - 1];
          const gy = L[n + GW - 1] + 2 * L[n + GW] + L[n + GW + 1] - L[n - GW - 1] - 2 * L[n - GW] - L[n - GW + 1];
          const v = Math.min(1, Math.max(0, Math.hypot(gx, gy) - 40) / 120);
          ed[4 * n] = r * v; ed[4 * n + 1] = g2 * v; ed[4 * n + 2] = b * v; ed[4 * n + 3] = 255;
        }
        edgX.putImageData(edgD, 0, 0);
      }
      // Shadow against the learned background.
      if (bgReady < 15) { for (let n = 0; n < GW * GH; n++) bg[n] = bgReady ? bg[n] * 0.8 + L[n] * 0.2 : L[n]; bgReady++; }
      const cells = [], sd = shD.data;
      for (let n = 0; n < GW * GH; n++) {
        const s0 = bgReady >= 15 && bg[n] > 18 && L[n] < bg[n] * 0.6;
        shadow[n] = s0 ? 1 : 0;
        if (s0) cells.push(n); else bg[n] += (L[n] - bg[n]) * 0.03;
        sd[4 * n] = sd[4 * n + 1] = sd[4 * n + 2] = 255; sd[4 * n + 3] = s0 ? 255 : 0;
      }
      // Specks aren't people: need a decent patch.
      shadowCells = cells.length > GW * GH * 0.004 ? cells : [];
      shX.putImageData(shD, 0, 0);
      prevL = L;
      hist.push(camX.getImageData(0, 0, GW, GH));
      while (hist.length > 60) hist.shift();
    }

    // The stream: "CAMF", w, h (uint16 LE), then RGB; reconnects if it drops.
    async function run() {
      while (!disposed) {
        try {
          ctl = new AbortController();
          const res = await fetch('/api/camera/stream', { signal: ctl.signal });
          if (!res.ok) { status = (await res.json()).error || 'camera unavailable'; await sleep(3000); continue; }
          const rd = res.body.getReader();
          let buf = new Uint8Array(0);
          status = 'waiting for frames…';
          for (;;) {
            const { value, done } = await rd.read();
            if (done || disposed) break;
            const nb = new Uint8Array(buf.length + value.length); nb.set(buf); nb.set(value, buf.length); buf = nb;
            for (;;) {
              if (buf.length < 8) break;
              if (!(buf[0] === 67 && buf[1] === 65 && buf[2] === 77 && buf[3] === 70)) { buf = buf.subarray(1); continue; }   // resync on "CAMF"
              const fw = buf[4] | (buf[5] << 8), fh = buf[6] | (buf[7] << 8), n = 8 + fw * fh * 3;
              if (buf.length < n) break;
              if (!lut) lut = await buildLut(fw, fh);
              if (lut) { onFrame(fw, fh, buf.subarray(8, n)); status = null; }
              buf = buf.slice(n);
            }
          }
        } catch (e) { if (disposed) return; status = 'camera stream dropped, retrying…'; }
        await sleep(2000);
      }
    }
    run();

    return {
      draw(t) {
        c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
        c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
        c.imageSmoothingEnabled = true;
        const fresh = performance.now() - lastFrame < 2000;
        if (!fresh) {                                  // say what's wrong, softly, on the wall
          c.fillStyle = 'rgba(255,255,255,0.5)'; c.font = `${Math.round(H / 22)}px sans-serif`; c.textAlign = 'center';
          c.fillText(status || 'no camera frames', W / 2, H / 2);
          return;
        }
        // Tunnel: last output, zoomed and turned a touch, fading; the camera's view added.
        if (fx('tunnel')) {
          tmpX.globalCompositeOperation = 'copy'; tmpX.drawImage(fb, 0, 0);
          fbX.setTransform(1, 0, 0, 1, 0, 0); fbX.globalCompositeOperation = 'source-over'; fbX.globalAlpha = 1;
          fbX.fillStyle = '#000'; fbX.fillRect(0, 0, W, H);
          fbX.translate(W / 2, H / 2); fbX.rotate(0.006 * Math.sin(t * 0.1) + 0.004); fbX.scale(1.035, 1.035); fbX.translate(-W / 2, -H / 2);
          fbX.globalAlpha = 0.88; fbX.drawImage(tmp, 0, 0);
          fbX.setTransform(1, 0, 0, 1, 0, 0);
          // The camera's view, brightened to a steady level (several passes: 'lighter' adds).
          fbX.globalCompositeOperation = 'lighter';
          for (let gg = gain * 0.35; gg > 0.01; gg -= 1) { fbX.globalAlpha = Math.min(1, gg); fbX.drawImage(cam, 0, 0, W, H); }
          // A seed, so the loop has something to grow from even in a dark, still room:
          // three soft lights wandering slowly.
          for (let i = 0; i < 3; i++) {
            const sx = W * (0.5 + 0.38 * Math.sin(t * (0.13 + i * 0.05) + i * 2)), sy = H * (0.5 + 0.35 * Math.cos(t * (0.11 + i * 0.04) + i));
            const r = H * 0.07, gr = fbX.createRadialGradient(sx, sy, 0, sx, sy, r);
            gr.addColorStop(0, `hsla(${(t * 20 + i * 120) % 360},100%,60%,0.5)`); gr.addColorStop(1, 'hsla(0,0%,0%,0)');
            fbX.globalAlpha = 1; fbX.fillStyle = gr; fbX.fillRect(sx - r, sy - r, 2 * r, 2 * r);
          }
          // Colours drift: a slow tint over the loop.
          fbX.globalCompositeOperation = 'multiply'; fbX.globalAlpha = 1;
          const h = (t * 12) % 360; fbX.fillStyle = `hsl(${h},70%,82%)`; fbX.fillRect(0, 0, W, H);
          fbX.globalCompositeOperation = 'source-over';
          c.drawImage(fb, 0, 0);
        }
        c.globalCompositeOperation = 'lighter';
        if (fx('light')) { c.globalAlpha = 1; c.fillStyle = 'rgba(255,240,225,0.22)'; c.fillRect(0, 0, W, H); }
        if (fx('kaleido')) {
          c.globalAlpha = 0.7;
          for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
            c.save(); c.translate(W / 2, H / 2); c.scale(sx, sy); c.drawImage(cam, 0, 0, GW / 2, GH / 2, 0, 0, W / 2, H / 2); c.restore();
          }
        }
        if (fx('echo') && hist.length > 36) {
          echoX.putImageData(hist[hist.length - 36], 0, 0);
          c.globalAlpha = 0.55; c.drawImage(echo, 0, 0, W, H);
        }
        if (fx('trails')) { c.globalAlpha = 1; c.drawImage(motion, 0, 0, W, H); }
        if (fx('edges')) { c.globalAlpha = 1; c.drawImage(edges, 0, 0, W, H); }
        // Beat circles: a burst of coloured rings on every beat, most of them inside the
        // shadow; the shadow itself fills with the beat's colour. They pop and fade (no
        // hard flashing, never faster than the beat).
        if (fx('circles')) {
          const beat = (performance.now() / 1000 - ctx.flags.party.t0) * (ctx.flags.party.bpm / 60), b = Math.floor(beat), within = beat - b;
          const hue = (b * 67) % 360;
          if (b !== lastBeat) {
            lastBeat = b;
            const n = shadowCells.length ? 7 : 4;
            for (let i = 0; i < n; i++) {
              let x = Math.random() * W, y = Math.random() * H;
              if (shadowCells.length && i < 5) { const cell = shadowCells[(Math.random() * shadowCells.length) | 0]; x = ((cell % GW) + 0.5) * (W / GW); y = (((cell / GW) | 0) + 0.5) * (H / GH); }
              circles.push({ x, y, born: performance.now() / 1000, hue: (hue + Math.random() * 90) % 360, r0: H * (0.03 + Math.random() * 0.05), ring: Math.random() < 0.5 });
            }
          }
          const now = performance.now() / 1000, life = 60 / ctx.flags.party.bpm * 1.6;
          circles = circles.filter((q) => now - q.born < life);
          if (shadowCells.length) {                                      // your shadow, in colour
            tmpX.globalCompositeOperation = 'copy'; tmpX.imageSmoothingEnabled = true; tmpX.drawImage(shadowC, 0, 0, W, H);
            tmpX.globalCompositeOperation = 'source-in'; tmpX.fillStyle = `hsl(${hue},100%,55%)`; tmpX.fillRect(0, 0, W, H);
            c.globalAlpha = 0.25 + 0.55 * Math.exp(-within * 3); c.drawImage(tmp, 0, 0);
          }
          for (const q of circles) {
            const a = (now - q.born) / life, r = q.r0 * (1 + a * 2.5), al = (1 - a) ** 2;
            c.globalAlpha = 1;
            if (q.ring) { c.strokeStyle = `hsla(${q.hue},100%,60%,${al})`; c.lineWidth = H * 0.012 * (1 - a * 0.5); c.beginPath(); c.arc(q.x, q.y, r, 0, 7); c.stroke(); }
            else { const gr = c.createRadialGradient(q.x, q.y, 0, q.x, q.y, r); gr.addColorStop(0, `hsla(${q.hue},100%,62%,${al})`); gr.addColorStop(0.7, `hsla(${q.hue},100%,55%,${al * 0.6})`); gr.addColorStop(1, `hsla(${q.hue},100%,50%,0)`); c.fillStyle = gr; c.beginPath(); c.arc(q.x, q.y, r, 0, 7); c.fill(); }
          }
        }
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      },
      dispose() { disposed = true; ctl?.abort(); },
    };
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function hsl2rgb(h, s, l) {
  const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
  return [f(0), f(8), f(4)];
}
