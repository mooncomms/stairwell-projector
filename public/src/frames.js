// Window frames: transparent overlays in wall space (W × H px, `cm` px per centimetre)
// laid over a scene by the output shader, to sell the "window" illusion. Each returns a
// p5.Graphics whose opaque parts are the frame and whose transparent part is the view.
// Frames emit projected light, so they're kept fairly dark.

export const FRAME_NAMES = { house: 'House window', sub: 'Porthole (sub base)', ship: 'Spaceship viewport', broken: 'Broken wall' };

// Frames are drawn once on a software-rendered canvas (willReadFrequently): drawn on a
// GPU-accelerated canvas, composite + shadow + clip operations came out wrong in Chrome.
// The result is copied into a p5.Graphics for the output shader.
function surface(p, W, H) {
  const el = document.createElement('canvas'); el.width = W; el.height = H;
  const c = el.getContext('2d', { willReadFrequently: true });
  return { c, done() { const g = p.createGraphics(W, H); g.pixelDensity(1); g.clear(); g.drawingContext.drawImage(el, 0, 0); return g; } };
}

const rgb = (c, k = 1) => `rgb(${c.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(',')})`;

// Cut a shape out of the frame (making it see-through).
function cut(c, path) {
  c.save(); c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000';
  c.beginPath(); path(c); c.fill(); c.restore();
}

// Soft inner shadow along the inside of an opening (depth of the frame).
function innerShadow(c, path, depth, alpha = 0.55) {
  c.save();
  c.beginPath(); path(c); c.clip();
  c.shadowColor = `rgba(0,0,0,${alpha})`; c.shadowBlur = depth; c.shadowOffsetY = depth * 0.35;
  c.lineWidth = depth; c.strokeStyle = 'rgba(0,0,0,1)';
  c.beginPath(); path(c); c.stroke();
  c.restore();
}

// Faint reflection on glass.
function sheen(c, x, y, w, h, alpha = 0.05) {
  const g = c.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, `rgba(255,255,255,${alpha})`);
  g.addColorStop(0.5, `rgba(255,255,255,${alpha * 0.3})`); g.addColorStop(0.58, `rgba(255,255,255,${alpha})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(x, y, w, h);
}

// Wood grain: long faint streaks in the direction of each piece.
function grain(c, x, y, w, h, vertical, base) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  const n = Math.round((vertical ? w : h) / 2);
  for (let i = 0; i < n; i++) {
    const k = 0.82 + Math.random() * 0.3;
    c.strokeStyle = rgb(base, k); c.globalAlpha = 0.25; c.lineWidth = 1 + Math.random() * 1.5;
    c.beginPath();
    if (vertical) { const xx = x + Math.random() * w; c.moveTo(xx, y); c.bezierCurveTo(xx + 3, y + h * 0.3, xx - 3, y + h * 0.7, xx + 1, y + h); }
    else { const yy = y + Math.random() * h; c.moveTo(x, yy); c.bezierCurveTo(x + w * 0.3, yy + 2, x + w * 0.7, yy - 2, x + w, yy + 1); }
    c.stroke();
  }
  c.restore();
}

// A raised rectangular piece: base colour, lit top/left edge, shaded bottom/right edge.
function piece(c, x, y, w, h, base, vertical) {
  c.fillStyle = rgb(base); c.fillRect(x, y, w, h);
  grain(c, x, y, w, h, vertical, base);
  const e = Math.max(1.5, Math.min(w, h) * 0.12);
  c.fillStyle = rgb(base, 1.35); c.fillRect(x, y, w, e * 0.6); c.fillRect(x, y, e * 0.6, h);
  c.fillStyle = rgb(base, 0.6); c.fillRect(x, y + h - e * 0.6, w, e * 0.6); c.fillRect(x + w - e * 0.6, y, e * 0.6, h);
}

function house(p, W, H, cm) {
  const surf = surface(p, W, H);
  const c = surf.c, wood = [86, 56, 36];
  const casing = 8 * cm, sill = 13 * cm, stile = 5 * cm, rail = 6 * cm, bar = 2.2 * cm;
  // Outer casing and sill.
  piece(c, 0, 0, W, casing, wood, false);
  piece(c, 0, 0, casing, H, wood, true);
  piece(c, W - casing, 0, casing, H, wood, true);
  piece(c, 0, H - sill, W, sill, wood.map((v) => v * 1.12), false);
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(casing, H - sill, W - 2 * casing, 1.2 * cm);   // shadow under the sashes
  // Two sashes (double-hung), each 2 × 3 panes.
  const ox = casing, oy = casing, ow = W - 2 * casing, oh = H - casing - sill;
  const sashH = (oh - rail) / 2;
  const panes = [];
  for (const sy of [oy, oy + sashH + rail]) {
    piece(c, ox, sy, ow, stile, wood, false);
    piece(c, ox, sy + sashH - stile, ow, stile, wood, false);
    piece(c, ox, sy, stile, sashH, wood, true);
    piece(c, ox + ow - stile, sy, stile, sashH, wood, true);
    const ix = ox + stile, iy = sy + stile, iw = ow - 2 * stile, ih = sashH - 2 * stile;
    piece(c, ix + iw / 2 - bar / 2, iy, bar, ih, wood, true);
    for (const f of [1 / 3, 2 / 3]) piece(c, ix, iy + ih * f - bar / 2, iw, bar, wood, false);
    const pw = (iw - bar) / 2, ph = (ih - 2 * bar) / 3;
    for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) panes.push([ix + k * (pw + bar), iy + r * (ph + bar), pw, ph]);
  }
  piece(c, ox, oy + sashH, ow, rail, wood.map((v) => v * 1.05), false);   // meeting rail
  for (const [x, y, w, h] of panes) {
    const path = (cc) => cc.rect(x, y, w, h);
    cut(c, path);
    innerShadow(c, path, 1.4 * cm, 0.5);
    sheen(c, x, y, w, h, 0.045);
  }
  return surf.done();
}

function sub(p, W, H, cm) {
  const surf = surface(p, W, H);
  const c = surf.c, steel = [48, 62, 66];
  // Bulkhead plate, lit dimly from above by an interior lamp.
  const grd = c.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, rgb(steel, 1.25)); grd.addColorStop(0.5, rgb(steel)); grd.addColorStop(1, rgb(steel, 0.7));
  c.fillStyle = grd; c.fillRect(0, 0, W, H);
  // Plate seams with rivets.
  c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 0.4 * cm;
  for (const y of [H * 0.18, H * 0.82]) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  const rivet = (x, y, r) => {
    const rg = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    rg.addColorStop(0, rgb(steel, 2)); rg.addColorStop(1, rgb(steel, 0.6));
    c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  };
  for (const y of [H * 0.18, H * 0.82]) for (let x = 2 * cm; x < W; x += 6 * cm) { rivet(x, y - 1.2 * cm, 0.55 * cm); rivet(x, y + 1.2 * cm, 0.55 * cm); }
  // Viewport: a tall rounded opening with a thick bolted ring.
  const vx = 11 * cm, vy = 14 * cm, vw = W - 22 * cm, vh = H - 32 * cm, vr = Math.min(vw / 2, 34 * cm);
  const view = (cc) => cc.roundRect(vx, vy, vw, vh, vr);
  const ring = 6 * cm;
  c.save();
  c.beginPath(); c.roundRect(vx - ring, vy - ring, vw + 2 * ring, vh + 2 * ring, vr + ring);
  const rgd = c.createLinearGradient(0, vy - ring, 0, vy + vh + ring);
  rgd.addColorStop(0, rgb(steel, 1.9)); rgd.addColorStop(0.5, rgb(steel, 1.35)); rgd.addColorStop(1, rgb(steel, 0.9));
  c.fillStyle = rgd; c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.5 * cm; c.stroke();
  c.restore();
  // Bolts around the ring.
  const per = 2 * (vw + vh) - (8 - 2 * Math.PI) * vr, nb = Math.round(per / (11 * cm));
  const pointOn = (s) => {   // walk the rounded rectangle's centre line of the ring
    const R = vr + ring / 2, x0 = vx - ring / 2, y0 = vy - ring / 2, w = vw + ring, h = vh + ring;
    const segs = [w - 2 * R, (Math.PI / 2) * R, h - 2 * R, (Math.PI / 2) * R, w - 2 * R, (Math.PI / 2) * R, h - 2 * R, (Math.PI / 2) * R];
    let L = segs.reduce((a, b) => a + b, 0); s = ((s % L) + L) % L;
    const cs = [[x0 + w - R, y0 + R], [x0 + w - R, y0 + h - R], [x0 + R, y0 + h - R], [x0 + R, y0 + R]];
    for (let i = 0; i < 8; i++) {
      if (s > segs[i]) { s -= segs[i]; continue; }
      const k = Math.floor(i / 2);
      if (i % 2 === 0) {
        if (k === 0) return [x0 + R + s, y0]; if (k === 1) return [x0 + w, y0 + R + s];
        if (k === 2) return [x0 + w - R - s, y0 + h]; return [x0, y0 + h - R - s];
      }
      const a0 = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][k], a = a0 + s / R, [cx, cy] = cs[k];
      return [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
    }
    return [x0, y0];
  };
  for (let i = 0; i < nb; i++) { const [x, y] = pointOn((i / nb) * per); rivet(x, y, 1.1 * cm); }
  // Hazard stripe near the floor, and a small plate.
  const hy = H - 9 * cm, hh = 3.2 * cm;
  c.save(); c.beginPath(); c.rect(0, hy, W, hh); c.clip();
  c.fillStyle = 'rgb(150,120,20)'; c.fillRect(0, hy, W, hh);
  c.fillStyle = 'rgb(20,20,20)';
  for (let x = -hh; x < W + hh; x += 2 * hh) { c.beginPath(); c.moveTo(x, hy + hh); c.lineTo(x + hh, hy); c.lineTo(x + 2 * hh, hy); c.lineTo(x + hh, hy + hh); c.fill(); }
  c.restore();
  c.fillStyle = rgb(steel, 0.55); c.fillRect(W / 2 - 9 * cm, vy + vh + ring + 1.5 * cm, 18 * cm, 4 * cm);
  c.fillStyle = 'rgba(170,200,190,0.55)'; c.font = `bold ${2 * cm}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('DEPTH 30 M', W / 2, vy + vh + ring + 3.5 * cm);
  // Open the viewport.
  cut(c, view);
  innerShadow(c, view, 3 * cm, 0.6);
  c.save(); c.beginPath(); view(c); c.clip(); sheen(c, vx, vy, vw, vh, 0.04); c.restore();
  return surf.done();
}

function ship(p, W, H, cm) {
  const surf = surface(p, W, H);
  const c = surf.c, hull = [38, 42, 50];
  c.fillStyle = rgb(hull); c.fillRect(0, 0, W, H);
  // Viewport: a tall octagon with chamfered corners.
  const vx = 9 * cm, vy = 15 * cm, vw = W - 18 * cm, vh = H - 30 * cm, ch = 16 * cm;
  const oct = (cc, grow = 0) => {
    const x = vx - grow, y = vy - grow, w = vw + 2 * grow, h = vh + 2 * grow, k = ch + grow * 0.4;
    cc.moveTo(x + k, y); cc.lineTo(x + w - k, y); cc.lineTo(x + w, y + k); cc.lineTo(x + w, y + h - k);
    cc.lineTo(x + w - k, y + h); cc.lineTo(x + k, y + h); cc.lineTo(x, y + h - k); cc.lineTo(x, y + k); cc.closePath();
  };
  // Panel seams radiating from the viewport's corners, plus a few horizontal ones.
  c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 0.35 * cm;
  for (const [a, b, x2, y2] of [[vx + ch, vy, 0, 0], [vx + vw - ch, vy, W, 0], [vx + vw - ch, vy + vh, W, H], [vx + ch, vy + vh, 0, H]]) { c.beginPath(); c.moveTo(a, b); c.lineTo(x2, y2); c.stroke(); }
  for (const y of [H * 0.35, H * 0.65]) { c.beginPath(); c.moveTo(0, y); c.lineTo(vx, y); c.moveTo(vx + vw, y); c.lineTo(W, y); c.stroke(); }
  // Greebles: small raised blocks on the side panels.
  for (let i = 0; i < 40; i++) {
    const side = Math.random() < 0.5, x = side ? Math.random() * (vx - 4 * cm) + 0.5 * cm : vx + vw + 0.5 * cm + Math.random() * (W - vx - vw - 4 * cm);
    const y = Math.random() * H, w = (1 + Math.random() * 3) * cm, h = (1 + Math.random() * 6) * cm;
    c.fillStyle = rgb(hull, 1.25 + Math.random() * 0.3); c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x, y + h, w, 0.3 * cm);
  }
  // Thick bevelled rim.
  c.save(); c.beginPath(); oct(c, 4 * cm);
  const rg = c.createLinearGradient(0, vy - 4 * cm, 0, vy + vh + 4 * cm);
  rg.addColorStop(0, rgb(hull, 2.1)); rg.addColorStop(0.5, rgb(hull, 1.5)); rg.addColorStop(1, rgb(hull, 1.0));
  c.fillStyle = rg; c.fill(); c.restore();
  // Indicator lights and a small status panel.
  const dot = (x, y, col) => { c.save(); c.shadowColor = col; c.shadowBlur = 1.2 * cm; c.fillStyle = col; c.beginPath(); c.arc(x, y, 0.5 * cm, 0, Math.PI * 2); c.fill(); c.restore(); };
  for (let i = 0; i < 5; i++) dot(vx + 3 * cm + i * 2 * cm, vy + vh + 7 * cm, i === 4 ? 'rgb(220,60,50)' : 'rgb(60,200,120)');
  c.fillStyle = 'rgb(14,22,30)'; c.fillRect(W - vx - 22 * cm, vy + vh + 5.5 * cm, 20 * cm, 4 * cm);
  c.fillStyle = 'rgba(90,190,230,0.6)'; c.font = `${1.6 * cm}px monospace`; c.textBaseline = 'middle';
  c.fillText('NAV · HULL 98%', W - vx - 21 * cm, vy + vh + 7.5 * cm);
  // Open the viewport, then a thin cyan light strip around its edge.
  cut(c, (cc) => oct(cc));
  innerShadow(c, (cc) => oct(cc), 2.5 * cm, 0.65);
  c.save(); c.shadowColor = 'rgba(80,200,255,0.9)'; c.shadowBlur = 1.5 * cm;
  c.strokeStyle = 'rgba(110,210,255,0.55)'; c.lineWidth = 0.35 * cm;
  c.beginPath(); oct(c, 1.2 * cm); c.stroke(); c.restore();
  c.save(); c.beginPath(); oct(c); c.clip(); sheen(c, vx, vy, vw, vh, 0.035); c.restore();
  return surf.done();
}

// A wall smashed open: a big ragged hole, a band of exposed brick and broken plaster
// thickness around it, cracks running out into what's left. Seeded, so it's the same
// hole every time.
function broken(p, W, H, cm) {
  const surf = surface(p, W, H);
  const c = surf.c;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const plaster = [74, 71, 66], brick = [92, 46, 34], mortar = [58, 54, 50];

  // Remaining wall: plaster with a faint mottle.
  c.fillStyle = rgb(plaster); c.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    c.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + rnd() * 0.03})`;
    const r = (0.5 + rnd() * 3) * cm;
    c.beginPath(); c.arc(rnd() * W, rnd() * H, r, 0, Math.PI * 2); c.fill();
  }

  // The hole: a jagged ring around the centre, rough at two scales, leaving thicker
  // remnants towards the corners.
  const cx = W / 2, cy = H * 0.48, rx = W * 0.4, ry = H * 0.42;
  const N = 160, jag = [], lip = [], phase = [rnd() * 6, rnd() * 6, rnd() * 6];
  // Smooth noise along the edge (random values, interpolated), for the plaster band.
  const smooth = (n, amp) => { const v = Array.from({ length: n }, () => rnd() * amp); return (i) => { const f = (i / N) * n, j = Math.floor(f) % n, t = f - Math.floor(f); return v[j] * (1 - t) + v[(j + 1) % n] * t; }; };
  const band = smooth(11, 1), fine = smooth(37, 1);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const wob = 0.09 * Math.sin(a * 3 + phase[0]) + 0.06 * Math.sin(a * 7 + phase[1]) + 0.04 * Math.sin(a * 13 + phase[2]);
    // Irregular teeth: mostly small breaks, now and then a deep notch or a jutting shard.
    const r = rnd();
    const tooth = r < 0.1 ? 0.06 + rnd() * 0.07 : r < 0.18 ? -(0.04 + rnd() * 0.05) : (rnd() - 0.5) * 0.035;
    jag.push(1 + wob + tooth);
    // Plaster broken back from the brick by a varying amount (sometimes nearly flush).
    lip.push(0.015 + band(i) * 0.13 + fine(i) * 0.03);
  }
  // The edge, `grow` beyond the hole (lip = the plaster's broken edge).
  const holePath = (cc, grow = 0) => {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, k = jag[i] + (grow === 'lip' ? lip[i] : grow);
      const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
      i ? cc.lineTo(x, y) : cc.moveTo(x, y);
    }
    cc.closePath();
  };

  // Exposed brick band around the hole (plaster broken away further than the bricks).
  c.save();
  c.beginPath(); holePath(c, 'lip'); c.clip();
  c.fillStyle = rgb(mortar); c.fillRect(0, 0, W, H);
  const bw = 22 * cm, bh = 7 * cm;
  for (let row = 0, y = 0; y < H; row++, y += bh) {
    for (let x = -(row % 2) * bw / 2; x < W; x += bw) {
      c.fillStyle = rgb(brick, 0.8 + rnd() * 0.4);
      c.fillRect(x + 0.6 * cm, y + 0.6 * cm, bw - 1.2 * cm, bh - 1.2 * cm);
    }
  }
  c.restore();
  // Plaster edge: a light broken lip, then shadow falling inwards onto the bricks.
  c.save();
  c.lineJoin = 'round';
  c.strokeStyle = rgb(plaster, 1.35); c.lineWidth = 0.8 * cm;
  c.beginPath(); holePath(c, 'lip'); c.stroke();
  c.restore();
  innerShadow(c, (cc) => holePath(cc, 'lip'), 2.5 * cm, 0.6);

  // Cracks: branching random walks starting at the hole's edge, heading outwards.
  const crack = (x, y, ang, len, width, depth) => {
    c.beginPath(); c.moveTo(x, y);
    const step = 1.6 * cm;
    for (let d = 0; d < len; d += step) {
      ang += (rnd() - 0.5) * 0.7;
      x += Math.cos(ang) * step; y += Math.sin(ang) * step;
      c.lineTo(x, y);
      if (depth < 2 && rnd() < 0.05) crack(x, y, ang + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.6), len * 0.45, width * 0.6, depth + 1);
    }
    c.strokeStyle = `rgba(20,18,16,${0.75 - depth * 0.15})`; c.lineWidth = width; c.stroke();
  };
  for (let k = 0; k < 16; k++) {
    const i = Math.floor(rnd() * N), a = (i / N) * Math.PI * 2;
    const x = cx + Math.cos(a) * rx * (jag[i] + lip[i]), y = cy + Math.sin(a) * ry * (jag[i] + lip[i]);
    crack(x, y, a + (rnd() - 0.5) * 0.6, (12 + rnd() * 30) * cm, (0.25 + rnd() * 0.25) * cm, 0);
  }

  // Open the hole, with depth: the wall's thickness casts a soft shadow inwards.
  cut(c, (cc) => holePath(cc));
  innerShadow(c, (cc) => holePath(cc), 3 * cm, 0.7);
  return surf.done();
}

export const FRAMES = { house, sub, ship, broken };
