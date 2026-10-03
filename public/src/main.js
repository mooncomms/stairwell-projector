// Projector page: wires scenes → output warp, calibration, keyboard, and the remote bus.
import { Output } from './output.js';
import { Calibrator, defaultCalibration } from './calibrate.js';
import { squareToQuad, apply as applyH } from './warp.js';
import { SceneManager } from './scenes.js';
import testcard, { fill, levels, reference } from './scenes/testcard.js';
import starfield from './scenes/starfield.js';
import nebula from './scenes/nebula.js';
import boids from './scenes/boids.js';
import trippy from './scenes/trippy.js';
import nature from './scenes/nature.js';
import icarus from './scenes/icarus.js';
import painting from './scenes/painting.js';
import underwater from './scenes/underwater.js';
import destroyer from './scenes/destroyer.js';
import jellyfish from './scenes/jellyfish.js';
import rain from './scenes/rain.js';
import aurora from './scenes/aurora.js';
import sky from './scenes/sky.js';
import lavalamp from './scenes/lavalamp.js';
import glow from './scenes/glow.js';
import traffic from './scenes/traffic.js';

const SCENES = [starfield, nebula, boids, trippy, nature, icarus, painting, underwater, destroyer, jellyfish, rain, aurora, sky, lavalamp, glow, traffic, testcard];

const [config, savedCal] = await Promise.all([
  fetch('/api/config').then((r) => r.json()),
  fetch('/api/calibration').then((r) => r.json()),
]);
const wall = config.wall || { widthM: 1.2, heightM: 2.4 };
const H = config.contentHeight || 1600;
const W = Math.round((H * wall.widthM) / wall.heightM);
// Physical panels (e.g. a split canvas print), in cm from the wall's top-left corner.
// Scenes get them in pixels; the output masks everything outside them.
const cmW = wall.widthM * 100, cmH = wall.heightM * 100;
const panels = (config.panels || []).map(({ x, y, w, h }) => ({ x: (x / cmW) * W, y: (y / cmH) * H, w: (w / cmW) * W, h: (h / cmH) * H }));

// Panels for the output mask, with every gap between panels widened by `grow` cm
// (calibration setting "gapGrow", adjustable from the remote; negative narrows).
// Edges on the wall's outer border stay put.
// Per-panel content shifts (calibration "panelShift": [[dx, dy] cm, …]) in wall uv.
const panelShifts = (c) => (config.panels || []).map((_, i) => { const v = c.panelShift?.[i] || [0, 0]; return [v[0] / cmW, v[1] / cmH]; });
let selPanel = 0;   // which panel the pane controls act on

function maskPanels(grow = 0) {
  const g = grow / 2, e = 0.05;
  return (config.panels || []).map(({ x, y, w, h }) => {
    let x0 = x, y0 = y, x1 = x + w, y1 = y + h;
    if (x0 > e) x0 += g; if (y0 > e) y0 += g;
    if (x1 < cmW - e) x1 -= g; if (y1 < cmH - e) y1 -= g;
    return { x0: x0 / cmW, y0: y0 / cmH, x1: x1 / cmW, y1: y1 / cmH };
  });
}
const ctx = { W, H, wall, config, panels, pxPerM: H / wall.heightM };

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
    const cal = savedCal || defaultCalibration(p.width, p.height, wall.widthM / wall.heightM);
    calib = new Calibrator(cal, (c) => { out.setCalibration(c); out.setPanels(maskPanels(c.gapGrow), panelShifts(c)); reportState(); });
    out.setCalibration(cal);
    out.setPanels(maskPanels(cal.gapGrow), panelShifts(cal));

    scenes = new SceneManager(p, SCENES, ctx);
    scenes.go(params.get('scene') || scenes.playlist[0] || SCENES[0].name, 0);
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
    const def = { grid: testcard, reference, edges: fill(190), levels, white: fill(255), gray: fill(128) }[name];
    if (def) {
      const g = p.createGraphics(W, H);
      g.pixelDensity(1);
      patternScene = { g, inst: def.create(p, g, ctx) };
    }
  }

  function setCalibrating(on) {
    if (calib.active && !on && calib.dirty) calib.save();   // leaving calibration: keep it
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
      out.render(patternScene.g, null, 0, {
        brightness: 1, flatten: calib.pattern === 'levels' ? 0 : cal.flatten, maskOn: true,
        edgeCheck: calib.pattern === 'edges', gain: cal.gain ?? [1, 1, 1],
      });
    } else {
      const { a, b, mix } = scenes.layers();
      out.render(a, b, mix, {
        brightness: (cal.brightness ?? 1) * power,
        flatten: cal.flatten ?? 0,
        maskOn: !(calib.active && calib.pattern === 'frame'),
        gain: cal.gain ?? [1, 1, 1],
        panels: !(scenes.current?.def.outside),        // scenes may draw around the panels
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
    if (calib.active && panels.length) {
      // Outline the pane the Pane controls act on.
      const Hm = squareToQuad(calib.cal.corners), q = (config.panels || [])[selPanel];
      if (q) {
        const pts = [[q.x, q.y], [q.x + q.w, q.y], [q.x + q.w, q.y + q.h], [q.x, q.y + q.h]].map(([x, y]) => applyH(Hm, x / cmW, y / cmH));
        octx.save(); octx.strokeStyle = '#ff3'; octx.lineWidth = 2; octx.setLineDash([8, 6]);
        octx.beginPath(); pts.forEach((pt, i) => (i ? octx.lineTo(pt.x, pt.y) : octx.moveTo(pt.x, pt.y))); octx.closePath(); octx.stroke();
        octx.restore();
      }
    }
    const lines = [
      `${Math.round(fps)} fps · ${config.wallName || 'wall'} · scene: ${scenes.name}${blackout ? ' · BLACKOUT' : ''}`,
    ];
    if (calib.active) {
      const c = calib.cal;
      lines.push(
        `CALIBRATING · ${calib.pattern}${calib.dirty ? ' · UNSAVED' : ''}`,
        `bright ${c.brightness.toFixed(2)} · flat ${c.flatten.toFixed(2)}`,
        `feather ${c.feather} · inset ${c.inset}${panels.length ? ` · gaps ${(c.gapGrow ?? 0) >= 0 ? '+' : ''}${c.gapGrow ?? 0} cm (g / G)` : ''}`,
        ...(panels.length ? [`pane ${selPanel + 1} shift ${(c.panelShift?.[selPanel] || [0, 0]).join(', ')} cm (v select · i j k l move)`] : []),
        `colour ${['R', 'G', 'B'].map((k, i) => `${k} ${(c.gain ?? [1, 1, 1])[i].toFixed(2)}`).join(' ')}`,
        'drag · Tab select · arrows nudge',
        '  (shift ×10, alt ×0.25)',
        'a add pt · del remove · p pattern',
        'r rotate 90° · f flip',
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
      case 'prev': scenes.prev(); break;
      case 'blackout': blackout = cmd.on ?? !blackout; break;
      case 'hud': hud = !hud; break;
      case 'brightness': calib.set('brightness', clamp01(cmd.v ?? c.brightness + (cmd.d || 0))); break;
      case 'flatten': calib.set('flatten', clamp01(cmd.v ?? c.flatten + (cmd.d || 0))); break;
      case 'gain': {
        const gain = [...(c.gain ?? [1, 1, 1])];
        gain[cmd.c] = Math.max(0.3, Math.min(1, cmd.v));
        calib.set('gain', gain);
        break;
      }
      case 'calibrate': setCalibrating(cmd.on ?? !calib.active); break;
      case 'pattern': calib.nextPattern(); break;
      case 'select': calib.select(cmd.dir || 1); break;
      case 'nudge': calib.nudge(cmd.dx || 0, cmd.dy || 0); break;
      case 'addPoint': calib.addPoint(); break;
      case 'deletePoint': calib.deletePoint(); break;
      case 'feather': calib.set('feather', Math.max(0, +(c.feather + cmd.d).toFixed(2))); break;
      case 'inset': calib.set('inset', +(c.inset + cmd.d).toFixed(2)); break;
      case 'pane': selPanel = ((selPanel + (cmd.dir || 1)) % panels.length + panels.length) % panels.length; break;
      case 'paneShift': {
        const all = (config.panels || []).map((_, i) => [...(c.panelShift?.[i] || [0, 0])]);
        all[selPanel][0] = +(all[selPanel][0] + (cmd.dx || 0)).toFixed(2);
        all[selPanel][1] = +(all[selPanel][1] + (cmd.dy || 0)).toFixed(2);
        calib.set('panelShift', all);
        break;
      }
      case 'gaps': calib.set('gapGrow', Math.max(-1, +((c.gapGrow ?? 0) + cmd.d).toFixed(2))); break;
      case 'save': calib.save(); break;
      case 'rotate': calib.rotate(); break;
      case 'flip': calib.flip(); break;
      case 'reset': calib.cal = Object.assign(calib.cal, defaultCalibration(p.width, p.height, wall.widthM / wall.heightM)); calib.selected = 0; calib.changed(); break;
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
        g: { type: 'gaps', d: 0.25 }, G: { type: 'gaps', d: -0.25 },
        v: { type: 'pane' }, i: { type: 'paneShift', dy: -0.25 }, k: { type: 'paneShift', dy: 0.25 }, j: { type: 'paneShift', dx: -0.25 }, l: { type: 'paneShift', dx: 0.25 },
        '-': { type: 'inset', d: -0.5 }, '=': { type: 'inset', d: 0.5 },
        r: { type: 'rotate' }, f: { type: 'flip' },
      }[k];
      if (m) { run(m); e.preventDefault(); return; }
    }
    const m = {
      c: { type: 'calibrate' }, n: { type: 'next' }, h: { type: 'hud' }, b: { type: 'blackout' },
      ArrowRight: { type: 'next' }, ArrowLeft: { type: 'prev' },
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
          wall: config.wallName, scenes: (scenes.playlist.length ? scenes.playlist : SCENES.map((s) => s.name)), scene: scenes.name, blackout,
          calibrating: calib.active, pattern: calib.pattern, dirty: calib.dirty,
          selected: calib.selected, handles: calib.handles().length,
          handleName: ((h) => (h ? (h.corner >= 0 ? `${['TL', 'TR', 'BR', 'BL'][h.corner]} corner` : `edge point`) : ''))(calib.handles()[calib.selected]),
          brightness: c.brightness, flatten: c.flatten, feather: c.feather, inset: c.inset, gain: c.gain ?? [1, 1, 1],
          panels: panels.length, gapGrow: c.gapGrow ?? 0, selPanel, paneShift: c.panelShift?.[selPanel] || [0, 0],
        }),
      }).catch(() => {});
    }, 150);
  }
});
