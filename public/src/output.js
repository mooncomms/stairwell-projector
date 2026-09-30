// Output stage: draws wall-space content onto the projector frame.
// For every projector pixel the fragment shader maps back into wall space (H⁻¹),
// samples the content, and multiplies by a feathered polygon mask. Everything
// outside the wall is pure black.
import { squareToQuad, invert3, toColumnMajor, minCornerW, isConvexQuad } from './warp.js';

const MAX_PTS = 48;

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
uniform vec2 uRes;          // canvas size in CSS px
uniform float uDensity;     // device px per CSS px
uniform mat3 uHinv;         // output px → wall uv
uniform float uValid;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uMix;
uniform vec2 uPoly[MAX_PTS + 1];  // closed polygon (last == first), CSS px
uniform int uPolyN;               // number of segments
uniform float uFeather;
uniform float uInset;
uniform float uMaskOn;
uniform float uBright;
uniform float uFlat;
uniform float uWmin;

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
    gl_FragColor = vec4(col * uBright, 1.0);
    return;
  }

  float sd = sdPoly(px) + uInset;
  float inside = uFeather > 0.0 ? 1.0 - smoothstep(-uFeather * 0.5, uFeather * 0.5, sd) : step(sd, 0.0);
  vec3 col = vec3(0.0);
  if (inside > 0.0 && uValid > 0.5) {
    vec2 st = clamp(uv, 0.0, 1.0);
    col = mix(texture2D(uTexA, st).rgb, texture2D(uTexB, st).rgb, uMix);
    // Light per wall area ∝ 1/|w|³. Scale light (linear, hence ^1/2.2) so every
    // part of the wall matches the dimmest one.
    float gain = min(pow(uWmin / abs(h.z), 3.0), 1.0);
    col *= pow(mix(1.0, gain, uFlat), 1.0 / 2.2);
  }
  gl_FragColor = vec4(col * inside * uBright, 1.0);
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
  render(texA, texB, mix, { brightness = 1, flatten = 0, maskOn = true } = {}) {
    const p = this.p, s = this.shader, cal = this.cal;
    p.shader(s);
    s.setUniform('uRes', [p.width, p.height]);
    s.setUniform('uDensity', p.pixelDensity());
    s.setUniform('uHinv', this.hinv);
    s.setUniform('uValid', this.valid ? 1 : 0);
    s.setUniform('uTexA', texA);
    s.setUniform('uTexB', texB || texA);
    s.setUniform('uMix', texB ? mix : 0);
    s.setUniform('uPoly', this.poly);
    s.setUniform('uPolyN', this.polyN);
    s.setUniform('uFeather', cal.feather ?? 1.5);
    s.setUniform('uInset', cal.inset ?? 0);
    s.setUniform('uMaskOn', maskOn ? 1 : 0);
    s.setUniform('uBright', brightness);
    s.setUniform('uFlat', flatten);
    s.setUniform('uWmin', this.wmin);
    p.noStroke();
    p.rect(0, 0, p.width, p.height);
  }
}
