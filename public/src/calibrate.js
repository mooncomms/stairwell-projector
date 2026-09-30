// Calibration state + editing. The 4 corners drive the homography (where the wall's
// corners land in projector pixels). Extra edge points only bend the mask, for walls
// whose edges aren't perfectly straight.

// edges: grey inside the mask, red stripes outside it — line the colour change up with
// the real corners, checking from where people actually look.
export const PATTERNS = ['grid', 'edges', 'levels', 'white', 'gray', 'content', 'frame'];

export function defaultCalibration(w, h) {
  // Centered 1:2 portrait rectangle, 85% of the screen height.
  const ch = h * 0.85, cw = ch / 2, x0 = (w - cw) / 2, y0 = (h - ch) / 2;
  return {
    corners: [{ x: x0, y: y0 }, { x: x0 + cw, y: y0 }, { x: x0 + cw, y: y0 + ch }, { x: x0, y: y0 + ch }],
    edges: [[], [], [], []],
    feather: 1.5,
    inset: 0,
    brightness: 1,
    flatten: 0,
    gain: [1, 1, 1],          // colour balance: per-channel output gain (≤ 1)
  };
}

export class Calibrator {
  constructor(cal, onChange) {
    this.cal = cal;
    this.cal.edges ||= [[], [], [], []];
    this.onChange = onChange;
    this.active = false;
    this.pattern = 'grid';
    this.selected = 0;
    this.dragging = false;
    this.dirty = false;
  }

  // Handles in polygon order: corner0, edge0 points…, corner1, edge1 points…, …
  handles() {
    const out = [];
    for (let i = 0; i < 4; i++) {
      out.push({ pt: this.cal.corners[i], corner: i, edge: i, k: -1 });
      this.cal.edges[i].forEach((pt, k) => out.push({ pt, corner: -1, edge: i, k }));
    }
    return out;
  }

  changed() {
    this.dirty = true;
    this.onChange(this.cal);
    // Autosave shortly after the last edit, so a reload or crash never loses work.
    clearTimeout(this.autosave);
    this.autosave = setTimeout(() => this.save().catch(() => {}), 1000);
  }

  select(dir) {
    const n = this.handles().length;
    this.selected = (this.selected + dir + n) % n;
    this.onChange(this.cal);
  }

  nudge(dx, dy) {
    const h = this.handles()[this.selected];
    if (!h) return;
    h.pt.x += dx;
    h.pt.y += dy;
    this.changed();
  }

  // Insert a point halfway between the selected handle and the next one.
  addPoint() {
    const hs = this.handles();
    const a = hs[this.selected], b = hs[(this.selected + 1) % hs.length];
    const pt = { x: (a.pt.x + b.pt.x) / 2, y: (a.pt.y + b.pt.y) / 2 };
    this.cal.edges[a.edge].splice(a.k + 1, 0, pt);
    this.selected += 1;
    this.changed();
  }

  deletePoint() {
    const h = this.handles()[this.selected];
    if (!h || h.corner >= 0) return; // corners can't be deleted
    this.cal.edges[h.edge].splice(h.k, 1);
    this.selected -= 1;
    this.changed();
  }

  nextPattern() {
    this.pattern = PATTERNS[(PATTERNS.indexOf(this.pattern) + 1) % PATTERNS.length];
    this.onChange(this.cal);
  }

  set(key, value) {
    this.cal[key] = value;
    this.changed();
  }

  // Mouse: grab the nearest handle within 40px.
  press(x, y) {
    let best = -1, bestD = 40 * 40;
    this.handles().forEach((h, i) => {
      const d = (h.pt.x - x) ** 2 + (h.pt.y - y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best >= 0) {
      this.selected = best;
      this.dragging = true;
      // No grab offset: the handle jumps to the cursor, so it can reach the very edge
      // of the frame (an offset left it short by up to 40 px).
      this.drag(x, y);
    }
  }

  drag(x, y) {
    if (!this.dragging) return;
    const h = this.handles()[this.selected];
    h.pt.x = x;
    h.pt.y = y;
    this.changed();
  }

  release() { this.dragging = false; }

  async save() {
    await fetch('/api/calibration', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.cal),
    });
    this.dirty = false;
    this.onChange(this.cal);
  }

  // Handles + outline on a 2D overlay canvas (CSS px).
  drawOverlay(ctx) {
    const hs = this.handles();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,255,255,0.8)';
    ctx.beginPath();
    hs.forEach((h, i) => (i ? ctx.lineTo(h.pt.x, h.pt.y) : ctx.moveTo(h.pt.x, h.pt.y)));
    ctx.closePath();
    ctx.stroke();

    // Handles pushed past the frame (keyboard can do that): an arrow on the edge.
    const fw = ctx.canvas.clientWidth, fh = ctx.canvas.clientHeight;
    hs.forEach((h, i) => {
      const { x, y } = h.pt;
      if (x >= 0 && y >= 0 && x <= fw && y <= fh) return;
      const cx = Math.max(12, Math.min(fw - 12, x)), cy = Math.max(12, Math.min(fh - 12, y));
      const a = Math.atan2(y - cy, x - cx);
      ctx.fillStyle = i === this.selected ? '#ff3' : '#0ff';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12);
      ctx.lineTo(cx + Math.cos(a + 2.5) * 10, cy + Math.sin(a + 2.5) * 10);
      ctx.lineTo(cx + Math.cos(a - 2.5) * 10, cy + Math.sin(a - 2.5) * 10);
      ctx.fill();
    });
    hs.forEach((h, i) => {
      const sel = i === this.selected;
      const r = h.corner >= 0 ? 14 : 9;
      ctx.strokeStyle = sel ? '#ff3' : h.corner >= 0 ? '#0ff' : '#f0f';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.beginPath();
      ctx.arc(h.pt.x, h.pt.y, r, 0, Math.PI * 2);
      ctx.moveTo(h.pt.x - r - 6, h.pt.y); ctx.lineTo(h.pt.x + r + 6, h.pt.y);
      ctx.moveTo(h.pt.x, h.pt.y - r - 6); ctx.lineTo(h.pt.x, h.pt.y + r + 6);
      ctx.stroke();
      if (h.corner >= 0) {
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = '14px monospace';
        ctx.fillText(['TL', 'TR', 'BR', 'BL'][h.corner], h.pt.x + r + 4, h.pt.y - r - 4);
      }
    });
  }
}
