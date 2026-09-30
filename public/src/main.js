// Projector page: wires scenes → output warp, calibration, keyboard, and the remote bus.
import { Output } from './output.js';
import { Calibrator, defaultCalibration } from './calibrate.js';
import { SceneManager } from './scenes.js';
import testcard, { fill } from './scenes/testcard.js';
import starfield from './scenes/starfield.js';
import boids from './scenes/boids.js';
import trippy from './scenes/trippy.js';
import nature from './scenes/nature.js';
import icarus from './scenes/icarus.js';

const SCENES = [starfield, boids, trippy, nature, icarus, testcard];

const [config, savedCal] = await Promise.all([
  fetch('/api/config').then((r) => r.json()),
  fetch('/api/calibration').then((r) => r.json()),
]);
const wall = config.wall || { widthM: 1.2, heightM: 2.4 };
const H = config.contentHeight || 1600;
const W = Math.round((H * wall.widthM) / wall.heightM);
const ctx = { W, H, wall, config, pxPerM: H / wall.heightM };

const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');
const params = new URLSearchParams(location.search);

new p5((p) => {
  let out, scenes, calib, patternScene = null, patternName = null;
  let hud = params.has('hud'), blackout = false, power = 1, fps = 60;

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight, p.WEBGL);
    p.noCursor();
    resizeOverlay();

    out = new Output(p);
    const cal = savedCal || defaultCalibration(p.width, p.height);
    calib = new Calibrator(cal, (c) => { out.setCalibration(c); reportState(); });
    out.setCalibration(cal);

    scenes = new SceneManager(p, SCENES, ctx);
    scenes.go(params.get('scene') || scenes.playlist[0] || 'starfield', 0);
    if (params.has('calibrate')) setCalibrating(true);
    connectRemote();
    reportState();
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    resizeOverlay();
  };

  // Never below 1: with a zoomed-out browser (DPR < 1) Chrome failed to clear the
  // downscaled overlay, leaving calibration handles and HUD on screen.
  const overlayScale = () => Math.max(1, window.devicePixelRatio || 1);

  function resizeOverlay() {
    const d = overlayScale();
    overlay.width = window.innerWidth * d;
    overlay.height = window.innerHeight * d;
    octx.setTransform(d, 0, 0, d, 0, 0);
  }

  // ---- calibration patterns ----
  function setPattern(name) {
    if (patternName === name) return;
    if (patternScene) { patternScene.inst.dispose?.(); patternScene.g.remove(); patternScene = null; }
    patternName = name;
    const def = { grid: testcard, white: fill(255), gray: fill(128) }[name];
    if (def) {
      const g = p.createGraphics(W, H);
      g.pixelDensity(1);
      patternScene = { g, inst: def.create(p, g, ctx) };
    }
  }

  function setCalibrating(on) {
    calib.active = on;
    on ? p.cursor(p.CROSS) : p.noCursor();
    reportState();
  }

  // ---- schedule ----
  function scheduledOn() {
    const s = config.schedule;
    if (!s) return true;
    const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
    const [on, off] = [s.on, s.off].map((x) => { const [h, mm] = x.split(':').map(Number); return h * 60 + mm; });
    return on <= off ? m >= on && m < off : m >= on || m < off;
  }

  p.draw = () => {
    const dt = Math.min(p.deltaTime / 1000, 0.1);
    fps += (p.frameRate() - fps) * 0.05;
    const target = blackout || (!calib.active && !scheduledOn()) ? 0 : 1;
    power += (target - power) * Math.min(1, dt * 1.5);

    p.background(0);
    const cal = calib.cal;
    const showContent = !calib.active || calib.pattern === 'content' || calib.pattern === 'frame';
    if (showContent && (power > 0.002 || calib.active)) scenes.update(dt);

    if (calib.active) setPattern(calib.pattern);
    if (!showContent && patternScene) {
      out.render(patternScene.g, null, 0, { brightness: 1, flatten: cal.flatten, maskOn: true });
    } else {
      const { a, b, mix } = scenes.layers();
      out.render(a, b, mix, {
        brightness: (cal.brightness ?? 1) * power,
        flatten: cal.flatten ?? 0,
        maskOn: !(calib.active && calib.pattern === 'frame'),
      });
    }
    drawOverlay();
  };

  function drawOverlay() {
    const d = overlayScale();
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.setTransform(d, 0, 0, d, 0, 0);
    const visible = calib.active || hud;
    overlay.style.visibility = visible ? 'visible' : 'hidden';
    if (!visible) return;
    if (calib.active) calib.drawOverlay(octx);
    const lines = [
      `${Math.round(fps)} fps · scene: ${scenes.name}${blackout ? ' · BLACKOUT' : ''}`,
    ];
    if (calib.active) {
      const c = calib.cal;
      lines.push(
        `CALIBRATING · ${calib.pattern}${calib.dirty ? ' · UNSAVED' : ''}`,
        `bright ${c.brightness.toFixed(2)} · flat ${c.flatten.toFixed(2)}`,
        `feather ${c.feather} · inset ${c.inset}`,
        'drag · Tab select · arrows nudge',
        '  (shift ×10, alt ×0.25)',
        'a add pt · del remove · p pattern',
        '[ ] feather · - = inset',
        ', . flatten · ; \' brightness',
        's save · c exit',
      );
    }
    octx.font = '13px monospace';
    const LH = 17, pad = 6;
    const bw = Math.max(...lines.map((l) => octx.measureText(l).width)) + pad * 2;
    const bh = lines.length * LH + pad * 2, sw = window.innerWidth, sh = window.innerHeight;
    // Pick the screen corner whose box stays farthest from every calibration handle.
    const distToBox = (q, bx, by) => Math.hypot(Math.max(bx - q.x, 0, q.x - bx - bw), Math.max(by - q.y, 0, q.y - by - bh));
    const pts = calib.active ? calib.handles().map((h) => h.pt) : [];
    const spots = [[12, sh - bh - 12], [12, 12], [sw - bw - 12, 12], [sw - bw - 12, sh - bh - 12]];
    const [bx, by] = spots
      .map(([x, y]) => [x, y, Math.min(Infinity, ...pts.map((q) => distToBox(q, x, y)))])
      .reduce((best, s) => (s[2] > best[2] ? s : best));
    octx.fillStyle = 'rgba(0,0,0,0.7)';
    octx.fillRect(bx, by, bw, bh);
    octx.fillStyle = '#0f0';
    lines.forEach((l, i) => octx.fillText(l, bx + pad, by + pad + 12 + i * LH));
  }

  // ---- commands (keyboard and remote share this) ----
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  function run(cmd) {
    const c = calib.cal;
    switch (cmd.type) {
      case 'scene': scenes.go(cmd.name); break;
      case 'next': scenes.next(); break;
      case 'blackout': blackout = cmd.on ?? !blackout; break;
      case 'hud': hud = !hud; break;
      case 'brightness': calib.set('brightness', clamp01(cmd.v ?? c.brightness + (cmd.d || 0))); break;
      case 'flatten': calib.set('flatten', clamp01(cmd.v ?? c.flatten + (cmd.d || 0))); break;
      case 'calibrate': setCalibrating(cmd.on ?? !calib.active); break;
      case 'pattern': calib.nextPattern(); break;
      case 'select': calib.select(cmd.dir || 1); break;
      case 'nudge': calib.nudge(cmd.dx || 0, cmd.dy || 0); break;
      case 'addPoint': calib.addPoint(); break;
      case 'deletePoint': calib.deletePoint(); break;
      case 'feather': calib.set('feather', Math.max(0, +(c.feather + cmd.d).toFixed(2))); break;
      case 'inset': calib.set('inset', +(c.inset + cmd.d).toFixed(2)); break;
      case 'save': calib.save(); break;
      case 'reset': calib.cal = Object.assign(calib.cal, defaultCalibration(p.width, p.height)); calib.selected = 0; calib.changed(); break;
      case 'reload': location.reload(); break;
    }
    reportState();
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    const step = e.shiftKey ? 10 : e.altKey ? 0.25 : 1;
    if (calib.active) {
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (arrows) { run({ type: 'nudge', dx: arrows[0] * step, dy: arrows[1] * step }); e.preventDefault(); return; }
      const m = {
        Tab: { type: 'select', dir: e.shiftKey ? -1 : 1 }, p: { type: 'pattern' }, a: { type: 'addPoint' },
        Delete: { type: 'deletePoint' }, Backspace: { type: 'deletePoint' }, s: { type: 'save' },
        '[': { type: 'feather', d: -0.5 }, ']': { type: 'feather', d: 0.5 },
        '-': { type: 'inset', d: -0.5 }, '=': { type: 'inset', d: 0.5 },
      }[k];
      if (m) { run(m); e.preventDefault(); return; }
    }
    const m = {
      c: { type: 'calibrate' }, n: { type: 'next' }, h: { type: 'hud' }, b: { type: 'blackout' },
      ',': { type: 'flatten', d: -0.1 }, '.': { type: 'flatten', d: 0.1 },
      ';': { type: 'brightness', d: -0.05 }, "'": { type: 'brightness', d: 0.05 },
    }[k];
    if (m) { run(m); e.preventDefault(); return; }
    if (/^[1-9]$/.test(k) && SCENES[+k - 1]) run({ type: 'scene', name: SCENES[+k - 1].name });
  });

  window.addEventListener('mousedown', (e) => calib.active && calib.press(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => calib.active && calib.drag(e.clientX, e.clientY));
  window.addEventListener('mouseup', () => calib.release());

  // ---- remote bus ----
  function connectRemote() {
    const es = new EventSource('/api/events');
    es.addEventListener('cmd', (e) => run(JSON.parse(e.data)));
  }

  let stateTimer = null;
  function reportState() {
    clearTimeout(stateTimer);
    stateTimer = setTimeout(() => {
      const c = calib.cal;
      fetch('/api/state', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: SCENES.map((s) => s.name), scene: scenes.name, blackout,
          calibrating: calib.active, pattern: calib.pattern, dirty: calib.dirty,
          selected: calib.selected, handles: calib.handles().length,
          brightness: c.brightness, flatten: c.flatten, feather: c.feather, inset: c.inset,
        }),
      }).catch(() => {});
    }, 150);
  }
});
