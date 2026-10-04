// Output stage: draws wall-space content onto the projector frame.
// For every projector pixel the fragment shader maps back into wall space (H⁻¹),
// samples the content, and multiplies by a feathered polygon mask. Everything
// outside the wall is pure black.
import { squareToQuad, invert3, toColumnMajor, minCornerW, isConvexQuad } from './warp.js';

const MAX_PTS = 48;
const MAX_PANELS = 16;

const VERT = `
precision highp float;
attribute vec3 aPosition;
void main() {
  vec4 p = vec4(aPosition, 1.0);
  p.xy = p.xy * 2.0 - 1.0;
  gl_Position = p;
}`;

const FRAG = `
precision highp float;
#define MAX_PTS ${MAX_PTS}
#define MAX_PANELS ${MAX_PANELS}
uniform vec2 uRes;          // canvas size in CSS px
uniform float uDensity;     // device px per CSS px
uniform mat3 uHinv;         // output px → wall uv
uniform float uValid;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uMix;
uniform sampler2D uFrameA;        // window-frame overlays (wall space, alpha = frame)
uniform sampler2D uFrameB;
uniform float uFrameOnA;          // 0 = no frame for that layer
uniform float uFrameOnB;
uniform vec2 uPoly[MAX_PTS + 1];  // closed polygon (last == first), CSS px
uniform int uPolyN;               // number of segments
uniform float uFeather;
uniform float uInset;
uniform float uMaskOn;
uniform float uEdgeCheck;
uniform float uBright;
uniform vec3 uGain;           // colour balance, applied to everything shown
uniform float uFlat;
uniform float uWmin;
uniform vec4 uPanels[MAX_PANELS]; // physical panels in wall uv: x0, y0, x1, y1
uniform int uPanelN;              // 0 = the whole wall is one surface
uniform vec2 uPanelShift[MAX_PANELS]; // per-panel content shift, wall uv (for split prints)
uniform vec2 uPanelScale[MAX_PANELS]; // per-panel content stretch (1 = as is)

// Per-panel content correction for split prints: the panel nearest uv (with a little
// margin, so edges and gaps match their panel) moves its content by its shift and
// scales it around the panel's centre. Returns where to sample the content.
vec2 panelXform(vec2 uv) {
  float best = 1e9; vec2 sh = vec2(0.0), sc = vec2(1.0), ctr = vec2(0.5);
  for (int i = 0; i < MAX_PANELS; i++) {
    if (i >= uPanelN) break;
    vec4 r = uPanels[i];
    float d = length(uv - clamp(uv, r.xy, r.zw));
    if (d < best) { best = d; sh = uPanelShift[i]; sc = uPanelScale[i]; ctr = (r.xy + r.zw) * 0.5; }
  }
  return ctr + (uv - ctr - sh) / sc;
}

// 1 inside any panel, 0 in the gaps between them (and around them).
float panelMask(vec2 uv) {
  if (uPanelN == 0) return 1.0;
  float m = 0.0;
  for (int i = 0; i < MAX_PANELS; i++) {
    if (i >= uPanelN) break;
    vec4 r = uPanels[i];
    vec2 d = min(uv - r.xy, r.zw - uv);          // > 0 inside on both axes
    m = max(m, smoothstep(0.0, 0.0015, min(d.x, d.y)));
  }
  return m;
}

// Signed distance to the polygon (negative inside). After Inigo Quilez.
float sdPoly(vec2 p) {
  float d = 1e20;
  float s = 1.0;
  for (int i = 0; i < MAX_PTS; i++) {
    if (i >= uPolyN) break;
    vec2 a = uPoly[i];
    vec2 b = uPoly[i + 1];
    vec2 e = b - a;
    vec2 w = p - a;
    vec2 q = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(q, q));
    bvec3 c = bvec3(p.y >= a.y, p.y < b.y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
  }
  return s * sqrt(d);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y * uDensity - gl_FragCoord.y) / uDensity;
  vec3 h = uHinv * vec3(px, 1.0);
  vec2 uv = h.xy / h.z;
  bool inQuad = uValid > 0.5 && all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));

  if (uMaskOn < 0.5) {
    // Mask off: show the whole projector frame so the beam extents are visible.
    vec3 col = vec3(0.18);
    vec2 g = step(fract(px / 80.0), vec2(1.5 / 80.0));
    col += 0.25 * max(g.x, g.y);
    if (inQuad) col = mix(texture2D(uTexA, uv).rgb, texture2D(uTexB, uv).rgb, uMix);
    gl_FragColor = vec4(col * uBright * uGain, 1.0);
    return;
  }

  float sd = sdPoly(px) + uInset;
  if (uEdgeCheck > 0.5) {
    // Edge check: hard boundary, content inside, red stripes everywhere else. Where
    // the colour change lands on the real wall corner, the mask edge is right.
    float stripe = step(0.5, fract((px.x + px.y) / 28.0));
    vec3 outside = vec3(0.95, 0.06, 0.04) * stripe;
    vec3 inner = texture2D(uTexA, clamp(panelXform(uv), 0.0, 1.0)).rgb;
    bool onWall = sd < 0.0 && uValid > 0.5 && panelMask(uv) > 0.5;
    gl_FragColor = vec4((onWall ? inner : outside) * uBright * uGain, 1.0);
    return;
  }
  float inside = uFeather > 0.0 ? 1.0 - smoothstep(-uFeather * 0.5, uFeather * 0.5, sd) : step(sd, 0.0);
  inside *= panelMask(uv);
  vec3 col = vec3(0.0);
  if (inside > 0.0 && uValid > 0.5) {
    vec2 st = clamp(panelXform(uv), 0.0, 1.0);
    vec3 ca = texture2D(uTexA, st).rgb, cb = texture2D(uTexB, st).rgb;
    vec4 fa = texture2D(uFrameA, st), fb = texture2D(uFrameB, st);
    ca = mix(ca, fa.rgb, fa.a * uFrameOnA);      // each scene wears its own frame,
    cb = mix(cb, fb.rgb, fb.a * uFrameOnB);      // so frames crossfade with scenes
    col = mix(ca, cb, uMix);
    // Light per wall area ∝ 1/|w|³. Scale light (linear, hence ^1/2.2) so every
    // part of the wall matches the dimmest one.
    float gain = min(pow(uWmin / abs(h.z), 3.0), 1.0);
    col *= pow(mix(1.0, gain, uFlat), 1.0 / 2.2);
  }
  gl_FragColor = vec4(col * inside * uBright * uGain, 1.0);
}`;

export function maskPolygon(cal) {
  const pts = [];
  for (let i = 0; i < 4; i++) {
    pts.push(cal.corners[i]);
    for (const q of cal.edges?.[i] || []) pts.push(q);
  }
  return pts;
}

export class Output {
  constructor(p) {
    this.p = p;
    this.shader = p.createShader(VERT, FRAG);
    this.valid = false;
  }

  // Panels in wall coordinates (fractions of the wall, 0..1). Empty = no panel mask.
  // shifts: per panel [dx, dy] in wall uv — moves that panel's content.
  // scales: per panel [sx, sy] — stretches it around the panel's centre.
  setPanels(rects = [], shifts = [], scales = []) {
    const flat = new Array(MAX_PANELS * 4).fill(0);
    rects.slice(0, MAX_PANELS).forEach((r, i) => flat.splice(i * 4, 4, r.x0, r.y0, r.x1, r.y1));
    this.panels = flat;
    const sh = new Array(MAX_PANELS * 2).fill(0);
    shifts.slice(0, MAX_PANELS).forEach((v, i) => { if (v) { sh[i * 2] = v[0]; sh[i * 2 + 1] = v[1]; } });
    this.shifts = sh;
    const sc = new Array(MAX_PANELS * 2).fill(1);
    scales.slice(0, MAX_PANELS).forEach((v, i) => { if (v) { sc[i * 2] = v[0]; sc[i * 2 + 1] = v[1]; } });
    this.scales = sc;
    this.panelN = Math.min(MAX_PANELS, rects.length);
  }

  setCalibration(cal) {
    this.cal = cal;
    const H = squareToQuad(cal.corners);
    const Hinv = isConvexQuad(cal.corners) ? invert3(H) : null;
    this.valid = !!Hinv;
    this.hinv = Hinv ? toColumnMajor(Hinv) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    this.wmin = Hinv ? minCornerW(Hinv, cal.corners) : 1;

    const poly = maskPolygon(cal).slice(0, MAX_PTS);
    poly.push(poly[0]);
    const flat = new Array((MAX_PTS + 1) * 2).fill(0);
    poly.forEach((q, i) => { flat[i * 2] = q.x; flat[i * 2 + 1] = q.y; });
    this.poly = flat;
    this.polyN = poly.length - 1;
  }

  // texA/texB: p5.Graphics in wall space. mix: 0 → A, 1 → B.
  render(texA, texB, mix, { brightness = 1, flatten = 0, maskOn = true, edgeCheck = false, gain = [1, 1, 1], panels = true, frameA = null, frameB = null } = {}) {
    const p = this.p, s = this.shader, cal = this.cal;
    p.shader(s);
    s.setUniform('uRes', [p.width, p.height]);
    s.setUniform('uDensity', p.pixelDensity());
    s.setUniform('uHinv', this.hinv);
    s.setUniform('uValid', this.valid ? 1 : 0);
    s.setUniform('uTexA', texA);
    s.setUniform('uTexB', texB || texA);
    s.setUniform('uMix', texB ? mix : 0);
    // Frames: a 1×1 transparent stand-in when a layer has none.
    this.noFrame ??= (() => { const g = p.createGraphics(1, 1); g.pixelDensity(1); g.clear(); return g; })();
    s.setUniform('uFrameA', frameA || this.noFrame);
    s.setUniform('uFrameB', (texB ? frameB : frameA) || this.noFrame);
    s.setUniform('uFrameOnA', frameA ? 1 : 0);
    s.setUniform('uFrameOnB', (texB ? frameB : frameA) ? 1 : 0);
    s.setUniform('uPoly', this.poly);
    s.setUniform('uPolyN', this.polyN);
    s.setUniform('uFeather', cal.feather ?? 1.5);
    s.setUniform('uInset', cal.inset ?? 0);
    s.setUniform('uMaskOn', maskOn ? 1 : 0);
    s.setUniform('uEdgeCheck', edgeCheck ? 1 : 0);
    s.setUniform('uBright', brightness);
    s.setUniform('uGain', gain);
    s.setUniform('uFlat', flatten);
    s.setUniform('uWmin', this.wmin);
    s.setUniform('uPanels', this.panels ?? new Array(MAX_PANELS * 4).fill(0));
    s.setUniform('uPanelN', panels ? this.panelN ?? 0 : 0);
    s.setUniform('uPanelShift', this.shifts ?? new Array(MAX_PANELS * 2).fill(0));
    s.setUniform('uPanelScale', this.scales ?? new Array(MAX_PANELS * 2).fill(1));
    p.noStroke();
    p.rect(0, 0, p.width, p.height);
  }
}
